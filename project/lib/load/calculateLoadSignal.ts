import type {
  AudioMeta,
  ConditionSignal,
  WorkloadSelfReport,
} from "@/types/echly";

const MIN_VOICE_BASELINE = 5;
const WORKLOAD_KEYS = [
  "mentalDemand",
  "physicalDemand",
  "temporalDemand",
  "performance",
  "effort",
  "frustration",
] as const;

type LoadSignalInput = {
  selfReport: WorkloadSelfReport;
  audioMeta: AudioMeta;
  audioBaseline?: AudioMeta[];
};

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function robustDeviation(current: number, baseline: number[]) {
  const center = median(baseline);
  const deviations = baseline.map((value) => Math.abs(value - center));
  const mad = median(deviations);
  const fallbackScale = Math.max(Math.abs(center) * 0.15, 0.03);
  const scale = mad > 0.001 ? 1.4826 * mad : fallbackScale;
  const robustZ = Math.abs(current - center) / scale;

  // A one-scale change is treated as ordinary day-to-day variation.
  return round(clamp(((robustZ - 1) / 2.5) * 100), 1);
}

function voiceDeviationScore(audioMeta: AudioMeta, baseline: AudioMeta[]) {
  const eligible = baseline.filter(
    (item) =>
      item.durationSec >= 20 &&
      item.speechRate !== null &&
      item.silenceRatio !== null,
  );
  if (
    eligible.length < MIN_VOICE_BASELINE ||
    audioMeta.durationSec < 20 ||
    audioMeta.speechRate === null ||
    audioMeta.silenceRatio === null
  ) {
    return { score: null, baselineCount: eligible.length };
  }

  const speechRate = robustDeviation(
    audioMeta.speechRate,
    eligible.map((item) => item.speechRate as number),
  );
  const pauseRatio = robustDeviation(
    audioMeta.silenceRatio,
    eligible.map((item) => item.silenceRatio as number),
  );

  return {
    score: round((speechRate + pauseRatio) / 2, 1),
    baselineCount: eligible.length,
  };
}

export function isCompleteWorkloadSelfReport(
  value: Partial<WorkloadSelfReport>,
): value is WorkloadSelfReport {
  return (
    WORKLOAD_KEYS.every(
      (key) =>
        Number.isFinite(value[key]) &&
        (value[key] as number) >= 0 &&
        (value[key] as number) <= 100,
    ) &&
    Number.isInteger(value.sleepiness) &&
    (value.sleepiness as number) >= 1 &&
    (value.sleepiness as number) <= 9
  );
}

export function calculateLoadSignal({
  selfReport,
  audioMeta,
  audioBaseline = [],
}: LoadSignalInput): ConditionSignal {
  const rawTlx = round(
    WORKLOAD_KEYS.reduce((sum, key) => sum + selfReport[key], 0) /
      WORKLOAD_KEYS.length,
    1,
  );
  const sleepiness = round(((selfReport.sleepiness - 1) / 8) * 100, 1);
  const voice = voiceDeviationScore(audioMeta, audioBaseline);
  const hasVoiceTrend = voice.score !== null;
  const weights = hasVoiceTrend
    ? { workload: 0.75, sleepiness: 0.15, voice: 0.1 }
    : { workload: 0.85, sleepiness: 0.15, voice: 0 };

  const score = Math.round(
    rawTlx * weights.workload +
      sleepiness * weights.sleepiness +
      (voice.score ?? 0) * weights.voice,
  );
  const level =
    score >= 60 ? "high" : score >= 40 ? "caution" : "normal";
  const label =
    level === "high" ? "高い" : level === "caution" ? "やや高い" : "低〜通常";
  const summary =
    level === "high"
      ? "今日の主観的負荷が高い範囲です。明日は予定を絞り、回復時間を先に確保する判断が妥当です。"
      : level === "caution"
        ? "今日の主観的負荷はやや高い範囲です。重要な予定を残し、余白を確保してください。"
        : "今日の主観的負荷は低〜通常の範囲です。急な増加を見つけるため、同じ条件で記録を続けてください。";

  const evidence = [
    `Raw TLX（日次適用）: ${rawTlx}/100`,
    `現在の眠気（KSS）: ${selfReport.sleepiness}/9`,
    hasVoiceTrend
      ? `本人の過去${voice.baselineCount}件に対する音声変化: ${voice.score}/100`
      : `音声傾向: 個人ベースライン不足（${voice.baselineCount}/${MIN_VOICE_BASELINE}件）`,
  ];

  return {
    score,
    level,
    label,
    summary,
    evidence,
    disclaimer:
      "診断ではありません。Raw TLXとKSSを日次チェックイン向けに組み合わせた未検証の独自指標です。個人内の変化と休息判断の補助にのみ使用してください。",
    confidence: hasVoiceTrend ? "standard" : "limited",
    components: {
      rawTlx,
      selfReport,
      sleepiness,
      voiceDeviation: voice.score,
      voiceBaselineCount: voice.baselineCount,
      workloadWeight: weights.workload,
      sleepinessWeight: weights.sleepiness,
      voiceWeight: weights.voice,
    },
    methodVersion: "echly-load-v1",
  };
}


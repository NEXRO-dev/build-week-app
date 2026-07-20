import type {
  AudioMeta,
  ConditionSignal,
  WorkloadSelfReport,
} from "@/types/echly";

const MIN_VOICE_BASELINE = 5;
const MIN_VOICE_SAMPLE_DURATION_SEC = 10;
type VoiceFeature = "speechRate" | "pauseRatio";
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

function availableVoiceFeatures(audioMeta: AudioMeta): VoiceFeature[] {
  if (audioMeta.durationSec < MIN_VOICE_SAMPLE_DURATION_SEC) return [];

  const features: VoiceFeature[] = [];
  if (Number.isFinite(audioMeta.speechRate)) features.push("speechRate");
  if (Number.isFinite(audioMeta.silenceRatio)) features.push("pauseRatio");
  return features;
}

function isVoiceSampleEligible(audioMeta: AudioMeta) {
  return availableVoiceFeatures(audioMeta).length > 0;
}

function voiceMetric(audioMeta: AudioMeta, feature: VoiceFeature) {
  return feature === "speechRate"
    ? audioMeta.speechRate
    : audioMeta.silenceRatio;
}

function voiceFeatureLabel(features: VoiceFeature[]) {
  if (features.length === 2) return "話速・間";
  return features[0] === "pauseRatio" ? "間" : "話速";
}

function voiceDeviationScore(audioMeta: AudioMeta, baseline: AudioMeta[]) {
  const featuresAvailable = availableVoiceFeatures(audioMeta);
  const currentEligible = featuresAvailable.length > 0;
  const eligibilityReason: "eligible" | "too_short" | "no_features" =
    currentEligible
      ? "eligible"
    : audioMeta.durationSec < MIN_VOICE_SAMPLE_DURATION_SEC
      ? "too_short"
      : "no_features";

  const baselineValues: Record<VoiceFeature, number[]> = {
    speechRate: baseline
      .filter(
        (item) =>
          item.durationSec >= MIN_VOICE_SAMPLE_DURATION_SEC &&
          Number.isFinite(item.speechRate),
      )
      .map((item) => item.speechRate as number),
    pauseRatio: baseline
      .filter(
        (item) =>
          item.durationSec >= MIN_VOICE_SAMPLE_DURATION_SEC &&
          Number.isFinite(item.silenceRatio),
      )
      .map((item) => item.silenceRatio as number),
  };
  const relevantBaselineCount = featuresAvailable.length
    ? Math.max(
        ...featuresAvailable.map((feature) => baselineValues[feature].length),
      )
    : baseline.filter(isVoiceSampleEligible).length;
  const samplesCollected = Math.min(
    MIN_VOICE_BASELINE,
    relevantBaselineCount + (currentEligible ? 1 : 0),
  );
  const featuresUsed = featuresAvailable.filter(
    (feature) => baselineValues[feature].length >= MIN_VOICE_BASELINE,
  );

  if (!featuresUsed.length) {
    return {
      score: null,
      baselineCount: relevantBaselineCount,
      baselineTarget: MIN_VOICE_BASELINE,
      samplesCollected,
      currentEligible,
      featuresAvailable,
      featuresUsed,
      featureCoverage: 0,
      minimumDurationSec: MIN_VOICE_SAMPLE_DURATION_SEC,
      eligibilityReason,
    };
  }

  const deviations = featuresUsed.map((feature) =>
    robustDeviation(
      voiceMetric(audioMeta, feature) as number,
      baselineValues[feature],
    ),
  );

  return {
    score: round(
      deviations.reduce((sum, deviation) => sum + deviation, 0) /
        deviations.length,
      1,
    ),
    baselineCount: Math.min(
      ...featuresUsed.map((feature) => baselineValues[feature].length),
    ),
    baselineTarget: MIN_VOICE_BASELINE,
    samplesCollected: MIN_VOICE_BASELINE,
    currentEligible,
    featuresAvailable,
    featuresUsed,
    featureCoverage: featuresUsed.length / 2,
    minimumDurationSec: MIN_VOICE_SAMPLE_DURATION_SEC,
    eligibilityReason,
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
  const voiceWeight = hasVoiceTrend
    ? round(voice.featureCoverage * 0.1, 2)
    : 0;
  const weights = {
    workload: round(0.85 - voiceWeight, 2),
    sleepiness: 0.15,
    voice: voiceWeight,
  };

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

  const voiceEvidence = (() => {
    if (hasVoiceTrend) {
      const partialNote =
        voice.featuresUsed.length === 1
          ? "（取得できた1特徴のみ・音声の重みを半分に調整）"
          : "";
      return (
        "音声傾向: 本人の過去" +
        voice.baselineCount +
        "件に対する" +
        voiceFeatureLabel(voice.featuresUsed) +
        "の変化 " +
        voice.score +
        "/100" +
        partialNote
      );
    }

    if (voice.eligibilityReason === "too_short") {
      return (
        "音声傾向: " +
        voice.minimumDurationSec +
        "秒未満のため参考記録として保存（ベースラインには未採用）"
      );
    }

    if (voice.eligibilityReason === "no_features") {
      return "音声傾向: 音声特徴を取得できなかったため参考記録として保存";
    }

    const availableNote =
      voice.featuresAvailable.length === 1
        ? "（" + voiceFeatureLabel(voice.featuresAvailable) + "のみ取得）"
        : "";
    return voice.samplesCollected >= voice.baselineTarget
      ? "音声傾向: 個人ベースラインがそろいました。次回から個人内変化を算出します" +
          availableNote
      : "音声傾向: 個人ベースライン作成中（利用可能な音声記録 " +
          voice.samplesCollected +
          "/" +
          voice.baselineTarget +
          "件）" +
          availableNote;
  })();

  const evidence = [
    "Raw TLX（日次適用）: " + rawTlx + "/100",
    "現在の眠気（KSS）: " + selfReport.sleepiness + "/9",
    voiceEvidence,
  ];

  return {
    score,
    level,
    label,
    summary,
    evidence,
    disclaimer:
      "診断ではありません。Raw TLXとKSSを日次チェックイン向けに組み合わせた未検証の独自指標です。音声は取得できた特徴だけを個人内比較し、休息判断の補助にのみ使用してください。",
    confidence:
      hasVoiceTrend && voice.featureCoverage === 1 ? "standard" : "limited",
    components: {
      rawTlx,
      selfReport,
      sleepiness,
      voiceDeviation: voice.score,
      voiceBaselineCount: voice.baselineCount,
      voiceBaselineTarget: voice.baselineTarget,
      voiceSamplesCollected: voice.samplesCollected,
      voiceCurrentEligible: voice.currentEligible,
      voiceFeaturesAvailable: voice.featuresAvailable,
      voiceFeaturesUsed: voice.featuresUsed,
      voiceFeatureCoverage: voice.featureCoverage,
      voiceMinimumDurationSec: voice.minimumDurationSec,
      voiceEligibilityReason: voice.eligibilityReason,
      workloadWeight: weights.workload,
      sleepinessWeight: weights.sleepiness,
      voiceWeight: weights.voice,
    },
    methodVersion: "echly-load-v2",
  };
}


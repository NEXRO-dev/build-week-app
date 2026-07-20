"use client";

import { Button } from "@heroui/react";
import { ArrowLeft, ArrowRight, CalendarDays, LoaderCircle, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AudioMeta, ConditionLevel, ConditionSignal, ExtractedTask, TaskType } from "@/types/echly";
import { useI18n } from "@/lib/i18n";
import { isTomorrowActionableTask } from "@/lib/tasks/temporal";

type Props = {
  transcript: string;
  audioBlob: Blob | null;
  audioMeta: AudioMeta;
  tasks: ExtractedTask[];
  condition: ConditionSignal;
  source: "cloudflare" | "demo";
  onBack: () => void;
  onCreatePlan: () => void;
  processingStage: string | null;
  error: string | null;
};

const taskTypeLabels: Record<TaskType, string> = {
  meeting: "会議", focus_work: "集中作業", admin: "事務", communication: "連絡", personal: "個人", unknown: "未分類",
};
const temporalLabels = {
  past: "過去",
  today: "今日",
  tomorrow: "明日",
  future: "将来",
  unspecified: "時期不明",
} as const;
const temporalStyles = {
  past: "bg-[#f1f2f6] text-[#69708a]",
  today: "bg-[#edf4ff] text-[#315caa]",
  tomorrow: "bg-[#eeeaff] text-[#543bd2]",
  future: "bg-[#eefaf6] text-[#25785f]",
  unspecified: "bg-[#fff6e9] text-[#a96817]",
} as const;
type AnalysisGroup = "reflection" | "tomorrow" | "concern" | "other";

const analysisGroups = [
  { id: "reflection", label: "今日のふり返り", style: "bg-[#edf4ff] text-[#315caa]" },
  { id: "tomorrow", label: "明日の予定・タスク", style: "bg-[#eeeaff] text-[#543bd2]" },
  { id: "concern", label: "悩み・気がかり", style: "bg-[#fff0f4] text-[#c83b64]" },
  { id: "other", label: "今後・時期未定", style: "bg-[#eefaf6] text-[#25785f]" },
] as const;

function analysisGroupFor(task: ExtractedTask): AnalysisGroup {
  if (task.kind === "topic" && task.topicType === "concern") return "concern";
  if (isTomorrowActionableTask(task)) return "tomorrow";
  if (
    task.topicType === "reflection" || task.status === "completed" ||
    task.temporalContext === "past" || task.temporalContext === "today"
  ) return "reflection";
  return "other";
}
const waveformBarCount = 56;
const waveformMinHeight = 6;
const waveformMaxHeight = 52;
type VoiceFeature = "speechRate" | "pauseRatio";

function voiceFeatureDescription(features: VoiceFeature[]) {
  if (features.length === 2) return "話速と間";
  return features[0] === "pauseRatio" ? "間" : "話速";
}

function scoreFor(level: ConditionLevel) { return level === "high" ? 72 : level === "caution" ? 58 : 34; }
function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

async function createWaveformHeights(audioBlob: Blob) {
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await audioBlob.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(samples.length / waveformBarCount));
    const values = Array.from({ length: waveformBarCount }, (_, barIndex) => {
      const start = barIndex * samplesPerBar;
      const end = Math.min(samples.length, start + samplesPerBar);
      let sumSquares = 0;
      for (let index = start; index < end; index += 1) {
        sumSquares += samples[index] ** 2;
      }
      return Math.sqrt(sumSquares / Math.max(1, end - start));
    });
    const peak = Math.max(...values, 0.001);
    return values.map((value) =>
      Math.round(
        waveformMinHeight +
          (value / peak) * (waveformMaxHeight - waveformMinHeight),
      ),
    );
  } finally {
    await context.close();
  }
}

function shareTextFor(
  condition: ConditionSignal,
  groupedTasks: Record<AnalysisGroup, ExtractedTask[]>,
) {
  const score = condition.score ?? scoreFor(condition.level);
  const sections = analysisGroups.flatMap((group) => {
    const items = groupedTasks[group.id];
    if (!items.length) return [];
    return [`${group.label}: ${items.map((item) => item.title).join("、")}`];
  });
  return [
    `Echly 負荷シグナル: ${score}/100（${condition.label}）`,
    condition.summary,
    ...sections,
  ].join("\n");
}

export function AnalysisView({
  transcript,
  audioBlob,
  audioMeta,
  tasks,
  condition,
  onBack,
  onCreatePlan,
  processingStage,
  error,
}: Props) {
  const { isEnglish, t } = useI18n();
  const localizedTaskTypeLabels: Record<TaskType, string> = isEnglish
    ? {
        meeting: "Meeting",
        focus_work: "Focus work",
        admin: "Admin",
        communication: "Communication",
        personal: "Personal",
        unknown: "Uncategorized",
      }
    : taskTypeLabels;
  const localizedTemporalLabels = isEnglish
    ? {
        past: "Past",
        today: "Today",
        tomorrow: "Tomorrow",
        future: "Future",
        unspecified: "Unscheduled",
      }
    : temporalLabels;
  const localizedAnalysisGroups = isEnglish
    ? analysisGroups.map((group) => ({
        ...group,
        label: {
          reflection: "Today's reflection",
          tomorrow: "Tomorrow's plans & tasks",
          concern: "Concerns",
          other: "Later or unscheduled",
        }[group.id],
      }))
    : analysisGroups;
  const localizedConditionLabel = isEnglish
    ? condition.level === "high"
      ? "High"
      : condition.level === "caution"
        ? "Elevated"
        : "Normal"
    : condition.label;
  const localizedConditionSummary = isEnglish
    ? condition.level === "high"
      ? "Your load looks high today. Reduce movable commitments and protect recovery time tomorrow."
      : condition.level === "caution"
        ? "Your load looks elevated. Keep essential commitments and leave room to recover."
        : "Your load is in a low-to-normal range. Keep some open space and continue tracking changes."
    : condition.summary;
  const localizedEvidence = isEnglish
    ? [
        "Based on today's self-assessment",
        condition.confidence === "standard"
          ? "Compared with your personal voice baseline"
          : "Voice baseline is still being established",
      ]
    : condition.evidence;
  const localizedDisclaimer = isEnglish
    ? "This is not a diagnosis. Use this experimental signal only to notice personal changes and support rest decisions."
    : condition.disclaimer;
  const score = condition.score ?? scoreFor(condition.level);
  const voiceBaselineTarget =
    condition.components?.voiceBaselineTarget ?? 5;
  const voiceMinimumDurationSec =
    condition.components?.voiceMinimumDurationSec ?? 10;
  const fallbackVoiceFeatures: VoiceFeature[] =
    audioMeta.durationSec >= voiceMinimumDurationSec
      ? [
          ...(Number.isFinite(audioMeta.speechRate)
            ? (["speechRate"] as VoiceFeature[])
            : []),
          ...(Number.isFinite(audioMeta.silenceRatio)
            ? (["pauseRatio"] as VoiceFeature[])
            : []),
        ]
      : [];
  const voiceFeaturesAvailable =
    condition.components?.voiceFeaturesAvailable ?? fallbackVoiceFeatures;
  const voiceFeaturesUsed =
    condition.components?.voiceFeaturesUsed ?? [];
  const voiceCurrentEligible =
    condition.components?.voiceCurrentEligible ??
    voiceFeaturesAvailable.length > 0;
  const voiceEligibilityReason =
    condition.components?.voiceEligibilityReason ??
    (voiceCurrentEligible
      ? "eligible"
      : audioMeta.durationSec < voiceMinimumDurationSec
        ? "too_short"
        : "no_features");
  const voiceSamplesCollected =
    condition.components?.voiceSamplesCollected ??
    Math.min(
      voiceBaselineTarget,
      (condition.components?.voiceBaselineCount ?? 0) +
        (voiceCurrentEligible ? 1 : 0),
    );
  const voiceBaselineProgress =
    (voiceSamplesCollected / voiceBaselineTarget) * 100;
  const hasVoiceDeviation =
    typeof condition.components?.voiceDeviation === "number";
  const voiceUsesSingleFeature =
    hasVoiceDeviation &&
    (voiceFeaturesUsed.length === 1 ||
      condition.components?.voiceWeight === 0.05);
  const voiceStatusLabel = hasVoiceDeviation
    ? condition.components?.voiceDeviation +
      "/100" +
      (voiceUsesSingleFeature ? t("（1特徴）", " (1 feature)") : "")
    : !voiceCurrentEligible
      ? voiceEligibilityReason === "too_short"
        ? t("参考記録（短時間）", "Reference only (short)")
        : t("特徴を取得できず", "Features unavailable")
      : voiceSamplesCollected >= voiceBaselineTarget
        ? t("基準作成完了", "Baseline ready")
        : voiceSamplesCollected + "/" + voiceBaselineTarget;
  const voiceStatusHint = hasVoiceDeviation
    ? voiceUsesSingleFeature
      ? "過去" +
        condition.components?.voiceBaselineCount +
        "件と比べ、取得できた" +
        voiceFeatureDescription(
          voiceFeaturesUsed.length ? voiceFeaturesUsed : voiceFeaturesAvailable,
        ) +
        "のみで暫定算出しています。音声の重みは半分です。"
      : "過去" +
        condition.components?.voiceBaselineCount +
        "件と比べた話速・間の変化です。"
    : !voiceCurrentEligible
      ? voiceEligibilityReason === "too_short"
        ? voiceMinimumDurationSec +
          "秒未満のため保存のみ行い、ベースラインには加えていません。"
        : "録音は保存しましたが、話速と間を取得できなかったため参考記録です。"
      : voiceSamplesCollected >= voiceBaselineTarget
        ? "次回の録音から、取得できた特徴で個人内変化を算出します。"
        : "あと" +
          (voiceBaselineTarget - voiceSamplesCollected) +
          "件で個人内比較を開始します。";
  const calculationMetrics = condition.components
    ? [
        {
          label: t("主観的ワークロード", "Subjective workload"),
          valueLabel: condition.components.rawTlx + "/100",
          progress: condition.components.rawTlx,
          hint: null,
          pending: false,
        },
        {
          label: t("眠気", "Sleepiness"),
          valueLabel: condition.components.sleepiness + "/100",
          progress: condition.components.sleepiness,
          hint: null,
          pending: false,
        },
        {
          label: t("音声の個人内変化", "Personal voice deviation"),
          valueLabel: voiceStatusLabel,
          progress:
            typeof condition.components.voiceDeviation === "number"
              ? condition.components.voiceDeviation
              : voiceBaselineProgress,
          hint: voiceStatusHint,
          pending: condition.components.voiceDeviation === null,
        },
      ]
    : [];
  const gaugeColor =
    condition.level === "high"
      ? "#ef3f71"
      : condition.level === "caution"
        ? "#e89a20"
        : "#28a477";
  const audioUrl = useMemo(
    () => (audioBlob ? URL.createObjectURL(audioBlob) : null),
    [audioBlob],
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioProgressFrameRef = useRef<number | null>(null);
  const [waveformHeights, setWaveformHeights] = useState<number[] | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(audioMeta.durationSec);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const audioProgress =
    audioDuration > 0
      ? Math.min(1, Math.max(0, audioCurrentTime / audioDuration))
      : 0;
  const groupedTasks: Record<AnalysisGroup, ExtractedTask[]> = {
    reflection: [],
    tomorrow: [],
    concern: [],
    other: [],
  };
  for (const task of tasks) {
    groupedTasks[analysisGroupFor(task)].push(task);
  }
  const shareText = isEnglish
    ? [
        "Echly analysis",
        "",
        "Load signal: " + localizedConditionLabel + " (" + score + "/100)",
        localizedConditionSummary,
        "",
        ...tasks.map((task) => "- " + task.title),
      ].join("\n").trim()
    : shareTextFor(condition, groupedTasks);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (audioProgressFrameRef.current !== null) {
      cancelAnimationFrame(audioProgressFrameRef.current);
    }
  }, [audioUrl]);

  useEffect(() => {
    let cancelled = false;

    if (!audioBlob) return;

    createWaveformHeights(audioBlob)
      .then((heights) => {
        if (!cancelled) setWaveformHeights(heights);
      })
      .catch(() => {
        if (!cancelled) setWaveformHeights(null);
      });

    return () => {
      cancelled = true;
    };
  }, [audioBlob]);

  async function handleShare() {
    setShareFeedback(null);
    try {
      if (navigator.share) {
        await navigator.share({
          title: t("Echly 解析結果", "Echly analysis"),
          text: shareText,
        });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setShareFeedback(t("共有内容をコピーしました", "Copied to clipboard"));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(shareText);
        setShareFeedback(t("共有内容をコピーしました", "Copied to clipboard"));
      } catch {
        setShareFeedback(t("共有できませんでした", "Could not share"));
      }
    }
  }

  function syncAudioProgress() {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioCurrentTime(audio.currentTime);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setAudioDuration(audio.duration);
    }
  }

  function stopSmoothAudioProgress() {
    if (audioProgressFrameRef.current === null) return;
    cancelAnimationFrame(audioProgressFrameRef.current);
    audioProgressFrameRef.current = null;
  }

  function startSmoothAudioProgress() {
    stopSmoothAudioProgress();
    const tick = () => {
      syncAudioProgress();
      const audio = audioRef.current;
      if (audio && !audio.paused && !audio.ended) {
        audioProgressFrameRef.current = requestAnimationFrame(tick);
      } else {
        audioProgressFrameRef.current = null;
      }
    };
    audioProgressFrameRef.current = requestAnimationFrame(tick);
  }

  function handleWaveSeek(event: React.PointerEvent<HTMLButtonElement>) {
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audioDuration;
    setAudioCurrentTime(audio.currentTime);
  }

  return (
    <div>
      <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onBack} aria-label={t("戻る", "Back")} className="grid size-10 place-items-center text-[#303857]"><ArrowLeft size={20} /></button>
        <h1 className="text-center text-base font-bold">{t("解析結果", "Analysis")}</h1>
        <button type="button" onClick={handleShare} aria-label={t("解析結果を共有", "Share analysis")} title={t("負荷シグナルと内容の整理を共有", "Share your load signal and organized notes")} className="grid size-10 place-items-center text-[#303857] active:scale-95"><Upload size={19} /></button>
      </header>

      <div className="space-y-3 px-4 pb-8 pt-3">
        {error ? <div role="alert" className="rounded-lg bg-[#fff4f5] p-3 text-sm text-[#b43d4d]">{error}</div> : null}
        {shareFeedback ? <div role="status" className="rounded-lg bg-[#f1efff] px-3 py-2 text-xs font-medium text-[#5039ce]">{shareFeedback}</div> : null}

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold">{t("録音した音声", "Recorded audio")}</h2>
            <span className="font-mono text-[10px] text-[#737b99]">{formatDuration(audioDuration || audioMeta.durationSec)}</span>
          </div>
          <button
            type="button"
            onPointerDown={handleWaveSeek}
            disabled={!audioUrl}
            className="relative mt-5 block h-[58px] w-full overflow-hidden rounded-md bg-[#f7f8fc] px-2 disabled:cursor-default"
            aria-label={t("波形をタップして再生位置を移動", "Tap the waveform to seek")}
          >
            {waveformHeights ? (
              <div className="analysis-wave h-full" aria-hidden="true">
                {waveformHeights.map((height, index) => <span key={index} style={{ height }} />)}
              </div>
            ) : (
              <div className="grid h-full place-items-center text-xs font-medium text-[#737b99]">
                {audioUrl ? t("波形を生成中...", "Generating waveform...") : t("録音なし", "No recording")}
              </div>
            )}
            {audioUrl ? (
              <>
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 w-full origin-left transform-gpu bg-[#6047ff]/10"
                  style={{ transform: `scaleX(${audioProgress})` }}
                />
                <span
                  className="pointer-events-none absolute bottom-1 top-1 w-px transform-gpu rounded-full bg-[#111735] shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                  style={{ left: `${audioProgress * 100}%` }}
                />
              </>
            ) : null}
          </button>
          {audioUrl ? <div className="mt-2 flex justify-between font-mono text-[10px] text-[#737b99]"><span>{formatDuration(Math.floor(audioCurrentTime))}</span><span>{formatDuration(Math.floor(audioDuration || audioMeta.durationSec))}</span></div> : null}
          {audioUrl ? (
            <audio
              ref={audioRef}
              controls
              src={audioUrl}
              onLoadedMetadata={syncAudioProgress}
              onSeeking={syncAudioProgress}
              onSeeked={syncAudioProgress}
              onPlay={startSmoothAudioProgress}
              onPause={() => {
                stopSmoothAudioProgress();
                syncAudioProgress();
              }}
              onEnded={() => {
                stopSmoothAudioProgress();
                syncAudioProgress();
              }}
              className="mt-4 h-9 w-full"
            />
          ) : (
            <p className="mt-4 rounded-md bg-[#f7f8fc] px-3 py-2 text-xs text-[#68708f]">{t("録音音声はありません。テキスト入力から解析した結果です。", "No audio was recorded. This analysis is based on typed input.")}</p>
          )}
        </section>

        <div className="grid gap-3 min-[380px]:grid-cols-2">
          <section className="min-w-0 rounded-lg border border-[#e3e5ef] p-4">
            <h2 className="text-xs font-bold">{t("文字起こし", "Transcript")}</h2>
            <p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-[#3d4563]">{transcript}</p>
          </section>

          <section className="min-w-0 rounded-lg border border-[#e3e5ef] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold">{t("負荷シグナル", "Load signal")}</h2>
              <span className={`rounded px-2 py-1 text-[10px] font-bold ${condition.level === "high" ? "bg-[#fff0f4] text-[#ef3f71]" : condition.level === "caution" ? "bg-[#fff7e9] text-[#de8a16]" : "bg-[#eaf8f2] text-[#28a477]"}`}>{localizedConditionLabel}</span>
            </div>
            <div className="relative mx-auto mt-6 size-32 rounded-full" style={{ background: `conic-gradient(${gaugeColor} ${score * 3.6}deg, #eceef4 0)` }}>
              <div className="absolute inset-[12px] grid place-items-center rounded-full bg-white">
                <p className="text-center"><span className="text-3xl font-bold">{score}</span><span className="text-xs">/100</span></p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-x-2 gap-y-1 text-[9px] text-[#737b99]"><span className="text-[#43b98b]">● {t("低", "Low")}</span><span className="text-[#5870df]">● {t("通常", "Normal")}</span><span className="text-[#f0a62b]">● {t("注意", "Elevated")}</span><span className="text-[#ef3f71]">● {t("高", "High")}</span></div>
          </section>
        </div>
        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold">{t("算出根拠", "How this was calculated")}</h2>
            <span className="text-[10px] font-medium text-[#68708f]">
              {condition.confidence === "standard"
                ? t("自己評価＋個人内音声", "Self-report + personal voice baseline")
                : t("自己評価中心", "Primarily self-report")}
            </span>
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-[#343c5b]">
            {localizedConditionSummary}
          </p>
          {calculationMetrics.length ? (
            <div className="mt-4 space-y-3">
              {calculationMetrics.map((metric) => (
                <div key={metric.label}>
                  <div className="flex justify-between gap-3 text-[10px]">
                    <span className="text-[#626b89]">{metric.label}</span>
                    <span className="font-bold tabular-nums text-[#303857]">
                      {metric.valueLabel}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eceef4]">
                    <span
                      className={
                        "block h-full rounded-full transition-[width] duration-500 " +
                        (metric.pending ? "bg-[#168f78]" : "bg-[#5b42ff]")
                      }
                      style={{ width: metric.progress + "%" }}
                    />
                  </div>
                  {metric.hint ? (
                    <p className="mt-1.5 text-[9px] leading-4 text-[#737b99]">
                      {metric.hint}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          <ul className="mt-4 space-y-1 text-[10px] leading-4 text-[#59617d]">
            {localizedEvidence.map((item) => <li key={item}>• {item}</li>)}
          </ul>
          <p className="mt-3 border-t border-[#eceef3] pt-3 text-[9px] leading-4 text-[#8188a1]">
            {localizedDisclaimer}
          </p>
        </section>



        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">{t("内容の整理", "Organized notes")}</h2>
          <div className="mt-4 space-y-4">
            {localizedAnalysisGroups.map((group) => {
              const items = groupedTasks[group.id];
              if (!items.length) return null;
              return (
                <div key={group.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className={`rounded px-2 py-1 text-[10px] font-bold ${group.style}`}>{group.label}</h3>
                    <span className="text-[10px] text-[#8188a1]">{items.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((task) => (
                      <span key={task.id} className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-[#dfe2ec] bg-white px-2 py-1.5 text-xs font-medium text-[#343c5b]">
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${temporalStyles[task.temporalContext]}`}>{localizedTemporalLabels[task.temporalContext]}</span>
                        {task.startTime ? <CalendarDays size={12} className="shrink-0" /> : null}
                        <span className={`min-w-0 break-words ${task.status === "completed" ? "line-through opacity-60" : ""}`}>{task.title}</span>
                        <span className="shrink-0 text-[9px] text-[#8188a1]">{task.kind === "topic" ? t("話題", "Topic") : localizedTaskTypeLabels[task.type]}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {!tasks.length ? <p className="text-xs text-[#737b99]">{t("整理できる項目はありませんでした。", "No items were found to organize.")}</p> : null}
          </div>
        </section>

        <Button variant="primary" size="lg" fullWidth isDisabled={Boolean(processingStage)} onPress={onCreatePlan} className="h-12 bg-[#5b42ff] text-white">
          {processingStage ? <LoaderCircle size={18} className="animate-spin" /> : null}{processingStage ?? t("明日のプランを作る", "Create tomorrow's plan")}{!processingStage ? <ArrowRight size={18} /> : null}
        </Button>
      </div>
    </div>
  );
}

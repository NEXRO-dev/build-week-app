"use client";

import { Button, Label, TextArea, TextField } from "@heroui/react";
import {
  Activity,
  ArrowLeft,
  CalendarCheck,
  Check,
  Clock3,
  FlaskConical,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  SAMPLE_TRANSCRIPT,
  SAMPLE_TRANSCRIPT_EN,
} from "@/lib/demo/sampleCheckIns";
import { useI18n } from "@/lib/i18n";
import { isTomorrowActionableTask } from "@/lib/tasks/temporal";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type {
  AudioMeta,
  ConditionSignal,
  ScheduleEntry,
  TranscriptReview,
  WorkloadSelfReport,
} from "@/types/echly";

import { RecorderPanel } from "./RecorderPanel";
import { TranscriptReviewPanel } from "./TranscriptReviewPanel";

export type CheckInMode = "reflection" | "planning";
export type ReflectionStatus = "loading" | "too-early" | "available" | "completed";

const REFLECTION_SAMPLE =
  "今日は資料作成を終えました。午後は会議が続いて少し疲れましたが、重要な連絡まで対応できました。";
type AssessmentQuestion = {
  key: keyof WorkloadSelfReport;
  eyebrow: string;
  question: string;
  options: Array<{ label: string; value: number }>;
};

const workloadOptions = [
  { label: "ほとんどない", value: 0 },
  { label: "少ない", value: 25 },
  { label: "普通", value: 50 },
  { label: "多い", value: 75 },
  { label: "かなり多い", value: 100 },
];

const assessmentQuestions: AssessmentQuestion[] = [
  { key: "mentalDemand", eyebrow: "精神的な要求", question: "今日は、考えたり集中したりする負担がどのくらいありましたか？", options: workloadOptions },
  { key: "physicalDemand", eyebrow: "身体的な要求", question: "今日は、体を使う負担がどのくらいありましたか？", options: workloadOptions },
  { key: "temporalDemand", eyebrow: "時間的な切迫", question: "今日は、時間に追われる感覚がどのくらいありましたか？", options: workloadOptions },
  {
    key: "performance",
    eyebrow: "達成度への不満",
    question: "今日の出来に対する不満はどのくらいありますか？",
    options: [
      { label: "満足している", value: 0 },
      { label: "やや満足", value: 25 },
      { label: "どちらでもない", value: 50 },
      { label: "やや不満", value: 75 },
      { label: "とても不満", value: 100 },
    ],
  },
  { key: "effort", eyebrow: "必要だった努力", question: "今日を乗り切るために、どのくらい努力が必要でしたか？", options: workloadOptions },
  { key: "frustration", eyebrow: "不安・いらだち", question: "今日は、不安やいらだちをどのくらい感じましたか？", options: workloadOptions },
  {
    key: "sleepiness",
    eyebrow: "現在の眠気",
    question: "今の眠気に最も近いものはどれですか？",
    options: [
      { label: "非常にはっきり目覚めている", value: 1 },
      { label: "とても目覚めている", value: 2 },
      { label: "目覚めている", value: 3 },
      { label: "やや目覚めている", value: 4 },
      { label: "どちらでもない", value: 5 },
      { label: "少し眠い", value: 6 },
      { label: "眠いが、起きていられる", value: 7 },
      { label: "眠くて、起きているのがつらい", value: 8 },
      { label: "とても眠く、起きているのが困難", value: 9 },
    ],
  },
];

const englishWorkloadOptions = [
  { label: "Very low", value: 0 },
  { label: "Low", value: 25 },
  { label: "Moderate", value: 50 },
  { label: "High", value: 75 },
  { label: "Very high", value: 100 },
];

const englishAssessmentQuestions: AssessmentQuestion[] = [
  { key: "mentalDemand", eyebrow: "Mental demand", question: "How mentally demanding was your day?", options: englishWorkloadOptions },
  { key: "physicalDemand", eyebrow: "Physical demand", question: "How physically demanding was your day?", options: englishWorkloadOptions },
  { key: "temporalDemand", eyebrow: "Time pressure", question: "How rushed or pressed for time did you feel today?", options: englishWorkloadOptions },
  { key: "performance", eyebrow: "Performance dissatisfaction", question: "How dissatisfied are you with what you accomplished today?", options: [{ label: "Very satisfied", value: 0 }, { label: "Somewhat satisfied", value: 25 }, { label: "Neutral", value: 50 }, { label: "Somewhat dissatisfied", value: 75 }, { label: "Very dissatisfied", value: 100 }] },
  { key: "effort", eyebrow: "Effort", question: "How much effort did it take to get through today?", options: englishWorkloadOptions },
  { key: "frustration", eyebrow: "Frustration", question: "How anxious or frustrated did you feel today?", options: englishWorkloadOptions },
  {
    key: "sleepiness",
    eyebrow: "Current sleepiness",
    question: "Which option best describes how sleepy you feel now?",
    options: [
      "Extremely alert",
      "Very alert",
      "Alert",
      "Fairly alert",
      "Neither alert nor sleepy",
      "Somewhat sleepy",
      "Sleepy, but no difficulty staying awake",
      "Sleepy and making an effort to stay awake",
      "Very sleepy and struggling to stay awake",
    ].map((label, index) => ({ label, value: index + 1 })),
  },
];

type CheckInViewProps = {
  userName: string;
  todayLabel: string;
  timeZone: string;
  previousCondition: ConditionSignal | null;
  reflectionStatus: ReflectionStatus;
  reflectionCompletedAt: string | null;
  transcriptByMode: Record<CheckInMode, string>;
  onTranscriptChange: (mode: CheckInMode, value: string) => void;
  audioByMode: Record<CheckInMode, Blob | null>;
  retryRecordingMode: CheckInMode | null;
  onRetryRecordingShown: () => void;
  transcriptReview: TranscriptReview | null;
  onTranscriptReviewChange: (value: string) => void;
  onTranscriptReviewConfirm: () => void;
  onTranscriptReviewRetry: () => void;
  onTranscriptReviewClose: () => void;
  onAudioReady: (mode: CheckInMode, blob: Blob, meta: AudioMeta) => void;
  onAudioDiscard: (mode: CheckInMode) => void;
  selfReport: Partial<WorkloadSelfReport>;
  onSelfReportChange: (key: keyof WorkloadSelfReport, value: number) => void;
  onAssessmentClose: () => void;
  onAnalyzeReflection: (completedReport: WorkloadSelfReport) => void;
  onAddSchedule: () => void;
  scheduleEntries: ScheduleEntry[];
  onRemoveSchedule: (id: string) => void;
  onCreatePlan: () => void;
  onError: (message: string) => void;
  processingStage: string | null;
  error: string | null;
};

export function CheckInView(props: CheckInViewProps) {
  const { isEnglish, t } = useI18n();
  const {
    userName,
    todayLabel,
    timeZone,
    previousCondition,
    reflectionStatus,
    reflectionCompletedAt,
    transcriptByMode,
    onTranscriptChange,
    audioByMode,
    retryRecordingMode,
    onRetryRecordingShown,
    transcriptReview,
    onTranscriptReviewChange,
    onTranscriptReviewConfirm,
    onTranscriptReviewRetry,
    onTranscriptReviewClose,
    onAudioReady,
    onAudioDiscard,
    selfReport,
    onSelfReportChange,
    onAssessmentClose,
    onAnalyzeReflection,
    onAddSchedule,
    scheduleEntries,
    onRemoveSchedule,
    onCreatePlan,
    processingStage,
    error,
  } = props;
  const [mode, setMode] = useState<CheckInMode>("planning");
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [assessmentIndex, setAssessmentIndex] = useState(0);
  const [assessmentCloseConfirmOpen, setAssessmentCloseConfirmOpen] = useState(false);
  const localizedAssessmentQuestions = isEnglish
    ? englishAssessmentQuestions
    : assessmentQuestions;
  const assessmentQuestion = localizedAssessmentQuestions[assessmentIndex];
  const currentAudioBlob = audioByMode[mode];
  const currentTranscript = transcriptByMode[mode];
  const combinedCheckInAvailable = reflectionStatus === "available";
  const hasReflectionInput = Boolean(
    audioByMode.reflection || transcriptByMode.reflection.trim(),
  );
  const hasPlanningInput = Boolean(
    audioByMode.planning || transcriptByMode.planning.trim(),
  );
  const tomorrowTaskCount = scheduleEntries.reduce(
    (total, entry) => total + entry.tasks.filter(isTomorrowActionableTask).length,
    0,
  );

  useEffect(() => {
    if (reflectionStatus !== "available") return;
    const timeoutId = window.setTimeout(() => setMode("reflection"), 0);
    return () => window.clearTimeout(timeoutId);
  }, [reflectionStatus]);

  useEffect(() => {
    if (retryRecordingMode === null) return;
    const timeoutId = window.setTimeout(() => {
      setAssessmentOpen(false);
      setMode(retryRecordingMode);
      onRetryRecordingShown();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [onRetryRecordingShown, retryRecordingMode]);

  function startAssessment() {
    if (combinedCheckInAvailable && (!hasReflectionInput || !hasPlanningInput)) {
      props.onError(
        t(
          "STEP 1とSTEP 2の両方を入力してください。",
          "Complete both STEP 1 and STEP 2.",
        ),
      );
      setMode(hasReflectionInput ? "planning" : "reflection");
      return;
    }

    const firstUnanswered = localizedAssessmentQuestions.findIndex(
      (question) => !Number.isFinite(selfReport[question.key]),
    );
    setAssessmentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
    setAssessmentCloseConfirmOpen(false);
    setAssessmentOpen(true);
  }

  function handleCombinedPrimaryAction() {
    if (mode === "reflection") {
      setMode("planning");
      return;
    }
    startAssessment();
  }

  function requestAssessmentClose() {
    if (processingStage) return;
    setAssessmentCloseConfirmOpen(true);
  }

  function confirmAssessmentClose() {
    setAssessmentOpen(false);
    setAssessmentIndex(0);
    setAssessmentCloseConfirmOpen(false);
    onAssessmentClose();
  }

  function answerAssessment(question: AssessmentQuestion, value: number) {
    const nextReport = { ...selfReport, [question.key]: value };
    onSelfReportChange(question.key, value);

    if (assessmentIndex < localizedAssessmentQuestions.length - 1) {
      setAssessmentIndex((current) => current + 1);
      return;
    }

    if (Object.values(nextReport).filter(Number.isFinite).length === 7) {
      onAnalyzeReflection(nextReport as WorkloadSelfReport);
    }
  }

  const reflectionLocked = reflectionStatus !== "available";
  const greetingName = userName.trim();
  const greetingSuffix = !isEnglish && !greetingName.endsWith("さん") ? "さん" : "";
  const prompt = mode === "reflection"
    ? {
        title: t("今日の振り返り", "Reflect on today"),
        text: t(
          "まず、今日起きたこと、進んだこと、詰まったことや疲れを話してください。",
          "First, tell us what happened today, what moved forward, what felt blocked, and how tired you felt.",
        ),
        examples: isEnglish
          ? ["What moved forward", "What felt blocked", "Energy and focus"]
          : ["進んだこと", "詰まったこと", "疲れや集中度"],
      }
    : {
        title: t("明日の予定・タスク", "Tomorrow's plans and tasks"),
        text: t(
          combinedCheckInAvailable
            ? "次に、明日の予定・締切・やることを話してください。"
            : "明日の予定・締切・やることを、思い出したときに追加できます。",
          combinedCheckInAvailable
            ? "Next, tell us about tomorrow's plans, deadlines, and tasks."
            : "Add tomorrow's plans, deadlines, and tasks whenever they come to mind.",
        ),
        examples: isEnglish
          ? ["Tomorrow's meetings", "Work to complete", "Fixed commitments"]
          : ["明日の会議", "やるべき作業", "動かせない予定"],
      };
  const reviewAudioBlobs: Array<{ label: string; blob: Blob }> = [];
  if (transcriptReview) {
    if (transcriptReview.mode === "reflection" && combinedCheckInAvailable) {
      const reflectionAudio = audioByMode.reflection;
      const planningAudio = audioByMode.planning;
      if (reflectionAudio) {
        reviewAudioBlobs.push({
          label: t("STEP 1：今日の振り返り", "STEP 1: Today's reflection"),
          blob: reflectionAudio,
        });
      }
      if (planningAudio) {
        reviewAudioBlobs.push({
          label: t("STEP 2：明日の予定・タスク", "STEP 2: Tomorrow's plans and tasks"),
          blob: planningAudio,
        });
      }
    } else {
      const reviewAudio = audioByMode[transcriptReview.mode];
      if (reviewAudio) {
        reviewAudioBlobs.push({
          label: t("録音した音声", "Recording"),
          blob: reviewAudio,
        });
      }
    }
  }

  return (
    <div>
      <header className="flex h-16 items-center justify-between border-b border-[#ececf3] px-5 pt-[env(safe-area-inset-top)]">
        <button type="button" className="flex items-center gap-2 text-lg font-bold" aria-label="Echly ホーム">
          <span className="echly-logo" aria-hidden="true"><i /><i /><i /></span>
          Echly
        </button>
        <NotificationBell timeZone={timeZone} />
      </header>

      <div className="px-5 pb-8 pt-5">
        <h1 className="text-[20px] font-bold leading-7">{isEnglish ? "Welcome back, " + greetingName : "おつかれさまです、" + greetingName + greetingSuffix}</h1>
        <p className="mt-1 text-xs text-[#606985]">{todayLabel}・{timeZone}</p>

        <section className="mt-5 flex min-w-0 items-center gap-3 rounded-lg border border-[#e4e6ef] p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#eff4ff] text-[#4266e8]"><Activity size={21} /></span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#626b89]">{t("直近の状態", "Latest status")}</p>
            <p className="mt-1 text-sm font-bold">
              {previousCondition?.score !== undefined ? `${previousCondition.score}/100・${previousCondition.label}` : t("まだ記録がありません", "No records yet")}
            </p>
          </div>
        </section>

        {error ? <div role="alert" className="mt-4 rounded-lg border border-[#ffc9c9] bg-[#fff5f5] px-4 py-3 text-sm text-[#b43d4d]">{error}</div> : null}
        {processingStage ? <div className="mt-4 flex min-w-0 items-center gap-2 rounded-lg bg-[#f1efff] px-4 py-3 text-sm text-[#5039ce]"><LoaderCircle size={17} className="shrink-0 animate-spin" /><span className="min-w-0 break-words">{processingStage}</span></div> : null}

        {combinedCheckInAvailable ? (
          <section className="mt-5 overflow-hidden rounded-lg border border-[#e2e5f0] bg-white shadow-[0_10px_28px_rgba(32,39,80,0.05)]">
            <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#68708f]">Voice check-in</p>
                <h2 className="mt-1 text-base font-bold text-[#111735]">{t("2ステップで明日を整える", "Prepare for tomorrow in two steps")}</h2>
              </div>
              <span className="rounded-md bg-[#f2f4fa] px-2.5 py-1 text-[10px] font-bold text-[#5e6683]">{mode === "reflection" ? "1" : "2"}/2</span>
            </div>
            <div className="grid grid-cols-2 gap-2 px-3 pb-3">
              <button type="button" onClick={() => setMode("reflection")} aria-current={mode === "reflection" ? "step" : undefined} className={`flex min-h-16 items-center gap-2 rounded-md border px-2.5 py-2 text-left active:scale-[0.98] ${mode === "reflection" ? "border-[#6d58ff] bg-[#f7f5ff] text-[#3420bc]" : "border-[#e5e7f1] bg-[#f8f9fd] text-[#5e6683]"}`}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${mode === "reflection" || hasReflectionInput ? "bg-[#efedff] text-[#5b42ff]" : "bg-white text-[#737b99]"}`}>{hasReflectionInput ? <Check size={16} /> : <MessageSquareText size={16} />}</span>
                <span><span className="block text-[10px] font-bold">STEP 1</span><span className="block text-xs font-bold">{t("今日の振り返り", "Today's reflection")}</span></span>
              </button>
              <button type="button" disabled={!hasReflectionInput} onClick={() => setMode("planning")} aria-current={mode === "planning" ? "step" : undefined} className={`flex min-h-16 items-center gap-2 rounded-md border px-2.5 py-2 text-left active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${mode === "planning" ? "border-[#41b69d] bg-[#f0fbf7] text-[#13705f]" : "border-[#e5e7f1] bg-[#f8f9fd] text-[#5e6683]"}`}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${mode === "planning" || hasPlanningInput ? "bg-[#e8f8f2] text-[#18957d]" : "bg-white text-[#737b99]"}`}>{hasPlanningInput ? <Check size={16} /> : <CalendarCheck size={16} />}</span>
                <span><span className="block text-[10px] font-bold">STEP 2</span><span className="block text-xs font-bold">{t("明日の予定", "Tomorrow's plans")}</span></span>
              </button>
            </div>
            <p className="border-t border-[#eceef6] bg-[#f8f9fd] px-4 py-2.5 text-xs leading-5 text-[#59617d]">{t("各ステップの入力を別々に保持し、最後にまとめて解析します。", "Each step is kept separately and analyzed together at the end.")}</p>
          </section>
        ) : (
        <div className="mt-5 grid grid-cols-2 rounded-lg bg-[#f1f2f7] p-1" role="tablist" aria-label="入力する内容">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "reflection"}
            onClick={() => setMode("reflection")}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-xs font-bold ${mode === "reflection" ? "bg-white text-[#4d35db] shadow-sm" : "text-[#68708f]"}`}
          >
            {reflectionStatus === "completed" ? <Check size={15} /> : reflectionStatus === "too-early" ? <LockKeyhole size={15} /> : <MessageSquareText size={15} />}
            {t("今日の振り返り", "Today")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "planning"}
            onClick={() => setMode("planning")}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-xs font-bold ${mode === "planning" ? "bg-white text-[#13705f] shadow-sm" : "text-[#68708f]"}`}
          >
            <Plus size={15} />{t("明日の予定", "Tomorrow")}
          </button>
        </div>
        )}

        <section className={`mt-3 overflow-hidden rounded-lg border ${mode === "reflection" ? "border-[#e2ddff]" : "border-[#d5efe7]"}`}>
          <div className={`px-4 py-4 ${mode === "reflection" ? "bg-[#faf9ff]" : "bg-[#f7fcfa]"}`}>
            <div className="flex items-start gap-3">
              <span className={`grid size-11 shrink-0 place-items-center rounded-full ${mode === "reflection" ? "bg-[#efedff] text-[#5b42ff]" : "bg-[#e8f8f2] text-[#18957d]"}`}>
                {mode === "reflection" ? <MessageSquareText size={21} /> : <CalendarCheck size={21} />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-[#111735]">{prompt.title}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#303857]">{prompt.text}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {prompt.examples.map((example) => <span key={example} className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-[#606985] shadow-[inset_0_0_0_1px_rgba(213,217,233,0.9)]">{example}</span>)}
                </div>
              </div>
            </div>
          </div>

          {mode === "reflection" && reflectionStatus === "too-early" ? (
            <div className="flex items-center gap-3 border-t border-[#eceef6] px-4 py-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f3f7] text-[#68708f]"><Clock3 size={19} /></span>
              <div><p className="text-sm font-bold">{t("20:00から振り返れます", "Reflection opens at 8:00 PM")}</p><p className="mt-1 text-xs text-[#68708f]">{t("端末のタイムゾーンで判定しています。", "Based on your device time zone.")}</p></div>
            </div>
          ) : null}

          {mode === "reflection" && reflectionStatus === "completed" ? (
            <div className="flex items-center gap-3 border-t border-[#eceef6] px-4 py-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eaf8f2] text-[#23966f]"><Check size={20} /></span>
              <div><p className="text-sm font-bold">{t("今日の振り返りは完了しました", "Today's reflection is complete")}</p><p className="mt-1 text-xs text-[#68708f]">{reflectionCompletedAt ? `${reflectionCompletedAt}に記録` : "1日1回の記録済み"}</p></div>
            </div>
          ) : null}
        </section>

        {(mode === "planning" || !reflectionLocked) ? (
          <RecorderPanel
            audioBlob={currentAudioBlob}
            onAudioReady={(blob, meta) => onAudioReady(mode, blob, meta)}
            onDiscard={() => onAudioDiscard(mode)}
            onError={props.onError}
            onPrimaryAction={combinedCheckInAvailable ? handleCombinedPrimaryAction : mode === "reflection" ? startAssessment : () => onAddSchedule()}
            isProcessing={Boolean(processingStage)}
            idleLabel={mode === "reflection" ? t("今日の振り返りを録音", "Record today's reflection") : t("明日の予定を録音", "Record tomorrow's plans")}
            recordingLabel={t("録音中", "Recording")}
            recordedLabel={t("録音できました", "Recording ready")}
            durationHint={mode === "reflection" ? t("目安：30秒〜1分", "About 30–60 seconds") : t("目安：30秒〜2分", "About 30 seconds–2 minutes")}
            primaryActionLabel={combinedCheckInAvailable ? mode === "reflection" ? t("STEP 2へ", "Continue to STEP 2") : t("負荷確認へ", "Continue to load check") : mode === "reflection" ? t("負荷確認へ", "Continue to load check") : t("予定を追加", "Add plans")}
            tone={mode}
          />
        ) : null}

        {(mode === "planning" || !reflectionLocked) ? (
          <details className="group mt-5 rounded-lg border border-[#e7e8f0] bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-xs font-medium text-[#5e6683] [&::-webkit-details-marker]:hidden"><FlaskConical size={14} /> {t("テキストで入力", "Type instead")}</summary>
            <div className="border-t border-[#ececf3] p-3">
              <TextField fullWidth className="w-full">
                <Label className="sr-only">{prompt.title}</Label>
                <TextArea
                  value={currentTranscript}
                  onInput={(event) => onTranscriptChange(mode, event.currentTarget.value)}
                  rows={5}
                  fullWidth
                  placeholder={mode === "reflection" ? t("今日あったことや感じた負担", "What happened today and how it felt") : t("明日の会議、作業、締切など", "Tomorrow's meetings, tasks, and deadlines")}
                  className="min-h-32 w-full resize-none rounded-md border border-[#dfe2ec] bg-white px-3 py-2 text-sm leading-6 text-[#27304d] outline-none focus:border-[#6d58ff] focus:ring-2 focus:ring-[#ded9ff]"
                />
              </TextField>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onPress={() => onTranscriptChange(mode, mode === "reflection" ? (isEnglish ? "I finished preparing the materials today. The afternoon was full of meetings, so I feel a little tired." : REFLECTION_SAMPLE) : (isEnglish ? SAMPLE_TRANSCRIPT_EN : SAMPLE_TRANSCRIPT))} className="min-w-0">{t("デモ文を入力", "Insert demo text")}</Button>
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={!currentTranscript.trim() || Boolean(processingStage)}
                  onPress={combinedCheckInAvailable ? handleCombinedPrimaryAction : mode === "reflection" ? startAssessment : () => onAddSchedule()}
                  className={`ml-auto min-w-20 text-white ${mode === "reflection" ? "bg-[#5b42ff]" : "bg-[#168f78]"}`}
                >
                  {combinedCheckInAvailable ? mode === "reflection" ? t("STEP 2へ", "Continue to STEP 2") : t("負荷確認へ", "Continue to load check") : mode === "reflection" ? t("負荷確認へ", "Continue to load check") : t("予定を追加", "Add plans")}
                </Button>
              </div>
            </div>
          </details>
        ) : null}

        {mode === "planning" && !combinedCheckInAvailable ? (
          <section className="mt-5 border-t border-[#e7e8f0] pt-5">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-bold">{t("追加済みの明日の予定", "Tomorrow's saved plans")}</h2><p className="mt-1 text-xs text-[#68708f]">{tomorrowTaskCount}件</p></div>
              {tomorrowTaskCount > 0 ? <Button size="sm" variant="primary" onPress={onCreatePlan} isDisabled={Boolean(processingStage)} className="bg-[#5b42ff] text-white">{t("プランを作る", "Create plan")}</Button> : null}
            </div>
            {scheduleEntries.length ? (
              <div className="mt-3 divide-y divide-[#eceef3] border-y border-[#eceef3]">
                {scheduleEntries.map((entry) => {
                  const tasks = entry.tasks.filter(isTomorrowActionableTask);
                  return (
                    <div key={entry.id} className="flex gap-3 py-3">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#e8f8f2] text-[#168f78]"><CalendarCheck size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-1.5">{tasks.map((task) => <span key={task.id} className="rounded-md bg-[#f2f8f6] px-2 py-1 text-xs font-semibold text-[#275e52]">{task.startTime ? `${task.startTime} ` : ""}{task.title}</span>)}</div>
                        <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[#8188a1]">{entry.transcript}</p>
                      </div>
                      <button type="button" aria-label={t("この予定追加を削除", "Delete this plan entry")} title={t("削除", "Delete")} onClick={() => onRemoveSchedule(entry.id)} className="grid size-9 shrink-0 place-items-center text-[#8188a1] active:scale-95"><Trash2 size={16} /></button>
                    </div>
                  );
                })}
              </div>
            ) : <p className="mt-3 rounded-md bg-[#f7f8fc] px-3 py-4 text-center text-xs text-[#68708f]">{t("明日の予定はまだありません。", "No plans for tomorrow yet.")}</p>}
            {tomorrowTaskCount > 0 && reflectionStatus !== "completed" ? <p className="mt-3 text-xs leading-5 text-[#68708f]">{t("今日の振り返り前でも、予定情報だけでプランを作成できます。", "You can create a plan from schedule information before today's check-in.")}</p> : null}
          </section>
        ) : null}
      </div>

      {assessmentOpen ? (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#f5f6fa]">
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] shadow-[0_0_36px_rgba(28,35,70,0.08)]">
            <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center">
              <button type="button" aria-label={assessmentIndex === 0 ? t("自己評価を閉じる", "Close self-check") : t("前の質問に戻る", "Previous question")} onClick={() => { if (assessmentIndex === 0) requestAssessmentClose(); else setAssessmentIndex((current) => current - 1); }} className="grid size-11 place-items-center text-[#303857] disabled:opacity-40" disabled={Boolean(processingStage)}><ArrowLeft size={21} /></button>
              <p className="text-center text-sm font-bold text-[#303857]">{t("今日の負荷を確認", "Check today's load")}</p>
              <button type="button" aria-label={t("自己評価を閉じる", "Close self-check")} title={t("閉じる", "Close")} onClick={requestAssessmentClose} className="grid size-11 place-items-center text-[#303857] transition-transform active:scale-95 disabled:opacity-40" disabled={Boolean(processingStage)}><X size={21} /></button>
            </header>

            <div className="mt-3 flex gap-1.5" aria-hidden="true">{localizedAssessmentQuestions.map((question, index) => <span key={question.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e8eaf2]"><span className={`block h-full rounded-full bg-[#5b42ff] transition-transform duration-200 ${index <= assessmentIndex ? "translate-x-0" : "-translate-x-full"}`} /></span>)}</div>

            {processingStage ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 text-center"><span className="grid size-20 place-items-center rounded-full bg-[#efedff] text-[#5b42ff]"><LoaderCircle size={34} className="animate-spin" /></span><h2 className="mt-6 text-xl font-bold text-[#111735]">{t("回答をもとに解析中", "Analyzing your answers")}</h2><p className="mt-2 text-sm text-[#68708f]">{processingStage}</p></div>
            ) : (
              <main className="flex flex-1 flex-col py-7">
                <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-[#5b42ff]">{assessmentQuestion.eyebrow}</p><p className="text-xs font-bold tabular-nums text-[#7b829c]">{assessmentIndex + 1} / {localizedAssessmentQuestions.length}</p></div>
                <h1 className="mt-5 text-[24px] font-bold leading-9 text-[#111735]">{assessmentQuestion.question}</h1>
                <div className={`mt-8 grid ${assessmentQuestion.key === "sleepiness" ? "gap-1.5 pb-2" : "my-auto gap-2.5"}`} role="group" aria-label={assessmentQuestion.question}>
                  {assessmentQuestion.options.map((option) => {
                    const selected = selfReport[assessmentQuestion.key] === option.value;
                    return <button key={option.value} type="button" onClick={() => answerAssessment(assessmentQuestion, option.value)} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 text-left font-semibold transition-[background-color,border-color,transform] active:scale-[0.98] ${assessmentQuestion.key === "sleepiness" ? "min-h-11 py-2 text-xs" : "min-h-[52px] py-3 text-sm"} ${selected ? "border-[#5b42ff] bg-[#f3f1ff] text-[#3f2bc7]" : "border-[#dfe2ec] bg-white text-[#303857]"}`} aria-pressed={selected}><span>{option.label}</span>{selected ? <Check size={18} className="shrink-0" /> : null}</button>;
                  })}
                </div>
              </main>
            )}

            {error ? <div role="alert" className="mb-2 rounded-lg bg-[#fff4f5] p-3 text-xs leading-5 text-[#b43d4d]">{error}</div> : null}
          </div>

          {assessmentCloseConfirmOpen ? (
            <div className="fixed inset-0 z-[90] grid place-items-center bg-[#111735]/45 px-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssessmentCloseConfirmOpen(false); }}>
              <section role="alertdialog" aria-modal="true" aria-labelledby="assessment-close-title" aria-describedby="assessment-close-description" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(17,23,53,0.24)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="assessment-close-title" className="text-base font-bold text-[#111735]">{t("今日の負荷確認を閉じますか？", "Close today's load check?")}</h2>
                    <p id="assessment-close-description" className="mt-2 text-sm leading-6 text-[#68708f]">{t("録音した音声と、ここまでに選択した回答はすべて削除されます。この操作は取り消せません。", "The recording and all answers selected so far will be deleted. This cannot be undone.")}</p>
                  </div>
                  <button type="button" aria-label={t("確認を閉じる", "Close confirmation")} onClick={() => setAssessmentCloseConfirmOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-full text-[#747b96] hover:bg-[#f4f5f8]"><X size={18} /></button>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setAssessmentCloseConfirmOpen(false)} className="min-h-11 rounded-lg border border-[#dfe2ec] px-3 text-sm font-bold text-[#4f5878]">{t("キャンセル", "Cancel")}</button>
                  <button type="button" onClick={confirmAssessmentClose} className="min-h-11 rounded-lg bg-[#e54863] px-3 text-sm font-bold text-white active:scale-[0.98]">{t("削除して閉じる", "Delete and close")}</button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      ) : null}

      {transcriptReview ? (
        <TranscriptReviewPanel
          review={transcriptReview}
          audioBlobs={reviewAudioBlobs}
          processingStage={processingStage}
          error={error}
          onChange={onTranscriptReviewChange}
          onConfirm={onTranscriptReviewConfirm}
          onRetry={onTranscriptReviewRetry}
          onClose={onTranscriptReviewClose}
        />
      ) : null}
    </div>
  );
}

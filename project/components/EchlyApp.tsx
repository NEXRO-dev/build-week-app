"use client";

import { useEffect, useMemo, useState } from "react";

import { AnalysisView } from "@/components/analysis/AnalysisView";
import { ApprovalView } from "@/components/approval/ApprovalView";
import {
  CheckInView,
  type CheckInMode,
  type ReflectionStatus,
} from "@/components/check-in/CheckInView";
import { HistoryView } from "@/components/history/HistoryView";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyWorkspaceView } from "@/components/layout/EmptyWorkspaceView";
import { PlanView } from "@/components/plan/PlanView";
import { SettingsView } from "@/components/settings/SettingsView";
import {
  getZonedNow,
  isReflectionWindowOpen,
  nextDateKey,
  resolveBrowserTimeZone,
  type ZonedNow,
} from "@/lib/date/localTime";
import { mockCalendarEvents } from "@/lib/demo/mockCalendar";
import {
  createDemoAnalysis,
  createDemoPlan,
  getSampleHistory,
} from "@/lib/demo/sampleCheckIns";
import {
  calculateLoadSignal,
  isCompleteWorkloadSelfReport,
} from "@/lib/load/calculateLoadSignal";
import { applySpokenTimesToPlan } from "@/lib/plan/applySpokenTimes";
import { isTomorrowActionableTask } from "@/lib/tasks/temporal";
import { normalizeExtractedTaskTimes } from "@/lib/tasks/time";
import type {
  AnalysisResult,
  AudioMeta,
  CheckIn,
  ConditionSignal,
  ExtractedTask,
  ScheduleEntry,
  TranscriptReview,
  TomorrowPlan,
  WorkloadSelfReport,
  WorkspaceView,
} from "@/types/echly";

const EMPTY_AUDIO_META: AudioMeta = {
  durationSec: 0,
  averageVolume: null,
  silenceRatio: null,
  speechRate: null,
};

const HISTORY_STORAGE_KEY = "echly.checkins.v1";
const SCHEDULE_STORAGE_KEY = "echly.schedule-entries.v1";

type ModeAudio = {
  blob: Blob | null;
  meta: AudioMeta;
};

type AudioByMode = Record<CheckInMode, ModeAudio>;

class ApiClientError extends Error {
  code: string;

  constructor(message: string, code = "UNKNOWN") {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

function canUseDemoFallback(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.code === "CLOUDFLARE_CONFIG_MISSING" ||
      error.code === "CLOUDFLARE_LIMIT_REACHED")
  );
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string; code?: string };
  if (!response.ok) {
    throw new ApiClientError(data.error ?? "処理に失敗しました。", data.code);
  }
  return data;
}

function newId(prefix: string) {
  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function createEmptyAudioByMode(): AudioByMode {
  return {
    reflection: { blob: null, meta: { ...EMPTY_AUDIO_META } },
    planning: { blob: null, meta: { ...EMPTY_AUDIO_META } },
  };
}

function audioMetaWithSpeechRate(meta: AudioMeta, transcript: string): AudioMeta {
  return {
    ...meta,
    speechRate:
      meta.durationSec > 0 && transcript.length > 0
        ? Number((transcript.length / meta.durationSec).toFixed(2))
        : null,
  };
}

function emptyPlan(condition: ConditionSignal): TomorrowPlan {
  return {
    condition,
    keep: [],
    move: [],
    reschedule: [],
    restBlocks: [],
    emailDrafts: [],
    rationale: [],
  };
}

function hasMeasuredCondition(checkIn: CheckIn) {
  return (
    checkIn.condition.methodVersion === "echly-load-v1" ||
    typeof checkIn.condition.score === "number"
  );
}

function isPersonalVoiceHistory(checkIn: CheckIn) {
  return Boolean(checkIn.localDate) || checkIn.source === "cloudflare";
}

function uniqueTasks(tasks: ExtractedTask[]) {
  const unique = new Map<string, ExtractedTask>();
  for (const task of tasks) {
    const key = [task.title.trim(), task.date ?? "", task.startTime ?? ""].join("|");
    if (!unique.has(key)) unique.set(key, task);
  }
  return [...unique.values()];
}

type EchlyAppProps = {
  todayLabel: string;
};

export function EchlyApp({ todayLabel: serverTodayLabel }: EchlyAppProps) {
  const [view, setView] = useState<WorkspaceView>("checkin");
  const [transcriptByMode, setTranscriptByMode] = useState<Record<CheckInMode, string>>({
    reflection: "",
    planning: "",
  });
  const [transcript, setTranscript] = useState("");
  const [audioByMode, setAudioByMode] = useState<AudioByMode>(createEmptyAudioByMode);
  const [selfReport, setSelfReport] = useState<Partial<WorkloadSelfReport>>({});
  const [audioMeta, setAudioMeta] = useState<AudioMeta>(EMPTY_AUDIO_META);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [plan, setPlan] = useState<TomorrowPlan | null>(null);
  const [source, setSource] = useState<"cloudflare" | "demo">("demo");
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryRecordingMode, setRetryRecordingMode] = useState<CheckInMode | null>(null);
  const [transcriptReview, setTranscriptReview] = useState<TranscriptReview | null>(null);
  const [pendingReflectionReport, setPendingReflectionReport] =
    useState<WorkloadSelfReport | null>(null);
  const [appliedActionIds, setAppliedActionIds] = useState<string[]>([]);
  const [history, setHistory] = useState<CheckIn[]>(() => getSampleHistory());
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [zonedNow, setZonedNow] = useState<ZonedNow | null>(null);
  const [saveTranscript, setSaveTranscript] = useState(true);

  useEffect(() => {
    const timeZone = resolveBrowserTimeZone();
    const updateClock = () => setZonedNow(getZonedNow(new Date(), timeZone));
    updateClock();
    const intervalId = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const savedHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
        if (savedHistory) {
          const parsed = JSON.parse(savedHistory) as CheckIn[];
          if (Array.isArray(parsed)) {
            const uniqueCheckIns = new Map<string, CheckIn>();
            for (const checkIn of [...parsed, ...getSampleHistory()]) {
              if (!uniqueCheckIns.has(checkIn.id)) uniqueCheckIns.set(checkIn.id, checkIn);
            }
            setHistory([...uniqueCheckIns.values()]);
          }
        }

        const savedSchedules = window.localStorage.getItem(SCHEDULE_STORAGE_KEY);
        if (savedSchedules) {
          const parsed = JSON.parse(savedSchedules) as ScheduleEntry[];
          if (Array.isArray(parsed)) setScheduleEntries(parsed);
        }
      } catch {
        // Browser storage is optional; the current session remains usable.
      } finally {
        setStorageLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  const localDate = zonedNow?.dateKey ?? null;
  const tomorrowDate = localDate ? nextDateKey(localDate) : null;
  const todayCheckIn = useMemo(
    () =>
      localDate
        ? history.find(
            (item) =>
              item.localDate === localDate && hasMeasuredCondition(item),
          ) ?? null
        : null,
    [history, localDate],
  );
  const tomorrowEntries = useMemo(
    () =>
      tomorrowDate
        ? scheduleEntries.filter((entry) => entry.targetDate === tomorrowDate)
        : [],
    [scheduleEntries, tomorrowDate],
  );
  const activeAnalysis = useMemo(
    () =>
      analysis ??
      (todayCheckIn
        ? { tasks: todayCheckIn.tasks, condition: todayCheckIn.condition }
        : null),
    [analysis, todayCheckIn],
  );
  const activeTranscript = analysis ? transcript : todayCheckIn?.transcript ?? "";
  const activeAudioMeta = analysis ? audioMeta : todayCheckIn?.audioMeta ?? EMPTY_AUDIO_META;
  const activeSource: "cloudflare" | "demo" = analysis
    ? source
    : todayCheckIn?.source === "cloudflare"
      ? "cloudflare"
      : "demo";
  const scheduledTasks = useMemo(
    () =>
      uniqueTasks(
        tomorrowEntries.flatMap((entry) => entry.tasks).filter(isTomorrowActionableTask),
      ),
    [tomorrowEntries],
  );
  const planTasks = useMemo(
    () =>
      uniqueTasks([
        ...(activeAnalysis?.tasks.filter(isTomorrowActionableTask) ?? []),
        ...scheduledTasks,
      ]),
    [activeAnalysis, scheduledTasks],
  );
  const reflectionStatus: ReflectionStatus =
    !storageLoaded || !zonedNow
      ? "loading"
      : todayCheckIn
        ? "completed"
        : isReflectionWindowOpen(zonedNow)
          ? "available"
          : "too-early";
  const reflectionCompletedAt = todayCheckIn && zonedNow
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: zonedNow.timeZone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(todayCheckIn.createdAt))
    : null;

  const actionCount = useMemo(() => {
    if (!plan) return 0;
    return plan.move.length + plan.reschedule.length + plan.restBlocks.length + plan.emailDrafts.length;
  }, [plan]);

  function persistHistory(update: (current: CheckIn[]) => CheckIn[]) {
    setHistory((current) => {
      const next = update(current);
      try {
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next.slice(0, 30)));
      } catch {
        // In-memory history remains usable in private browsing modes.
      }
      return next;
    });
  }

  function persistScheduleEntries(update: (current: ScheduleEntry[]) => ScheduleEntry[]) {
    setScheduleEntries((current) => {
      const next = update(current);
      try {
        window.localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(next.slice(0, 60)));
      } catch {
        // In-memory schedule entries remain usable in private browsing modes.
      }
      return next;
    });
  }

  function handleAudioReady(mode: CheckInMode, blob: Blob, meta: AudioMeta) {
    setAudioByMode((current) => ({ ...current, [mode]: { blob, meta } }));
    setError(null);
  }

  function handleAudioDiscard(mode: CheckInMode) {
    setAudioByMode((current) => ({
      ...current,
      [mode]: { blob: null, meta: { ...EMPTY_AUDIO_META } },
    }));
  }

  async function transcribeRecording(
    mode: CheckInMode,
    audioBlob: Blob,
    meta: AudioMeta,
  ) {
    const formData = new FormData();
    const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
    formData.append("audio", audioBlob, `echly-${mode}.${extension}`);
    formData.append("context", mode);
    formData.append("durationSec", String(meta.durationSec));
    if (meta.averageVolume !== null) formData.append("averageVolume", String(meta.averageVolume));
    if (meta.silenceRatio !== null) formData.append("silenceRatio", String(meta.silenceRatio));
    const response = await fetch("/api/transcribe", { method: "POST", body: formData });
    return parseApiResponse<{
      transcript: string;
      provider: TranscriptReview["provider"];
      confidence: number | null;
      agreement: number | null;
      quality: TranscriptReview["quality"];
      requiresConfirmation: true;
      alternatives: TranscriptReview["alternatives"];
    }>(response);
  }

  async function resolveModeTranscript(
    mode: CheckInMode,
    confirmedTranscript?: string,
  ): Promise<string | null> {
    if (confirmedTranscript !== undefined) {
      const confirmed = confirmedTranscript.trim();
      if (!confirmed) {
        throw new ApiClientError(
          "確認した文字起こしを入力してください。",
          "INPUT_REQUIRED",
        );
      }
      return confirmed;
    }

    const typed = transcriptByMode[mode].trim();
    const recording = audioByMode[mode];

    if (recording.blob) {
      try {
        const result = await transcribeRecording(
          mode,
          recording.blob,
          recording.meta,
        );
        const resolved = [result.transcript.trim(), typed]
          .filter(Boolean)
          .join("\n\n");

        if (!resolved) {
          throw new ApiClientError(
            "音声を認識できませんでした。もう一度録音してください。",
            "NO_SPEECH_DETECTED",
          );
        }

        setTranscriptReview({
          mode,
          transcript: resolved,
          provider: result.provider,
          confidence: result.confidence,
          agreement: result.agreement,
          quality: result.quality,
          alternatives: result.alternatives.map((alternative) => ({
            ...alternative,
            transcript: [alternative.transcript.trim(), typed]
              .filter(Boolean)
              .join("\n\n"),
          })),
        });
        return null;
      } catch (caught) {
        if (
          caught instanceof ApiClientError &&
          caught.code === "NO_SPEECH_DETECTED"
        ) {
          handleAudioDiscard(mode);
          setRetryRecordingMode(mode);
        }
        if (canUseDemoFallback(caught) && typed) return typed;
        throw caught;
      }
    }

    if (typed) return typed;

    throw new ApiClientError(
      mode === "reflection"
        ? "今日の振り返りを録音するか、テキストで入力してください。"
        : "明日の予定を録音するか、テキストで入力してください。",
      "INPUT_REQUIRED",
    );
  }

  async function handleAnalyzeReflection(
    completedReport: WorkloadSelfReport,
    confirmedTranscript?: string,
  ) {
    if (reflectionStatus !== "available" || !zonedNow || !localDate) {
      setError(
        reflectionStatus === "completed"
          ? "今日の振り返りはすでに完了しています。"
          : "今日の振り返りは、端末のタイムゾーンで20:00以降に利用できます。",
      );
      return;
    }
    if (!isCompleteWorkloadSelfReport(completedReport)) {
      setError("負荷の自己評価7項目に回答してください。");
      return;
    }

    setSelfReport(completedReport);
    if (confirmedTranscript === undefined) {
      setPendingReflectionReport(completedReport);
    }
    setError(null);
    setProcessingStage(
      confirmedTranscript === undefined
        ? "今日の振り返りを文字起こし中..."
        : "今日の負荷を解析中...",
    );

    try {
      const resolvedTranscript = await resolveModeTranscript(
        "reflection",
        confirmedTranscript,
      );
      if (resolvedTranscript === null) return;

      const resolvedAudioMeta = audioMetaWithSpeechRate(
        audioByMode.reflection.meta,
        resolvedTranscript,
      );
      const audioBaseline = history
        .filter(isPersonalVoiceHistory)
        .map((item) => item.audioMeta);
      setProcessingStage("今日の負荷を解析中...");

      let result: AnalysisResult;
      let resolvedSource: "cloudflare" | "demo" = "cloudflare";
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: resolvedTranscript,
            selfReport: completedReport,
            audioBaseline,
            audioMeta: resolvedAudioMeta,
            referenceDate: new Date().toISOString(),
            timeZone: zonedNow.timeZone,
          }),
        });
        result = await parseApiResponse<AnalysisResult>(response);
      } catch (caught) {
        if (!canUseDemoFallback(caught)) throw caught;
        const demo = createDemoAnalysis(resolvedTranscript);
        result = {
          ...demo,
          condition: calculateLoadSignal({
            selfReport: completedReport,
            audioMeta: resolvedAudioMeta,
            audioBaseline,
          }),
        };
        resolvedSource = "demo";
      }

      const checkIn: CheckIn = {
        id: newId("checkin"),
        createdAt: new Date().toISOString(),
        localDate,
        timeZone: zonedNow.timeZone,
        transcript: saveTranscript
          ? resolvedTranscript
          : "文字起こしは保存しない設定です。",
        audioMeta: resolvedAudioMeta,
        condition: result.condition,
        tasks: result.tasks,
        plan: emptyPlan(result.condition),
        approvalStatus: "draft",
        approvedActionIds: [],
        source: resolvedSource,
      };

      persistHistory((current) => [
        checkIn,
        ...current.filter((item) => item.localDate !== localDate),
      ]);
      setTranscript(resolvedTranscript);
      setAudioMeta(resolvedAudioMeta);
      setAnalysis(result);
      setPlan(null);
      setAppliedActionIds([]);
      setSource(resolvedSource);
      setTranscriptReview(null);
      setPendingReflectionReport(null);
      setView("analysis");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "今日の振り返りを解析できませんでした。",
      );
    } finally {
      setProcessingStage(null);
    }
  }

  async function handleAddSchedule(confirmedTranscript?: string) {
    if (!zonedNow || !tomorrowDate) {
      setError(
        "端末のタイムゾーンを確認中です。少し待ってからもう一度お試しください。",
      );
      return;
    }

    setError(null);
    setProcessingStage(
      confirmedTranscript === undefined
        ? "明日の予定を文字起こし中..."
        : "予定とタスクを整理中...",
    );

    try {
      const resolvedTranscript = await resolveModeTranscript(
        "planning",
        confirmedTranscript,
      );
      if (resolvedTranscript === null) return;

      const resolvedAudioMeta = audioMetaWithSpeechRate(
        audioByMode.planning.meta,
        resolvedTranscript,
      );
      setProcessingStage("予定とタスクを整理中...");

      let tasks: ExtractedTask[];
      let resolvedSource: "cloudflare" | "demo" = "cloudflare";
      try {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: resolvedTranscript,
            referenceDate: new Date().toISOString(),
            timeZone: zonedNow.timeZone,
          }),
        });
        const result = await parseApiResponse<{ tasks: ExtractedTask[] }>(
          response,
        );
        tasks = result.tasks;
      } catch (caught) {
        if (!canUseDemoFallback(caught)) throw caught;
        tasks = createDemoAnalysis(resolvedTranscript).tasks;
        resolvedSource = "demo";
      }

      tasks = tasks.map(normalizeExtractedTaskTimes);
      const actionable = tasks.filter(isTomorrowActionableTask);
      if (!actionable.length) {
        throw new ApiClientError(
          "明日の予定として確定できる内容が見つかりませんでした。日付や、やることを具体的にしてもう一度追加してください。",
          "NO_TOMORROW_TASKS",
        );
      }

      const entryId = newId("schedule");
      const entry: ScheduleEntry = {
        id: entryId,
        createdAt: new Date().toISOString(),
        targetDate: tomorrowDate,
        transcript: resolvedTranscript,
        audioMeta: resolvedAudioMeta,
        tasks: actionable.map((task, index) => ({
          ...task,
          id: `${entryId}-${task.id || index + 1}`,
        })),
        source: resolvedSource,
      };
      persistScheduleEntries((current) => [entry, ...current]);
      setTranscriptByMode((current) => ({ ...current, planning: "" }));
      handleAudioDiscard("planning");
      setTranscriptReview(null);
      setPlan(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "明日の予定を追加できませんでした。",
      );
    } finally {
      setProcessingStage(null);
    }
  }

  async function handleTranscriptReviewConfirm() {
    if (!transcriptReview) return;
    setError(null);

    if (transcriptReview.mode === "reflection") {
      if (!pendingReflectionReport) {
        setError("自己評価の回答を確認できませんでした。もう一度お試しください。");
        return;
      }
      await handleAnalyzeReflection(
        pendingReflectionReport,
        transcriptReview.transcript,
      );
      return;
    }

    await handleAddSchedule(transcriptReview.transcript);
  }

  function handleTranscriptReviewRetry() {
    if (!transcriptReview) return;
    const mode = transcriptReview.mode;
    setTranscriptReview(null);
    setPendingReflectionReport(null);
    setError(null);
    handleAudioDiscard(mode);
    setRetryRecordingMode(mode);
  }

  function handleTranscriptReviewClose() {
    setTranscriptReview(null);
    setPendingReflectionReport(null);
    setError(null);
    setProcessingStage(null);
  }
  async function handleCreatePlan() {
    if (!activeAnalysis) {
      setError("今日の振り返りを完了すると、負荷に合わせたプランを作成できます。");
      setView("checkin");
      return;
    }
    setError(null);
    setProcessingStage("明日のプランを作成中...");

    try {
      let nextPlan: TomorrowPlan;
      if (activeSource === "demo") {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        nextPlan = createDemoPlan(planTasks, activeAnalysis.condition);
      } else {
        const response = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tasks: planTasks,
            condition: activeAnalysis.condition,
            calendarEvents: mockCalendarEvents,
          }),
        });
        try {
          const data = await parseApiResponse<{ plan: TomorrowPlan }>(response);
          nextPlan = data.plan;
        } catch (caught) {
          if (!canUseDemoFallback(caught)) throw caught;
          nextPlan = createDemoPlan(planTasks, activeAnalysis.condition);
          setSource("demo");
        }
      }
      nextPlan = applySpokenTimesToPlan(nextPlan, planTasks);
      setPlan(nextPlan);
      setAppliedActionIds([]);
      setView("plan");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "明日のプランを作成できませんでした。");
    } finally {
      setProcessingStage(null);
    }
  }

  function handleApply(ids: string[]) {
    if (!activeAnalysis || !plan || !ids.length) return;
    const mergedIds = Array.from(new Set([...appliedActionIds, ...ids]));
    setAppliedActionIds(mergedIds);

    persistHistory((current) => {
      const currentRecord = localDate
        ? current.find((item) => item.localDate === localDate)
        : undefined;
      if (!currentRecord) return current;
      const updated: CheckIn = {
        ...currentRecord,
        plan,
        approvalStatus:
          mergedIds.length >= actionCount ? "approved" : "partially_approved",
        approvedActionIds: mergedIds,
      };
      return [updated, ...current.filter((item) => item.id !== updated.id)];
    });
  }

  function handleRemoveSchedule(id: string) {
    persistScheduleEntries((current) => current.filter((entry) => entry.id !== id));
    setPlan(null);
  }

  function startNewCheckIn() {
    setSelfReport({});
    setTranscriptByMode({ reflection: "", planning: "" });
    setTranscript("");
    setAudioByMode(createEmptyAudioByMode());
    setAudioMeta({ ...EMPTY_AUDIO_META });
    setAnalysis(null);
    setPlan(null);
    setAppliedActionIds([]);
    setError(null);
    setProcessingStage(null);
    setRetryRecordingMode(null);
    setTranscriptReview(null);
    setPendingReflectionReport(null);
    setSource("demo");
    setView("checkin");
  }

  let content;
  if (view === "analysis") {
    content = activeAnalysis ? (
      <AnalysisView
        transcript={activeTranscript}
        audioBlob={analysis ? audioByMode.reflection.blob : null}
        audioMeta={activeAudioMeta}
        tasks={uniqueTasks([...activeAnalysis.tasks, ...scheduledTasks])}
        condition={activeAnalysis.condition}
        source={activeSource}
        onBack={() => setView("checkin")}
        onCreatePlan={handleCreatePlan}
        processingStage={processingStage}
        error={error}
      />
    ) : (
      <EmptyWorkspaceView type="analysis" onCheckIn={() => setView("checkin")} />
    );
  } else if (view === "plan") {
    content = plan ? (
      <PlanView
        plan={plan}
        onPlanChange={setPlan}
        onBack={() => setView("analysis")}
        onApproval={() => setView("approval")}
      />
    ) : (
      <EmptyWorkspaceView
        type="plan"
        hasAnalysis={Boolean(activeAnalysis)}
        onCheckIn={() => setView("checkin")}
        onShowAnalysis={() => setView("analysis")}
      />
    );
  } else if (view === "approval" && plan) {
    content = (
      <ApprovalView
        plan={plan}
        appliedActionIds={appliedActionIds}
        onPlanChange={setPlan}
        onApply={handleApply}
        onBack={() => setView("plan")}
      />
    );
  } else if (view === "history") {
    content = <HistoryView checkIns={history} onNewCheckIn={startNewCheckIn} />;
  } else if (view === "settings") {
    content = <SettingsView saveTranscript={saveTranscript} onSaveTranscriptChange={setSaveTranscript} />;
  } else {
    content = (
      <CheckInView
        todayLabel={zonedNow?.label ?? serverTodayLabel}
        timeZone={zonedNow?.timeZone ?? "タイムゾーンを確認中"}
        previousCondition={activeAnalysis?.condition ?? history.find(hasMeasuredCondition)?.condition ?? null}
        reflectionStatus={reflectionStatus}
        reflectionCompletedAt={reflectionCompletedAt}
        transcriptByMode={transcriptByMode}
        onTranscriptChange={(mode, value) => setTranscriptByMode((current) => ({ ...current, [mode]: value }))}
        audioByMode={{ reflection: audioByMode.reflection.blob, planning: audioByMode.planning.blob }}
        retryRecordingMode={retryRecordingMode}
        onRetryRecordingShown={() => setRetryRecordingMode(null)}
        transcriptReview={transcriptReview}
        onTranscriptReviewChange={(value) =>
          setTranscriptReview((current) =>
            current ? { ...current, transcript: value } : current,
          )
        }
        onTranscriptReviewConfirm={handleTranscriptReviewConfirm}
        onTranscriptReviewRetry={handleTranscriptReviewRetry}
        onTranscriptReviewClose={handleTranscriptReviewClose}
        onAudioReady={handleAudioReady}
        onAudioDiscard={handleAudioDiscard}
        selfReport={selfReport}
        onSelfReportChange={(key, value) => setSelfReport((current) => ({ ...current, [key]: value }))}
        onAnalyzeReflection={handleAnalyzeReflection}
        onAddSchedule={handleAddSchedule}
        scheduleEntries={tomorrowEntries}
        onRemoveSchedule={handleRemoveSchedule}
        onCreatePlan={handleCreatePlan}
        onError={setError}
        processingStage={processingStage}
        error={error}
      />
    );
  }

  return (
    <AppShell view={view} onViewChange={setView}>
      {content}
    </AppShell>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AnalysisView } from "@/components/analysis/AnalysisView";
import { ApprovalView } from "@/components/approval/ApprovalView";
import { SignInView } from "@/components/auth/SignInView";
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
} from "@/lib/demo/sampleCheckIns";
import {
  calculateLoadSignal,
  isCompleteWorkloadSelfReport,
} from "@/lib/load/calculateLoadSignal";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
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
const DEBUG_TIME_ZONE_STORAGE_KEY = "echly.debug-time-zone.v1";

type ModeAudio = {
  blob: Blob | null;
  meta: AudioMeta;
};

type AudioByMode = Record<CheckInMode, ModeAudio>;

type WorkspaceData = {
  history: CheckIn[];
  scheduleEntries: ScheduleEntry[];
  preferences: { saveTranscript: boolean };
};

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

async function parseApiResponse<T>(
  response: Response,
  isEnglish = false,
): Promise<T> {
  const data = (await response.json()) as T & { error?: string; code?: string };
  if (!response.ok) {
    const englishErrors: Record<string, string> = {
      UNAUTHORIZED: "Please sign in to continue.",
      AUDIO_REQUIRED: "An audio file is required.",
      AUDIO_TOO_LARGE: "Audio files must be 4 MB or smaller.",
      NO_SPEECH_DETECTED: "The recording could not be transcribed. Play it back, record again, or add the details as text.",
      CLOUDFLARE_CONFIG_MISSING: "AI processing is not configured yet.",
      CLOUDFLARE_AUTH_FAILED: "The AI service credentials could not be verified.",
      CLOUDFLARE_LIMIT_REACHED: "The AI usage limit has been reached. Please try again later.",
      CLOUDFLARE_INVALID_RESPONSE: "The AI response could not be validated. Please try again.",
      CLOUDFLARE_REQUEST_FAILED: "AI processing could not be completed. Please try again later.",
      DATABASE_REQUEST_FAILED: "Your data could not be saved or loaded. Please try again.",
      INVALID_DATA: "The data could not be validated. Please try again.",
    };
    const message = isEnglish
      ? englishErrors[data.code ?? ""] ?? "Something went wrong. Please try again."
      : data.error ?? "処理に失敗しました。";
    throw new ApiClientError(message, data.code);
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

function combineAudioMeta(
  metas: AudioMeta[],
  transcript: string,
): AudioMeta {
  const durationSec = metas.reduce(
    (sum, meta) => sum + Math.max(0, meta.durationSec),
    0,
  );
  const weightedAverage = (key: "averageVolume" | "silenceRatio") => {
    const available = metas.filter(
      (meta) => meta[key] !== null && meta.durationSec > 0,
    );
    const duration = available.reduce((sum, meta) => sum + meta.durationSec, 0);
    if (!duration) return null;
    return Number(
      (
        available.reduce(
          (sum, meta) => sum + (meta[key] ?? 0) * meta.durationSec,
          0,
        ) / duration
      ).toFixed(3),
    );
  };

  return {
    durationSec: Number(durationSec.toFixed(1)),
    averageVolume: weightedAverage("averageVolume"),
    silenceRatio: weightedAverage("silenceRatio"),
    speechRate:
      durationSec > 0 && transcript.length > 0
        ? Number((transcript.length / durationSec).toFixed(2))
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

function isValidTimeZone(value: string | null): value is string {
  if (!value) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

type EchlyAppProps = {
  todayLabel: string;
};

export function EchlyApp({ todayLabel: serverTodayLabel }: EchlyAppProps) {
  const { isEnglish, t } = useI18n();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const sessionUserId = session?.user.id ?? null;
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
  const [history, setHistory] = useState<CheckIn[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [zonedNow, setZonedNow] = useState<ZonedNow | null>(null);
  const [debugTimeZone, setDebugTimeZone] = useState<string | null>(null);
  const [saveTranscript, setSaveTranscript] = useState(true);
  const [tabsPreloaded, setTabsPreloaded] = useState(false);
  const checkInWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const timeZone = debugTimeZone ?? resolveBrowserTimeZone();
    const updateClock = () => setZonedNow(getZonedNow(new Date(), timeZone));
    updateClock();
    const intervalId = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(intervalId);
  }, [debugTimeZone]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const savedTimeZone = window.localStorage.getItem(
          DEBUG_TIME_ZONE_STORAGE_KEY,
        );
        if (isValidTimeZone(savedTimeZone)) setDebugTimeZone(savedTimeZone);
      } catch {
        // Debug settings are optional; fall back to the browser time zone.
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!sessionUserId) return;

    let cancelled = false;
    const resetStateId = window.setTimeout(() => {
      setHistory([]);
      setScheduleEntries([]);
      setStorageLoaded(false);
    }, 0);

    async function loadDatabaseWorkspace() {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        const workspace = await parseApiResponse<WorkspaceData>(
          response,
          isEnglish,
        );
        const historyById = new Map(
          workspace.history.map((checkIn) => [checkIn.id, checkIn]),
        );
        const schedulesById = new Map(
          workspace.scheduleEntries.map((entry) => [entry.id, entry]),
        );
        let hasLegacyData = false;
        const legacyHistory: CheckIn[] = [];
        const legacyScheduleEntries: ScheduleEntry[] = [];

        try {
          const savedHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
          if (savedHistory) {
            const parsed = JSON.parse(savedHistory) as CheckIn[];
            if (Array.isArray(parsed)) {
              for (const checkIn of parsed) {
                if (checkIn.id === "history-1" || checkIn.id === "history-2") {
                  continue;
                }
                historyById.set(checkIn.id, checkIn);
                legacyHistory.push(checkIn);
                hasLegacyData = true;
              }
            }
          }

          const savedSchedules = window.localStorage.getItem(
            SCHEDULE_STORAGE_KEY,
          );
          if (savedSchedules) {
            const parsed = JSON.parse(savedSchedules) as ScheduleEntry[];
            if (Array.isArray(parsed)) {
              for (const entry of parsed) {
                schedulesById.set(entry.id, entry);
                legacyScheduleEntries.push(entry);
                hasLegacyData = true;
              }
            }
          }
        } catch {
          // Invalid legacy storage is ignored; the database remains authoritative.
        }

        const mergedHistory = [...historyById.values()]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 30);
        const mergedSchedules = [...schedulesById.values()]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 60);

        if (hasLegacyData) {
          try {
            const importResponse = await fetch("/api/workspace", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                history: legacyHistory.slice(0, 30),
                scheduleEntries: legacyScheduleEntries.slice(0, 60),
              }),
            });
            await parseApiResponse(importResponse, isEnglish);
            window.localStorage.removeItem(HISTORY_STORAGE_KEY);
            window.localStorage.removeItem(SCHEDULE_STORAGE_KEY);
          } catch (migrationError) {
            if (!cancelled) {
              setError(
                migrationError instanceof Error
                  ? migrationError.message
                  : isEnglish
                    ? "Existing browser data could not be migrated."
                    : "ブラウザ内の既存データを移行できませんでした。",
              );
            }
          }
        }

        if (!cancelled) {
          setHistory(mergedHistory);
          setScheduleEntries(mergedSchedules);
          setSaveTranscript(workspace.preferences.saveTranscript);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : isEnglish
                ? "Your data could not be loaded."
                : "データを読み込めませんでした。",
          );
        }
      } finally {
        if (!cancelled) setStorageLoaded(true);
      }
    }

    void loadDatabaseWorkspace();
    return () => {
      cancelled = true;
      window.clearTimeout(resetStateId);
    };
  }, [isEnglish, sessionUserId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  useEffect(() => {
    if (!session || tabsPreloaded) return;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(
        () => setTabsPreloaded(true),
        { timeout: 800 },
      );
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(() => setTabsPreloaded(true), 250);
    return () => window.clearTimeout(timeoutId);
  }, [session, tabsPreloaded]);

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

  useEffect(() => {
    if (analysis || plan || !todayCheckIn) return;
    const storedPlan = todayCheckIn.plan;
    const hasStoredPlan =
      storedPlan.keep.length > 0 ||
      storedPlan.move.length > 0 ||
      storedPlan.reschedule.length > 0 ||
      storedPlan.restBlocks.length > 0 ||
      storedPlan.emailDrafts.length > 0 ||
      storedPlan.rationale.length > 0;
    if (!hasStoredPlan) return;

    const restoreId = window.setTimeout(() => {
      setPlan(storedPlan);
      setAppliedActionIds(todayCheckIn.approvedActionIds);
    }, 0);
    return () => window.clearTimeout(restoreId);
  }, [analysis, plan, todayCheckIn]);

  if (isSessionPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f7f8fc] text-sm text-[#68708f]">
        {t("ログイン状態を確認しています...", "Checking your session...")}
      </main>
    );
  }

  if (!session) return <SignInView />;
  const signedInUser = session.user;

  function replaceCheckInRecord(checkIn: CheckIn) {
    setHistory((current) => [
      checkIn,
      ...current.filter(
        (item) =>
          item.id !== checkIn.id &&
          (checkIn.localDate === undefined ||
            item.localDate !== checkIn.localDate),
      ),
    ].slice(0, 30));
  }

  function replaceScheduleEntry(scheduleEntry: ScheduleEntry) {
    setScheduleEntries((current) => [
      scheduleEntry,
      ...current.filter((item) => item.id !== scheduleEntry.id),
    ].slice(0, 60));
  }

  async function saveCheckInRecord(checkIn: CheckIn) {
    const response = await fetch("/api/workspace/check-ins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkIn }),
    });
    await parseApiResponse(response, isEnglish);
  }

  function queueCheckInRecord(checkIn: CheckIn) {
    const operation = checkInWriteQueueRef.current
      .catch(() => undefined)
      .then(() => saveCheckInRecord(checkIn));
    checkInWriteQueueRef.current = operation;
    return operation;
  }

  async function saveScheduleEntry(scheduleEntry: ScheduleEntry) {
    const response = await fetch("/api/workspace/schedule-entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleEntry }),
    });
    await parseApiResponse(response, isEnglish);
  }

  async function removeScheduleEntry(id: string) {
    const response = await fetch("/api/workspace/schedule-entries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await parseApiResponse(response, isEnglish);
  }

  async function savePreferences(nextSaveTranscript: boolean) {
    const response = await fetch("/api/workspace/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saveTranscript: nextSaveTranscript }),
    });
    await parseApiResponse(response, isEnglish);
  }

  function handleDebugTimeZoneChange(timeZone: string | null) {
    const nextTimeZone = isValidTimeZone(timeZone) ? timeZone : null;
    setDebugTimeZone(nextTimeZone);

    try {
      if (nextTimeZone) {
        window.localStorage.setItem(
          DEBUG_TIME_ZONE_STORAGE_KEY,
          nextTimeZone,
        );
      } else {
        window.localStorage.removeItem(DEBUG_TIME_ZONE_STORAGE_KEY);
      }
    } catch {
      // The setting still applies to the current session without persistence.
    }
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

  function handleReflectionAssessmentClose() {
    handleAudioDiscard("reflection");
    handleAudioDiscard("planning");
    setSelfReport({});
    setPendingReflectionReport(null);
    setTranscriptReview(null);
    setRetryRecordingMode(null);
    setError(null);
  }

  async function transcribeRecording(
    mode: CheckInMode,
    audioBlob: Blob,
    meta: AudioMeta,
  ) {
    const formData = new FormData();
    const extension = audioBlob.type === "audio/wav"
      ? "wav"
      : audioBlob.type.includes("mp4")
        ? "m4a"
        : "webm";
    formData.append("audio", audioBlob, `echly-${mode}.${extension}`);
    formData.append("context", mode);
    formData.append("locale", isEnglish ? "us-en" : "jp-ja");
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
    }>(response, isEnglish);
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
        if (canUseDemoFallback(caught) && typed) return typed;
        throw caught;
      }
    }

    if (typed) return typed;

    throw new ApiClientError(
      mode === "reflection"
        ? "今日の振り返りと明日の予定を録音するか、テキストで入力してください。"
        : "明日の予定を録音するか、テキストで入力してください。",
      "INPUT_REQUIRED",
    );
  }

  async function resolveCombinedTranscript(
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

    async function resolveSection(mode: CheckInMode) {
      const typed = transcriptByMode[mode].trim();
      const recording = audioByMode[mode];
      let result: Awaited<ReturnType<typeof transcribeRecording>> | null = null;

      if (recording.blob) {
        try {
          result = await transcribeRecording(mode, recording.blob, recording.meta);
        } catch (caught) {
          if (!canUseDemoFallback(caught) || !typed) throw caught;
        }
      }

      const text = [result?.transcript.trim(), typed]
        .filter(Boolean)
        .join("\n\n");
      if (!text) {
        throw new ApiClientError(
          mode === "reflection"
            ? "STEP 1「今日の振り返り」を入力してください。"
            : "STEP 2「明日の予定・タスク」を入力してください。",
          "INPUT_REQUIRED",
        );
      }
      return { mode, typed, result, text };
    }

    const [reflection, planning] = await Promise.all([
      resolveSection("reflection"),
      resolveSection("planning"),
    ]);
    const formatCombined = (reflectionText: string, planningText: string) =>
      isEnglish
        ? `STEP 1 — Today's reflection\n${reflectionText}\n\nSTEP 2 — Tomorrow's plans and tasks\n${planningText}`
        : `STEP 1：今日の振り返り\n${reflectionText}\n\nSTEP 2：明日の予定・タスク\n${planningText}`;
    const transcript = formatCombined(reflection.text, planning.text);
    const transcribed = [reflection.result, planning.result].filter(
      (result): result is NonNullable<typeof result> => Boolean(result),
    );

    if (!transcribed.length) return transcript;

    const primary = transcribed[0];
    const numericMinimum = (values: Array<number | null>) => {
      const numbers = values.filter((value): value is number => value !== null);
      return numbers.length ? Math.min(...numbers) : null;
    };
    const alternativeCount = Math.max(
      1,
      reflection.result?.alternatives.length ?? 0,
      planning.result?.alternatives.length ?? 0,
    );
    const sectionAlternative = (
      section: typeof reflection,
      index: number,
    ) => {
      const recognized = section.result?.alternatives[index]?.transcript.trim()
        ?? section.result?.transcript.trim()
        ?? "";
      return [recognized, section.typed].filter(Boolean).join("\n\n");
    };

    setTranscriptReview({
      mode: "reflection",
      transcript,
      provider: primary.provider,
      confidence: numericMinimum(transcribed.map((result) => result.confidence)),
      agreement: numericMinimum(transcribed.map((result) => result.agreement)),
      quality: transcribed.some((result) => result.quality === "review")
        ? "review"
        : "high",
      alternatives: Array.from({ length: alternativeCount }, (_, index) => ({
        provider: primary.provider,
        transcript: formatCombined(
          sectionAlternative(reflection, index),
          sectionAlternative(planning, index),
        ),
        confidence: numericMinimum(
          [reflection.result, planning.result]
            .filter((result): result is NonNullable<typeof result> => Boolean(result))
            .map((result) => result.alternatives[index]?.confidence ?? result.confidence),
        ),
      })),
    });
    return null;
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
        ? "今日と明日の内容を文字起こし中..."
        : "今日と明日の内容を解析中...",
    );

    try {
      const resolvedTranscript = await resolveCombinedTranscript(
        confirmedTranscript,
      );
      if (resolvedTranscript === null) return;

      const resolvedAudioMeta = combineAudioMeta(
        [audioByMode.reflection.meta, audioByMode.planning.meta],
        resolvedTranscript,
      );
      const audioBaseline = history
        .filter(isPersonalVoiceHistory)
        .map((item) => item.audioMeta);
      setProcessingStage("今日と明日の内容を解析中...");

      let result: AnalysisResult;
      let resolvedSource: "cloudflare" | "demo" = "cloudflare";
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale: isEnglish ? "us-en" : "jp-ja",
            transcript: resolvedTranscript,
            selfReport: completedReport,
            audioBaseline,
            audioMeta: resolvedAudioMeta,
            referenceDate: new Date().toISOString(),
            timeZone: zonedNow.timeZone,
          }),
        });
        result = await parseApiResponse<AnalysisResult>(response, isEnglish);
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
          : t("文字起こしは保存しない設定です。", "Transcript storage is turned off."),
        audioMeta: resolvedAudioMeta,
        condition: result.condition,
        tasks: result.tasks,
        plan: emptyPlan(result.condition),
        approvalStatus: "draft",
        approvedActionIds: [],
        source: resolvedSource,
      };

      await queueCheckInRecord(checkIn);
      replaceCheckInRecord(checkIn);
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
            locale: isEnglish ? "us-en" : "jp-ja",
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
      await saveScheduleEntry(entry);
      replaceScheduleEntry(entry);
      setTranscriptByMode((current) => ({ ...current, planning: "" }));
      handleAudioDiscard("planning");
      setTranscriptReview(null);
      await clearStoredPlan();
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
    const retryingCombinedCheckIn =
      mode === "reflection" && pendingReflectionReport !== null;
    setTranscriptReview(null);
    setPendingReflectionReport(null);
    setError(null);
    if (retryingCombinedCheckIn) {
      handleAudioDiscard("reflection");
      handleAudioDiscard("planning");
      setRetryRecordingMode("reflection");
    } else {
      handleAudioDiscard(mode);
      setRetryRecordingMode(mode);
    }
  }

  function handleTranscriptReviewClose() {
    setTranscriptReview(null);
    setPendingReflectionReport(null);
    setError(null);
    setProcessingStage(null);
  }

  async function persistPlan(nextPlan: TomorrowPlan) {
    setPlan(nextPlan);
    const currentRecord = localDate
      ? history.find((item) => item.localDate === localDate)
      : undefined;
    if (!currentRecord) return;

    const updated: CheckIn = {
      ...currentRecord,
      plan: nextPlan,
    };
    await queueCheckInRecord(updated);
    replaceCheckInRecord(updated);
  }

  function handlePlanChange(nextPlan: TomorrowPlan) {
    void persistPlan(nextPlan).catch((caught) => {
      setError(
        caught instanceof Error
          ? caught.message
          : isEnglish
            ? "The plan change could not be saved."
            : "プランの変更を保存できませんでした。",
      );
    });
  }

  async function clearStoredPlan() {
    setPlan(null);
    const currentRecord = localDate
      ? history.find((item) => item.localDate === localDate)
      : undefined;
    if (!currentRecord) return;

    const updated: CheckIn = {
      ...currentRecord,
      plan: emptyPlan(currentRecord.condition),
      approvalStatus: "draft",
      approvedActionIds: [],
    };
    await queueCheckInRecord(updated);
    replaceCheckInRecord(updated);
    setAppliedActionIds([]);
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
        nextPlan = createDemoPlan(planTasks, activeAnalysis.condition, isEnglish);
      } else {
        const response = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale: isEnglish ? "us-en" : "jp-ja",
            tasks: planTasks,
            condition: activeAnalysis.condition,
            calendarEvents: mockCalendarEvents,
          }),
        });
        try {
          const data = await parseApiResponse<{ plan: TomorrowPlan }>(response, isEnglish);
          nextPlan = data.plan;
        } catch (caught) {
          if (!canUseDemoFallback(caught)) throw caught;
          nextPlan = createDemoPlan(planTasks, activeAnalysis.condition, isEnglish);
          setSource("demo");
        }
      }
      nextPlan = applySpokenTimesToPlan(nextPlan, planTasks);
      await persistPlan(nextPlan);
      setAppliedActionIds([]);
      setView("plan");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "明日のプランを作成できませんでした。");
    } finally {
      setProcessingStage(null);
    }
  }

  async function handleApply(ids: string[]) {
    if (!activeAnalysis || !plan || !ids.length) return;
    const mergedIds = Array.from(new Set([...appliedActionIds, ...ids]));
    const currentRecord = localDate
      ? history.find((item) => item.localDate === localDate)
      : undefined;
    if (!currentRecord) return;

    const updated: CheckIn = {
      ...currentRecord,
      plan,
      approvalStatus:
        mergedIds.length >= actionCount ? "approved" : "partially_approved",
      approvedActionIds: mergedIds,
    };

    try {
      await queueCheckInRecord(updated);
      replaceCheckInRecord(updated);
      setAppliedActionIds(mergedIds);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isEnglish
            ? "Approval could not be saved."
            : "承認内容を保存できませんでした。",
      );
    }
  }

  async function handleRemoveSchedule(id: string) {
    try {
      await removeScheduleEntry(id);
      setScheduleEntries((current) =>
        current.filter((entry) => entry.id !== id),
      );
      await clearStoredPlan();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isEnglish
            ? "The schedule entry could not be deleted."
            : "予定を削除できませんでした。",
      );
    }
  }

  function handleSaveTranscriptChange(nextValue: boolean) {
    const previousValue = saveTranscript;
    setSaveTranscript(nextValue);
    void savePreferences(nextValue).catch((caught) => {
      setSaveTranscript(previousValue);
      setError(
        caught instanceof Error
          ? caught.message
          : isEnglish
            ? "The setting could not be saved."
            : "設定を保存できませんでした。",
      );
    });
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

  function renderView(targetView: WorkspaceView) {
    if (targetView === "analysis") {
      return activeAnalysis ? (
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
    }

    if (targetView === "plan") {
      return plan ? (
        <PlanView
          plan={plan}
          onPlanChange={handlePlanChange}
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
    }

    if (targetView === "approval" && plan) {
      return (
        <ApprovalView
          plan={plan}
          appliedActionIds={appliedActionIds}
          onPlanChange={handlePlanChange}
          onApply={handleApply}
          onBack={() => setView("plan")}
        />
      );
    }

    if (targetView === "history") {
      return <HistoryView checkIns={history} onNewCheckIn={startNewCheckIn} />;
    }

    if (targetView === "settings") {
      return (
        <SettingsView
          user={{ name: signedInUser.name, email: signedInUser.email }}
          saveTranscript={saveTranscript}
          onSaveTranscriptChange={handleSaveTranscriptChange}
          timeZone={zonedNow?.timeZone ?? resolveBrowserTimeZone()}
          deviceTimeZone={resolveBrowserTimeZone()}
          debugTimeZone={debugTimeZone}
          onDebugTimeZoneChange={handleDebugTimeZoneChange}
        />
      );
    }

    return (
      <CheckInView
        userName={signedInUser.name}
        todayLabel={zonedNow?.label ?? serverTodayLabel}
        timeZone={zonedNow?.timeZone ?? t("タイムゾーンを確認中", "Checking time zone")}
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
        onAssessmentClose={handleReflectionAssessmentClose}
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

  const primaryViews = [
    "checkin",
    "analysis",
    "plan",
    "history",
    "settings",
  ] as const;
  const viewsToMount = tabsPreloaded
    ? primaryViews
    : primaryViews.filter((targetView) => targetView === view);

  return (
    <AppShell view={view} onViewChange={setView}>
      {viewsToMount.map((targetView) => (
        <div
          key={targetView}
          hidden={view !== targetView}
          aria-hidden={view !== targetView}
        >
          {renderView(targetView)}
        </div>
      ))}
      {view === "approval" ? renderView("approval") : null}
    </AppShell>
  );
}

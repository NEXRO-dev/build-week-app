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
import type { PlanActivityInput } from "@/components/plan/PlanActivityForm";
import { PlanEmptyView } from "@/components/plan/PlanEmptyView";
import { PlanView } from "@/components/plan/PlanView";
import { SettingsView } from "@/components/settings/SettingsView";
import {
  getZonedNow,
  isReflectionWindowOpen,
  nextDateKey,
  resolveBrowserTimeZone,
  type ZonedNow,
} from "@/lib/date/localTime";
import { createDemoAnalysis } from "@/lib/demo/sampleCheckIns";
import {
  calculateLoadSignal,
  isCompleteWorkloadSelfReport,
} from "@/lib/load/calculateLoadSignal";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { applySpokenTimesToPlan } from "@/lib/plan/applySpokenTimes";
import { isTomorrowActionableTask } from "@/lib/tasks/temporal";
import { normalizeClockTime, normalizeExtractedTaskTimes } from "@/lib/tasks/time";
import type {
  AnalysisResult,
  AudioMeta,
  CalendarEvent,
  CheckIn,
  ConditionSignal,
  ExtractedTask,
  HistoryTranscriptEntry,
  PlanItem,
  PlanRecord,
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
  historyTranscripts: HistoryTranscriptEntry[];
  scheduleEntries: ScheduleEntry[];
  plans: PlanRecord[];
  preferences: {
    saveTranscript: boolean;
    requireCalendarApproval: boolean;
  };
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

async function fetchGoogleCalendarEvents(
  targetDate: string,
  timeZone: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ date: targetDate, timeZone });
  const response = await fetch(`/api/calendar/events?${query}`, {
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => ({})) as {
    events?: CalendarEvent[];
    code?: string;
  };
  if (response.ok) return data.events ?? [];
  if (
    data.code === "CALENDAR_NOT_CONNECTED" ||
    data.code === "CALENDAR_RECONNECT_REQUIRED"
  ) {
    return [];
  }
  throw new Error("CALENDAR_EVENTS_FAILED");
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
    rationale: [],
  };
}

function createPlanningCondition(isEnglish: boolean): ConditionSignal {
  const selfReport: WorkloadSelfReport = {
    mentalDemand: 50,
    physicalDemand: 50,
    temporalDemand: 50,
    performance: 50,
    effort: 50,
    frustration: 50,
    sleepiness: 5,
  };

  return {
    score: 50,
    level: "normal",
    label: isEnglish ? "Not assessed" : "未評価",
    summary: isEnglish
      ? "Today's check-in is not available, so this plan uses schedule information only."
      : "今日の振り返りがないため、明日の予定情報だけでプランを作成します。",
    evidence: [
      isEnglish
        ? "No workload self-report is available for today."
        : "今日の負荷に関する自己評価はまだありません。",
    ],
    confidence: "limited",
    components: {
      selfReport,
      rawTlx: 50,
      sleepiness: 50,
      voiceDeviation: null,
      voiceBaselineCount: 0,
      workloadWeight: 0,
      sleepinessWeight: 0,
      voiceWeight: 0,
    },
    methodVersion: "echly-load-v2",
    disclaimer: isEnglish
      ? "This is planning support, not a medical diagnosis."
      : "これは予定調整の支援であり、医学的な診断ではありません。",
  };
}

function hasCompletePlanningCondition(condition: ConditionSignal) {
  return (
    typeof condition.score === "number" &&
    Boolean(condition.confidence) &&
    Boolean(condition.components) &&
    Boolean(condition.methodVersion)
  );
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
  initialView?: WorkspaceView;
  initialHistoryId?: string | null;
};

const WORKSPACE_VIEWS: WorkspaceView[] = [
  "checkin",
  "analysis",
  "plan",
  "approval",
  "history",
  "settings",
];

function workspaceViewFromHistoryState(value: unknown): WorkspaceView | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as { echlyView?: unknown }).echlyView;
  return WORKSPACE_VIEWS.includes(candidate as WorkspaceView)
    ? candidate as WorkspaceView
    : null;
}

function workspaceViewFromPathname(pathname: string): WorkspaceView | null {
  const match = pathname.match(
    /^\/(?:jp-ja|us-en)(?:\/(analysis|plan(?:\/approval)?|history(?:\/[^/]+)?|setting))?\/?$/,
  );
  if (!match) return null;
  if (!match[1]) return "checkin";
  if (match[1] === "analysis") return "analysis";
  if (match[1] === "plan") return "plan";
  if (match[1] === "plan/approval") return "approval";
  if (match[1]?.startsWith("history")) return "history";
  return "settings";
}

function historyIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/(?:jp-ja|us-en)\/history\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function workspacePath(localePath: string, view: WorkspaceView) {
  if (view === "checkin") return localePath;
  if (view === "approval") return `${localePath}/plan/approval`;
  if (view === "settings") return `${localePath}/setting`;
  return `${localePath}/${view}`;
}

export function EchlyApp({
  todayLabel: serverTodayLabel,
  initialView = "checkin",
  initialHistoryId = null,
}: EchlyAppProps) {
  const { isEnglish, t } = useI18n();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const sessionUserId = session?.user.id ?? null;
  const [view, setView] = useState<WorkspaceView>(initialView);
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
  const [planRecords, setPlanRecords] = useState<PlanRecord[]>([]);
  const [planTargetDate, setPlanTargetDate] = useState<string | null>(null);
  const [planGenerationSource, setPlanGenerationSource] = useState<
    PlanRecord["generationSource"] | null
  >(null);
  const [source, setSource] = useState<"cloudflare" | "demo">("demo");
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryRecordingMode, setRetryRecordingMode] = useState<CheckInMode | null>(null);
  const [transcriptReview, setTranscriptReview] = useState<TranscriptReview | null>(null);
  const [pendingReflectionReport, setPendingReflectionReport] =
    useState<WorkloadSelfReport | null>(null);
  const [appliedActionIds, setAppliedActionIds] = useState<string[]>([]);
  const [history, setHistory] = useState<CheckIn[]>([]);
  const [historyTranscripts, setHistoryTranscripts] = useState<HistoryTranscriptEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(initialHistoryId);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<CalendarEvent[]>([]);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [zonedNow, setZonedNow] = useState<ZonedNow | null>(null);
  const [debugTimeZone, setDebugTimeZone] = useState<string | null>(null);
  const [tabsPreloaded, setTabsPreloaded] = useState(false);
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspaceData["preferences"]>({
    saveTranscript: true,
    requireCalendarApproval: true,
  });
  const checkInWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const planWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeLocalDateRef = useRef<string | null>(null);

  useEffect(() => {
    const timeZone = debugTimeZone ?? resolveBrowserTimeZone();
    const updateClock = () => setZonedNow(getZonedNow(new Date(), timeZone));
    updateClock();
    const intervalId = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(intervalId);
  }, [debugTimeZone]);

  useEffect(() => {
    const currentLocalDate = zonedNow?.dateKey;
    if (!currentLocalDate) return;

    const previousLocalDate = activeLocalDateRef.current;
    activeLocalDateRef.current = currentLocalDate;
    if (!previousLocalDate || previousLocalDate === currentLocalDate) return;

    const resetId = window.setTimeout(() => {
      setAnalysis(null);
      setTranscript("");
      setAudioMeta({ ...EMPTY_AUDIO_META });
      setSource("demo");
      setTranscriptByMode({ reflection: "", planning: "" });
      setAudioByMode(createEmptyAudioByMode());
      setSelfReport({});
      setTranscriptReview(null);
      setPendingReflectionReport(null);
      setRetryRecordingMode(null);
      setError(null);
      setProcessingStage(null);
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [zonedNow?.dateKey]);

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
      setHistoryTranscripts([]);
      setScheduleEntries([]);
      setPlanRecords([]);
      setPlan(null);
      setPlanTargetDate(null);
      setPlanGenerationSource(null);
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
          .slice(0, 365);
        const mergedSchedules = [...schedulesById.values()]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 60);
        const historyTranscriptsById = new Map(
          workspace.historyTranscripts.map((entry) => [entry.id, entry]),
        );
        for (const checkIn of mergedHistory) {
          if (historyTranscriptsById.has(checkIn.id)) continue;
          historyTranscriptsById.set(checkIn.id, {
            id: checkIn.id,
            createdAt: checkIn.createdAt,
            localDate: checkIn.localDate ?? checkIn.createdAt.slice(0, 10),
            timeZone: checkIn.timeZone,
            kind: "reflection",
            transcript: checkIn.transcript,
            tasks: checkIn.tasks,
          });
        }
        for (const entry of mergedSchedules) {
          if (historyTranscriptsById.has(entry.id)) continue;
          historyTranscriptsById.set(entry.id, {
            id: entry.id,
            createdAt: entry.createdAt,
            localDate: entry.localDate ?? entry.createdAt.slice(0, 10),
            timeZone: entry.timeZone,
            kind: "planning",
            transcript: entry.transcript,
            tasks: entry.tasks,
          });
        }
        const mergedHistoryTranscripts = [...historyTranscriptsById.values()]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 730);

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
          setHistoryTranscripts(mergedHistoryTranscripts);
          setScheduleEntries(mergedSchedules);
          setPlanRecords(workspace.plans ?? []);
          setWorkspacePreferences(workspace.preferences);
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
    const handlePopState = (event: PopStateEvent) => {
      setSelectedHistoryId(historyIdFromPathname(window.location.pathname));
      setView(
        workspaceViewFromPathname(window.location.pathname)
          ?? workspaceViewFromHistoryState(event.state)
          ?? "checkin",
      );
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
  const activeTimeZone = zonedNow?.timeZone ?? null;

  useEffect(() => {
    if (!tomorrowDate || !activeTimeZone) return;
    const targetDate = tomorrowDate;
    const timeZone = activeTimeZone;
    const controller = new AbortController();
    let cancelled = false;

    async function loadGoogleCalendarEvents() {
      setGoogleCalendarLoading(true);
      try {
        const events = await fetchGoogleCalendarEvents(
          targetDate,
          timeZone,
          controller.signal,
        );
        if (cancelled) return;
        setGoogleCalendarEvents(events);
      } catch (caught) {
        if (!cancelled && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setGoogleCalendarEvents([]);
        }
      } finally {
        if (!cancelled) setGoogleCalendarLoading(false);
      }
    }

    void loadGoogleCalendarEvents();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTimeZone, tomorrowDate]);
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
  const planningCondition =
    (activeAnalysis && hasCompletePlanningCondition(activeAnalysis.condition)
      ? activeAnalysis.condition
      : history.find((item) =>
          hasCompletePlanningCondition(item.condition),
        )?.condition) ?? createPlanningCondition(isEnglish);
  const activePlanRecord = useMemo(
    () =>
      tomorrowDate
        ? planRecords.find((record) => record.targetDate === tomorrowDate) ?? null
        : null,
    [planRecords, tomorrowDate],
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
    return plan.move.length + plan.reschedule.length + plan.restBlocks.length;
  }, [plan]);

  useEffect(() => {
    if (!storageLoaded || !tomorrowDate) return;
    if (plan && planTargetDate === tomorrowDate) return;

    if (activePlanRecord) {
      const restoreId = window.setTimeout(() => {
        setPlan(activePlanRecord.plan);
        setPlanTargetDate(tomorrowDate);
        setPlanGenerationSource(activePlanRecord.generationSource);
        setAppliedActionIds(activePlanRecord.approvedActionIds);
      }, 0);
      return () => window.clearTimeout(restoreId);
    }

    if (todayCheckIn) {
      const storedPlan = todayCheckIn.plan;
      const hasStoredPlan =
        storedPlan.keep.length > 0 ||
        storedPlan.move.length > 0 ||
        storedPlan.reschedule.length > 0 ||
        storedPlan.restBlocks.length > 0 ||
        storedPlan.rationale.length > 0;
      if (hasStoredPlan) {
        const restoreId = window.setTimeout(() => {
          setPlan(storedPlan);
          setPlanTargetDate(tomorrowDate);
          setPlanGenerationSource("fallback");
          setAppliedActionIds(todayCheckIn.approvedActionIds);
        }, 0);
        return () => window.clearTimeout(restoreId);
      }
    }

    const clearId = window.setTimeout(() => {
      setPlan(null);
      setPlanTargetDate(tomorrowDate);
      setPlanGenerationSource(null);
      setAppliedActionIds([]);
    }, 0);
    return () => window.clearTimeout(clearId);
  }, [
    activePlanRecord,
    plan,
    planTargetDate,
    storageLoaded,
    todayCheckIn,
    tomorrowDate,
  ]);

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
    ].slice(0, 365));
    setHistoryTranscripts((current) => [
      {
        id: checkIn.id,
        createdAt: checkIn.createdAt,
        localDate: checkIn.localDate ?? checkIn.createdAt.slice(0, 10),
        timeZone: checkIn.timeZone,
        kind: "reflection" as const,
        transcript: checkIn.transcript,
        tasks: checkIn.tasks,
      },
      ...current.filter(
        (entry) =>
          entry.id !== checkIn.id &&
          !(
            entry.kind === "reflection" &&
            entry.localDate === (checkIn.localDate ?? checkIn.createdAt.slice(0, 10))
          ),
      ),
    ].slice(0, 730));
  }

  function replaceScheduleEntry(scheduleEntry: ScheduleEntry) {
    setScheduleEntries((current) => [
      scheduleEntry,
      ...current.filter((item) => item.id !== scheduleEntry.id),
    ].slice(0, 60));
    setHistoryTranscripts((current) => [
      {
        id: scheduleEntry.id,
        createdAt: scheduleEntry.createdAt,
        localDate: scheduleEntry.localDate ?? scheduleEntry.createdAt.slice(0, 10),
        timeZone: scheduleEntry.timeZone,
        kind: "planning" as const,
        transcript: scheduleEntry.transcript,
        tasks: scheduleEntry.tasks,
      },
      ...current.filter((entry) => entry.id !== scheduleEntry.id),
    ].slice(0, 730));
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

  function replacePlanRecord(planRecord: PlanRecord) {
    setPlanRecords((current) => [
      planRecord,
      ...current.filter((item) => item.targetDate !== planRecord.targetDate),
    ].slice(0, 30));
  }

  async function savePlanRecord(planRecord: PlanRecord) {
    const response = await fetch("/api/workspace/plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planRecord }),
    });
    await parseApiResponse(response, isEnglish);
  }

  function queuePlanRecord(planRecord: PlanRecord) {
    const operation = planWriteQueueRef.current
      .catch(() => undefined)
      .then(() => savePlanRecord(planRecord));
    planWriteQueueRef.current = operation;
    return operation;
  }

  async function removePlanRecord(targetDate: string) {
    const response = await fetch("/api/workspace/plans", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetDate }),
    });
    await parseApiResponse(response, isEnglish);
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

  function clearHomeDraftInputs() {
    setTranscriptByMode({ reflection: "", planning: "" });
    setAudioByMode(createEmptyAudioByMode());
    setSelfReport({});
    setTranscriptReview(null);
    setPendingReflectionReport(null);
    setRetryRecordingMode(null);
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
        transcript: resolvedTranscript,
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
      handleWorkspaceViewChange("analysis");
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
    if (!zonedNow || !localDate || !tomorrowDate) {
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
        localDate,
        timeZone: zonedNow.timeZone,
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

  async function persistPlan(
    nextPlan: TomorrowPlan,
    generationSource: PlanRecord["generationSource"] =
      planGenerationSource ?? activePlanRecord?.generationSource ?? "fallback",
  ) {
    if (!tomorrowDate) {
      throw new ApiClientError(
        isEnglish
          ? "The device time zone is still being checked."
          : "端末のタイムゾーンを確認中です。",
        "TIME_ZONE_REQUIRED",
      );
    }

    const now = new Date().toISOString();
    const planRecord: PlanRecord = {
      targetDate: tomorrowDate,
      createdAt: activePlanRecord?.createdAt ?? now,
      updatedAt: now,
      plan: nextPlan,
      approvalStatus: "draft",
      approvedActionIds: [],
      generationSource,
    };

    setPlan(nextPlan);
    setPlanTargetDate(tomorrowDate);
    setPlanGenerationSource(generationSource);
    setAppliedActionIds([]);
    await queuePlanRecord(planRecord);
    replacePlanRecord(planRecord);

    const currentRecord = localDate
      ? history.find((item) => item.localDate === localDate)
      : undefined;
    if (!currentRecord) return;

    const updated: CheckIn = {
      ...currentRecord,
      plan: nextPlan,
      approvalStatus: "draft",
      approvedActionIds: [],
    };
    await queueCheckInRecord(updated);
    replaceCheckInRecord(updated);
  }

  async function handleAddPlanActivity(activity: PlanActivityInput) {
    if (!zonedNow || !localDate || !tomorrowDate) {
      const message = isEnglish
        ? "The device time zone is still being checked."
        : "端末のタイムゾーンを確認中です。少し待ってからもう一度お試しください。";
      setError(message);
      throw new ApiClientError(message, "TIME_ZONE_REQUIRED");
    }

    setError(null);
    setProcessingStage(isEnglish ? "Adding activity..." : "予定を追加中...");

    try {
      const entryId = newId("schedule");
      const taskId = entryId + "-manual";
      const startTime = normalizeClockTime(activity.startTime);
      const endTime = normalizeClockTime(activity.endTime);
      const task: ExtractedTask = {
        id: taskId,
        title: activity.title,
        kind: "event",
        topicType: null,
        temporalContext: "tomorrow",
        status: "pending",
        type: "unknown",
        date: tomorrowDate,
        startTime,
        endTime,
        deadline: null,
        people: [],
        importance: "medium",
        movable: activity.movable,
        burden: "medium",
        sourceText: activity.title,
      };
      const entry: ScheduleEntry = {
        id: entryId,
        createdAt: new Date().toISOString(),
        localDate,
        timeZone: zonedNow.timeZone,
        targetDate: tomorrowDate,
        transcript: [startTime, activity.title].filter(Boolean).join(" "),
        audioMeta: { ...EMPTY_AUDIO_META },
        tasks: [task],
        source: "manual",
      };

      await saveScheduleEntry(entry);
      replaceScheduleEntry(entry);

      if (plan) {
        const item: PlanItem = {
          id: "keep-" + task.id,
          taskId: task.id,
          title: task.title,
          originalTime: startTime,
          proposedTime: startTime,
          endTime,
          reason: isEnglish
            ? "Added directly from the plan."
            : "プラン画面から追加された予定です。",
          impact: "medium",
        };
        await persistPlan({
          ...plan,
          keep: [...plan.keep, item],
        });
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isEnglish
            ? "The activity could not be added."
            : "予定を追加できませんでした。",
      );
      throw caught;
    } finally {
      setProcessingStage(null);
    }
  }

  async function synchronizeScheduleEntriesWithPlan(nextPlan: TomorrowPlan) {
    const planItems = [...nextPlan.keep, ...nextPlan.move, ...nextPlan.reschedule];
    const byTaskId = new Map(
      planItems.flatMap((item) =>
        item.taskId ? ([[item.taskId, item]] as const) : [],
      ),
    );
    const updates: ScheduleEntry[] = [];

    for (const entry of scheduleEntries) {
      let changed = false;
      const tasks = entry.tasks.map((task) => {
        const item = byTaskId.get(task.id);
        if (!item) return task;
        const startTime = normalizeClockTime(
          item.proposedTime ?? item.originalTime,
        );
        if (!startTime) return task;
        const endTime = normalizeClockTime(item.endTime) ?? task.endTime;
        if (task.startTime === startTime && task.endTime === endTime) {
          return task;
        }
        changed = true;
        return { ...task, startTime, endTime };
      });

      if (changed) updates.push({ ...entry, tasks });
    }

    for (const entry of updates) {
      await saveScheduleEntry(entry);
      replaceScheduleEntry(entry);
    }
  }
  function handlePlanChange(nextPlan: TomorrowPlan) {
    void (async () => {
      await persistPlan(nextPlan);
      await synchronizeScheduleEntriesWithPlan(nextPlan);
    })().catch((caught) => {
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
    setPlanTargetDate(tomorrowDate);
    setPlanGenerationSource(null);
    setAppliedActionIds([]);

    if (tomorrowDate) {
      setPlanRecords((current) =>
        current.filter((record) => record.targetDate !== tomorrowDate),
      );
      await removePlanRecord(tomorrowDate);
    }

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
  }

  async function handleCreatePlan() {
    if (!tomorrowDate) {
      setError(
        isEnglish
          ? "The device time zone is still being checked."
          : "端末のタイムゾーンを確認中です。少し待ってからもう一度お試しください。",
      );
      return;
    }
    if (!planTasks.length && !googleCalendarEvents.length) {
      setError(
        isEnglish
          ? "Add at least one plan for tomorrow first."
          : "先に明日の予定を1件以上追加してください。",
      );
      handleWorkspaceViewChange("checkin");
      return;
    }

    setError(null);
    setProcessingStage(
      isEnglish ? "Creating tomorrow's plan..." : "明日のプランを作成中...",
    );

    try {
      let calendarEvents = googleCalendarEvents;
      if (activeTimeZone) {
        try {
          calendarEvents = await fetchGoogleCalendarEvents(
            tomorrowDate,
            activeTimeZone,
          );
          setGoogleCalendarEvents(calendarEvents);
        } catch {
          // Continue with the last successfully loaded snapshot.
        }
      }
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: isEnglish ? "us-en" : "jp-ja",
          tasks: planTasks.map((task) => ({
            ...task,
            topicType: task.topicType ?? null,
          })),
          condition: planningCondition,
          calendarEvents,
        }),
      });
      const data = await parseApiResponse<{
        plan: TomorrowPlan;
        generationSource: PlanRecord["generationSource"];
      }>(response, isEnglish);
      const nextPlan = applySpokenTimesToPlan(data.plan, planTasks);
      await persistPlan(nextPlan, data.generationSource);
      clearHomeDraftInputs();
      handleWorkspaceViewChange("plan");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isEnglish
            ? "Tomorrow's plan could not be created."
            : "明日のプランを作成できませんでした。",
      );
    } finally {
      setProcessingStage(null);
    }
  }

  async function handleApply(ids: string[]) {
    if (!plan || !tomorrowDate || !ids.length) return;
    const mergedIds = Array.from(new Set([...appliedActionIds, ...ids]));
    const approvalStatus =
      mergedIds.length >= actionCount ? "approved" : "partially_approved";
    const now = new Date().toISOString();
    const planRecord: PlanRecord = {
      targetDate: tomorrowDate,
      createdAt: activePlanRecord?.createdAt ?? now,
      updatedAt: now,
      plan,
      approvalStatus,
      approvedActionIds: mergedIds,
      generationSource:
        planGenerationSource ?? activePlanRecord?.generationSource ?? "fallback",
    };

    try {
      await queuePlanRecord(planRecord);
      replacePlanRecord(planRecord);
      setAppliedActionIds(mergedIds);

      const currentRecord = localDate
        ? history.find((item) => item.localDate === localDate)
        : undefined;
      if (currentRecord) {
        const updated: CheckIn = {
          ...currentRecord,
          plan,
          approvalStatus,
          approvedActionIds: mergedIds,
        };
        await queueCheckInRecord(updated);
        replaceCheckInRecord(updated);
      }
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

  async function handleConfirmPlan() {
    if (!plan || !tomorrowDate) return;
    const confirmedActionIds = [
      ...plan.move,
      ...plan.reschedule,
      ...plan.restBlocks,
    ].map((item) => item.id);
    const now = new Date().toISOString();
    const planRecord: PlanRecord = {
      targetDate: tomorrowDate,
      createdAt: activePlanRecord?.createdAt ?? now,
      updatedAt: now,
      plan,
      approvalStatus: "approved",
      approvedActionIds: confirmedActionIds,
      generationSource:
        planGenerationSource ?? activePlanRecord?.generationSource ?? "fallback",
    };

    setError(null);
    setProcessingStage(isEnglish ? "Confirming schedule..." : "予定を確定中...");
    try {
      await synchronizeScheduleEntriesWithPlan(plan);
      await queuePlanRecord(planRecord);
      replacePlanRecord(planRecord);
      setAppliedActionIds(confirmedActionIds);

      const currentRecord = localDate
        ? history.find((item) => item.localDate === localDate)
        : undefined;
      if (currentRecord) {
        const updated: CheckIn = {
          ...currentRecord,
          plan,
          approvalStatus: "approved",
          approvedActionIds: confirmedActionIds,
        };
        await queueCheckInRecord(updated);
        replaceCheckInRecord(updated);
      }

      if (zonedNow) {
        setProcessingStage(
          isEnglish
            ? "Syncing Google Calendar..."
            : "Google Calendarに同期中...",
        );
        try {
          const calendarResponse = await fetch("/api/calendar/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetDate: tomorrowDate,
              timeZone: zonedNow.timeZone,
              locale: isEnglish ? "us-en" : "jp-ja",
              plan,
            }),
          });
          if (!calendarResponse.ok) {
            const calendarError = await calendarResponse.json().catch(() => ({})) as {
              code?: string;
            };
            if (calendarError.code !== "CALENDAR_NOT_CONNECTED") {
              setError(
                calendarError.code === "CALENDAR_RECONNECT_REQUIRED"
                  ? t(
                      "予定は確定しました。Google Calendarを設定画面から再連携してください。",
                      "The schedule was confirmed. Reconnect Google Calendar in Settings.",
                    )
                  : t(
                      "予定は確定しましたが、Google Calendarに同期できませんでした。",
                      "The schedule was confirmed, but Google Calendar sync failed.",
                    ),
              );
            }
          }
        } catch {
          setError(t(
            "予定は確定しましたが、Google Calendarに同期できませんでした。",
            "The schedule was confirmed, but Google Calendar sync failed.",
          ));
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isEnglish
            ? "The schedule could not be confirmed."
            : "予定を確定できませんでした。",
      );
    } finally {
      setProcessingStage(null);
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

  async function handleCalendarApprovalChange(requireCalendarApproval: boolean) {
    const previousPreferences = workspacePreferences;
    const nextPreferences = { ...previousPreferences, requireCalendarApproval };
    setWorkspacePreferences(nextPreferences);

    try {
      const response = await fetch("/api/workspace/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPreferences),
      });
      await parseApiResponse(response, isEnglish);
    } catch (caught) {
      setWorkspacePreferences(previousPreferences);
      throw caught;
    }
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
    handleWorkspaceViewChange("checkin");
  }

  function handleWorkspaceViewChange(nextView: WorkspaceView) {
    if (nextView === view && !(nextView === "history" && selectedHistoryId)) return;
    const localePath = isEnglish ? "/us-en" : "/jp-ja";
    const nextPath = workspacePath(localePath, nextView);
    window.history.replaceState(
      { ...window.history.state, echlyView: view },
      "",
      window.location.href,
    );
    window.history.pushState(
      { ...window.history.state, echlyView: nextView },
      "",
      nextPath,
    );
    setSelectedHistoryId(null);
    setView(nextView);
  }

  function handleHistorySelect(id: string) {
    const localePath = isEnglish ? "/us-en" : "/jp-ja";
    window.history.pushState(
      { ...window.history.state, echlyView: "history", echlyHistoryId: id },
      "",
      `${localePath}/history/${encodeURIComponent(id)}`,
    );
    setSelectedHistoryId(id);
    setView("history");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function handleHistoryBack() {
    const localePath = isEnglish ? "/us-en" : "/jp-ja";
    window.history.pushState(
      { ...window.history.state, echlyView: "history" },
      "",
      `${localePath}/history`,
    );
    setSelectedHistoryId(null);
    window.scrollTo({ top: 0, behavior: "auto" });
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
          onBack={() => handleWorkspaceViewChange("checkin")}
          onCreatePlan={handleCreatePlan}
          planCreated={Boolean(activePlanRecord || (plan && planTargetDate === tomorrowDate))}
          processingStage={processingStage}
          error={error}
        />
      ) : (
        <EmptyWorkspaceView type="analysis" onCheckIn={() => handleWorkspaceViewChange("checkin")} />
      );
    }

    if (targetView === "plan") {
      return plan ? (
        <PlanView
          plan={plan}
          calendarEvents={googleCalendarEvents}
          targetDate={tomorrowDate}
          generationSource={planGenerationSource}
          approvalStatus={activePlanRecord?.approvalStatus ?? "draft"}
          processingStage={processingStage}
          error={error}
          onPlanChange={handlePlanChange}
          onAddActivity={handleAddPlanActivity}
          onBack={() => handleWorkspaceViewChange("checkin")}
          onRegenerate={handleCreatePlan}
          onConfirm={() => void handleConfirmPlan()}
        />
      ) : (
        <PlanEmptyView
          targetDate={tomorrowDate}
          tasks={planTasks}
          calendarEvents={googleCalendarEvents}
          calendarLoading={googleCalendarLoading}
          hasTodayCondition={Boolean(activeAnalysis)}
          processingStage={processingStage}
          error={error}
          onCreatePlan={handleCreatePlan}
          onAddActivity={handleAddPlanActivity}
        />
      );
    }

    if (targetView === "approval") {
      return plan ? (
        <ApprovalView
          plan={plan}
          appliedActionIds={appliedActionIds}
          onApply={handleApply}
          onBack={() => handleWorkspaceViewChange("plan")}
        />
      ) : (
        <EmptyWorkspaceView
          type="plan"
          hasAnalysis={Boolean(activeAnalysis)}
          onCheckIn={() => handleWorkspaceViewChange("checkin")}
          onShowAnalysis={() => handleWorkspaceViewChange("analysis")}
        />
      );
    }

    if (targetView === "history") {
      return (
        <HistoryView
          checkIns={history}
          historyTranscripts={historyTranscripts}
          selectedHistoryId={selectedHistoryId}
          storageLoaded={storageLoaded}
          onHistoryBack={handleHistoryBack}
          onHistorySelect={handleHistorySelect}
          onNewCheckIn={startNewCheckIn}
        />
      );
    }

    if (targetView === "settings") {
      return (
        <SettingsView
          user={{
            name: signedInUser.name,
            email: signedInUser.email,
            image: signedInUser.image,
          }}
          timeZone={zonedNow?.timeZone ?? resolveBrowserTimeZone()}
          deviceTimeZone={resolveBrowserTimeZone()}
          debugTimeZone={debugTimeZone}
          onDebugTimeZoneChange={handleDebugTimeZoneChange}
          requireCalendarApproval={workspacePreferences.requireCalendarApproval}
          onRequireCalendarApprovalChange={handleCalendarApprovalChange}
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
    <AppShell view={view} onViewChange={handleWorkspaceViewChange}>
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

"use client";

import { useEffect, useMemo, useState } from "react";

import { AnalysisView } from "@/components/analysis/AnalysisView";
import { ApprovalView } from "@/components/approval/ApprovalView";
import { SignInView } from "@/components/auth/SignInView";
import { CheckInView, type CheckInStep } from "@/components/check-in/CheckInView";
import { HistoryView } from "@/components/history/HistoryView";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyWorkspaceView } from "@/components/layout/EmptyWorkspaceView";
import { PlanView } from "@/components/plan/PlanView";
import { SettingsView } from "@/components/settings/SettingsView";
import { mockCalendarEvents } from "@/lib/demo/mockCalendar";
import {
  createDemoAnalysis,
  createDemoPlan,
  getSampleHistory,
} from "@/lib/demo/sampleCheckIns";
import { isTomorrowActionableTask } from "@/lib/tasks/temporal";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import {
  calculateLoadSignal,
  isCompleteWorkloadSelfReport,
} from "@/lib/load/calculateLoadSignal";
import type {
  AnalysisResult,
  AudioMeta,
  CheckIn,
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

async function parseApiResponse<T>(response: Response, isEnglish = false): Promise<T> {
  const data = (await response.json()) as T & { error?: string; code?: string };

  if (!response.ok) {
    const englishErrors: Record<string, string> = {
      UNAUTHORIZED: "Please sign in to continue.",
      AUDIO_REQUIRED: "An audio file is required.",
      AUDIO_TOO_LARGE: "Audio files must be 4 MB or smaller.",
      CLOUDFLARE_CONFIG_MISSING: "AI processing is not configured yet.",
      CLOUDFLARE_AUTH_FAILED: "The AI service credentials could not be verified.",
      CLOUDFLARE_LIMIT_REACHED: "The AI usage limit has been reached. Please try again later.",
      CLOUDFLARE_INVALID_RESPONSE: "The AI response could not be validated. Please try again.",
      CLOUDFLARE_REQUEST_FAILED: "AI processing could not be completed. Please try again later.",
    };
    const message = isEnglish
      ? englishErrors[data.code ?? ""] ?? "Something went wrong. Please try again."
      : data.error ?? "処理に失敗しました。";
    throw new ApiClientError(message, data.code);
  }

  return data;
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `checkin-${Date.now()}`;
}

type StepAudio = {
  blob: Blob | null;
  meta: AudioMeta;
};

type StepAudioState = Record<CheckInStep, StepAudio>;

const CHECK_IN_STEPS = [1, 2] as const;
const STEP_TRANSCRIPT_LABELS: Record<CheckInStep, string> = {
  1: "【STEP 1: 今日の振り返り】",
  2: "【STEP 2: 明日の予定・タスク】",
};

function createEmptyStepAudioState(): StepAudioState {
  return {
    1: { blob: null, meta: { ...EMPTY_AUDIO_META } },
    2: { blob: null, meta: { ...EMPTY_AUDIO_META } },
  };
}

function aggregateAudioMeta(
  audioByStep: StepAudioState,
  spokenCharacterCount: number,
): AudioMeta {
  const recordings = CHECK_IN_STEPS
    .map((step) => audioByStep[step])
    .filter((recording) => recording.blob);
  const durationSec = recordings.reduce(
    (total, recording) => total + recording.meta.durationSec,
    0,
  );

  function weightedAverage(key: "averageVolume" | "silenceRatio") {
    const measured = recordings.filter((recording) => recording.meta[key] !== null);
    const weight = measured.reduce(
      (total, recording) => total + Math.max(recording.meta.durationSec, 1),
      0,
    );
    if (!weight) return null;
    const value = measured.reduce(
      (total, recording) =>
        total + (recording.meta[key] ?? 0) * Math.max(recording.meta.durationSec, 1),
      0,
    );
    return Number((value / weight).toFixed(3));
  }

  return {
    durationSec,
    averageVolume: weightedAverage("averageVolume"),
    silenceRatio: weightedAverage("silenceRatio"),
    speechRate:
      durationSec > 0 && spokenCharacterCount > 0
        ? Number((spokenCharacterCount / durationSec).toFixed(2))
        : null,
  };
}

type EchlyAppProps = {
  todayLabel: string;
};

export function EchlyApp({ todayLabel }: EchlyAppProps) {
  const { isEnglish, t } = useI18n();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [view, setView] = useState<WorkspaceView>("checkin");
  const [draftTranscript, setDraftTranscript] = useState("");
  const [transcript, setTranscript] = useState("");
  const [audioByStep, setAudioByStep] = useState<StepAudioState>(createEmptyStepAudioState);
  const [selfReport, setSelfReport] =
    useState<Partial<WorkloadSelfReport>>({});
  const [audioMeta, setAudioMeta] = useState<AudioMeta>(EMPTY_AUDIO_META);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [plan, setPlan] = useState<TomorrowPlan | null>(null);
  const [source, setSource] = useState<"cloudflare" | "demo">("demo");
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedActionIds, setAppliedActionIds] = useState<string[]>([]);
  const [history, setHistory] = useState<CheckIn[]>(() => getSampleHistory());
  const [saveTranscript, setSaveTranscript] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved) as CheckIn[];
        if (Array.isArray(parsed) && parsed.length) {
          const uniqueCheckIns = new Map<string, CheckIn>();
          for (const checkIn of [...parsed, ...getSampleHistory()]) {
            if (!uniqueCheckIns.has(checkIn.id)) {
              uniqueCheckIns.set(checkIn.id, checkIn);
            }
          }
          setHistory([...uniqueCheckIns.values()]);
        }
      } catch {
        // Local history is optional; malformed browser data should not block check-in.
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  const actionCount = useMemo(() => {
    if (!plan) return 0;
    return (
      plan.move.length +
      plan.reschedule.length +
      plan.restBlocks.length +
      plan.emailDrafts.length
    );
  }, [plan]);

  if (isSessionPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f7f8fc] text-sm text-[#68708f]">
        {t("ログイン状態を確認しています...", "Checking your session...")}
      </main>
    );
  }

  if (!session) return <SignInView />;

  function handleAudioReady(step: CheckInStep, blob: Blob, meta: AudioMeta) {
    setAudioByStep((current) => ({
      ...current,
      [step]: { blob, meta },
    }));
    setError(null);
  }

  function handleAudioDiscard(step: CheckInStep) {
    setAudioByStep((current) => ({
      ...current,
      [step]: { blob: null, meta: { ...EMPTY_AUDIO_META } },
    }));
  }

  async function transcribeRecording(step: CheckInStep, audioBlob: Blob) {
    const formData = new FormData();
    const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
    formData.append("audio", audioBlob, `echly-step-${step}.${extension}`);
    formData.append("context", step === 1 ? "reflection" : "planning");
    formData.append("locale", isEnglish ? "us-en" : "jp-ja");
    const response = await fetch("/api/transcribe", { method: "POST", body: formData });
    const result = await parseApiResponse<{ transcript: string }>(response, isEnglish);
    return { step, transcript: result.transcript };
  }

  async function handleAnalyze(completedReport?: WorkloadSelfReport) {
    const report = completedReport ?? selfReport;
    if (!isCompleteWorkloadSelfReport(report)) {
      setError(t("負荷の自己評価7項目に回答してください。", "Please answer all seven workload questions."));
      return;
    }

    const resolvedSelfReport = report;
    if (completedReport) setSelfReport(completedReport);
    const audioBaseline = history
      .filter((item) => item.condition.methodVersion === "echly-load-v1")
      .map((item) => item.audioMeta);
    setError(null);
    setProcessingStage(t("チェックインを準備中...", "Preparing your check-in..."));
    let resolvedTranscript = draftTranscript.trim();
    let useDemo = false;
    let spokenCharacterCount = 0;

    try {
      const recordings = CHECK_IN_STEPS.flatMap((step) => {
        const recording = audioByStep[step];
        return recording.blob ? [{ step, blob: recording.blob }] : [];
      });

      if (recordings.length) {
        setProcessingStage(
          recordings.length === 2
            ? t("2件の音声を文字起こし中...", "Transcribing two recordings...")
            : t("音声を文字起こし中...", "Transcribing audio..."),
        );
        try {
          const transcribed = await Promise.all(
            recordings.map(({ step, blob }) => transcribeRecording(step, blob)),
          );
          spokenCharacterCount = transcribed.reduce(
            (total, item) => total + item.transcript.length,
            0,
          );
          const voiceTranscript = transcribed
            .sort((a, b) => a.step - b.step)
            .map(({ step, transcript: value }) =>
              `${isEnglish ? (step === 1 ? "[STEP 1: TODAY'S REFLECTION]" : "[STEP 2: TOMORROW'S PLANS & TASKS]") : STEP_TRANSCRIPT_LABELS[step]}\n${value}`,
            )
            .join("\n\n");
          resolvedTranscript = draftTranscript.trim()
            ? `${voiceTranscript}\n\n${t("【補足テキスト】", "[ADDITIONAL NOTES]")}\n${draftTranscript.trim()}`
            : voiceTranscript;
        } catch (transcribeError) {
          if (canUseDemoFallback(transcribeError) && resolvedTranscript) {
            useDemo = true;
          } else if (canUseDemoFallback(transcribeError)) {
            throw new ApiClientError(
              t("現在、音声を文字起こしできません。「テキストで入力」から内容を入力すると、デモ解析を利用できます。", "Audio transcription is currently unavailable. Type your check-in to use the demo analysis."),
              transcribeError instanceof ApiClientError
                ? transcribeError.code
                : "CLOUDFLARE_REQUEST_FAILED",
            );
          } else {
            throw transcribeError;
          }
        }
      }

      if (!resolvedTranscript) {
        throw new ApiClientError(t("音声またはテキストを入力してください。", "Record audio or enter text to continue."), "INPUT_REQUIRED");
      }

      const resolvedAudioMeta = aggregateAudioMeta(audioByStep, spokenCharacterCount);

      setProcessingStage(t("タスクと負荷スコアを解析中...", "Analyzing tasks and workload..."));
      let result: AnalysisResult;

      if (useDemo) {
        const demo = createDemoAnalysis(resolvedTranscript);
        result = {
          ...demo,
          condition: calculateLoadSignal({
            selfReport: resolvedSelfReport,
            audioMeta: resolvedAudioMeta,
            audioBaseline,
          }),
        };
      } else {
        try {
          const analyzeResponse = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locale: isEnglish ? "us-en" : "jp-ja",
              transcript: resolvedTranscript,
              selfReport: resolvedSelfReport,
              audioBaseline,
              audioMeta: resolvedAudioMeta,
              referenceDate: new Date().toISOString(),
              timeZone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
            }),
          });
          result = await parseApiResponse<AnalysisResult>(analyzeResponse, isEnglish);
        } catch (analyzeError) {
          if (canUseDemoFallback(analyzeError)) {
            const demo = createDemoAnalysis(resolvedTranscript);
            result = {
              ...demo,
              condition: calculateLoadSignal({
                selfReport: resolvedSelfReport,
                audioMeta: resolvedAudioMeta,
                audioBaseline,
              }),
            };
            useDemo = true;
          } else {
            throw analyzeError;
          }
        }
      }

      setTranscript(resolvedTranscript);
      setAudioMeta(resolvedAudioMeta);
      setAnalysis(result);
      setPlan(null);
      setAppliedActionIds([]);
      setSource(useDemo ? "demo" : "cloudflare");
      setView("analysis");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("チェックインを解析できませんでした。", "Could not analyze your check-in."));
    } finally {
      setProcessingStage(null);
    }
  }

  async function handleCreatePlan() {
    if (!analysis) return;
    setError(null);
    setProcessingStage(t("明日のプランを作成中...", "Creating tomorrow's plan..."));

    try {
      let nextPlan: TomorrowPlan;
      const tomorrowTasks = analysis.tasks.filter(isTomorrowActionableTask);

      if (source === "demo") {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        nextPlan = createDemoPlan(tomorrowTasks, analysis.condition, isEnglish);
      } else {
        const response = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale: isEnglish ? "us-en" : "jp-ja",
            tasks: tomorrowTasks,
            condition: analysis.condition,
            calendarEvents: mockCalendarEvents,
          }),
        });

        try {
          const data = await parseApiResponse<{ plan: TomorrowPlan }>(response, isEnglish);
          nextPlan = data.plan;
        } catch (planError) {
          if (canUseDemoFallback(planError)) {
            nextPlan = createDemoPlan(analysis.tasks, analysis.condition, isEnglish);
            setSource("demo");
          } else {
            throw planError;
          }
        }
      }

      setPlan(nextPlan);
      setAppliedActionIds([]);
      setView("plan");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("明日のプランを作成できませんでした。", "Could not create tomorrow's plan."));
    } finally {
      setProcessingStage(null);
    }
  }

  function handleApply(ids: string[]) {
    if (!analysis || !plan || !ids.length) return;

    const mergedIds = Array.from(new Set([...appliedActionIds, ...ids]));
    setAppliedActionIds(mergedIds);

    const checkIn: CheckIn = {
      id: newId(),
      createdAt: new Date().toISOString(),
      transcript: saveTranscript ? transcript : t("文字起こしは保存しない設定です。", "Transcript storage is turned off."),
      audioMeta,
      condition: analysis.condition,
      tasks: analysis.tasks,
      plan,
      approvalStatus: mergedIds.length >= actionCount ? "approved" : "partially_approved",
      approvedActionIds: mergedIds,
      source,
    };

    setHistory((current) => {
      const withoutCurrent = current.filter((item) => item.id !== checkIn.id);
      const next = [checkIn, ...withoutCurrent];
      try {
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next.slice(0, 20)));
      } catch {
        // Browser storage may be unavailable in private mode; in-memory history remains usable.
      }
      return next;
    });
  }

  function startNewCheckIn() {
    setSelfReport({});
    setDraftTranscript("");
    setTranscript("");
    setAudioByStep(createEmptyStepAudioState());
    setAudioMeta({ ...EMPTY_AUDIO_META });
    setAnalysis(null);
    setPlan(null);
    setAppliedActionIds([]);
    setError(null);
    setProcessingStage(null);
    setSource("demo");
    setView("checkin");
  }

  let content;

  if (view === "analysis") {
    content = analysis ? (
      <AnalysisView
        transcript={transcript}
        audioBlob={audioByStep[1].blob ?? audioByStep[2].blob}
        audioMeta={audioMeta}
        tasks={analysis.tasks}
        condition={analysis.condition}
        source={source}
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
      <PlanView plan={plan} onBack={() => setView("analysis")} onApproval={() => setView("approval")} />
    ) : (
      <EmptyWorkspaceView
        type="plan"
        hasAnalysis={Boolean(analysis)}
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
    content = (
      <SettingsView
        user={session.user}
        saveTranscript={saveTranscript}
        onSaveTranscriptChange={setSaveTranscript}
      />
    );
  } else {
    content = (
      <CheckInView
        todayLabel={todayLabel}
        userName={session.user.name}
        previousCondition={history.find((item) => item.condition.methodVersion === "echly-load-v1")?.condition ?? null}
        transcript={draftTranscript}
        onTranscriptChange={setDraftTranscript}
        audioByStep={{ 1: audioByStep[1].blob, 2: audioByStep[2].blob }}
        onAudioReady={handleAudioReady}
        onAudioDiscard={handleAudioDiscard}
        selfReport={selfReport}
        onSelfReportChange={(key, value) =>
          setSelfReport((current) => ({ ...current, [key]: value }))
        }
        onAnalyze={handleAnalyze}
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

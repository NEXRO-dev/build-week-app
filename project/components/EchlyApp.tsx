"use client";

import { useEffect, useMemo, useState } from "react";

import { AnalysisView } from "@/components/analysis/AnalysisView";
import { ApprovalView } from "@/components/approval/ApprovalView";
import { CheckInView } from "@/components/check-in/CheckInView";
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
import type {
  AnalysisResult,
  AudioMeta,
  CheckIn,
  TomorrowPlan,
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

async function parseApiResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string; code?: string };

  if (!response.ok) {
    throw new ApiClientError(data.error ?? "処理に失敗しました。", data.code);
  }

  return data;
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `checkin-${Date.now()}`;
}

type EchlyAppProps = {
  todayLabel: string;
};

export function EchlyApp({ todayLabel }: EchlyAppProps) {
  const [view, setView] = useState<WorkspaceView>("checkin");
  const [transcript, setTranscript] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMeta, setAudioMeta] = useState<AudioMeta>(EMPTY_AUDIO_META);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [plan, setPlan] = useState<TomorrowPlan | null>(null);
  const [source, setSource] = useState<"openai" | "demo">("demo");
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

  const conditionLevel = analysis?.condition.level;

  const actionCount = useMemo(() => {
    if (!plan) return 0;
    return (
      plan.move.length +
      plan.reschedule.length +
      plan.restBlocks.length +
      plan.emailDrafts.length
    );
  }, [plan]);

  function handleAudioReady(blob: Blob, meta: AudioMeta) {
    setAudioBlob(blob);
    setAudioMeta(meta);
    setError(null);
  }

  function handleAudioDiscard() {
    setAudioBlob(null);
    setAudioMeta(EMPTY_AUDIO_META);
  }

  async function handleAnalyze() {
    setError(null);
    setProcessingStage("チェックインを準備中...");
    let resolvedTranscript = transcript.trim();
    let useDemo = false;

    try {
      if (audioBlob) {
        setProcessingStage("音声を文字起こし中...");
        const formData = new FormData();
        const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
        formData.append("audio", audioBlob, `echly-checkin.${extension}`);

        try {
          const transcribeResponse = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          const transcribed = await parseApiResponse<{ transcript: string }>(transcribeResponse);
          resolvedTranscript = resolvedTranscript
            ? `${transcribed.transcript}\n\n補足: ${resolvedTranscript}`
            : transcribed.transcript;
        } catch (transcribeError) {
          if (
            transcribeError instanceof ApiClientError &&
            transcribeError.code === "OPENAI_API_KEY_MISSING" &&
            resolvedTranscript
          ) {
            useDemo = true;
          } else if (
            transcribeError instanceof ApiClientError &&
            transcribeError.code === "OPENAI_API_KEY_MISSING"
          ) {
            throw new ApiClientError(
              "音声の文字起こしにはOpenAI APIキーが必要です。今回は「デモ用の発話を入力」またはテキスト入力を利用してください。",
              transcribeError.code,
            );
          } else {
            throw transcribeError;
          }
        }
      }

      if (!resolvedTranscript) {
        throw new ApiClientError("音声またはテキストを入力してください。", "INPUT_REQUIRED");
      }

      const resolvedAudioMeta: AudioMeta = {
        ...audioMeta,
        speechRate:
          audioMeta.durationSec > 0
            ? Number((resolvedTranscript.length / audioMeta.durationSec).toFixed(2))
            : null,
      };

      setProcessingStage("タスクと負荷シグナルを解析中...");
      let result: AnalysisResult;

      if (useDemo) {
        result = createDemoAnalysis(resolvedTranscript);
      } else {
        try {
          const analyzeResponse = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript: resolvedTranscript,
              audioMeta: resolvedAudioMeta,
            }),
          });
          result = await parseApiResponse<AnalysisResult>(analyzeResponse);
        } catch (analyzeError) {
          if (
            analyzeError instanceof ApiClientError &&
            analyzeError.code === "OPENAI_API_KEY_MISSING"
          ) {
            result = createDemoAnalysis(resolvedTranscript);
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
      setSource(useDemo ? "demo" : "openai");
      setView("analysis");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "チェックインを解析できませんでした。");
    } finally {
      setProcessingStage(null);
    }
  }

  async function handleCreatePlan() {
    if (!analysis) return;
    setError(null);
    setProcessingStage("明日のプランを作成中...");

    try {
      let nextPlan: TomorrowPlan;

      if (source === "demo") {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        nextPlan = createDemoPlan(analysis.tasks, analysis.condition);
      } else {
        const response = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tasks: analysis.tasks,
            condition: analysis.condition,
            calendarEvents: mockCalendarEvents,
          }),
        });

        try {
          const data = await parseApiResponse<{ plan: TomorrowPlan }>(response);
          nextPlan = data.plan;
        } catch (planError) {
          if (
            planError instanceof ApiClientError &&
            planError.code === "OPENAI_API_KEY_MISSING"
          ) {
            nextPlan = createDemoPlan(analysis.tasks, analysis.condition);
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
      setError(caught instanceof Error ? caught.message : "明日のプランを作成できませんでした。");
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
      transcript: saveTranscript ? transcript : "文字起こしは保存しない設定です。",
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
    setTranscript("");
    setAudioBlob(null);
    setAudioMeta(EMPTY_AUDIO_META);
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
        audioMeta={audioMeta}
        tasks={analysis.tasks}
        onTasksChange={(tasks) => setAnalysis({ ...analysis, tasks })}
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
        saveTranscript={saveTranscript}
        onSaveTranscriptChange={setSaveTranscript}
      />
    );
  } else {
    content = (
      <CheckInView
        todayLabel={todayLabel}
        transcript={transcript}
        onTranscriptChange={setTranscript}
        audioBlob={audioBlob}
        onAudioReady={handleAudioReady}
        onAudioDiscard={handleAudioDiscard}
        onAnalyze={handleAnalyze}
        onError={setError}
        processingStage={processingStage}
        error={error}
      />
    );
  }

  return (
    <AppShell
      view={view}
      onViewChange={setView}
      conditionLevel={conditionLevel}
    >
      {content}
    </AppShell>
  );
}

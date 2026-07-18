"use client";

import { Button } from "@heroui/react";
import { ArrowLeft, ArrowRight, CalendarDays, LoaderCircle, Share2 } from "lucide-react";

import type { AudioMeta, ConditionLevel, ExtractedTask, TaskType } from "@/types/echly";
import { isTomorrowActionableTask } from "@/lib/tasks/temporal";

type Props = {
  transcript: string;
  audioMeta: AudioMeta;
  tasks: ExtractedTask[];
  condition: { level: ConditionLevel; label: string; summary: string; evidence: string[]; disclaimer: string };
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
const wave = [12,20,35,26,45,22,31,48,25,17,39,52,28,44,21,35,59,27,18,45,33,54,24,38,17,30,48,20,35,14,28,42,19,31,12];

function scoreFor(level: ConditionLevel) { return level === "high" ? 72 : level === "caution" ? 58 : 34; }
function formatDuration(seconds: number) {
  const total = seconds || 88;
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

export function AnalysisView({ transcript, audioMeta, tasks, condition, onBack, onCreatePlan, processingStage, error }: Props) {
  const score = scoreFor(condition.level);
  const groupedTasks: Record<AnalysisGroup, ExtractedTask[]> = {
    reflection: [],
    tomorrow: [],
    concern: [],
    other: [],
  };
  for (const task of tasks) {
    groupedTasks[analysisGroupFor(task)].push(task);
  }
  return (
    <div>
      <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onBack} aria-label="戻る" className="grid size-10 place-items-center text-[#303857]"><ArrowLeft size={20} /></button>
        <h1 className="text-center text-base font-bold">解析結果</h1>
        <button type="button" aria-label="共有" className="grid size-10 place-items-center text-[#303857]"><Share2 size={19} /></button>
      </header>

      <div className="space-y-3 px-4 pb-8 pt-3">
        {error ? <div role="alert" className="rounded-lg bg-[#fff4f5] p-3 text-sm text-[#b43d4d]">{error}</div> : null}

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">音声の波形</h2>
          <div className="analysis-wave mt-5" aria-hidden="true">{wave.map((height, index) => <span key={index} style={{ height }} />)}</div>
          <div className="mt-4 flex justify-between text-[10px] text-[#737b99]"><span>00:00</span><span>{formatDuration(audioMeta.durationSec)}</span></div>
        </section>

        <div className="grid gap-3 min-[380px]:grid-cols-2">
          <section className="min-w-0 rounded-lg border border-[#e3e5ef] p-4">
            <h2 className="text-xs font-bold">文字起こし</h2>
            <p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-[#3d4563]">{transcript}</p>
          </section>

          <section className="min-w-0 rounded-lg border border-[#e3e5ef] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold">負荷シグナル</h2>
              <span className={`rounded px-2 py-1 text-[10px] font-bold ${condition.level === "high" ? "bg-[#fff0f4] text-[#ef3f71]" : condition.level === "caution" ? "bg-[#fff7e9] text-[#de8a16]" : "bg-[#eaf8f2] text-[#28a477]"}`}>{condition.label}</span>
            </div>
            <div className="relative mx-auto mt-6 size-32 rounded-full" style={{ background: `conic-gradient(#ff3f72 ${score * 3.6}deg, #eceef4 0)` }}>
              <div className="absolute inset-[12px] grid place-items-center rounded-full bg-white">
                <p className="text-center"><span className="text-3xl font-bold">{score}</span><span className="text-xs">/100</span></p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-x-2 gap-y-1 text-[9px] text-[#737b99]"><span className="text-[#43b98b]">● 低</span><span className="text-[#5870df]">● 通常</span><span className="text-[#f0a62b]">● 注意</span><span className="text-[#ef3f71]">● 高</span></div>
          </section>
        </div>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">内容の整理</h2>
          <div className="mt-4 space-y-4">
            {analysisGroups.map((group) => {
              const items = groupedTasks[group.id];
              if (!items.length) return null;
              return (
                <div key={group.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className={`rounded px-2 py-1 text-[10px] font-bold ${group.style}`}>{group.label}</h3>
                    <span className="text-[10px] text-[#8188a1]">{items.length}件</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((task) => (
                      <span key={task.id} className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-[#dfe2ec] bg-white px-2 py-1.5 text-xs font-medium text-[#343c5b]">
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${temporalStyles[task.temporalContext]}`}>{temporalLabels[task.temporalContext]}</span>
                        {task.startTime ? <CalendarDays size={12} className="shrink-0" /> : null}
                        <span className={`min-w-0 break-words ${task.status === "completed" ? "line-through opacity-60" : ""}`}>{task.title}</span>
                        <span className="shrink-0 text-[9px] text-[#8188a1]">{task.kind === "topic" ? "話題" : taskTypeLabels[task.type]}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {!tasks.length ? <p className="text-xs text-[#737b99]">整理できる項目はありませんでした。</p> : null}
          </div>
        </section>

        <Button variant="primary" size="lg" fullWidth isDisabled={Boolean(processingStage)} onPress={onCreatePlan} className="h-12 bg-[#5b42ff] text-white">
          {processingStage ? <LoaderCircle size={18} className="animate-spin" /> : null}{processingStage ?? "明日のプランを作る"}{!processingStage ? <ArrowRight size={18} /> : null}
        </Button>
      </div>
    </div>
  );
}

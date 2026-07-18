"use client";

import { Button, Card, Chip, Input, Label, Switch, TextField } from "@heroui/react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BrainCircuit,
  CalendarClock,
  ChevronDown,
  Gauge,
  Info,
  LoaderCircle,
  Users,
} from "lucide-react";

import type { AudioMeta, ConditionLevel, ExtractedTask, TaskType } from "@/types/echly";

type AnalysisViewProps = {
  transcript: string;
  audioMeta: AudioMeta;
  tasks: ExtractedTask[];
  onTasksChange: (tasks: ExtractedTask[]) => void;
  condition: {
    level: ConditionLevel;
    label: string;
    summary: string;
    evidence: string[];
    disclaimer: string;
  };
  source: "openai" | "demo";
  onBack: () => void;
  onCreatePlan: () => void;
  processingStage: string | null;
  error: string | null;
};

const taskTypeLabels: Record<TaskType, string> = {
  meeting: "会議",
  focus_work: "集中作業",
  admin: "事務",
  communication: "連絡",
  personal: "個人",
  unknown: "未分類",
};

const taskTypeOptions = Object.entries(taskTypeLabels) as Array<[TaskType, string]>;
const analysisWave = [16, 26, 18, 36, 28, 48, 32, 22, 40, 56, 26, 44, 20, 34, 52, 30, 18, 42, 28, 50, 24, 38, 18, 30];

const conditionStyles: Record<ConditionLevel, { panel: string; dot: string; chip: "success" | "warning" | "danger" }> = {
  normal: { panel: "border-[#c8ddd7] bg-[#edf6f3]", dot: "bg-[#4d8b7d]", chip: "success" },
  caution: { panel: "border-[#e7d5af] bg-[#fbf6ea]", dot: "bg-[#d0a049]", chip: "warning" },
  high: { panel: "border-[#e8c9c1] bg-[#fff3f0]", dot: "bg-[#c8765e]", chip: "danger" },
};

function formatDuration(seconds: number) {
  if (!seconds) return "--:--";
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function percent(value: number | null) {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

export function AnalysisView({
  transcript,
  audioMeta,
  tasks,
  onTasksChange,
  condition,
  source,
  onBack,
  onCreatePlan,
  processingStage,
  error,
}: AnalysisViewProps) {
  const tone = conditionStyles[condition.level];

  function updateTask(id: string, patch: Partial<ExtractedTask>) {
    onTasksChange(tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="flex items-start gap-3">
        <Button isIconOnly variant="ghost" size="sm" onPress={onBack} aria-label="チェックインへ戻る" className="mt-0.5 shrink-0">
          <ArrowLeft size={19} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold leading-8">解析結果</h1>
            <Chip size="sm" variant="soft" color={source === "openai" ? "success" : "warning"}>
              {source === "openai" ? "OpenAI" : "デモ"}
            </Chip>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#687471]">
            声から読み取った内容です。プランを作る前に確認できます。
          </p>
        </div>
      </section>

      {error ? (
        <div role="alert" className="rounded-md border border-[#efc6bc] bg-[#fff5f2] px-4 py-3 text-sm text-[#883e2e]">
          {error}
        </div>
      ) : null}

      <Card className="border border-[#dbe1df] bg-white shadow-none">
        <Card.Content className="px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AudioLines size={17} className="text-[#2a685d]" />
              <p className="text-sm font-semibold">音声の概要</p>
            </div>
            <span className="font-mono text-xs text-[#6d7875]">{formatDuration(audioMeta.durationSec)}</span>
          </div>
          <div className="mt-4 flex h-14 items-center justify-center gap-1 overflow-hidden" aria-hidden="true">
            {analysisWave.map((height, index) => (
              <span key={`${height}-${index}`} className="w-1 rounded-full bg-[#4f8b7e]" style={{ height }} />
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-3 divide-x divide-[#e2e7e5] border-t border-[#e2e7e5] pt-3 text-center">
            <div>
              <dt className="text-[10px] text-[#7a8581]">発話時間</dt>
              <dd className="mt-1 font-mono text-xs font-semibold">{audioMeta.durationSec || "-"}秒</dd>
            </div>
            <div>
              <dt className="text-[10px] text-[#7a8581]">平均音量</dt>
              <dd className="mt-1 font-mono text-xs font-semibold">{percent(audioMeta.averageVolume)}</dd>
            </div>
            <div>
              <dt className="text-[10px] text-[#7a8581]">無音比率</dt>
              <dd className="mt-1 font-mono text-xs font-semibold">{percent(audioMeta.silenceRatio)}</dd>
            </div>
          </dl>
        </Card.Content>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-[#dbe1df] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <AudioLines size={17} className="text-[#2a685d]" />
            <h2 className="text-sm font-semibold">文字起こし</h2>
          </div>
          <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-[#3f4b48]">
            {transcript}
          </p>
        </section>

        <section className={`rounded-lg border p-4 sm:p-5 ${tone.panel}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Gauge size={17} className="text-[#6b5b3e]" />
              <h2 className="text-sm font-semibold">負荷シグナル</h2>
            </div>
            <Chip size="sm" variant="soft" color={tone.chip}>{condition.label}</Chip>
          </div>
          <p className="mt-3 text-sm font-medium leading-6 text-[#3f4a47]">{condition.summary}</p>
          <ul className="mt-3 space-y-2">
            {condition.evidence.map((evidence) => (
              <li key={evidence} className="flex gap-2 text-xs leading-5 text-[#64706d]">
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone.dot}`} />
                {evidence}
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-2 border-t border-black/5 pt-3 text-[11px] leading-5 text-[#6a7471]">
            <Info size={13} className="mt-0.5 shrink-0" />
            {condition.disclaimer}
          </p>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-[#dbe1df] bg-white">
        <div className="flex items-center justify-between border-b border-[#e2e7e5] px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2">
            <BrainCircuit size={18} className="text-[#2a685d]" />
            <h2 className="text-sm font-semibold">抽出したタスク</h2>
          </div>
          <span className="text-xs text-[#74807d]">{tasks.length}件</span>
        </div>
        <div className="divide-y divide-[#e2e7e5]">
          {tasks.map((task, index) => (
            <details key={task.id} className="group px-4 py-3.5 sm:px-5">
              <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e1ece8] font-mono text-xs font-semibold text-[#285f55]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#303b38]">{task.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#727d7a]">
                    <span>{taskTypeLabels[task.type]}</span>
                    <span className="flex items-center gap-1"><CalendarClock size={12} />{task.startTime ?? task.deadline ?? "時刻未定"}</span>
                    {task.people.length ? <span className="flex items-center gap-1"><Users size={12} />{task.people.join("、")}</span> : null}
                  </div>
                </div>
                <Chip size="sm" variant="soft" color={task.movable ? "default" : "success"}>
                  {task.movable ? "調整可" : "固定"}
                </Chip>
                <ChevronDown size={16} className="shrink-0 text-[#7a8581] transition-transform group-open:rotate-180" />
              </summary>

              <div className="ml-10 mt-4 grid gap-3 border-t border-[#e8ecea] pt-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
                <TextField fullWidth>
                  <Label className="text-xs text-[#65706d]">タスク名</Label>
                  <Input value={task.title} onChange={(event) => updateTask(task.id, { title: event.target.value })} fullWidth />
                </TextField>
                <label className="space-y-1.5 text-xs text-[#65706d]">
                  種類
                  <select
                    value={task.type}
                    onChange={(event) => updateTask(task.id, { type: event.target.value as TaskType })}
                    className="h-10 w-full rounded-md border border-[#d8dfdc] bg-white px-3 text-sm text-[#2c3734] outline-none focus:border-[#6c9f94] focus:ring-2 focus:ring-[#d8e8e4]"
                  >
                    {taskTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <Switch isSelected={task.movable} onChange={(movable) => updateTask(task.id, { movable })} size="sm">
                  <Switch.Content className="h-10 whitespace-nowrap">
                    <Switch.Control><Switch.Thumb /></Switch.Control>
                    <span className="text-sm">調整可能</span>
                  </Switch.Content>
                </Switch>
              </div>
            </details>
          ))}
        </div>
      </section>

      <div className="sticky bottom-[68px] z-10 -mx-4 border-t border-[#d8dfdc] bg-[#eef2f0]/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:mx-0 lg:flex lg:justify-end lg:border-0 lg:bg-transparent lg:px-0">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          isDisabled={Boolean(processingStage)}
          onPress={onCreatePlan}
          className="h-12 bg-[#195b52] text-white lg:w-auto lg:px-6"
        >
          {processingStage ? <LoaderCircle size={18} className="animate-spin" /> : <BrainCircuit size={18} />}
          {processingStage ?? "明日のプランを作る"}
          {!processingStage ? <ArrowRight size={18} /> : null}
        </Button>
      </div>
    </div>
  );
}

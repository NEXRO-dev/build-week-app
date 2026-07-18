"use client";

import { Button, Chip } from "@heroui/react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ClockArrowUp,
  Coffee,
  Lightbulb,
  Mail,
  MoveRight,
  ShieldCheck,
} from "lucide-react";

import type { TomorrowPlan } from "@/types/echly";

type PlanViewProps = {
  plan: TomorrowPlan;
  onBack: () => void;
  onApproval: () => void;
};

type TimelineItem = {
  id: string;
  time: string;
  endTime?: string;
  title: string;
  kind: "keep" | "move" | "rest" | "reschedule";
  reason: string;
  proposedTime?: string | null;
};

function timeValue(time: string) {
  const match = time.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 2000;
}

function buildTimeline(plan: TomorrowPlan): TimelineItem[] {
  return [
    ...plan.keep.map((item) => ({
      id: item.id,
      time: item.proposedTime ?? item.originalTime ?? "未定",
      title: item.title,
      kind: "keep" as const,
      reason: item.reason,
      proposedTime: item.proposedTime,
    })),
    ...plan.move.map((item) => ({
      id: item.id,
      time: item.proposedTime ?? item.originalTime ?? "未定",
      title: item.title,
      kind: "move" as const,
      reason: item.reason,
      proposedTime: item.proposedTime,
    })),
    ...plan.restBlocks.map((item) => ({
      id: item.id,
      time: item.startTime,
      endTime: item.endTime,
      title: "休息・回復ブロック",
      kind: "rest" as const,
      reason: item.reason,
    })),
    ...plan.reschedule.map((item) => ({
      id: item.id,
      time: item.originalTime ?? "未定",
      title: item.title,
      kind: "reschedule" as const,
      reason: item.reason,
      proposedTime: item.proposedTime,
    })),
  ].sort((a, b) => timeValue(a.time) - timeValue(b.time));
}

const timelineTone = {
  keep: {
    panel: "border-[#bcd8cf] bg-[#eff7f4]",
    line: "bg-[#39806f]",
    label: "維持",
    text: "text-[#285f54]",
  },
  move: {
    panel: "border-[#e4cf9e] bg-[#fbf5e8]",
    line: "bg-[#d0a049]",
    label: "時間変更",
    text: "text-[#815a1c]",
  },
  rest: {
    panel: "border-[#c6d8e1] bg-[#eef4f7]",
    line: "bg-[#4f768d]",
    label: "休息",
    text: "text-[#31566b]",
  },
  reschedule: {
    panel: "border-[#e8c6bd] border-dashed bg-[#fff3f0]",
    line: "bg-[#c8765e]",
    label: "延期候補",
    text: "text-[#8d4f3f]",
  },
};

export function PlanView({ plan, onBack, onApproval }: PlanViewProps) {
  const timeline = buildTimeline(plan);
  const changeCount = plan.move.length + plan.reschedule.length + plan.restBlocks.length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="flex items-start gap-3">
        <Button isIconOnly variant="ghost" size="sm" onPress={onBack} aria-label="解析結果へ戻る" className="mt-0.5 shrink-0">
          <ArrowLeft size={19} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold leading-8">明日のプラン</h1>
            <Chip size="sm" variant="soft" color="accent">提案</Chip>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#687471]">
            守る予定を残しながら、負荷を軽くする時間割にしました。
          </p>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-[#cfe0da] bg-[#eaf3f0] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-[#2f6b60]">
            <CalendarCheck2 size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-[#617a73]">Calendarへの反映前</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[#2f514a]">{changeCount}件の調整案があります</p>
          </div>
        </div>
        <ShieldCheck size={18} className="shrink-0 text-[#397466]" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section className="overflow-hidden rounded-lg border border-[#dbe1df] bg-white">
          <div className="flex items-center justify-between border-b border-[#e2e7e5] px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-[#2a685d]" />
              <h2 className="text-sm font-semibold">タイムライン</h2>
            </div>
            <span className="text-xs text-[#74807d]">明日</span>
          </div>

          <div className="px-3 py-4 sm:px-5">
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 px-1">
              {Object.values(timelineTone).map((tone) => (
                <span key={tone.label} className="flex items-center gap-1.5 text-[10px] text-[#6f7a77]">
                  <span className={`size-2 rounded-full ${tone.line}`} />
                  {tone.label}
                </span>
              ))}
            </div>

            <div className="relative space-y-3 before:absolute before:bottom-4 before:left-[54px] before:top-4 before:w-px before:bg-[#dfe5e3]">
              {timeline.map((item) => {
                const tone = timelineTone[item.kind];
                return (
                  <div key={item.id} className="relative grid grid-cols-[42px_12px_minmax(0,1fr)] items-start gap-2">
                    <p className="pt-3 text-right font-mono text-[11px] font-semibold text-[#5c6865]">{item.time}</p>
                    <span className={`relative z-10 mt-3 size-3 rounded-full border-2 border-white ${tone.line}`} />
                    <div className={`relative overflow-hidden rounded-md border px-3.5 py-3 ${tone.panel}`}>
                      <span className={`absolute inset-y-0 left-0 w-1 ${tone.line}`} />
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold leading-5 ${item.kind === "reschedule" ? "line-through text-[#8a7772]" : "text-[#303b38]"}`}>
                            {item.title}
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-[#66716e]">
                            {item.endTime ? `${item.time} - ${item.endTime}` : item.kind === "reschedule" && item.proposedTime ? `${item.proposedTime}へ調整` : item.reason}
                          </p>
                        </div>
                        <span className={`shrink-0 text-[10px] font-semibold ${tone.text}`}>{tone.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-[#dbe1df] bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={17} className="text-[#39806f]" />
              <h2 className="text-sm font-semibold">維持する予定</h2>
            </div>
            <div className="mt-3 divide-y divide-[#e5eae8]">
              {plan.keep.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 py-3 first:pt-1 last:pb-0">
                  <p className="text-sm font-medium leading-5 text-[#35413e]">{item.title}</p>
                  <span className="shrink-0 font-mono text-xs text-[#596461]">{item.proposedTime ?? item.originalTime ?? "未定"}</span>
                </div>
              ))}
              {!plan.keep.length ? <p className="py-2 text-xs text-[#7a8581]">維持する予定はありません。</p> : null}
            </div>
          </section>

          <section className="rounded-lg border border-[#dbe1df] bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <ClockArrowUp size={17} className="text-[#c8765e]" />
              <h2 className="text-sm font-semibold">変更候補</h2>
            </div>
            <div className="mt-3 space-y-3">
              {plan.move.map((item) => (
                <div key={item.id} className="flex gap-3 text-sm">
                  <MoveRight size={15} className="mt-0.5 shrink-0 text-[#d0a049]" />
                  <div><p className="font-medium">{item.title}</p><p className="mt-1 text-xs text-[#74807d]">{item.originalTime ?? "未定"} → {item.proposedTime ?? "未定"}</p></div>
                </div>
              ))}
              {plan.reschedule.map((item) => (
                <div key={item.id} className="flex gap-3 text-sm">
                  <ClockArrowUp size={15} className="mt-0.5 shrink-0 text-[#c8765e]" />
                  <div><p className="font-medium">{item.title}</p><p className="mt-1 text-xs text-[#74807d]">{item.proposedTime ?? "翌日以降"}</p></div>
                </div>
              ))}
              {plan.restBlocks.map((item) => (
                <div key={item.id} className="flex gap-3 text-sm">
                  <Coffee size={15} className="mt-0.5 shrink-0 text-[#4f768d]" />
                  <div><p className="font-medium">回復ブロック</p><p className="mt-1 text-xs text-[#74807d]">{item.startTime} - {item.endTime}</p></div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-[#dbe1df] bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Lightbulb size={17} className="text-[#ae771f]" />
              <h2 className="text-sm font-semibold">このプランの理由</h2>
            </div>
            <ul className="mt-3 space-y-2.5">
              {plan.rationale.map((reason) => (
                <li key={reason} className="flex gap-2 text-xs leading-5 text-[#5b6764]">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#4d8579]" />
                  {reason}
                </li>
              ))}
            </ul>
            {plan.emailDrafts.length ? (
              <p className="mt-4 flex items-center gap-2 border-t border-[#e2e7e5] pt-3 text-xs text-[#6a6561]">
                <Mail size={14} className="text-[#9d5a47]" />
                日程調整メールを{plan.emailDrafts.length}件用意
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      <div className="sticky bottom-[68px] z-10 -mx-4 border-t border-[#d8dfdc] bg-[#eef2f0]/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:mx-0 lg:flex lg:justify-end lg:border-0 lg:bg-transparent lg:px-0">
        <Button variant="primary" size="lg" fullWidth onPress={onApproval} className="h-12 bg-[#195b52] text-white lg:w-auto lg:px-6">
          変更案を確認
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}

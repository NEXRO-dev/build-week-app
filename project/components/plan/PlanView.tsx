"use client";

import { Button } from "@heroui/react";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2 } from "lucide-react";

import type { TomorrowPlan } from "@/types/echly";
import { useI18n } from "@/lib/i18n";

type Props = { plan: TomorrowPlan; onBack: () => void; onApproval: () => void };
type TimelineItem = { id: string; time: string; end?: string; title: string; kind: "keep" | "move" | "rest" | "reschedule"; detail: string };

function timeValue(time: string) {
  const match = time.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 2000;
}

function timeline(plan: TomorrowPlan, isEnglish: boolean): TimelineItem[] {
  const undecided = isEnglish ? "TBD" : "未定";
  const later = isEnglish ? "a later date" : "翌日以降";
  return [
    ...plan.keep.map((item) => ({ id: item.id, time: item.proposedTime ?? item.originalTime ?? undecided, title: item.title, kind: "keep" as const, detail: item.reason })),
    ...plan.move.map((item) => ({ id: item.id, time: item.proposedTime ?? item.originalTime ?? undecided, title: item.title, kind: "move" as const, detail: item.reason })),
    ...plan.restBlocks.map((item) => ({ id: item.id, time: item.startTime, end: item.endTime, title: isEnglish ? "Rest block" : "休息ブロック", kind: "rest" as const, detail: item.reason })),
    ...plan.reschedule.map((item) => ({ id: item.id, time: item.originalTime ?? undecided, title: item.title, kind: "reschedule" as const, detail: isEnglish ? `Move to ${item.proposedTime ?? later}` : `${item.proposedTime ?? later}へ延期` })),
  ].sort((a, b) => timeValue(a.time) - timeValue(b.time));
}

const tone = {
  keep: "border-[#9ddfc5] bg-[#f0faf6] text-[#23775d]",
  move: "border-[#a9d2f5] bg-[#f2f8ff] text-[#315f9f]",
  rest: "border-[#cbbcff] bg-[#f6f3ff] text-[#5c43cb]",
  reschedule: "border-[#ff9fb4] bg-[#fff4f7] text-[#d93764] border-dashed",
};

export function PlanView({ plan, onBack, onApproval }: Props) {
  const { isEnglish, t } = useI18n();
  const items = timeline(plan, isEnglish);
  return (
    <div>
      <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onBack} aria-label={t("戻る", "Back")} className="grid size-10 place-items-center"><ArrowLeft size={20} /></button>
        <h1 className="text-center text-base font-bold">{t("明日のプラン", "Tomorrow's plan")}</h1>
        <CalendarDays size={19} className="mx-auto text-[#545d7d]" />
      </header>

      <div className="px-4 pb-8 pt-4">
        <p className="mb-4 text-center text-xs font-semibold text-[#545d7d]">{t("無理なく進めるための予定です", "A manageable schedule for your day")}</p>
        <section className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="grid min-w-0 grid-cols-[44px_1fr] gap-2 min-[380px]:grid-cols-[48px_1fr]">
              <time className="pt-3 text-right text-[11px] font-medium text-[#66708d]">{item.time}</time>
              <div className={`min-w-0 rounded-lg border-l-[3px] px-3 py-2.5 ${tone[item.kind]}`}>
                <p className={`break-words text-sm font-bold ${item.kind === "reschedule" ? "line-through" : ""}`}>{item.title}</p>
                <p className="mt-1 text-[11px] text-[#56607d]">{item.end ? `${item.time} - ${item.end}` : item.detail}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-5 rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">{t("維持する予定", "Plans to keep")}</h2>
          <ul className="mt-3 space-y-2">
            {plan.keep.map((item) => <li key={item.id} className="flex min-w-0 gap-2 text-xs leading-5"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#29ae7d]" /><span className="min-w-0 break-words">{item.title}</span></li>)}
            {!plan.keep.length ? <li className="text-xs text-[#717997]">{t("維持する予定はありません", "No fixed plans")}</li> : null}
          </ul>
        </section>

        {plan.reschedule.length ? (
          <section className="mt-3 rounded-lg border border-[#e3e5ef] p-4">
            <h2 className="text-xs font-bold">{t("延期候補", "Possible reschedules")}</h2>
            <ul className="mt-3 space-y-2">{plan.reschedule.map((item) => <li key={item.id} className="text-xs"><span className="font-semibold">{item.title}</span><span className="ml-2 text-[#717997]">{item.proposedTime}</span></li>)}</ul>
          </section>
        ) : null}

        <Button variant="primary" size="lg" fullWidth onPress={onApproval} className="mt-5 h-12 bg-[#5b42ff] text-white">{t("変更内容を確認", "Review changes")}<ArrowRight size={18} /></Button>
      </div>
    </div>
  );
}

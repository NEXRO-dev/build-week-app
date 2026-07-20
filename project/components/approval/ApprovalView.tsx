"use client";

import { Button, Checkbox } from "@heroui/react";
import { ArrowDown, ArrowLeft, CalendarDays, Check, Mail } from "lucide-react";
import { useMemo, useState } from "react";

import type { TomorrowPlan } from "@/types/echly";
import { useI18n } from "@/lib/i18n";

type Props = {
  plan: TomorrowPlan;
  appliedActionIds: string[];
  onPlanChange: (plan: TomorrowPlan) => void;
  onApply: (ids: string[]) => void;
  onBack: () => void;
};

function actionIds(plan: TomorrowPlan) {
  return [...plan.move, ...plan.reschedule, ...plan.restBlocks, ...plan.emailDrafts].map((item) => item.id);
}

function ApprovalCheckbox({
  id,
  label,
  selected,
  onToggle,
}: {
  id: string;
  label: string;
  selected: boolean;
  onToggle: (id: string, value: boolean) => void;
}) {
  return (
    <Checkbox
      isSelected={selected}
      onChange={(value) => onToggle(id, value)}
      aria-label={label}
      className="shrink-0"
    >
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  );
}

export function ApprovalView({ plan, appliedActionIds, onApply, onBack }: Props) {
  const { t } = useI18n();
  const allIds = useMemo(() => actionIds(plan), [plan]);
  const [selected, setSelected] = useState(() => new Set(allIds));
  const pending = allIds.filter((id) => selected.has(id) && !appliedActionIds.includes(id));

  function toggle(id: string, value: boolean) {
    setSelected((current) => { const next = new Set(current); if (value) next.add(id); else next.delete(id); return next; });
  }

  return (
    <div>
      <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onBack} aria-label={t("戻る", "Back")} className="grid size-10 place-items-center"><ArrowLeft size={20} /></button>
        <h1 className="text-center text-base font-bold">{t("変更の確認", "Review changes")}</h1><span />
      </header>

      <div className="space-y-3 px-4 pb-8 pt-4">
        {appliedActionIds.length ? <div className="flex items-center gap-2 rounded-lg bg-[#eefaf6] px-4 py-3 text-sm font-medium text-[#26785f]"><Check size={17} />{t(`${appliedActionIds.length}件を適用しました`, `${appliedActionIds.length} changes applied`)}</div> : null}

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="flex items-center gap-2 text-xs font-bold text-[#4e3ad0]"><CalendarDays size={15} />{t("カレンダーの変更", "Calendar changes")}</h2>
          <div className="mt-3 space-y-3">
            {plan.move.map((item) => (
              <label key={item.id} className="flex items-start gap-3">
                <ApprovalCheckbox id={item.id} label={item.title} selected={selected.has(item.id)} onToggle={toggle} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold">{item.title}</p>
                  <div className="mt-2 rounded-md border border-[#cfe1f7] bg-[#f4f8ff] px-3 py-2 text-xs text-[#365f9c]">{item.originalTime ?? t("未定", "TBD")} → {item.proposedTime ?? t("未定", "TBD")}</div>
                </div>
              </label>
            ))}
            {plan.reschedule.map((item) => (
              <label key={item.id} className="flex items-start gap-3">
                <ApprovalCheckbox id={item.id} label={item.title} selected={selected.has(item.id)} onToggle={toggle} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold">{item.title}</p>
                  <div className="mt-2 space-y-2 text-xs">
                    <p className="rounded-md border border-[#cfe1f7] bg-[#f4f8ff] px-3 py-2">{item.originalTime ?? t("未定", "TBD")}</p>
                    <ArrowDown size={14} className="mx-auto text-[#747c99]" />
                    <p className="rounded-md border border-[#ffd1b3] bg-[#fff7ee] px-3 py-2 text-[#bd632c]">{item.proposedTime ?? t("翌日以降", "A later date")}</p>
                  </div>
                </div>
              </label>
            ))}
            {plan.restBlocks.map((item) => (
              <label key={item.id} className="flex items-start gap-3">
                <ApprovalCheckbox id={item.id} label={t("休息ブロック", "Rest block")} selected={selected.has(item.id)} onToggle={toggle} />
                <div className="min-w-0 flex-1"><p className="text-sm font-bold">{t("休息ブロック", "Rest block")}</p><p className="mt-2 rounded-md border border-[#f1c4d3] bg-[#fff4f7] px-3 py-2 text-xs text-[#bd3c67]">{item.startTime} - {item.endTime}</p></div>
              </label>
            ))}
          </div>
        </section>

        {plan.emailDrafts.map((draft) => (
          <section key={draft.id} className="rounded-lg border border-[#e3e5ef] p-4">
            <label className="flex items-center gap-3">
              <ApprovalCheckbox id={draft.id} label={t("メール下書き", "Email draft")} selected={selected.has(draft.id)} onToggle={toggle} />
              <h2 className="flex items-center gap-2 text-xs font-bold text-[#4e3ad0]"><Mail size={15} />{t("メール下書き", "Email draft")}</h2>
            </label>
            <dl className="mt-3 space-y-2 text-xs">
              <div><dt className="font-bold">{t("宛先", "To")}</dt><dd className="mt-1 break-words rounded-md border border-[#e5e7ef] px-3 py-2">{draft.to.join(", ")}</dd></div>
              <div><dt className="font-bold">{t("件名", "Subject")}</dt><dd className="mt-1 break-words rounded-md border border-[#e5e7ef] px-3 py-2">{draft.subject}</dd></div>
              <div><dt className="font-bold">{t("本文プレビュー", "Message preview")}</dt><dd className="mt-1 max-h-28 overflow-hidden whitespace-pre-wrap rounded-md border border-[#e5e7ef] px-3 py-2 leading-5 text-[#555e7b]">{draft.body}</dd></div>
            </dl>
          </section>
        ))}

        <div className="grid grid-cols-[82px_1fr] gap-3 pt-1 min-[380px]:grid-cols-[96px_1fr]">
          <Button variant="outline" size="lg" onPress={onBack} className="h-12">{t("却下", "Cancel")}</Button>
          <Button variant="primary" size="lg" isDisabled={!pending.length} onPress={() => onApply(pending)} className="h-12 min-w-0 bg-[#5b42ff] px-2 text-xs text-white min-[380px]:text-sm">{t("すべて承認して実行", "Approve all")}</Button>
        </div>
      </div>
    </div>
  );
}

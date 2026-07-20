"use client";

import { Button, Checkbox } from "@heroui/react";
import { ArrowDown, ArrowLeft, CalendarDays, Check } from "lucide-react";
import { useMemo, useState } from "react";

import { useI18n } from "@/lib/i18n";
import type { TomorrowPlan } from "@/types/echly";

type Props = {
  plan: TomorrowPlan;
  appliedActionIds: string[];
  onApply: (ids: string[]) => void;
  onBack: () => void;
};

function actionIds(plan: TomorrowPlan) {
  return [...plan.move, ...plan.reschedule, ...plan.restBlocks].map(
    (item) => item.id,
  );
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
  const pending = allIds.filter(
    (id) => selected.has(id) && !appliedActionIds.includes(id),
  );

  function toggle(id: string, value: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div>
      <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onBack} aria-label={t("戻る", "Back")} className="grid size-10 place-items-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-center text-base font-bold">{t("調整候補の確認", "Review changes")}</h1>
        <span />
      </header>

      <div className="space-y-3 px-4 pb-8 pt-4">
        {appliedActionIds.length ? (
          <div className="flex items-center gap-2 rounded-md bg-[#eefaf6] px-4 py-3 text-sm font-medium text-[#26785f]">
            <Check size={17} />
            {t(
              `${appliedActionIds.length}件を承認済み`,
              `${appliedActionIds.length} changes approved`,
            )}
          </div>
        ) : null}

        <section className="border-b border-[#e3e5ef] pb-4">
          <h2 className="flex items-center gap-2 text-xs font-bold text-[#4e3ad0]">
            <CalendarDays size={15} />
            {t("予定の調整", "Schedule changes")}
          </h2>
          <div className="mt-3 space-y-4">
            {plan.move.map((item) => (
              <label key={item.id} className="flex items-start gap-3">
                <ApprovalCheckbox id={item.id} label={item.title} selected={selected.has(item.id)} onToggle={toggle} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold">{item.title}</p>
                  <div className="mt-2 rounded-md border border-[#cfe1f7] bg-[#f4f8ff] px-3 py-2 text-xs text-[#365f9c]">
                    {item.originalTime ?? t("未定", "TBD")} → {item.proposedTime ?? t("未定", "TBD")}
                  </div>
                </div>
              </label>
            ))}

            {plan.reschedule.map((item) => (
              <label key={item.id} className="flex items-start gap-3">
                <ApprovalCheckbox id={item.id} label={item.title} selected={selected.has(item.id)} onToggle={toggle} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold">{item.title}</p>
                  <div className="mt-2 space-y-2 text-xs">
                    <p className="rounded-md border border-[#cfe1f7] bg-[#f4f8ff] px-3 py-2">
                      {item.originalTime ?? t("明日の予定", "Tomorrow")}
                    </p>
                    <ArrowDown size={14} className="mx-auto text-[#747c99]" />
                    <p className="rounded-md border border-[#ffd1b3] bg-[#fff7ee] px-3 py-2 text-[#bd632c]">
                      {item.proposedTime ?? t("翌日以降", "A later date")}
                    </p>
                  </div>
                </div>
              </label>
            ))}

            {plan.restBlocks.map((item) => (
              <label key={item.id} className="flex items-start gap-3">
                <ApprovalCheckbox id={item.id} label={t("休息時間", "Rest block")} selected={selected.has(item.id)} onToggle={toggle} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{t("休息時間", "Rest block")}</p>
                  <p className="mt-2 rounded-md border border-[#d9cdf9] bg-[#f7f4ff] px-3 py-2 text-xs text-[#674ac8]">
                    {item.startTime} - {item.endTime}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </section>

        <p className="text-[11px] leading-5 text-[#737b99]">
          {t(
            "ここでは承認内容を保存します。外部カレンダーの変更は自動では行いません。",
            "This saves your approval. It does not automatically change an external calendar.",
          )}
        </p>

        <div className="grid grid-cols-[82px_1fr] gap-3 pt-1 min-[380px]:grid-cols-[96px_1fr]">
          <Button variant="outline" size="lg" onPress={onBack} className="h-12">
            {t("戻る", "Back")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            isDisabled={!pending.length}
            onPress={() => onApply(pending)}
            className="h-12 min-w-0 bg-[#5b42ff] px-2 text-xs text-white min-[380px]:text-sm"
          >
            {t("選択した内容を承認", "Approve selected")}
          </Button>
        </div>
      </div>
    </div>
  );
}
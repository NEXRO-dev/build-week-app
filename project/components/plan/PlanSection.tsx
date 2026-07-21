"use client";

import { Chip } from "@heroui/react";
import type { LucideIcon } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import type { PlanItem } from "@/types/echly";

type PlanSectionProps = {
  title: string;
  description: string;
  items: PlanItem[];
  icon: LucideIcon;
  tone: "keep" | "move" | "reschedule";
};

const toneStyles = {
  keep: {
    icon: "bg-[#dcece7] text-[#256357]",
    line: "bg-[#3f8878]",
    chip: "success" as const,
  },
  move: {
    icon: "bg-[#f3e8d2] text-[#94661e]",
    line: "bg-[#d2a149]",
    chip: "warning" as const,
  },
  reschedule: {
    icon: "bg-[#f5e2dd] text-[#96513f]",
    line: "bg-[#c8755f]",
    chip: "accent" as const,
  },
};

export function PlanSection({ title, description, items, icon: Icon, tone }: PlanSectionProps) {
  const { t } = useI18n();
  const styles = toneStyles[tone];

  return (
    <section className="border-b border-[#e1e6e4] py-5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-md ${styles.icon}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="mt-0.5 text-xs text-[#73807c]">{description}</p>
            </div>
            <Chip size="sm" variant="soft" color={styles.chip}>
              {t(`${items.length}件`, `${items.length} ${items.length === 1 ? "item" : "items"}`)}
            </Chip>
          </div>

          {items.length ? (
            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <div key={item.id} className="relative rounded-md border border-[#e0e5e3] bg-[#fafbfa] px-4 py-3.5">
                  <span className={`absolute inset-y-3 left-0 w-1 rounded-r ${styles.line}`} />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-[#2e3936]">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[#66716e]">{item.reason}</p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      {item.originalTime && item.proposedTime && item.originalTime !== item.proposedTime ? (
                        <p className="font-mono text-xs text-[#6e7976]">
                          <span className="line-through">{item.originalTime}</span>
                          <span className="mx-1.5">→</span>
                          <span className="font-semibold text-[#2d6359]">{item.proposedTime}</span>
                        </p>
                      ) : (
                        <p className="font-mono text-xs font-semibold text-[#41504c]">
                          {item.proposedTime ?? item.originalTime ?? t("時間未定", "Time TBD")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#7a8581]">{t("該当する予定はありません。", "No matching activities.")}</p>
          )}
        </div>
      </div>
    </section>
  );
}

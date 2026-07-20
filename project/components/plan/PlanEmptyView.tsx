"use client";

import { Button } from "@heroui/react";
import { CalendarDays, Clock3, LoaderCircle, Plus, Sparkles } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import type { ExtractedTask } from "@/types/echly";

type Props = {
  targetDate: string | null;
  tasks: ExtractedTask[];
  hasTodayCondition: boolean;
  processingStage: string | null;
  error: string | null;
  onCreatePlan: () => void;
  onAddSchedule: () => void;
};

function displayDate(targetDate: string | null, isEnglish: boolean) {
  if (!targetDate) return isEnglish ? "Tomorrow" : "明日";
  const parsed = new Date(`${targetDate}T00:00:00`);
  return new Intl.DateTimeFormat(isEnglish ? "en-US" : "ja-JP", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(parsed);
}

export function PlanEmptyView({
  targetDate,
  tasks,
  hasTodayCondition,
  processingStage,
  error,
  onCreatePlan,
  onAddSchedule,
}: Props) {
  const { isEnglish, t } = useI18n();

  return (
    <div>
      <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
        <span />
        <h1 className="text-center text-base font-bold">
          {t("明日のプラン", "Tomorrow's plan")}
        </h1>
        <CalendarDays size={19} className="mx-auto text-[#545d7d]" />
      </header>

      <div className="px-4 pb-8 pt-5">
        <div className="flex items-center justify-between gap-3 border-b border-[#e7e8f0] pb-4">
          <div>
            <p className="text-xs font-semibold text-[#68708f]">
              {displayDate(targetDate, isEnglish)}
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#303857]">
              {t("保存された予定", "Saved activities")}
            </h2>
          </div>
          <span className="text-2xl font-bold tabular-nums text-[#5b42ff]">
            {tasks.length}
          </span>
        </div>

        {tasks.length ? (
          <div className="divide-y divide-[#eceef3]">
            {tasks.map((task) => (
              <div key={task.id} className="flex min-w-0 items-center gap-3 py-3">
                <span className="grid size-8 shrink-0 place-items-center text-[#5b42ff]">
                  <Clock3 size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-[#303857]">
                    {task.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[#737b99]">
                    {task.startTime ?? t("時間指定なし", "No time set")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center">
            <CalendarDays size={28} className="mx-auto text-[#a0a6bb]" />
            <p className="mt-4 text-sm font-semibold text-[#505875]">
              {t("明日の予定はまだありません", "No activities saved for tomorrow")}
            </p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-[#737b99]">
              {t(
                "ホームから明日の予定を話すか入力すると、ここでプランを作成できます。",
                "Add tomorrow's activities from Home, then create a plan here.",
              )}
            </p>
          </div>
        )}

        {tasks.length ? (
          <div className="mt-5 border-t border-[#e7e8f0] pt-5">
            <div className="flex items-start gap-3 text-xs leading-5 text-[#68708f]">
              <Sparkles size={17} className="mt-0.5 shrink-0 text-[#5b42ff]" />
              <p>
                {hasTodayCondition
                  ? t(
                      "今日の負荷シグナルと明日の予定から、無理のない順番と休息時間を提案します。",
                      "The plan uses today's load signal and tomorrow's activities.",
                    )
                  : t(
                      "今日の振り返り前でも作成できます。今回は予定情報だけを使い、負荷は未評価として扱います。",
                      "You can create this before today's check-in. This plan will use schedule information only.",
                    )}
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-md bg-[#fff0f3] px-3 py-2 text-xs leading-5 text-[#c82f59]">
            {error}
          </p>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          isDisabled={Boolean(processingStage)}
          onPress={tasks.length ? onCreatePlan : onAddSchedule}
          className="mt-5 h-12 bg-[#5b42ff] text-white"
        >
          {processingStage ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : tasks.length ? (
            <Sparkles size={18} />
          ) : (
            <Plus size={18} />
          )}
          {processingStage ??
            (tasks.length
              ? t("明日のプランを作る", "Create tomorrow's plan")
              : t("明日の予定を追加", "Add tomorrow's activities"))}
        </Button>
      </div>
    </div>
  );
}

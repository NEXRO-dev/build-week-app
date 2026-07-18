"use client";

import { Button } from "@heroui/react";
import { CalendarDays, ChartNoAxesColumnIncreasing, Mic } from "lucide-react";

type EmptyWorkspaceViewProps = {
  type: "analysis" | "plan";
  hasAnalysis?: boolean;
  onCheckIn: () => void;
  onShowAnalysis?: () => void;
};

export function EmptyWorkspaceView({
  type,
  hasAnalysis = false,
  onCheckIn,
  onShowAnalysis,
}: EmptyWorkspaceViewProps) {
  const isAnalysis = type === "analysis";
  const Icon = isAnalysis ? ChartNoAxesColumnIncreasing : CalendarDays;
  const actionShowsAnalysis = !isAnalysis && hasAnalysis && onShowAnalysis;

  return (
    <section className="flex min-h-[calc(100dvh-190px)] flex-col items-center justify-center px-4 py-12 text-center lg:min-h-[calc(100dvh-128px)]">
      <span className="grid size-14 place-items-center rounded-full bg-[#dfece8] text-[#245f55]">
        <Icon size={25} />
      </span>
      <p className="mt-5 text-xs font-semibold text-[#397165]">
        {isAnalysis ? "Analysis" : "Tomorrow plan"}
      </p>
      <h1 className="mt-2 text-xl font-semibold text-[#1f2927] sm:text-2xl">
        {isAnalysis ? "解析結果はまだありません" : "明日のプランはまだありません"}
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-[#687471]">
        {isAnalysis
          ? "今日のことを話すか入力すると、負荷シグナルと予定候補を確認できます。"
          : hasAnalysis
            ? "解析結果を確認して、明日の予定を作成してください。"
            : "チェックインを解析すると、守る予定と調整候補をまとめます。"}
      </p>
      <Button
        variant="primary"
        size="lg"
        onPress={actionShowsAnalysis ? onShowAnalysis : onCheckIn}
        className="mt-6 h-12 bg-[#195b52] px-6 text-white"
      >
        {actionShowsAnalysis ? <ChartNoAxesColumnIncreasing size={18} /> : <Mic size={18} />}
        {actionShowsAnalysis ? "解析結果を確認" : "チェックインを始める"}
      </Button>
    </section>
  );
}

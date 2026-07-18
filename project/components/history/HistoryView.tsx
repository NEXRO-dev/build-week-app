"use client";

import { Button, Card, Chip } from "@heroui/react";
import { ArrowRight, CalendarDays, CheckCircle2, History, Mic, TrendingDown } from "lucide-react";

import type { CheckIn, ConditionLevel } from "@/types/echly";

type HistoryViewProps = {
  checkIns: CheckIn[];
  onNewCheckIn: () => void;
};

const levelHeight: Record<ConditionLevel, string> = {
  normal: "28%",
  caution: "58%",
  high: "88%",
};

const levelColor: Record<ConditionLevel, string> = {
  normal: "bg-[#4d8b7d]",
  caution: "bg-[#d1a048]",
  high: "bg-[#c66e58]",
};

const levelChip: Record<ConditionLevel, "success" | "warning" | "danger"> = {
  normal: "success",
  caution: "warning",
  high: "danger",
};

export function HistoryView({ checkIns, onNewCheckIn }: HistoryViewProps) {
  const recent = checkIns.slice(0, 7);

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-[#687370]">Past check-ins</p>
          <h1 className="mt-1.5 text-[22px] font-semibold leading-8">チェックイン履歴</h1>
          <p className="mt-1 text-sm leading-6 text-[#687471]">
            負荷シグナルと、実際に選んだ調整を振り返れます。
          </p>
        </div>
        <Button
          variant="primary"
          onPress={onNewCheckIn}
          fullWidth
          className="bg-[#195b52] text-white sm:w-auto"
        >
          <Mic size={17} />
          新しいチェックイン
        </Button>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="min-w-0 overflow-hidden border border-[#dbe1df] bg-white shadow-none">
          <Card.Header className="px-4 pt-4 sm:px-6 sm:pt-6">
            <Card.Title className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <TrendingDown size={19} className="text-[#2f6c60]" />
              直近7日の負荷推移
            </Card.Title>
            <Card.Description className="mt-1 text-sm text-[#6e7976]">
              自己申告と発話内容からの推定
            </Card.Description>
          </Card.Header>
          <Card.Content className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
            <div className="grid h-52 grid-cols-7 items-end gap-1.5 border-b border-[#dfe5e3] px-1 pb-2 sm:h-56 sm:gap-3 sm:px-2">
              {[...recent].reverse().map((checkIn) => {
                const date = new Date(checkIn.createdAt);
                return (
                  <div key={checkIn.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <div className="flex h-[145px] w-full max-w-8 items-end rounded-t bg-[#f1f4f3] sm:h-[165px] sm:max-w-10">
                      <div
                        className={`w-full rounded-t ${levelColor[checkIn.condition.level]}`}
                        style={{ height: levelHeight[checkIn.condition.level] }}
                        title={checkIn.condition.label}
                      />
                    </div>
                    <span className="whitespace-nowrap text-[10px] text-[#74807d] sm:text-[11px]">
                      {date.getMonth() + 1}/{date.getDate()}
                    </span>
                  </div>
                );
              })}
              {recent.length < 7
                ? Array.from({ length: 7 - recent.length }).map((_, index) => (
                    <div key={`empty-${index}`} className="flex h-full min-w-0 flex-col items-center justify-end gap-2 opacity-45">
                      <div className="h-[145px] w-full max-w-8 rounded-t bg-[#f1f4f3] sm:h-[165px] sm:max-w-10" />
                      <span className="text-[10px] text-[#8b9592] sm:text-[11px]">-</span>
                    </div>
                  ))
                : null}
            </div>
            <p className="mt-4 text-xs leading-5 text-[#74807d]">
              このグラフは診断結果ではありません。日々の調整傾向を確認するための目安です。
            </p>
          </Card.Content>
        </Card>

        <div className="min-w-0 space-y-3">
          {checkIns.map((checkIn) => {
            const date = new Intl.DateTimeFormat("ja-JP", {
              month: "short",
              day: "numeric",
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(checkIn.createdAt));
            return (
              <Card key={checkIn.id} className="min-w-0 overflow-hidden border border-[#dbe1df] bg-white shadow-none">
                <Card.Content className="px-4 py-4 sm:px-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#edf2f0] text-[#37695f] sm:size-10">
                      <History size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-5 text-[#737f7b] sm:text-xs">
                          <CalendarDays size={13} className="shrink-0" />
                          <span>{date}</span>
                        </p>
                        <Chip size="sm" variant="soft" color={levelChip[checkIn.condition.level]} className="shrink-0">
                          {checkIn.condition.label}
                        </Chip>
                      </div>
                      <p className="mt-1 line-clamp-2 break-words text-sm font-medium leading-5 text-[#35413e]">
                        {checkIn.transcript}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="flex min-w-0 items-center gap-1.5 text-xs text-[#6c7774]">
                          <CheckCircle2 size={13} className="shrink-0 text-[#4b8578]" />
                          {checkIn.approvedActionIds.length}件の調整を適用
                        </p>
                        <ArrowRight size={16} className="shrink-0 text-[#8a9592]" />
                      </div>
                    </div>
                  </div>
                </Card.Content>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

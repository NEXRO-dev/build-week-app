"use client";

import { ArrowLeft, ChevronDown, List, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";
import type { CheckIn, ConditionLevel, HistoryTranscriptEntry } from "@/types/echly";

type Props = {
  checkIns: CheckIn[];
  historyTranscripts: HistoryTranscriptEntry[];
  selectedHistoryId: string | null;
  storageLoaded: boolean;
  onHistoryBack: () => void;
  onHistorySelect: (id: string) => void;
  onNewCheckIn: () => void;
};
type ChartRange = 7 | 30;

const score: Record<ConditionLevel, number> = { normal: 36, caution: 58, high: 82 };
const DAY_MS = 24 * 60 * 60 * 1000;
const CHART = { left: 45, right: 326, top: 12, bottom: 130 } as const;

function loadScore(item: CheckIn) {
  return item.condition.score ?? score[item.condition.level];
}

function dateKey(item: CheckIn) {
  return item.localDate ?? item.createdAt.slice(0, 10);
}

function dateKeyToTime(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function offsetDateKey(value: string, days: number) {
  const date = new Date(dateKeyToTime(value) + days * DAY_MS);
  return date.toISOString().slice(0, 10);
}

function shortDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}/${day}`;
}

function monthLabel(value: string, isEnglish: boolean) {
  const [year, month] = value.split("-").map(Number);
  return isEnglish
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1)))
    : `${year}年${month}月`;
}

function dayLabel(value: string, isEnglish: boolean) {
  const date = new Date(dateKeyToTime(value));
  return new Intl.DateTimeFormat(isEnglish ? "en-US" : "ja-JP", {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

export function HistoryView({
  checkIns,
  historyTranscripts,
  selectedHistoryId,
  storageLoaded,
  onHistoryBack,
  onHistorySelect,
  onNewCheckIn,
}: Props) {
  const { isEnglish, t } = useI18n();
  const [chartRange, setChartRange] = useState<ChartRange>(7);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const closeDrawerRef = useRef<HTMLButtonElement | null>(null);
  const measured = checkIns.filter((item) => typeof item.condition.score === "number");
  const recent = measured.slice(0, 7).reverse();
  const avg = recent.length ? Math.round(recent.reduce((sum, item) => sum + loadScore(item), 0) / recent.length) : 0;
  const avgLabel = avg >= 60 ? t("高い", "High") : avg >= 40 ? t("やや高い", "Elevated") : t("低〜通常", "Low–normal");
  const measuredByDate = new Map<string, CheckIn>();
  for (const item of measured) {
    const key = dateKey(item);
    const saved = measuredByDate.get(key);
    if (!saved || item.createdAt > saved.createdAt) measuredByDate.set(key, item);
  }
  const chartEndDate = [...measuredByDate.keys()].sort().at(-1);
  const chartStartDate = chartEndDate
    ? offsetDateKey(chartEndDate, -(chartRange - 1))
    : undefined;
  const chartItems = chartStartDate && chartEndDate
    ? [...measuredByDate.entries()]
        .filter(([key]) => key >= chartStartDate && key <= chartEndDate)
        .sort(([left], [right]) => left.localeCompare(right))
    : [];
  const chartWidth = CHART.right - CHART.left;
  const chartHeight = CHART.bottom - CHART.top;
  const chartPoints = chartItems.map(([key, item]) => {
    const dayOffset = chartStartDate
      ? (dateKeyToTime(key) - dateKeyToTime(chartStartDate)) / DAY_MS
      : 0;
    const x = CHART.left + (dayOffset / Math.max(1, chartRange - 1)) * chartWidth;
    const value = Math.max(0, Math.min(100, loadScore(item)));
    const y = CHART.top + ((100 - value) / 100) * chartHeight;
    return { x, y, value, key };
  });
  const xTickOffsets = chartRange === 7 ? [0, 1, 2, 3, 4, 5, 6] : [0, 7, 14, 21, 29];
  const xTicks = chartStartDate
    ? xTickOffsets.map((offset) => ({
        offset,
        label: shortDate(offsetDateKey(chartStartDate, offset)),
      }))
    : [];
  const historyByDate = new Map<string, CheckIn>();
  for (const item of [...checkIns].sort((left, right) => {
    const dateComparison = dateKey(right).localeCompare(dateKey(left));
    return dateComparison || right.createdAt.localeCompare(left.createdAt);
  })) {
    const itemDate = dateKey(item);
    if (!historyByDate.has(itemDate)) historyByDate.set(itemDate, item);
  }
  const historyTranscriptByDate = new Map<string, HistoryTranscriptEntry>();
  for (const entry of [...historyTranscripts].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )) {
    if (!historyTranscriptByDate.has(entry.localDate)) {
      historyTranscriptByDate.set(entry.localDate, entry);
    }
  }
  const historyMonthKeys = new Set(
    [...historyByDate.keys(), ...historyTranscriptByDate.keys()].map((itemDate) => itemDate.slice(0, 7)),
  );
  const historyMonths = [...historyMonthKeys]
    .sort((left, right) => right.localeCompare(left))
    .map((month) => [
      month,
      [...new Set([...historyByDate.keys(), ...historyTranscriptByDate.keys()])]
        .filter((itemDate) => itemDate.startsWith(`${month}-`))
        .sort((left, right) => right.localeCompare(left))
        .map((itemDate) => ({
          itemDate,
          item: historyByDate.get(itemDate),
          historyEntry: historyTranscriptByDate.get(itemDate),
          recordId:
            historyByDate.get(itemDate)?.id ??
            historyTranscriptByDate.get(itemDate)!.id,
        })),
    ] as const);
  const selectedCheckIn = selectedHistoryId
    ? checkIns.find((item) => item.id === selectedHistoryId)
    : undefined;
  const selectedTranscriptEntry = selectedHistoryId
    ? historyTranscripts.find((entry) => entry.id === selectedHistoryId)
    : undefined;
  const selectedDate = selectedCheckIn
    ? dateKey(selectedCheckIn)
    : selectedTranscriptEntry?.localDate ?? null;
  const selectedTranscripts = selectedDate
    ? historyTranscripts
        .filter((entry) => entry.localDate === selectedDate)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    : [];
  const detailTranscripts = selectedTranscripts.length
    ? selectedTranscripts
    : selectedCheckIn && selectedDate
      ? [{
          id: selectedCheckIn.id,
          createdAt: selectedCheckIn.createdAt,
          localDate: selectedDate,
          timeZone: selectedCheckIn.timeZone,
          kind: "reflection" as const,
          transcript: selectedCheckIn.transcript,
          tasks: selectedCheckIn.tasks,
        }]
      : selectedTranscriptEntry
        ? [selectedTranscriptEntry]
        : [];
  const latest = measured[0];
  const latestComponents = latest?.condition.components;
  const voiceBaselineTarget = latestComponents?.voiceBaselineTarget ?? 5;
  const voiceMinimumDurationSec =
    latestComponents?.voiceMinimumDurationSec ?? 10;
  const voiceCurrentEligible =
    latestComponents?.voiceCurrentEligible ??
    Boolean(
      latest &&
        latest.audioMeta.durationSec >= voiceMinimumDurationSec &&
        (Number.isFinite(latest.audioMeta.speechRate) ||
          Number.isFinite(latest.audioMeta.silenceRatio)),
    );
  const voiceEligibilityReason =
    latestComponents?.voiceEligibilityReason ??
    (voiceCurrentEligible
      ? "eligible"
      : latest && latest.audioMeta.durationSec < voiceMinimumDurationSec
        ? "too_short"
        : "no_features");
  const voiceSamplesCollected =
    latestComponents?.voiceSamplesCollected ??
    Math.min(
      voiceBaselineTarget,
      (latestComponents?.voiceBaselineCount ?? 0) +
        (voiceCurrentEligible ? 1 : 0),
    );
  const voiceTrendReady =
    typeof latestComponents?.voiceDeviation === "number";
  const voiceUsesSingleFeature =
    voiceTrendReady &&
    ((latestComponents?.voiceFeaturesUsed?.length ?? 0) === 1 ||
      latestComponents?.voiceWeight === 0.05);
  const voiceProgress = latest
    ? voiceTrendReady
      ? 100
      : (voiceSamplesCollected / voiceBaselineTarget) * 100
    : 0;
  const voiceStatus = !latest
    ? t("記録なし", "No records")
    : voiceTrendReady
      ? voiceUsesSingleFeature
        ? t("一部特徴で比較中", "Comparing one feature")
        : t("個人内比較中", "Personal comparison active")
      : !voiceCurrentEligible
        ? voiceEligibilityReason === "too_short"
          ? t("参考記録（短時間）", "Reference only (short)")
          : t("特徴を取得できず", "Features unavailable")
        : voiceSamplesCollected + "/" + voiceBaselineTarget;

  useEffect(() => {
    if (!historyDrawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeDrawerRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setHistoryDrawerOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [historyDrawerOpen]);

  if (selectedHistoryId) {
    return (
      <div>
        <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={onHistoryBack}
            aria-label={t("履歴一覧へ戻る", "Back to history")}
            className="grid size-10 place-items-center text-[#303857] active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-center text-base font-bold">{t("履歴詳細", "History details")}</h1>
          <span />
        </header>
        {!storageLoaded ? (
          <div className="px-4 py-12 text-center text-xs text-[#737b96]">{t("履歴を読み込んでいます...", "Loading history...")}</div>
        ) : (!selectedCheckIn && !selectedTranscriptEntry) || !selectedDate ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-bold">{t("履歴が見つかりません", "History not found")}</p>
            <button type="button" onClick={onHistoryBack} className="mt-4 rounded-lg bg-[#303857] px-4 py-2 text-xs font-bold text-white">
              {t("履歴一覧へ戻る", "Back to history")}
            </button>
          </div>
        ) : (
          <div className="space-y-3 px-4 pb-8 pt-4">
            <section className="rounded-lg bg-[#303857] p-4 text-white">
              <p className="text-xs text-white/70">{dayLabel(selectedDate, isEnglish)}</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] text-white/65">{t("負荷スコア", "Load score")}</p>
                  <p className="mt-1 text-3xl font-bold">{typeof selectedCheckIn?.condition.score === "number" ? selectedCheckIn.condition.score : "—"}<span className="text-xs font-medium text-white/65">/100</span></p>
                </div>
                <span className="rounded-full bg-white/12 px-3 py-1 text-[10px] font-bold">{selectedCheckIn?.condition.label ?? t("予定・タスク", "Plans and tasks")}</span>
              </div>
            </section>

            {selectedCheckIn ? <section className="rounded-lg border border-[#e3e5ef] p-4">
              <h2 className="text-xs font-bold">{t("算出結果", "Result")}</h2>
              <p className="mt-3 text-xs leading-6 text-[#535c79]">{selectedCheckIn.condition.summary}</p>
              {selectedCheckIn.condition.components ? <p className="mt-2 text-[10px] text-[#737b96]">Raw TLX: {selectedCheckIn.condition.components.rawTlx}/100</p> : null}
              {selectedCheckIn.condition.evidence.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] leading-5 text-[#535c79]">
                  {selectedCheckIn.condition.evidence.map((evidence, index) => <li key={`${selectedCheckIn.id}-detail-evidence-${index}`}>{evidence}</li>)}
                </ul>
              ) : null}
            </section> : null}

            <section className="rounded-lg border border-[#e3e5ef] p-4">
              <h2 className="text-xs font-bold">{t("文字起こし", "Transcripts")}</h2>
              <div className="mt-3 space-y-3">
                {detailTranscripts.map((entry) => (
                  <article key={entry.id} className="rounded-md bg-[#f7f8fc] p-3">
                    <p className="text-[10px] font-bold text-[#4e3ad0]">{entry.kind === "reflection" ? t("振り返り", "Reflection") : t("予定・タスク", "Plans and tasks")}</p>
                    <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[#535c79]">{entry.transcript || t("文字起こしはありません", "No transcript")}</p>
                    <div className="mt-3 border-t border-[#e3e5ef] pt-2">
                      <p className="text-[10px] font-bold text-[#303857]">{t("抽出したタスク", "Extracted tasks")}</p>
                      {entry.tasks.length ? (
                        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-[#535c79]">
                          {entry.tasks.map((task) => <li key={task.id}>{task.title}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-1 text-[10px] text-[#737b96]">{t("タスクはありません", "No tasks")}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {selectedCheckIn ? <section className="rounded-lg border border-[#e3e5ef] p-4">
              <h2 className="text-xs font-bold">{t("翌日の調整結果", "Next-day adjustments")}</h2>
              <p className="mt-2 text-[11px] text-[#535c79]">
                {selectedCheckIn.approvedActionIds.length
                  ? `${selectedCheckIn.approvedActionIds.length}${t("件を実行", " adjustments made")}`
                  : t("実行した調整はありません", "No adjustments were made")}
              </p>
            </section> : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={() => setHistoryDrawerOpen(true)}
          aria-label={t("日別の履歴一覧を開く", "Open daily history")}
          title={t("日別の履歴一覧", "Daily history")}
          className="grid size-10 place-items-center text-[#303857] transition-transform active:scale-95"
        >
          <List size={20} />
        </button>
        <h1 className="text-center text-base font-bold">{t("履歴", "History")}</h1>
        <button
          type="button"
          onClick={onNewCheckIn}
          aria-label={t("新しく記録する", "Create a new check-in")}
          title={t("新しく記録する", "Create a new check-in")}
          className="grid size-10 place-items-center text-[#303857] active:scale-95"
        >
          <Plus size={19} />
        </button>
      </header>
      {historyDrawerOpen ? (
        <div className="fixed inset-0 z-50 bg-[#111735]/35 backdrop-blur-[2px]" role="presentation" onMouseDown={() => setHistoryDrawerOpen(false)}>
          <div className="relative mx-auto h-full w-full max-w-[430px]">
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="daily-history-title"
              onMouseDown={(event) => event.stopPropagation()}
              className="absolute inset-y-0 left-0 flex w-[min(62vw,270px)] flex-col bg-white shadow-[12px_0_36px_rgba(17,23,53,0.18)]"
            >
              <div className="flex min-h-16 items-center justify-between border-b border-[#ececf3] px-4 pt-[env(safe-area-inset-top)]">
                <div>
                  <h2 id="daily-history-title" className="text-sm font-bold">{t("日別の履歴", "Daily history")}</h2>
                  <p className="mt-0.5 text-[10px] text-[#737b96]">{t("月ごとに記録を確認できます", "Review records by month")}</p>
                </div>
                <button
                  ref={closeDrawerRef}
                  type="button"
                  onClick={() => setHistoryDrawerOpen(false)}
                  aria-label={t("履歴一覧を閉じる", "Close daily history")}
                  className="grid size-10 place-items-center rounded-full text-[#303857] hover:bg-[#f4f5f9] active:scale-95"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
                {historyMonths.length ? (
                  <div className="space-y-2">
                    {historyMonths.map(([month, items], monthIndex) => (
                      <details key={month} open={monthIndex === 0 ? true : undefined} className="group/month overflow-hidden rounded-lg border border-[#e3e5ef] bg-white">
                        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 marker:content-none">
                          <span className="text-xs font-bold">{monthLabel(month, isEnglish)}</span>
                          <span className="flex items-center gap-2 text-[10px] text-[#737b96]">
                            {items.length}{t("日", " days")}
                            <ChevronDown size={16} className="transition-transform group-open/month:rotate-180" />
                          </span>
                        </summary>
                        <div className="space-y-2 border-t border-[#ececf3] bg-[#f8f9fc] p-2">
                          {items.map(({ itemDate, item, recordId }) => {
                            const itemScore = item?.condition.score;
                            return (
                              <button
                                key={itemDate}
                                type="button"
                                onClick={() => {
                                  setHistoryDrawerOpen(false);
                                  onHistorySelect(recordId);
                                }}
                                className="flex min-h-14 w-full items-center gap-3 rounded-md border border-[#e3e5ef] bg-white px-3 text-left transition-colors hover:bg-[#fafaff] active:bg-[#f4f2ff]"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-xs font-bold">{dayLabel(itemDate, isEnglish)}</span>
                                  <span className="mt-1 block truncate text-[10px] text-[#737b96]">{item?.condition.summary ?? t("予定・タスクの記録", "Plans and tasks recorded")}</span>
                                </span>
                                {typeof itemScore === "number" ? (
                                  <span className="shrink-0 rounded-full bg-[#fff0f5] px-2 py-1 text-[10px] font-bold text-[#d9366b]">
                                    {itemScore}/100
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-[#f7f8fc] px-4 py-8 text-center text-xs text-[#737b96]">
                    {t("まだ履歴がありません", "No history yet")}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
      <div className="space-y-3 px-4 pb-8 pt-4">
        <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
          {[
            [t("実測チェックイン", "Measured check-ins"), String(measured.length)], [t("平均負荷", "Average load"), measured.length ? avgLabel + " (" + avg + ")" : t("記録なし", "No records")], [t("調整実行数", "Adjustments made"), String(measured.reduce((sum, item) => sum + item.approvedActionIds.length, 0))], [t("最新Raw TLX", "Latest Raw TLX"), latest?.condition.components ? latest.condition.components.rawTlx + "/100" : t("記録なし", "No records")],
          ].map(([label, value]) => <section key={label} className="min-w-0 rounded-lg border border-[#e3e5ef] px-2 py-3 text-center"><p className="text-[9px] leading-4 text-[#707895]">{label}</p><p className="mt-1 break-words text-sm font-bold">{value}</p></section>)}
        </div>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold">{t("音声の個人内ベースライン", "Personal voice baseline")}</h2>
            <span className="text-[10px] font-bold text-[#303857]">
              {voiceStatus}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eceef4]">
            <span
              className="block h-full rounded-full bg-[#168f78] transition-[width] duration-500"
              style={{ width: voiceProgress + "%" }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-5 text-[#68708f]">
            {!latest
              ? t(
                  voiceMinimumDurationSec + "秒以上で、話速または間を取得できると作成が始まります。",
                  "Baseline collection starts with recordings of at least " + voiceMinimumDurationSec + " seconds when speech rate or pauses can be measured.",
                )
              : voiceTrendReady
                ? voiceUsesSingleFeature
                  ? t("取得できた1特徴だけで比較し、音声の重みを半分にしています。", "Only one available voice feature is compared, with half weight.")
                  : t("本人の過去音声と比べて、話す速さと間の変化を算出しています。", "Speech rate and pauses are compared with your own past recordings.")
                : !voiceCurrentEligible
                  ? voiceEligibilityReason === "too_short"
                    ? voiceMinimumDurationSec +
                      "秒未満のため保存のみ行い、ベースラインには加えていません。"
                    : "録音は保存しましたが、音声特徴を取得できなかったため参考記録です。"
                  : voiceSamplesCollected >= voiceBaselineTarget
                    ? "基準がそろいました。次回から取得できた特徴で個人内変化を算出します。"
                    : "あと" +
                      (voiceBaselineTarget - voiceSamplesCollected) +
                      "件で個人内比較を開始します。"}
          </p>
        </section>
        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold">{t("負荷スコアの推移", "Load score trend")}</h2>
            <div className="flex rounded-md bg-[#f1f2f7] p-0.5" role="group" aria-label={t("表示期間", "Chart range")}>
              {([7, 30] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  aria-pressed={chartRange === range}
                  onClick={() => setChartRange(range)}
                  className={`min-h-7 rounded px-2.5 text-[10px] font-bold transition-colors ${
                    chartRange === range
                      ? "bg-white text-[#303857] shadow-sm"
                      : "text-[#777e98]"
                  }`}
                >
                  {range === 7 ? t("1週間", "1 week") : t("1ヶ月", "1 month")}
                </button>
              ))}
            </div>
          </div>
          <svg viewBox="0 0 340 178" className="mt-3 h-52 w-full" role="img" aria-label={t(`${chartRange === 7 ? "1週間" : "1ヶ月"}の負荷スコア推移。縦軸は0から100、横軸は日付。`, `${chartRange === 7 ? "One week" : "One month"} load score trend. The vertical axis runs from 0 to 100 and the horizontal axis shows dates.`)}>
            {[0, 25, 50, 75, 100].map((value) => {
              const y = CHART.top + ((100 - value) / 100) * chartHeight;
              return (
                <g key={value}>
                  <line x1={CHART.left} y1={y} x2={CHART.right} y2={y} stroke="#eceef4" strokeWidth="1" />
                  <text x={CHART.left - 8} y={y + 3} textAnchor="end" className="fill-[#737b96] text-[9px]">{value}</text>
                </g>
              );
            })}
            <line x1={CHART.left} y1={CHART.top} x2={CHART.left} y2={CHART.bottom} stroke="#aeb3c5" strokeWidth="1" />
            <line x1={CHART.left} y1={CHART.bottom} x2={CHART.right} y2={CHART.bottom} stroke="#aeb3c5" strokeWidth="1" />
            {xTicks.map(({ offset, label }) => {
              const x = CHART.left + (offset / Math.max(1, chartRange - 1)) * chartWidth;
              return (
                <g key={offset}>
                  <line x1={x} y1={CHART.bottom} x2={x} y2={CHART.bottom + 4} stroke="#aeb3c5" strokeWidth="1" />
                  <text x={x} y={CHART.bottom + 15} textAnchor="middle" className="fill-[#737b96] text-[8px]">{label}</text>
                </g>
              );
            })}
            <text x="12" y={(CHART.top + CHART.bottom) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(CHART.top + CHART.bottom) / 2})`} className="fill-[#5f6783] text-[9px] font-semibold">{t("負荷スコア", "Load score")}</text>
            <text x={(CHART.left + CHART.right) / 2} y="172" textAnchor="middle" className="fill-[#5f6783] text-[9px] font-semibold">{t("日付", "Date")}</text>
            {chartPoints.length ? (
              <>
                <polyline points={chartPoints.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="#ff4f82" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {chartPoints.map(({ x, y, value, key }) => <circle key={key} cx={x} cy={y} r="3.5" fill="#ff4f82"><title>{shortDate(key)}: {value}/100</title></circle>)}
              </>
            ) : (
              <text x={(CHART.left + CHART.right) / 2} y={(CHART.top + CHART.bottom) / 2} textAnchor="middle" className="fill-[#8188a1] text-[10px]">{t("実測記録はまだありません", "No measured records yet")}</text>
            )}
          </svg>
        </section>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">{t("直近7日のサマリー", "Last 7 days")}</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
            {[[t("注意シグナル", "Elevated signals"), String(recent.filter((item) => item.condition.level !== "normal").length)], [t("延期候補", "Reschedule options"), String(recent.reduce((sum, item) => sum + item.plan.reschedule.length, 0))], [t("休息時間", "Rest time"), String(recent.reduce((sum, item) => sum + item.plan.restBlocks.length, 0) * 2) + t("時間", "h")]].map(([label,value]) => <div key={label} className="min-w-0 rounded-md bg-[#f7f8fc] p-3"><p className="text-[10px] text-[#707895]">{label}</p><p className="mt-2 break-words text-xl font-bold">{value}</p></div>)}
          </div>
        </section>

        <section className="rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">{t("最新の算出結果", "Latest result")}</h2>
          {latest?.condition.score !== undefined ? <p className="mt-3 text-2xl font-bold">{latest.condition.score}<span className="text-xs">/100</span></p> : null}
          <p className="mt-3 text-xs leading-5 text-[#535c79]">{latest?.condition.summary ?? t("まだ記録がありません。", "No records yet.")}</p>
        </section>
      </div>
    </div>
  );
}

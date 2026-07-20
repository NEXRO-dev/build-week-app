"use client";

import { Button } from "@heroui/react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  GripVertical,
  LoaderCircle,
  RotateCw,
  Sparkles,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useI18n } from "@/lib/i18n";
import {
  movePlanItemToTime,
  type EditablePlanItemKind,
} from "@/lib/plan/editPlanTime";
import { normalizeClockTime } from "@/lib/tasks/time";
import type { ApprovalStatus, PlanRecord, TomorrowPlan } from "@/types/echly";

type Props = {
  plan: TomorrowPlan;
  targetDate: string | null;
  generationSource: PlanRecord["generationSource"] | null;
  approvalStatus: ApprovalStatus;
  processingStage: string | null;
  error: string | null;
  onPlanChange: (plan: TomorrowPlan) => void;
  onBack: () => void;
  onRegenerate: () => void;
  onApproval: () => void;
};

type TimelineItem = {
  id: string;
  time: string;
  end?: string | null;
  title: string;
  kind: EditablePlanItemKind;
  detail: string;
};

type DragSession = {
  item: TimelineItem;
  pointerId: number;
  targetTime: string | null;
  cleanup: () => void;
};

const tone = {
  keep: "border-[#70c9a8] bg-[#f0faf6] text-[#23775d]",
  move: "border-[#78afe0] bg-[#f2f8ff] text-[#315f9f]",
  rest: "border-[#a894f5] bg-[#f6f3ff] text-[#5c43cb]",
  reschedule: "border-[#ef7898] bg-[#fff4f7] text-[#c9335d] border-dashed",
};

function timeValue(time: string | null | undefined) {
  const normalized = normalizeClockTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function clock(totalMinutes: number) {
  const normalized = Math.max(0, Math.min(1439, totalMinutes));
  return `${Math.floor(normalized / 60).toString().padStart(2, "0")}:${(
    normalized % 60
  )
    .toString()
    .padStart(2, "0")}`;
}

function slotFor(time: string) {
  const value = timeValue(time);
  return value === null ? null : clock(Math.floor(value / 30) * 30);
}

function timeline(plan: TomorrowPlan, isEnglish: boolean): TimelineItem[] {
  return [
    ...plan.keep.map((item) => ({
      id: item.id,
      time: item.proposedTime ?? item.originalTime ?? (isEnglish ? "TBD" : "未定"),
      end: item.endTime,
      title: item.title,
      kind: "keep" as const,
      detail: item.reason,
    })),
    ...plan.move.map((item) => ({
      id: item.id,
      time: item.proposedTime ?? item.originalTime ?? (isEnglish ? "TBD" : "未定"),
      end: item.endTime,
      title: item.title,
      kind: "move" as const,
      detail: item.reason,
    })),
    ...plan.restBlocks.map((item) => ({
      id: item.id,
      time: item.startTime,
      end: item.endTime,
      title: isEnglish ? "Rest block" : "休息時間",
      kind: "rest" as const,
      detail: item.reason,
    })),
  ].sort(
    (first, second) =>
      (timeValue(first.time) ?? 2000) - (timeValue(second.time) ?? 2000),
  );
}

function rescheduledItems(plan: TomorrowPlan, isEnglish: boolean): TimelineItem[] {
  return plan.reschedule.map((item) => ({
    id: item.id,
    time: item.originalTime ?? (isEnglish ? "TBD" : "未定"),
    end: item.endTime,
    title: item.title,
    kind: "reschedule",
    detail: isEnglish
      ? `Move to ${item.proposedTime ?? "a later date"}`
      : `${item.proposedTime ?? "翌日以降"}へ延期`,
  }));
}

function timeSlots(items: TimelineItem[]) {
  const itemTimes = items
    .map((item) => timeValue(item.time))
    .filter((value): value is number => value !== null);
  const first = Math.max(
    0,
    Math.min(7 * 60, ...itemTimes.map((value) => Math.floor(value / 30) * 30)),
  );
  const last = Math.min(
    23 * 60 + 30,
    Math.max(22 * 60, ...itemTimes.map((value) => Math.ceil(value / 30) * 30)),
  );
  return Array.from(
    { length: Math.floor((last - first) / 30) + 1 },
    (_, index) => clock(first + index * 30),
  );
}

function formatTargetDate(targetDate: string | null, isEnglish: boolean) {
  if (!targetDate) return isEnglish ? "Tomorrow" : "明日";
  return new Intl.DateTimeFormat(isEnglish ? "en-US" : "ja-JP", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${targetDate}T00:00:00`));
}

export function PlanView({
  plan,
  targetDate,
  generationSource,
  approvalStatus,
  processingStage,
  error,
  onPlanChange,
  onBack,
  onRegenerate,
  onApproval,
}: Props) {
  const { isEnglish, t } = useI18n();
  const items = useMemo(() => timeline(plan, isEnglish), [isEnglish, plan]);
  const deferred = useMemo(
    () => rescheduledItems(plan, isEnglish),
    [isEnglish, plan],
  );
  const slots = useMemo(() => timeSlots(items), [items]);
  const dragRef = useRef<DragSession | null>(null);
  const scheduleRef = useRef<HTMLDivElement | null>(null);
  const [draggingItem, setDraggingItem] = useState<TimelineItem | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);

  const scheduledBySlot = new Map<string, TimelineItem[]>();
  const unscheduled = [...items.filter((item) => !slotFor(item.time)), ...deferred];
  const actionCount =
    plan.move.length +
    plan.reschedule.length +
    plan.restBlocks.length +
    plan.emailDrafts.length;

  for (const item of items) {
    const slot = slotFor(item.time);
    if (!slot) continue;
    const current = scheduledBySlot.get(slot) ?? [];
    current.push(item);
    scheduledBySlot.set(slot, current);
  }

  function changeTime(item: TimelineItem, time: string) {
    onPlanChange(movePlanItemToTime(plan, item.id, item.kind, time));
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, item: TimelineItem) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const pointerId = event.pointerId;

    function cleanup() {
      window.removeEventListener("pointermove", updateDrag);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
    }

    function updateDrag(nativeEvent: PointerEvent) {
      const session = dragRef.current;
      if (!session || session.pointerId !== nativeEvent.pointerId) return;
      nativeEvent.preventDefault();
      const element = document.elementFromPoint(nativeEvent.clientX, nativeEvent.clientY);
      const slot = element?.closest<HTMLElement>("[data-plan-time]");
      const targetTime = slot?.dataset.planTime ?? null;
      session.targetTime = targetTime;
      setDragTarget(targetTime);
      setPointerPosition({ x: nativeEvent.clientX, y: nativeEvent.clientY });

      const scheduleBounds = scheduleRef.current?.getBoundingClientRect();
      if (scheduleBounds && nativeEvent.clientY < scheduleBounds.top + 56) {
        scheduleRef.current?.scrollBy({ top: -18, behavior: "auto" });
      } else if (scheduleBounds && nativeEvent.clientY > scheduleBounds.bottom - 56) {
        scheduleRef.current?.scrollBy({ top: 18, behavior: "auto" });
      }
    }

    function finishDrag(nativeEvent: PointerEvent) {
      const session = dragRef.current;
      if (!session || session.pointerId !== nativeEvent.pointerId) return;
      const targetTime = session.targetTime;
      session.cleanup();
      dragRef.current = null;
      setDraggingItem(null);
      setDragTarget(null);
      setPointerPosition(null);
      if (targetTime) {
        onPlanChange(movePlanItemToTime(plan, item.id, item.kind, targetTime));
      }
    }

    function cancelDrag(nativeEvent: PointerEvent) {
      const session = dragRef.current;
      if (!session || session.pointerId !== nativeEvent.pointerId) return;
      session.cleanup();
      dragRef.current = null;
      setDraggingItem(null);
      setDragTarget(null);
      setPointerPosition(null);
    }

    dragRef.current = { item, pointerId, targetTime: null, cleanup };
    window.addEventListener("pointermove", updateDrag, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", cancelDrag);
    setDraggingItem(item);
    setPointerPosition({ x: event.clientX, y: event.clientY });
  }

  function renderCard(item: TimelineItem) {
    const normalizedTime = normalizeClockTime(item.time) ?? "";
    const isDragging = draggingItem?.id === item.id;
    return (
      <article
        key={`${item.kind}-${item.id}`}
        className={`min-w-0 rounded-md border-l-[3px] px-2 py-2 ${tone[item.kind]}${
          isDragging ? " opacity-35" : ""
        }`}
      >
        <div className="flex min-w-0 items-start gap-1.5">
          <button
            type="button"
            aria-label={`${item.title}${t("の時刻を移動", " time: drag to move")}`}
            title={t("ドラッグして時刻を変更", "Drag to change time")}
            className="mt-0.5 grid size-7 shrink-0 touch-none place-items-center text-current/70 active:cursor-grabbing"
            onPointerDown={(event) => beginDrag(event, item)}
          >
            <GripVertical size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p className={`break-words text-xs font-bold leading-5${item.kind === "reschedule" ? " line-through" : ""}`}>
              {item.title}
            </p>
            <p className="mt-0.5 break-words text-[10px] leading-4 text-[#56607d]">
              {item.end && normalizedTime ? `${normalizedTime} - ${item.end}` : item.detail}
            </p>
          </div>
          <label className="flex shrink-0 items-center text-[#56607d]">
            <span className="sr-only">{item.title}{t("の開始時刻", " start time")}</span>
            <input
              type="time"
              step={1800}
              value={normalizedTime}
              onInput={(event) => changeTime(item, event.currentTarget.value)}
              className="w-[92px] bg-transparent text-[11px] font-semibold tabular-nums outline-none"
            />
          </label>
        </div>
      </article>
    );
  }

  return (
    <div>
      <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center border-b border-[#ececf3] px-3 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onBack} aria-label={t("戻る", "Back")} className="grid size-10 place-items-center">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-center text-base font-bold">{t("明日のプラン", "Tomorrow's plan")}</h1>
        <CalendarDays size={19} className="mx-auto text-[#545d7d]" />
      </header>

      <div className="px-4 pb-8 pt-4">
        <div className="flex items-start justify-between gap-3 border-b border-[#e7e8f0] pb-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#68708f]">{formatTargetDate(targetDate, isEnglish)}</p>
            <p className="mt-1 break-words text-sm font-bold text-[#303857]">{plan.condition.summary}</p>
          </div>
          <span className="shrink-0 rounded-md bg-[#f1efff] px-2 py-1 text-[10px] font-bold text-[#5b42ff]">
            {approvalStatus === "approved"
              ? t("承認済み", "Approved")
              : generationSource === "cloudflare"
                ? t("AI作成", "AI generated")
                : t("自動作成", "Auto generated")}
          </span>
        </div>

        <section className="mt-4">
          <h2 className="mb-2 text-xs font-bold">{t("タイムライン", "Timeline")}</h2>
          <div ref={scheduleRef} className="max-h-[58vh] overflow-y-auto overscroll-contain border-y border-[#e5e7ef]">
            {slots.map((slot) => {
              const slotItems = scheduledBySlot.get(slot) ?? [];
              return (
                <div
                  key={slot}
                  data-plan-time={slot}
                  className={`grid min-h-12 grid-cols-[48px_1fr] border-b border-[#eceef4] transition-colors last:border-b-0 ${
                    dragTarget === slot ? "bg-[#eeeaff]" : "bg-white"
                  }`}
                >
                  <time className="border-r border-[#eceef4] px-1 pt-2 text-right text-[10px] font-medium tabular-nums text-[#737b96]">
                    {slot}
                  </time>
                  <div className="min-w-0 space-y-1.5 p-1.5">{slotItems.map(renderCard)}</div>
                </div>
              );
            })}
          </div>
        </section>

        {unscheduled.length ? (
          <section className="mt-5">
            <h2 className="mb-2 text-xs font-bold">{t("時間未定・延期候補", "Unscheduled and deferred")}</h2>
            <div className="space-y-2">{unscheduled.map(renderCard)}</div>
          </section>
        ) : null}

        {plan.rationale.length ? (
          <section className="mt-5 border-t border-[#e7e8f0] pt-4">
            <h2 className="flex items-center gap-2 text-xs font-bold">
              <Sparkles size={15} className="text-[#5b42ff]" />
              {t("この組み方の理由", "Why this plan")}
            </h2>
            <ul className="mt-3 space-y-2">
              {plan.rationale.map((reason, index) => (
                <li key={`${index}-${reason}`} className="flex gap-2 text-xs leading-5 text-[#5f6784]">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#29ae7d]" />
                  <span className="min-w-0 break-words">{reason}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {error ? <p className="mt-4 rounded-md bg-[#fff0f3] px-3 py-2 text-xs leading-5 text-[#c82f59]">{error}</p> : null}

        <div className="mt-5 grid grid-cols-[48px_1fr] gap-3">
          <Button
            isIconOnly
            variant="outline"
            size="lg"
            isDisabled={Boolean(processingStage)}
            onPress={onRegenerate}
            aria-label={t("プランを再作成", "Regenerate plan")}
            className="h-12 w-12"
          >
            {processingStage ? <LoaderCircle size={18} className="animate-spin" /> : <RotateCw size={18} />}
          </Button>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            isDisabled={!actionCount || Boolean(processingStage)}
            onPress={onApproval}
            className="h-12 min-w-0 bg-[#5b42ff] text-white"
          >
            {actionCount
              ? t(`${actionCount}件の調整候補を確認`, `Review ${actionCount} changes`)
              : t("調整が必要な予定はありません", "No changes to review")}
            {actionCount ? <ArrowRight size={18} /> : null}
          </Button>
        </div>
      </div>

      {draggingItem && pointerPosition ? (
        <div
          className={`pointer-events-none fixed z-50 w-64 rounded-md border-l-[3px] px-3 py-2 text-xs font-bold shadow-lg ${tone[draggingItem.kind]}`}
          style={{
            left: Math.max(8, pointerPosition.x - 128),
            top: Math.max(8, pointerPosition.y - 24),
          }}
        >
          {draggingItem.title}
        </div>
      ) : null}
    </div>
  );
}
"use client";

import { Button } from "@heroui/react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  GripVertical,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  movePlanItemToTime,
  type EditablePlanItemKind,
} from "@/lib/plan/editPlanTime";
import { normalizeClockTime } from "@/lib/tasks/time";
import type { TomorrowPlan } from "@/types/echly";

type Props = {
  plan: TomorrowPlan;
  onPlanChange: (plan: TomorrowPlan) => void;
  onBack: () => void;
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
  keep: "border-[#9ddfc5] bg-[#f0faf6] text-[#23775d]",
  move: "border-[#a9d2f5] bg-[#f2f8ff] text-[#315f9f]",
  rest: "border-[#cbbcff] bg-[#f6f3ff] text-[#5c43cb]",
  reschedule:
    "border-[#ff9fb4] bg-[#fff4f7] text-[#d93764] border-dashed",
};

function timeValue(time: string | null | undefined) {
  const normalized = normalizeClockTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function clock(totalMinutes: number) {
  const normalized = Math.max(0, Math.min(1439, totalMinutes));
  return (
    Math.floor(normalized / 60).toString().padStart(2, "0") +
    ":" +
    (normalized % 60).toString().padStart(2, "0")
  );
}

function slotFor(time: string) {
  const value = timeValue(time);
  return value === null ? null : clock(Math.floor(value / 30) * 30);
}

function timeline(plan: TomorrowPlan): TimelineItem[] {
  return [
    ...plan.keep.map((item) => ({
      id: item.id,
      time: item.proposedTime ?? item.originalTime ?? "未定",
      end: item.endTime,
      title: item.title,
      kind: "keep" as const,
      detail: item.reason,
    })),
    ...plan.move.map((item) => ({
      id: item.id,
      time: item.proposedTime ?? item.originalTime ?? "未定",
      end: item.endTime,
      title: item.title,
      kind: "move" as const,
      detail: item.reason,
    })),
    ...plan.restBlocks.map((item) => ({
      id: item.id,
      time: item.startTime,
      end: item.endTime,
      title: "休息ブロック",
      kind: "rest" as const,
      detail: item.reason,
    })),
  ].sort(
    (first, second) =>
      (timeValue(first.time) ?? 2000) - (timeValue(second.time) ?? 2000),
  );
}

function rescheduledItems(plan: TomorrowPlan): TimelineItem[] {
  return plan.reschedule.map((item) => ({
    id: item.id,
    time: item.originalTime ?? "未定",
    end: item.endTime,
    title: item.title,
    kind: "reschedule",
    detail: (item.proposedTime ?? "翌日以降") + "へ延期",
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
    Math.max(
      22 * 60,
      ...itemTimes.map((value) => Math.ceil(value / 30) * 30),
    ),
  );
  return Array.from(
    { length: Math.floor((last - first) / 30) + 1 },
    (_, index) => clock(first + index * 30),
  );
}

export function PlanView({
  plan,
  onPlanChange,
  onBack,
  onApproval,
}: Props) {
  const items = useMemo(() => timeline(plan), [plan]);
  const deferred = useMemo(() => rescheduledItems(plan), [plan]);
  const slots = useMemo(() => timeSlots(items), [items]);
  const dragRef = useRef<DragSession | null>(null);
  const scheduleRef = useRef<HTMLDivElement | null>(null);
  const [draggingItem, setDraggingItem] = useState<TimelineItem | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const scheduledBySlot = new Map<string, TimelineItem[]>();
  const unscheduled = [
    ...items.filter((item) => !slotFor(item.time)),
    ...deferred,
  ];
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

  function beginDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TimelineItem,
  ) {
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
      const element = document.elementFromPoint(
        nativeEvent.clientX,
        nativeEvent.clientY,
      );
      const slot = element?.closest<HTMLElement>("[data-plan-time]");
      const targetTime = slot?.dataset.planTime ?? null;
      session.targetTime = targetTime;
      setDragTarget(targetTime);
      setPointerPosition({ x: nativeEvent.clientX, y: nativeEvent.clientY });

      const scheduleBounds = scheduleRef.current?.getBoundingClientRect();
      if (scheduleBounds && nativeEvent.clientY < scheduleBounds.top + 56) {
        scheduleRef.current?.scrollBy({ top: -18, behavior: "auto" });
      } else if (
        scheduleBounds &&
        nativeEvent.clientY > scheduleBounds.bottom - 56
      ) {
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
        onPlanChange(
          movePlanItemToTime(plan, item.id, item.kind, targetTime),
        );
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
        key={item.kind + "-" + item.id}
        className={
          "min-w-0 rounded-md border-l-[3px] px-2 py-2 " +
          tone[item.kind] +
          (isDragging ? " opacity-35" : "")
        }
      >
        <div className="flex min-w-0 items-start gap-1.5">
          <button
            type="button"
            aria-label={item.title + "の時刻を移動"}
            title="時刻をドラッグして変更"
            className="mt-0.5 grid size-7 shrink-0 touch-none place-items-center text-current/70 active:cursor-grabbing"
            onPointerDown={(event) => beginDrag(event, item)}

          >
            <GripVertical size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p
              className={
                "break-words text-xs font-bold leading-5" +
                (item.kind === "reschedule" ? " line-through" : "")
              }
            >
              {item.title}
            </p>
            <p className="mt-0.5 break-words text-[10px] leading-4 text-[#56607d]">
              {item.end && normalizedTime
                ? normalizedTime + " - " + item.end
                : item.detail}
            </p>
          </div>
          <label className="flex shrink-0 items-center text-[#56607d]">
            <span className="sr-only">{item.title}の開始時刻</span>
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
        <button
          type="button"
          onClick={onBack}
          aria-label="戻る"
          className="grid size-10 place-items-center"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-center text-base font-bold">明日のプラン</h1>
        <CalendarDays size={19} className="mx-auto text-[#545d7d]" />
      </header>

      <div className="px-4 pb-8 pt-4">
        <p className="mb-4 text-center text-xs font-semibold text-[#545d7d]">
          無理なく進めるための予定です
        </p>

        <section>
          <h2 className="mb-2 text-xs font-bold">時間割</h2>
          <div
            ref={scheduleRef}
            className="max-h-[62vh] overflow-y-auto overscroll-contain border-y border-[#e5e7ef]"
          >
            {slots.map((slot) => {
              const slotItems = scheduledBySlot.get(slot) ?? [];
              const isTarget = dragTarget === slot;
              return (
                <div
                  key={slot}
                  data-plan-time={slot}
                  className={
                    "grid min-h-12 grid-cols-[48px_1fr] border-b border-[#eceef4] transition-colors last:border-b-0 " +
                    (isTarget ? "bg-[#eeeaff]" : "bg-white")
                  }
                >
                  <time className="border-r border-[#eceef4] px-1 pt-2 text-right text-[10px] font-medium tabular-nums text-[#737b96]">
                    {slot}
                  </time>
                  <div className="min-w-0 space-y-1.5 p-1.5">
                    {slotItems.map(renderCard)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {unscheduled.length ? (
          <section className="mt-5">
            <h2 className="mb-2 text-xs font-bold">時間未定・延期候補</h2>
            <div className="space-y-2">{unscheduled.map(renderCard)}</div>
          </section>
        ) : null}

        <section className="mt-5 rounded-lg border border-[#e3e5ef] p-4">
          <h2 className="text-xs font-bold">維持する予定</h2>
          <ul className="mt-3 space-y-2">
            {plan.keep.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 gap-2 text-xs leading-5"
              >
                <CheckCircle2
                  size={14}
                  className="mt-0.5 shrink-0 text-[#29ae7d]"
                />
                <span className="min-w-0 break-words">{item.title}</span>
              </li>
            ))}
            {!plan.keep.length ? (
              <li className="text-xs text-[#717997]">
                維持する予定はありません
              </li>
            ) : null}
          </ul>
        </section>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={onApproval}
          className="mt-5 h-12 bg-[#5b42ff] text-white"
        >
          変更内容を確認
          <ArrowRight size={18} />
        </Button>
      </div>

      {draggingItem && pointerPosition ? (
        <div
          className={
            "pointer-events-none fixed z-50 w-64 rounded-md border-l-[3px] px-3 py-2 text-xs font-bold shadow-lg " +
            tone[draggingItem.kind]
          }
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
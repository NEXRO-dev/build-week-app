"use client";

import { CalendarDays, ChartNoAxesColumnIncreasing, History, Home, Settings } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from "react";

import type { WorkspaceView } from "@/types/echly";
import { useI18n } from "@/lib/i18n";

type AppShellProps = {
  children: ReactNode;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
};

function isActive(item: WorkspaceView, view: WorkspaceView) {
  return item === "plan" ? view === "plan" || view === "approval" : item === view;
}

export function AppShell({ children, view, onViewChange }: AppShellProps) {
  const { t } = useI18n();
  const navRef = useRef<HTMLElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<{ pointerId: number; startX: number; startY: number; sourceIndex: number; activated: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [drag, setDrag] = useState<{ sourceIndex: number; deltaX: number; targetIndex: number } | null>(null);
  const navItems = [
    { id: "checkin" as const, label: t("ホーム", "Home"), icon: Home },
    { id: "analysis" as const, label: t("解析", "Analysis"), icon: ChartNoAxesColumnIncreasing },
    { id: "plan" as const, label: t("予定", "Plan"), icon: CalendarDays },
    { id: "history" as const, label: t("履歴", "History"), icon: History },
    { id: "settings" as const, label: t("設定", "Settings"), icon: Settings },
  ];
  const activeIndex = Math.max(0, navItems.findIndex((item) => isActive(item.id, view)));
  const indicatorIndex = drag?.sourceIndex ?? activeIndex;
  const indicatorDelta = drag?.deltaX ?? 0;

  useEffect(() => () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
  }, []);

  function clearPendingHold() {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (index !== activeIndex || event.button !== 0) return;
    clearPendingHold();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, sourceIndex: index, activated: false };
    holdTimerRef.current = window.setTimeout(() => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.activated = true;
      setDrag({ sourceIndex: gesture.sourceIndex, deltaX: 0, targetIndex: gesture.sourceIndex });
    }, 120);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const rawDeltaX = event.clientX - gesture.startX;
    const rawDeltaY = event.clientY - gesture.startY;

    if (!gesture.activated) {
      if (Math.hypot(rawDeltaX, rawDeltaY) > 10) {
        clearPendingHold();
        gestureRef.current = null;
      }
      return;
    }

    event.preventDefault();
    const cellWidth = Math.max(1, ((navRef.current?.clientWidth ?? 0) - 12) / navItems.length);
    const minDelta = -gesture.sourceIndex * cellWidth;
    const maxDelta = (navItems.length - 1 - gesture.sourceIndex) * cellWidth;
    const deltaX = Math.min(maxDelta, Math.max(minDelta, rawDeltaX));
    const targetIndex = Math.min(navItems.length - 1, Math.max(0, gesture.sourceIndex + Math.round(deltaX / cellWidth)));
    setDrag({ sourceIndex: gesture.sourceIndex, deltaX, targetIndex });
    if (targetIndex !== activeIndex) onViewChange(navItems[targetIndex].id);
  }

  function finishGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    clearPendingHold();
    if (gesture?.pointerId === event.pointerId && gesture.activated) {
      suppressClickRef.current = true;
      setDrag(null);
    }
    gestureRef.current = null;
  }

  function handleTabClick(id: WorkspaceView) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onViewChange(id);
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f7f8fc] text-[#111735]">
      <main className="mx-auto min-h-dvh w-full max-w-[430px] overflow-x-hidden bg-white pb-[calc(96px+env(safe-area-inset-bottom))] shadow-[0_0_40px_rgba(27,35,83,0.06)]">
        {children}
      </main>

      <nav
        ref={navRef}
        className="glass-tab-bar fixed bottom-[calc(10px+env(safe-area-inset-bottom))] left-1/2 z-40 grid min-h-[66px] w-[calc(100%-24px)] max-w-[406px] -translate-x-1/2 grid-cols-5 overflow-visible rounded-[32px] border border-white/75 bg-white/65 px-1.5 shadow-[0_14px_40px_rgba(27,35,83,0.16),0_2px_8px_rgba(27,35,83,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[22px] backdrop-saturate-[180%]"
        aria-label={t("メインナビゲーション", "Main navigation")}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 w-[calc(20%_-_0.15rem)] will-change-transform ${
            drag ? "z-20" : "z-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          }`}
          style={{ transform: `translate3d(calc(${indicatorIndex * 100}% + ${indicatorDelta}px), 0, 0)` }}
        >
          <span
            className={`absolute inset-0 origin-center rounded-[26px] shadow-[0_2px_10px_rgba(50,43,105,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] will-change-transform ${
              drag
                ? "scale-[1.45] border border-transparent bg-transparent backdrop-blur-none backdrop-saturate-100 transition-[scale,background-color,backdrop-filter] duration-150 ease-out"
                : "scale-100 border border-transparent bg-white backdrop-blur-none transition-[scale,background-color,backdrop-filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            }`}
          />
        </span>
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const active = isActive(item.id, view);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabClick(item.id)}
              onPointerDown={(event) => handlePointerDown(event, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={finishGesture}
              onPointerCancel={finishGesture}
              onContextMenu={(event) => {
                if (gestureRef.current?.sourceIndex === index) event.preventDefault();
              }}
              aria-current={active ? "page" : undefined}
              className={`relative z-10 my-1.5 flex min-h-[54px] min-w-0 touch-pan-y select-none flex-col items-center justify-center gap-1 rounded-[26px] text-[10px] transition-[color,transform] duration-150 ease-out active:scale-[0.96] ${
                active
                  ? "font-semibold text-[#5b42ff]"
                  : "text-[#68708f] hover:bg-white/35"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.7} />
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

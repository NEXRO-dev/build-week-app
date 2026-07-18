"use client";

import { Button, Chip } from "@heroui/react";
import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  History,
  Home,
  Mic,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ConditionLevel, WorkspaceView } from "@/types/echly";

type AppShellProps = {
  children: ReactNode;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  conditionLevel?: ConditionLevel;
};

const navItems: Array<{
  id: WorkspaceView;
  label: string;
  icon: typeof Home;
}> = [
  { id: "checkin", label: "ホーム", icon: Home },
  {
    id: "analysis",
    label: "解析",
    icon: ChartNoAxesColumnIncreasing,
  },
  { id: "plan", label: "プラン", icon: CalendarDays },
  { id: "history", label: "履歴", icon: History },
  { id: "settings", label: "設定", icon: Settings },
];

const viewTitles: Record<WorkspaceView, string> = {
  checkin: "ホーム",
  analysis: "解析結果",
  plan: "明日のプラン",
  approval: "変更の確認",
  history: "履歴",
  settings: "設定",
};

function conditionLabel(level?: ConditionLevel) {
  if (level === "high") return "高負荷";
  if (level === "caution") return "注意";
  if (level === "normal") return "通常";
  return "未計測";
}

function isActiveView(itemId: WorkspaceView, view: WorkspaceView) {
  return itemId === "plan" ? view === "plan" || view === "approval" : itemId === view;
}

export function AppShell({
  children,
  view,
  onViewChange,
  conditionLevel,
}: AppShellProps) {
  return (
    <div className="min-h-dvh bg-[#eef2f0] text-[#18201f]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] border-r border-[#d8dfdc] bg-[#f8faf9] px-4 py-5 lg:flex lg:flex-col">
        <button
          type="button"
          className="flex items-center gap-3 px-2 text-left"
          onClick={() => onViewChange("checkin")}
          aria-label="Echly ホームへ"
        >
          <span className="grid size-10 place-items-center rounded-lg bg-[#195b52] text-white">
            <span className="echly-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </span>
          <span>
            <span className="block text-xl font-semibold leading-none">Echly</span>
            <span className="mt-1.5 block text-[11px] text-[#6b7673]">明日を、無理なく整える</span>
          </span>
        </button>

        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="メインナビゲーション">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActiveView(item.id, view);
            return (
              <Button
                key={item.id}
                variant={active ? "secondary" : "ghost"}
                fullWidth
                onPress={() => onViewChange(item.id)}
                className={`h-11 justify-start gap-3 px-3 ${
                  active ? "bg-[#e1ece8] font-semibold text-[#195b52]" : "text-[#4f5b58]"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.3 : 1.8} />
                <span>{item.label}</span>
              </Button>
            );
          })}
        </nav>

        <div className="border-t border-[#dde3e1] px-2 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#dce9e5] text-sm font-semibold text-[#23544c]">
                R
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Ryo</p>
                <p className="truncate text-[11px] text-[#74807d]">Personal</p>
              </div>
            </div>
            <Chip size="sm" variant="soft" color={conditionLevel === "high" ? "warning" : "success"}>
              {conditionLabel(conditionLevel)}
            </Chip>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-[#d8dfdc] bg-[#fbfcfb]/95 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2.5"
            onClick={() => onViewChange("checkin")}
            aria-label="Echly ホームへ"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#195b52] text-white">
              <Mic size={16} />
            </span>
            <span className="truncate text-[17px] font-semibold">{viewTitles[view]}</span>
          </button>
          <Chip
            size="sm"
            variant="soft"
            color={conditionLevel === "high" ? "warning" : conditionLevel ? "success" : "default"}
          >
            {conditionLabel(conditionLevel)}
          </Chip>
        </div>
      </header>

      <main className="min-h-dvh pb-[calc(84px+env(safe-area-inset-bottom))] lg:ml-[224px] lg:pb-0">
        <div className="mx-auto w-full max-w-[1040px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid min-h-[68px] grid-cols-5 border-t border-[#d6ddda] bg-[#fbfcfb]/98 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="メインナビゲーション">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActiveView(item.id, view);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              aria-current={active ? "page" : undefined}
              className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 text-[10px]"
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.4 : 1.8}
                className={active ? "text-[#195b52]" : "text-[#6a7572]"}
              />
              <span className={`leading-none ${active ? "font-semibold text-[#195b52]" : "text-[#6a7572]"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

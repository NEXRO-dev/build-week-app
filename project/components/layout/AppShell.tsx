"use client";

import { CalendarDays, ChartNoAxesColumnIncreasing, History, Home, Settings } from "lucide-react";
import type { ReactNode } from "react";

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
  const navItems = [
    { id: "checkin" as const, label: t("ホーム", "Home"), icon: Home },
    { id: "analysis" as const, label: t("解析", "Analysis"), icon: ChartNoAxesColumnIncreasing },
    { id: "plan" as const, label: t("プラン", "Plan"), icon: CalendarDays },
    { id: "history" as const, label: t("履歴", "History"), icon: History },
    { id: "settings" as const, label: t("設定", "Settings"), icon: Settings },
  ];
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f7f8fc] text-[#111735]">
      <main className="mx-auto min-h-dvh w-full max-w-[430px] overflow-x-hidden bg-white pb-[calc(76px+env(safe-area-inset-bottom))] shadow-[0_0_40px_rgba(27,35,83,0.06)]">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 mx-auto grid min-h-[68px] max-w-[430px] grid-cols-5 border-t border-[#e5e7f1] bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
        aria-label={t("メインナビゲーション", "Main navigation")}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.id, view);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 text-[10px] transition-colors active:scale-[0.96] ${
                active ? "font-semibold text-[#5b42ff]" : "text-[#68708f]"
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

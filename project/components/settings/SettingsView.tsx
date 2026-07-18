"use client";

import { Switch } from "@heroui/react";
import { CalendarDays, ChevronRight, Database, Mail, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

type Props = { saveTranscript: boolean; onSaveTranscriptChange: (value: boolean) => void };

function Row({ icon: Icon, title, description, action }: { icon?: typeof CalendarDays; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f2f4fa] text-[#4d5a84]">{Icon ? <Icon size={17} /> : null}</span><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{title}</p>{description ? <p className="mt-1 break-words text-[10px] text-[#727a97]">{description}</p> : null}</div>{action ?? <ChevronRight size={16} className="shrink-0 text-[#8a91aa]" />}</div>;
}

export function SettingsView({ saveTranscript, onSaveTranscriptChange }: Props) {
  return (
    <div>
      <header className="flex h-16 items-center justify-center border-b border-[#ececf3] px-4 pt-[env(safe-area-inset-top)]"><h1 className="text-base font-bold">設定</h1></header>
      <div className="space-y-5 px-4 pb-8 pt-4">
        <section><h2 className="mb-2 text-xs font-bold">Google連携</h2><div className="divide-y divide-[#ececf3] rounded-lg border border-[#e3e5ef]"><Row icon={CalendarDays} title="Google Calendar" description="接続済み（ryo@example.com）" /><Row icon={Mail} title="Gmail" description="接続済み（ryo@example.com）" /></div></section>

        <section><h2 className="mb-2 text-xs font-bold text-[#4e3ad0]">データとプライバシー</h2><div className="divide-y divide-[#ececf3] rounded-lg border border-[#e3e5ef]"><Row icon={Database} title="音声データの保存" description="処理後に削除（推奨）" /><Row icon={Database} title="音声データの削除" description="すべての音声データを削除します" /></div></section>

        <section><h2 className="mb-2 text-xs font-bold text-[#4e3ad0]">安全と権限</h2><div className="divide-y divide-[#ececf3] rounded-lg border border-[#e3e5ef]">
          <div className="flex min-w-0 items-center gap-3 px-3 py-3"><ShieldCheck size={18} className="shrink-0 text-[#4d5a84]" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">カレンダー変更は必ず確認</p><p className="mt-1 break-words text-[10px] text-[#727a97]">承認なしでは実行しません</p></div><Switch isSelected onChange={() => undefined} size="sm" className="shrink-0"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch></div>
          <div className="flex min-w-0 items-center gap-3 px-3 py-3"><Mail size={18} className="shrink-0 text-[#4d5a84]" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">メールは下書き保存のみ</p><p className="mt-1 break-words text-[10px] text-[#727a97]">送信はしません</p></div><Switch isSelected onChange={() => undefined} size="sm" className="shrink-0"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch></div>
          <div className="flex min-w-0 items-center gap-3 px-3 py-3"><Database size={18} className="shrink-0 text-[#4d5a84]" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">文字起こしを履歴に保存</p><p className="mt-1 break-words text-[10px] text-[#727a97]">オフなら承認結果だけ保存</p></div><Switch isSelected={saveTranscript} onChange={onSaveTranscriptChange} size="sm" className="shrink-0"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch></div>
        </div></section>
      </div>
    </div>
  );
}

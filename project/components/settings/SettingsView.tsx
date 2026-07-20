"use client";

import { Button, Switch } from "@heroui/react";
import { CalendarDays, ChevronRight, Database, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";

type Props = {
  user: { name: string; email: string };
  saveTranscript: boolean;
  onSaveTranscriptChange: (value: boolean) => void;
};

function Row({ icon: Icon, title, description, action }: { icon?: typeof CalendarDays; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f2f4fa] text-[#4d5a84]">{Icon ? <Icon size={17} /> : null}</span><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{title}</p>{description ? <p className="mt-1 break-words text-[10px] text-[#727a97]">{description}</p> : null}</div>{action ?? <ChevronRight size={16} className="shrink-0 text-[#8a91aa]" />}</div>;
}

export function SettingsView({ user, saveTranscript, onSaveTranscriptChange }: Props) {
  const { locale, t } = useI18n();

  async function signOut() {
    await authClient.signOut();
    window.location.assign(`/${locale}`);
  }

  return (
    <div>
      <header className="flex h-16 items-center justify-center border-b border-[#ececf3] px-4 pt-[env(safe-area-inset-top)]"><h1 className="text-base font-bold">{t("設定", "Settings")}</h1></header>
      <div className="space-y-5 px-4 pb-8 pt-4">
        <section>
          <h2 className="mb-2 text-xs font-bold">{t("アカウント", "Account")}</h2>
          <div className="rounded-lg border border-[#e3e5ef] p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f2f4fa] text-[#4d5a84]"><UserRound size={19} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{user.name}</p><p className="mt-1 truncate text-[10px] text-[#727a97]">{user.email}</p></div><Button isIconOnly size="sm" variant="ghost" aria-label={t("ログアウト", "Sign out")} onPress={signOut}><LogOut size={17} /></Button></div></div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-bold">{t("言語", "Language")}</h2>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#e3e5ef] p-2">
            <Link href="/jp-ja" aria-current={locale === "jp-ja" ? "page" : undefined} className={`rounded-md px-3 py-2 text-center text-xs font-semibold ${locale === "jp-ja" ? "bg-[#edeaff] text-[#4e3ad0]" : "bg-[#f7f8fc] text-[#68708f]"}`}>日本語</Link>
            <Link href="/us-en" aria-current={locale === "us-en" ? "page" : undefined} className={`rounded-md px-3 py-2 text-center text-xs font-semibold ${locale === "us-en" ? "bg-[#edeaff] text-[#4e3ad0]" : "bg-[#f7f8fc] text-[#68708f]"}`}>English</Link>
          </div>
        </section>

        <section><h2 className="mb-2 text-xs font-bold">{t("Google連携", "Google integrations")}</h2><div className="divide-y divide-[#ececf3] rounded-lg border border-[#e3e5ef]"><Row icon={CalendarDays} title="Google Calendar" description={t("未連携", "Not connected")} /><Row icon={Mail} title="Gmail" description={t("未連携", "Not connected")} /></div></section>

        <section><h2 className="mb-2 text-xs font-bold text-[#4e3ad0]">{t("データとプライバシー", "Data & privacy")}</h2><div className="divide-y divide-[#ececf3] rounded-lg border border-[#e3e5ef]"><Row icon={Database} title={t("クラウド同期", "Cloud sync")} description={t("履歴・予定・設定をアカウントごとに保存", "History, plans, and settings are saved per account")} action={<span className="rounded bg-[#eaf8f2] px-2 py-1 text-[9px] font-bold text-[#23775d]">Turso</span>} /><Row icon={ShieldCheck} title={t("録音音声は保存しません", "Raw audio is not stored")} description={t("処理後に削除し、文字起こしと音声特徴だけを保存", "Deleted after processing; only transcripts and voice features are saved")} action={<ShieldCheck size={16} className="shrink-0 text-[#23966f]" />} /></div></section>

        <section><h2 className="mb-2 text-xs font-bold text-[#4e3ad0]">{t("安全と権限", "Safety & permissions")}</h2><div className="divide-y divide-[#ececf3] rounded-lg border border-[#e3e5ef]">
          <div className="flex min-w-0 items-center gap-3 px-3 py-3"><ShieldCheck size={18} className="shrink-0 text-[#4d5a84]" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{t("カレンダー変更は必ず確認", "Always review calendar changes")}</p><p className="mt-1 break-words text-[10px] text-[#727a97]">{t("承認なしでは実行しません", "Nothing runs without your approval")}</p></div><Switch isSelected onChange={() => undefined} size="sm" className="shrink-0"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch></div>
          <div className="flex min-w-0 items-center gap-3 px-3 py-3"><Mail size={18} className="shrink-0 text-[#4d5a84]" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{t("メールは下書き保存のみ", "Save emails as drafts only")}</p><p className="mt-1 break-words text-[10px] text-[#727a97]">{t("送信はしません", "Echly never sends them")}</p></div><Switch isSelected onChange={() => undefined} size="sm" className="shrink-0"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch></div>
          <div className="flex min-w-0 items-center gap-3 px-3 py-3"><Database size={18} className="shrink-0 text-[#4d5a84]" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{t("文字起こしを履歴に保存", "Save transcripts to history")}</p><p className="mt-1 break-words text-[10px] text-[#727a97]">{t("オフなら承認結果だけ保存", "When off, only approved results are saved")}</p></div><Switch isSelected={saveTranscript} onChange={onSaveTranscriptChange} size="sm" className="shrink-0"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch></div>
        </div></section>
      </div>
    </div>
  );
}

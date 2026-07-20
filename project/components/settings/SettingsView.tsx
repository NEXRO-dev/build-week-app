"use client";

import { Button, Switch } from "@heroui/react";
import { Bell, BellOff, Bug, CalendarDays, ChevronRight, Database, FileText, LogOut, Scale, ShieldCheck, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import { APP_BUILD_TIME, APP_RELEASE_ID, APP_VERSION } from "@/lib/app-version";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import {
  announcePushNotificationChange,
  isRunningAsPwa,
  PUSH_NOTIFICATION_CHANGE_EVENT,
  vapidKeyToBytes,
} from "@/lib/notifications/client";

type Props = {
  user: { name: string; email: string; image?: string | null };
  timeZone: string;
  deviceTimeZone: string;
  debugTimeZone: string | null;
  onDebugTimeZoneChange: (value: string | null) => void;
  requireCalendarApproval: boolean;
  onRequireCalendarApprovalChange: (value: boolean) => Promise<void>;
};

const DEBUG_TIME_ZONES = [
  "UTC",
  "Pacific/Honolulu",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function Row({ icon: Icon, title, description, action }: { icon?: typeof CalendarDays; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f2f4fa] text-[#4d5a84]">{Icon ? <Icon size={17} /> : null}</span><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{title}</p>{description ? <p className="mt-1 break-words text-[10px] text-[#727a97]">{description}</p> : null}</div>{action ?? <ChevronRight size={16} className="shrink-0 text-[#8a91aa]" />}</div>;
}

export function SettingsView({
  user,
  timeZone,
  deviceTimeZone,
  debugTimeZone,
  onDebugTimeZoneChange,
  requireCalendarApproval,
  onRequireCalendarApprovalChange,
}: Props) {
  const { locale, isEnglish, t } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [pushSubscription, setPushSubscription] =
    useState<PushSubscription | null>(null);
  const [isPwa, setIsPwa] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<
    "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on"
  >("loading");
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [calendarApprovalBusy, setCalendarApprovalBusy] = useState(false);
  const [calendarApprovalMessage, setCalendarApprovalMessage] = useState<string | null>(null);
  const profileImageUrl =
    user.image && failedAvatarUrl !== user.image ? user.image : null;

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationState() {
      const standalone = isRunningAsPwa();
      if (!cancelled) setIsPwa(standalone);
      if (!standalone) return;

      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setNotificationState("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setNotificationState("denied");
        return;
      }

      try {
        const [response, registration] = await Promise.all([
          fetch("/api/notifications"),
          navigator.serviceWorker.getRegistration("/"),
        ]);
        const config = response.ok
          ? await response.json() as { configured?: boolean; publicKey?: string | null }
          : null;
        const existing = await registration?.pushManager.getSubscription() ?? null;
        if (cancelled) return;
        setPushSubscription(existing);
        setVapidPublicKey(config?.publicKey ?? null);
        setNotificationState(!config?.configured ? "unconfigured" : existing ? "on" : "off");
      } catch {
        if (!cancelled) setNotificationState("off");
      }
    }

    void loadNotificationState();
    const handleSubscriptionChange = () => void loadNotificationState();
    window.addEventListener(PUSH_NOTIFICATION_CHANGE_EVENT, handleSubscriptionChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PUSH_NOTIFICATION_CHANGE_EVENT, handleSubscriptionChange);
    };
  }, []);

  function currentTimeAt(timeZone: string) {
    return new Intl.DateTimeFormat(isEnglish ? "en-US" : "ja-JP", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: isEnglish,
    }).format(now);
  }

  function formattedBuildTime() {
    if (!APP_BUILD_TIME) return t("不明", "Unknown");
    const buildTime = new Date(APP_BUILD_TIME);
    if (Number.isNaN(buildTime.getTime())) return t("不明", "Unknown");

    return new Intl.DateTimeFormat(isEnglish ? "en-US" : "ja-JP", {
      timeZone,
      year: "numeric",
      month: isEnglish ? "short" : "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: isEnglish,
    }).format(buildTime);
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign(`/${locale}`);
  }

  async function enableNotifications() {
    if (!vapidPublicKey) return;
    setNotificationBusy(true);
    setNotificationMessage(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const nextSubscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyToBytes(vapidPublicKey),
        });
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: nextSubscription.toJSON(),
          timeZone,
          locale,
        }),
      });
      if (!response.ok) throw new Error("subscribe_failed");

      setPushSubscription(nextSubscription);
      setNotificationState("on");
      setNotificationMessage(t("通知をオンにしました。", "Notifications are on."));
      announcePushNotificationChange();
    } catch {
      setNotificationMessage(t("通知をオンにできませんでした。", "Notifications could not be enabled."));
    } finally {
      setNotificationBusy(false);
    }
  }

  async function disableNotifications() {
    if (!pushSubscription) return;
    setNotificationBusy(true);
    setNotificationMessage(null);

    try {
      const response = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: pushSubscription.endpoint }),
      });
      if (!response.ok) throw new Error("unsubscribe_failed");

      await pushSubscription.unsubscribe().catch(() => false);
      setPushSubscription(null);
      setNotificationState("off");
      setNotificationMessage(t("通知をオフにしました。", "Notifications are off."));
      announcePushNotificationChange();
    } catch {
      setNotificationMessage(t("通知設定を変更できませんでした。", "Notification settings could not be changed."));
    } finally {
      setNotificationBusy(false);
    }
  }

  function handleNotificationChange(enabled: boolean) {
    if (enabled) {
      void enableNotifications();
    } else {
      void disableNotifications();
    }
  }

  async function handleCalendarApprovalChange(enabled: boolean) {
    setCalendarApprovalBusy(true);
    setCalendarApprovalMessage(null);
    try {
      await onRequireCalendarApprovalChange(enabled);
    } catch {
      setCalendarApprovalMessage(t("設定を保存できませんでした。", "The setting could not be saved."));
    } finally {
      setCalendarApprovalBusy(false);
    }
  }

  return (
    <div>
      <header className="flex h-16 items-center justify-center border-b border-[#ececf3] px-4 pt-[env(safe-area-inset-top)]"><h1 className="text-base font-bold">{t("設定", "Settings")}</h1></header>
      <div className="space-y-5 px-4 pb-8 pt-4">
        <section>
          <h2 className="mb-2 text-xs font-bold">{t("アカウント", "Account")}</h2>
          <div className="rounded-lg border border-[#e3e5ef] p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f2f4fa] text-[#4d5a84]">{profileImageUrl ? <Image src={profileImageUrl} alt={t("プロフィール画像", "Profile picture")} width={40} height={40} referrerPolicy="no-referrer" onError={() => setFailedAvatarUrl(profileImageUrl)} className="size-full object-cover" /> : <UserRound size={19} />}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{user.name}</p><p className="mt-1 truncate text-[10px] text-[#727a97]">{user.email}</p></div><Button isIconOnly size="sm" variant="ghost" aria-label={t("ログアウト", "Sign out")} onPress={signOut}><LogOut size={17} /></Button></div></div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-bold">{t("言語", "Language")}</h2>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#e3e5ef] p-2">
            <Link href="/jp-ja/setting" aria-current={locale === "jp-ja" ? "page" : undefined} className={`rounded-md px-3 py-2 text-center text-xs font-semibold ${locale === "jp-ja" ? "bg-[#edeaff] text-[#4e3ad0]" : "bg-[#f7f8fc] text-[#68708f]"}`}>日本語</Link>
            <Link href="/us-en/setting" aria-current={locale === "us-en" ? "page" : undefined} className={`rounded-md px-3 py-2 text-center text-xs font-semibold ${locale === "us-en" ? "bg-[#edeaff] text-[#4e3ad0]" : "bg-[#f7f8fc] text-[#68708f]"}`}>English</Link>
          </div>
        </section>

        <section><h2 className="mb-2 text-xs font-bold">{t("Google連携", "Google integrations")}</h2><div className="divide-y divide-[#ececf3] rounded-lg border border-[#e3e5ef]"><Row icon={CalendarDays} title="Google Calendar" description={t("未連携", "Not connected")} /></div></section>

        {isPwa ? <section>
          <h2 className="mb-2 text-xs font-bold">{t("通知", "Notifications")}</h2>
          <div className="rounded-lg border border-[#e3e5ef] p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${notificationState === "on" ? "bg-[#efedff] text-[#5b42ff]" : "bg-[#f2f4fa] text-[#68708f]"}`}>
                {notificationState === "on" ? <Bell size={17} /> : <BellOff size={17} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">{t("夜のチェックイン通知", "Evening check-in reminder")}</p>
                <p className="mt-1 text-[10px] leading-4 text-[#727a97]">
                  {notificationState === "loading"
                    ? t("通知状態を確認しています", "Checking notification status")
                    : notificationState === "unsupported"
                      ? t("この端末では利用できません", "Unavailable on this device")
                      : notificationState === "unconfigured"
                        ? t("Push通知のサーバー設定が必要です", "Push notification server setup is required")
                        : notificationState === "denied"
                          ? t("端末設定で通知がブロックされています", "Notifications are blocked in device settings")
                      : notificationState === "on"
                        ? t(`毎日20:00、未完了時は23:30（${timeZone}）`, `Daily at 8:00 PM; 11:30 PM if incomplete (${timeZone})`)
                        : t("現在の端末ではオフです", "Off on this device")}
                </p>
              </div>
              <Switch
                aria-label={t("夜のチェックイン通知", "Evening check-in reminder")}
                isSelected={notificationState === "on"}
                isDisabled={notificationBusy || notificationState === "loading" || notificationState === "unsupported" || notificationState === "unconfigured" || notificationState === "denied"}
                onChange={handleNotificationChange}
                size="lg"
                className="shrink-0"
              >
                <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
              </Switch>
            </div>
            {notificationMessage ? <p role="status" className="mt-2 text-[10px] leading-4 text-[#68708f]">{notificationMessage}</p> : null}
          </div>
        </section> : null}

        <section><h2 className="mb-2 text-xs font-bold text-[#4e3ad0]">{t("データとプライバシー", "Data & privacy")}</h2><div className="divide-y divide-[#ececf3] rounded-lg border border-[#e3e5ef]"><Row icon={Database} title={t("クラウド同期", "Cloud sync")} description={t("履歴・予定・設定をアカウントごとに保存", "History, plans, and settings are saved per account")} action={<span className="rounded bg-[#eaf8f2] px-2 py-1 text-[9px] font-bold text-[#23775d]">{t("有効", "On")}</span>} /><Row icon={ShieldCheck} title={t("録音音声は保存しません", "Raw audio is not stored")} description={t("処理後に削除し、文字起こしと音声特徴だけを保存", "Deleted after processing; only transcripts and voice features are saved")} action={<ShieldCheck size={16} className="shrink-0 text-[#23966f]" />} /></div></section>

        <section><h2 className="mb-2 text-xs font-bold text-[#4e3ad0]">{t("安全と権限", "Safety & permissions")}</h2><div className="divide-y divide-[#ececf3] rounded-lg border border-[#e3e5ef]">
          <div className="px-3 py-3">
            <div className="flex min-w-0 items-center gap-3"><ShieldCheck size={18} className="shrink-0 text-[#4d5a84]" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{t("カレンダー変更前に確認", "Review calendar changes")}</p><p className="mt-1 break-words text-[10px] text-[#727a97]">{requireCalendarApproval ? t("変更前に承認を求めます", "Approval is required before changes") : t("事前確認をオフにしています", "Pre-approval is turned off")}</p></div><Switch aria-label={t("カレンダー変更前に確認", "Review calendar changes")} isSelected={requireCalendarApproval} isDisabled={calendarApprovalBusy} onChange={(enabled) => void handleCalendarApprovalChange(enabled)} size="lg" className="shrink-0"><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch></div>
            {calendarApprovalMessage ? <p role="status" className="mt-2 pl-[30px] text-[10px] leading-4 text-[#b34848]">{calendarApprovalMessage}</p> : null}
          </div>
          <div className="flex min-w-0 items-center gap-3 px-3 py-3"><Database size={18} className="shrink-0 text-[#4d5a84]" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{t("文字起こしを履歴に保存", "Save transcripts to history")}</p><p className="mt-1 break-words text-[10px] text-[#727a97]">{t("振り返りと予定・タスクの文字起こしを保存", "Reflection and planning/task transcripts are saved")}</p></div><span className="rounded bg-[#eaf8f2] px-2 py-1 text-[9px] font-bold text-[#23775d]">{t("有効", "On")}</span></div>
        </div></section>

        <section>
          <h2 className="mb-2 text-xs font-bold">{t("法務", "Legal")}</h2>
          <div className="divide-y divide-[#ececf3] overflow-hidden rounded-lg border border-[#e3e5ef]">
            <Link href={`/${locale}/terms`} className="block transition-colors hover:bg-[#fafaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6a50ff]">
              <Row icon={Scale} title={t("利用規約", "Terms of Service")} description={t("サービス利用時のルール", "Rules for using Echly")} />
            </Link>
            <Link href={`/${locale}/privacy`} className="block transition-colors hover:bg-[#fafaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6a50ff]">
              <Row icon={FileText} title={t("プライバシーポリシー", "Privacy Policy")} description={t("個人情報とデータの取り扱い", "How personal information and data are handled")} />
            </Link>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold">{t("その他", "Other")}</h2>
            <span className="rounded-full bg-[#fff2d9] px-2 py-1 text-[9px] font-bold text-[#9a5b10]">
              {t("デバッグ用", "Debug only")}
            </span>
          </div>
          <div className="rounded-lg border border-dashed border-[#e2bd72] bg-[#fffbf3] p-3">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#fff0cf] text-[#9a5b10]">
                <Bug size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor="debug-time-zone" className="text-xs font-bold">
                  {t("タイムゾーンを変更", "Override time zone")}
                </label>
                <p className="mt-1 text-[10px] leading-4 text-[#727a97]">
                  {t(
                    "日付、20時判定、通知の動作確認に使用します。",
                    "Used to test dates, the 8:00 PM gate, and notifications.",
                  )}
                </p>
              </div>
            </div>
            <select
              id="debug-time-zone"
              value={debugTimeZone ?? ""}
              onChange={(event) =>
                onDebugTimeZoneChange(event.target.value || null)
              }
              className="mt-3 h-11 w-full rounded-md border border-[#ddd7c9] bg-white px-3 text-xs font-semibold text-[#31384f] outline-none focus:border-[#8b73ff] focus:ring-2 focus:ring-[#dcd5ff]"
            >
              <option value="">
                {t("端末設定", "Device time")} ({deviceTimeZone}) — {currentTimeAt(deviceTimeZone)}
              </option>
              {DEBUG_TIME_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone} — {currentTimeAt(zone)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[10px] text-[#727a97]">
              {t("現在の適用値", "Currently applied")}: <span className="font-bold text-[#4d5a84]">{timeZone} — {currentTimeAt(timeZone)}</span>
            </p>
          </div>
        </section>

        <footer className="border-t border-[#e3e5ef] pt-5 text-center text-[10px] leading-5 text-[#8a91aa]">
          <p className="font-semibold text-[#68708f]">Echly v{APP_VERSION}{APP_RELEASE_ID === "local" ? "" : ` (${APP_RELEASE_ID})`}</p>
          <p>{t("最終更新", "Last updated")}: {formattedBuildTime()} ({timeZone})</p>
        </footer>
      </div>
    </div>
  );
}

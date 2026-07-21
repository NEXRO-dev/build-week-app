"use client";

import { Button, Switch } from "@heroui/react";
import { Bell, BellOff, CalendarDays, ChevronLeft, ChevronRight, CircleHelp, Database, EllipsisVertical, FileText, ImageIcon, LogOut, PlusSquare, Scale, Share2, ShieldCheck, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import { APP_BUILD_TIME, APP_VERSION } from "@/lib/app-version";
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
  planReminderEnabled: boolean;
  onPlanReminderChange: (value: boolean) => Promise<void>;
  requireCalendarApproval: boolean;
  onRequireCalendarApprovalChange: (value: boolean) => Promise<void>;
};

type PwaGuideEnvironment =
  | "ios-safari"
  | "ios-chrome"
  | "mac-safari"
  | "android-chrome"
  | "desktop-chrome"
  | "other";

function detectPwaGuideEnvironment(): PwaGuideEnvironment {
  const userAgent = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const isChrome = /Chrome|Chromium|CriOS/i.test(userAgent)
    && !/Edg|EdgiOS|OPR|SamsungBrowser/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent)
    && !/Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|SamsungBrowser/i.test(userAgent);

  if (isSafari && isIOS) return "ios-safari";
  if (isSafari) return "mac-safari";
  if (isChrome && isIOS) return "ios-chrome";
  if (isChrome && isAndroid) return "android-chrome";
  if (isChrome) return "desktop-chrome";
  return "other";
}

function Row({ icon: Icon, title, description, action }: { icon?: typeof CalendarDays; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f2f4fa] text-[#4d5a84]">{Icon ? <Icon size={17} /> : null}</span><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{title}</p>{description ? <p className="mt-1 break-words text-[10px] text-[#727a97]">{description}</p> : null}</div>{action ?? <ChevronRight size={16} className="shrink-0 text-[#8a91aa]" />}</div>;
}

function PwaGuideStep({
  number,
  imageSrc,
  imageAlt,
  accent = "purple",
  portrait = false,
  fallback,
  children,
}: {
  number: number;
  imageSrc: string;
  imageAlt: string;
  accent?: "purple" | "teal";
  portrait?: boolean;
  fallback: string;
  children: ReactNode;
}) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const numberClass = accent === "teal"
    ? "bg-[#e8f8f2] text-[#168f78]"
    : "bg-[#efedff] text-[#5b42ff]";

  return (
    <li className="overflow-hidden rounded-xl border border-[#e3e5ef] bg-white">
      <div className={`relative bg-[#f4f5f9] ${portrait ? "aspect-[3/4]" : "aspect-[16/10]"}`}>
        {imageUnavailable ? (
          <div className="absolute inset-0 grid place-items-center text-[#8a91aa]">
            <div className="text-center">
              <ImageIcon size={22} className="mx-auto" />
              <p className="mt-2 text-[10px] font-semibold">{fallback}</p>
            </div>
          </div>
        ) : (
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(max-width: 640px) 100vw, 400px"
            className="object-contain"
            onError={() => setImageUnavailable(true)}
          />
        )}
      </div>
      <div className="flex gap-3 p-3 text-[11px] leading-5 text-[#59617e]">
        <span className={`grid size-7 shrink-0 place-items-center rounded-full font-bold ${numberClass}`}>{number}</span>
        <span className="pt-1">{children}</span>
      </div>
    </li>
  );
}

export function SettingsView({
  user,
  timeZone,
  planReminderEnabled,
  onPlanReminderChange,
  requireCalendarApproval,
  onRequireCalendarApprovalChange,
}: Props) {
  const { locale, isEnglish, t } = useI18n();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [pushSubscription, setPushSubscription] =
    useState<PushSubscription | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<
    "loading" | "requires-pwa" | "unsupported" | "unconfigured" | "denied" | "off" | "on"
  >("loading");
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [calendarApprovalBusy, setCalendarApprovalBusy] = useState(false);
  const [calendarApprovalMessage, setCalendarApprovalMessage] = useState<string | null>(null);
  const [planReminderBusy, setPlanReminderBusy] = useState(false);
  const [planReminderMessage, setPlanReminderMessage] = useState<string | null>(null);
  const [pwaGuideOpen, setPwaGuideOpen] = useState(false);
  const [pwaGuideEnvironment, setPwaGuideEnvironment] = useState<PwaGuideEnvironment>("other");
  const [pwaGuideStep, setPwaGuideStep] = useState(0);
  const [pwaGuideDirection, setPwaGuideDirection] = useState<"next" | "previous">("next");
  const profileImageUrl =
    user.image && failedAvatarUrl !== user.image ? user.image : null;
  const pwaGuideStepCount = pwaGuideEnvironment === "ios-chrome" ? 2 : 3;

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationState() {
      const standalone = isRunningAsPwa();
      if (!standalone) {
        if (!cancelled) setNotificationState("requires-pwa");
        return;
      }

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

  function openPwaGuide() {
    setPwaGuideEnvironment(detectPwaGuideEnvironment());
    setPwaGuideStep(0);
    setPwaGuideDirection("next");
    setPwaGuideOpen(true);
  }

  function changePwaGuideStep(nextStep: number) {
    setPwaGuideDirection(nextStep > pwaGuideStep ? "next" : "previous");
    setPwaGuideStep(nextStep);
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

  async function handlePlanReminderChange(enabled: boolean) {
    setPlanReminderBusy(true);
    setPlanReminderMessage(null);
    try {
      await onPlanReminderChange(enabled);
    } catch {
      setPlanReminderMessage(t("設定を保存できませんでした。", "The setting could not be saved."));
    } finally {
      setPlanReminderBusy(false);
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

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold">{t("通知", "Notifications")}</h2>
            <button
              type="button"
              onClick={openPwaGuide}
              aria-label={t("PWAにする方法を見る", "How to install the PWA")}
              aria-haspopup="dialog"
              className="grid size-6 place-items-center rounded-full text-[#727a97] transition-colors hover:bg-[#f2f4fa] hover:text-[#4e3ad0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6a50ff]"
            >
              <CircleHelp size={15} />
            </button>
          </div>
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
                      : notificationState === "requires-pwa"
                        ? t("PWAとしてホーム画面に追加すると設定できます", "Add Echly to your Home Screen as a PWA to configure notifications")
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
                isDisabled={notificationBusy || notificationState === "loading" || notificationState === "requires-pwa" || notificationState === "unsupported" || notificationState === "unconfigured" || notificationState === "denied"}
                onChange={handleNotificationChange}
                size="lg"
                className="shrink-0"
              >
                <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
              </Switch>
            </div>
            {notificationMessage ? <p role="status" className="mt-2 text-[10px] leading-4 text-[#68708f]">{notificationMessage}</p> : null}
            <div className="mt-3 flex min-w-0 items-center gap-3 border-t border-[#ececf3] pt-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${planReminderEnabled ? "bg-[#e8f8f2] text-[#168f78]" : "bg-[#f2f4fa] text-[#68708f]"}`}>
                <CalendarDays size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">{t("予定の5分前通知", "5-minute plan reminders")}</p>
                <p className="mt-1 text-[10px] leading-4 text-[#727a97]">
                  {notificationState === "requires-pwa"
                    ? t("PWAの場合のみ設定できます", "Available only when Echly is installed as a PWA")
                    : notificationState === "on"
                    ? t("確定した予定の5分前に、予定名を通知します", "Shows the activity name 5 minutes before a confirmed plan")
                    : t("先に夜のチェックイン通知をオンにしてください", "Turn on evening check-in notifications first")}
                </p>
              </div>
              <Switch
                aria-label={t("予定の5分前通知", "5-minute plan reminders")}
                isSelected={planReminderEnabled}
                isDisabled={planReminderBusy || notificationState !== "on"}
                onChange={(enabled) => void handlePlanReminderChange(enabled)}
                size="lg"
                className="shrink-0"
              >
                <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
              </Switch>
            </div>
            {planReminderMessage ? <p role="status" className="mt-2 text-[10px] leading-4 text-[#b34848]">{planReminderMessage}</p> : null}
          </div>
        </section>

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

        <footer className="border-t border-[#e3e5ef] pt-5 text-center text-[10px] leading-5 text-[#8a91aa]">
          <p className="font-semibold text-[#68708f]">Echly v{APP_VERSION}</p>
          <p>{t("最終更新", "Last updated")}: {formattedBuildTime()} ({timeZone})</p>
        </footer>
      </div>

      {pwaGuideOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
          <button
            type="button"
            aria-label={t("閉じる", "Close")}
            className="absolute inset-0 bg-[#17182a]/45 backdrop-blur-[2px]"
            onClick={() => setPwaGuideOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-guide-title"
            className="relative z-10 max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="pwa-guide-title" className="text-base font-bold">{t("EchlyをPWAにする方法", "How to install Echly as a PWA")}</h2>
                <p className="mt-1 text-[11px] leading-5 text-[#727a97]">{t("ホーム画面からEchlyを開くと通知を設定できます。", "Open Echly from your Home Screen to configure notifications.")}</p>
              </div>
              <button
                type="button"
                onClick={() => setPwaGuideOpen(false)}
                aria-label={t("閉じる", "Close")}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f2f4fa] text-[#68708f]"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {pwaGuideEnvironment === "ios-safari" ? (
              <div className="overflow-hidden rounded-xl border border-[#e3e5ef] p-4">
                <p className="text-xs font-bold">iPhone / iPad（Safari）</p>
                <ol key={`ios-${pwaGuideStep}`} className={`mt-3 ${pwaGuideDirection === "next" ? "pwa-guide-slide-next" : "pwa-guide-slide-previous"}`}>
                  {pwaGuideStep === 0 ? <PwaGuideStep number={1} imageSrc="/pwa-guide/ios-safari-step-1.png" imageAlt={t("Safariのその他メニューを押す手順", "Safari More menu step")} fallback={t("画像を準備中", "Image coming soon")}>{t("Safari下部右側の「…」ボタンを押します。", "Tap the More button at the bottom-right of Safari.")} <EllipsisVertical size={14} className="ml-1 inline text-[#5b42ff]" /></PwaGuideStep> : null}
                  {pwaGuideStep === 1 ? <PwaGuideStep number={2} imageSrc="/pwa-guide/ios-safari-step-2.png" imageAlt={t("Safariの共有を選ぶ手順", "Safari Share menu step")} fallback={t("画像を準備中", "Image coming soon")}>{t("メニューから「共有」を選びます。", "Select “Share” from the menu.")} <Share2 size={14} className="ml-1 inline text-[#5b42ff]" /></PwaGuideStep> : null}
                  {pwaGuideStep === 2 ? <PwaGuideStep number={3} imageSrc="/pwa-guide/ios-safari-step-3.png" imageAlt={t("ホーム画面に追加を選ぶ手順", "Add to Home Screen step")} portrait fallback={t("画像を準備中", "Image coming soon")}>{t("共有メニューを下にスクロールし、「ホーム画面に追加」を選びます。", "Scroll down in the Share menu and select “Add to Home Screen.”")} <PlusSquare size={14} className="ml-1 inline text-[#5b42ff]" /></PwaGuideStep> : null}
                </ol>
              </div>
              ) : null}

              {pwaGuideEnvironment === "ios-chrome" ? (
              <div className="overflow-hidden rounded-xl border border-[#e3e5ef] p-4">
                <p className="text-xs font-bold">iPhone / iPad（Chrome）</p>
                <ol key={`ios-chrome-${pwaGuideStep}`} className={`mt-3 ${pwaGuideDirection === "next" ? "pwa-guide-slide-next" : "pwa-guide-slide-previous"}`}>
                  {pwaGuideStep === 0 ? <PwaGuideStep number={1} imageSrc="/pwa-guide/ios-chrome-step-1.png" imageAlt={t("Chromeの共有ボタンを押す手順", "Chrome Share button step")} accent="teal" fallback={t("画像を準備中", "Image coming soon")}>{t("Chrome右上の共有ボタンを押します。", "Tap the Share button in the top-right corner of Chrome.")} <Share2 size={14} className="ml-1 inline text-[#168f78]" /></PwaGuideStep> : null}
                  {pwaGuideStep === 1 ? <PwaGuideStep number={2} imageSrc="/pwa-guide/ios-chrome-step-2.png" imageAlt={t("Chromeでホーム画面に追加を選ぶ手順", "Chrome Add to Home Screen step")} accent="teal" fallback={t("画像を準備中", "Image coming soon")}>{t("メニューの表示を増やし、「ホーム画面に追加」を押します。", "Expand the menu, then tap “Add to Home Screen.”")} <PlusSquare size={14} className="ml-1 inline text-[#168f78]" /></PwaGuideStep> : null}
                </ol>
              </div>
              ) : null}

              {pwaGuideEnvironment === "mac-safari" ? (
              <div className="overflow-hidden rounded-xl border border-[#e3e5ef] p-4">
                <p className="text-xs font-bold">Mac（Safari）</p>
                <ol key={`mac-${pwaGuideStep}`} className={`mt-3 ${pwaGuideDirection === "next" ? "pwa-guide-slide-next" : "pwa-guide-slide-previous"}`}>
                  {pwaGuideStep === 0 ? <PwaGuideStep number={1} imageSrc="/pwa-guide/mac-safari-step-1.png" imageAlt={t("Safariのファイルメニューを開く手順", "Safari File menu step")} fallback={t("画像を準備中", "Image coming soon")}>{t("Safariのメニューバーで「ファイル」を開きます。", "Open “File” in the Safari menu bar.")}</PwaGuideStep> : null}
                  {pwaGuideStep === 1 ? <PwaGuideStep number={2} imageSrc="/pwa-guide/mac-safari-step-2.png" imageAlt={t("Dockに追加を選ぶ手順", "Add to Dock step")} fallback={t("画像を準備中", "Image coming soon")}>{t("「Dockに追加」を選びます。", "Select “Add to Dock.”")}</PwaGuideStep> : null}
                  {pwaGuideStep === 2 ? <PwaGuideStep number={3} imageSrc="/pwa-guide/mac-safari-step-3.png" imageAlt={t("MacにEchlyを追加する手順", "Add Echly on Mac confirmation step")} fallback={t("画像を準備中", "Image coming soon")}>{t("追加後、DockまたはアプリケーションからEchlyを開きます。", "After installation, open Echly from the Dock or Applications.")}</PwaGuideStep> : null}
                </ol>
              </div>
              ) : null}

              {pwaGuideEnvironment === "android-chrome" ? (
              <div className="overflow-hidden rounded-xl border border-[#e3e5ef] p-4">
                <p className="text-xs font-bold">Android（Chrome）</p>
                <ol key={`android-${pwaGuideStep}`} className={`mt-3 ${pwaGuideDirection === "next" ? "pwa-guide-slide-next" : "pwa-guide-slide-previous"}`}>
                  {pwaGuideStep === 0 ? <PwaGuideStep number={1} imageSrc="/pwa-guide/android-chrome-step-1.png" imageAlt={t("Chromeのメニューを開く手順", "Chrome menu step")} accent="teal" fallback={t("画像を準備中", "Image coming soon")}>{t("Chrome右上のメニューボタンを押します。", "Tap the menu button in the top-right corner of Chrome.")} <EllipsisVertical size={14} className="ml-1 inline text-[#168f78]" /></PwaGuideStep> : null}
                  {pwaGuideStep === 1 ? <PwaGuideStep number={2} imageSrc="/pwa-guide/android-chrome-step-2.png" imageAlt={t("ホーム画面に追加を選ぶ手順", "Add to Home screen step")} accent="teal" fallback={t("画像を準備中", "Image coming soon")}>{t("「ホーム画面に追加」または「アプリをインストール」を選びます。", "Select “Add to Home screen” or “Install app.”")}</PwaGuideStep> : null}
                  {pwaGuideStep === 2 ? <PwaGuideStep number={3} imageSrc="/pwa-guide/android-chrome-step-3.png" imageAlt={t("AndroidにEchlyを追加する手順", "Install Echly on Android confirmation step")} accent="teal" fallback={t("画像を準備中", "Image coming soon")}>{t("追加後、ホーム画面のEchlyを開きます。", "After installation, open Echly from your Home Screen.")}</PwaGuideStep> : null}
                </ol>
              </div>
              ) : null}

              {pwaGuideEnvironment === "desktop-chrome" ? (
              <div className="overflow-hidden rounded-xl border border-[#e3e5ef] p-4">
                <p className="text-xs font-bold">PC（Chrome）</p>
                <ol key={`desktop-${pwaGuideStep}`} className={`mt-3 ${pwaGuideDirection === "next" ? "pwa-guide-slide-next" : "pwa-guide-slide-previous"}`}>
                  {pwaGuideStep === 0 ? <PwaGuideStep number={1} imageSrc="/pwa-guide/desktop-chrome-step-1.png" imageAlt={t("Chromeのメニューを開く手順", "Chrome menu step")} accent="teal" fallback={t("画像を準備中", "Image coming soon")}>{t("Chrome右上のメニューボタンを押します。", "Open the menu in the top-right corner of Chrome.")} <EllipsisVertical size={14} className="ml-1 inline text-[#168f78]" /></PwaGuideStep> : null}
                  {pwaGuideStep === 1 ? <PwaGuideStep number={2} imageSrc="/pwa-guide/desktop-chrome-step-2.png" imageAlt={t("ページをアプリとしてインストールする手順", "Install page as app step")} accent="teal" fallback={t("画像を準備中", "Image coming soon")}>{t("「キャスト、保存、共有」から「ページをアプリとしてインストール」を選びます。", "Under “Cast, save, and share,” select “Install page as app.”")}</PwaGuideStep> : null}
                  {pwaGuideStep === 2 ? <PwaGuideStep number={3} imageSrc="/pwa-guide/desktop-chrome-step-3.png" imageAlt={t("PCにEchlyをインストールする手順", "Install Echly on desktop confirmation step")} accent="teal" fallback={t("画像を準備中", "Image coming soon")}>{t("「インストール」を押し、追加されたEchlyを開きます。", "Select “Install,” then open the installed Echly app.")}</PwaGuideStep> : null}
                </ol>
              </div>
              ) : null}

              {pwaGuideEnvironment === "other" ? (
                <div className="rounded-xl bg-[#fff7e8] p-4 text-[11px] leading-5 text-[#8a5c12]">
                  {t("このブラウザ向けの自動案内はありません。iPhone・iPadではSafari、Android・PCではChromeでEchlyを開いてください。", "Automatic instructions are unavailable for this browser. Open Echly in Safari on iPhone or iPad, or Chrome on Android or desktop.")}
                </div>
              ) : null}
            </div>

            {pwaGuideEnvironment !== "other" ? (
              <div className="mt-5">
                <div className="mb-4 flex items-center justify-center gap-2" aria-label={t(`ステップ${pwaGuideStep + 1}／${pwaGuideStepCount}`, `Step ${pwaGuideStep + 1} of ${pwaGuideStepCount}`)}>
                  {Array.from({ length: pwaGuideStepCount }, (_, step) => (
                    <span key={step} className={`h-1.5 rounded-full transition-all duration-200 ${step === pwaGuideStep ? "w-6 bg-[#5b42ff]" : "w-1.5 bg-[#d9dbea]"}`} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="font-bold"
                    isDisabled={pwaGuideStep === 0}
                    onPress={() => changePwaGuideStep(pwaGuideStep - 1)}
                  >
                    <ChevronLeft size={16} />{t("戻る", "Back")}
                  </Button>
                  {pwaGuideStep < pwaGuideStepCount - 1 ? (
                    <Button className="bg-[#5b42ff] font-bold text-white" onPress={() => changePwaGuideStep(pwaGuideStep + 1)}>
                      {t("次へ", "Next")}<ChevronRight size={16} />
                    </Button>
                  ) : (
                    <Button className="bg-[#5b42ff] font-bold text-white" onPress={() => setPwaGuideOpen(false)}>
                      {t("完了", "Done")}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <Button className="mt-5 w-full bg-[#5b42ff] font-bold text-white" onPress={() => setPwaGuideOpen(false)}>
                {t("閉じる", "Close")}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

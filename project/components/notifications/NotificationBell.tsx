"use client";

import { Bell, BellOff, Check, Clock3, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";
import {
  announcePushNotificationChange,
  PUSH_NOTIFICATION_CHANGE_EVENT,
  vapidKeyToBytes,
} from "@/lib/notifications/client";

type PushState = "loading" | "unsupported" | "unconfigured" | "off" | "on" | "denied";

export function NotificationBell({ timeZone }: { timeZone: string }) {
  const { locale, isEnglish, t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
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
        setPublicKey(config?.publicKey ?? null);
        setState(!config?.configured ? "unconfigured" : existing ? "on" : "off");
        if (config?.configured && existing) {
          // Refresh the stored zone whenever the app opens, so travelling users
          // continue to receive the reminder at 20:00 where they currently are.
          void fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: existing.toJSON(),
              timeZone,
              locale,
            }),
          });
        }
      } catch {
        if (!cancelled) setState("off");
      }
    }
    void loadState();
    const handleSubscriptionChange = () => void loadState();
    window.addEventListener(PUSH_NOTIFICATION_CHANGE_EVENT, handleSubscriptionChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PUSH_NOTIFICATION_CHANGE_EVENT, handleSubscriptionChange);
    };
  }, [locale, timeZone]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open || !drawerMounted) return;
    const timeoutId = window.setTimeout(() => setDrawerMounted(false), 180);
    return () => window.clearTimeout(timeoutId);
  }, [drawerMounted, open]);

  function openDrawer() {
    setDrawerMounted(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setOpen(true);
        closeButtonRef.current?.focus();
      });
    });
  }

  function closeDrawer() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function enableNotifications() {
    if (!publicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const nextSubscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyToBytes(publicKey),
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
      setState("on");
      setMessage(t("20:00の通知をオンにしました。", "8:00 PM notifications are on."));
      announcePushNotificationChange();
    } catch {
      setMessage(t("通知をオンにできませんでした。もう一度お試しください。", "Notifications could not be enabled. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = state === "on"
    ? t("通知オン", "On")
    : state === "loading"
      ? t("確認中", "Checking")
      : t("通知オフ", "Off");

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("通知設定", "Notification settings")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="notification-settings-drawer"
        onClick={openDrawer}
        className={`relative grid size-10 place-items-center rounded-full transition active:scale-95 ${open ? "bg-[#f0edff] text-[#5540d8]" : "text-[#555d7d] hover:bg-[#f5f6fa]"}`}
      >
        <Bell size={20} />
        {state === "on" ? <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-[#5b42ff]" aria-hidden="true" /> : null}
      </button>

      {drawerMounted ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("通知設定を閉じる", "Close notification settings")}
            onClick={closeDrawer}
            className={`absolute inset-0 bg-[#111735]/30 transition-opacity duration-[180ms] ease-out motion-reduce:transition-none ${open ? "opacity-100" : "opacity-0"}`}
          />
          <aside
            ref={drawerRef}
            id="notification-settings-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("通知設定", "Notification settings")}
            className={`absolute inset-y-0 right-0 flex h-dvh w-[min(88vw,380px)] flex-col border-l border-[#e1e3ed] bg-white shadow-[-18px_0_55px_rgba(31,38,75,0.16)] transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none ${open ? "translate-x-0 duration-[220ms]" : "translate-x-full duration-[180ms]"}`}
          >
            <div className="flex items-center justify-between border-b border-[#ececf3] px-5 pb-4 pt-[calc(16px+env(safe-area-inset-top))]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7a819b]">Echly</p>
                <h2 className="mt-1 text-base font-bold">{t("通知設定", "Notifications")}</h2>
              </div>
              <button ref={closeButtonRef} type="button" onClick={closeDrawer} aria-label={t("閉じる", "Close")} className="grid size-10 shrink-0 place-items-center rounded-full text-[#747b96] transition-transform duration-150 active:scale-95 hover:bg-[#f4f5f8]"><X size={19} /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5">
              <div className="flex items-start gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${state === "on" ? "bg-[#efedff] text-[#5b42ff]" : "bg-[#f2f3f7] text-[#68708f]"}`}>
                  {state === "on" ? <Bell size={19} /> : <BellOff size={19} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold">{t("夜のチェックイン通知", "Evening check-in reminder")}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${state === "on" ? "bg-[#e9f8f1] text-[#19795d]" : "bg-[#f0f1f5] text-[#68708f]"}`}>{statusLabel}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#68708f]">{t("毎日、現地時刻20:00にお知らせします。未入力の場合は23:30にもう一度お知らせします。", "We'll remind you at 8:00 PM local time and again at 11:30 PM if your check-in is incomplete.")}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#f7f8fc] px-3 py-3">
                <Clock3 size={17} className="shrink-0 text-[#5b42ff]" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">20:00</p>
                  <p className="mt-0.5 truncate text-[10px] text-[#717995]">{timeZone}</p>
                </div>
                {state === "on" ? <Check size={17} className="text-[#23966f]" /> : null}
              </div>

              {state === "unsupported" ? <p className="mt-3 rounded-lg bg-[#fff7e8] px-3 py-2 text-xs leading-5 text-[#8a5c12]">{t("このブラウザはPush通知に対応していません。iPhoneではホーム画面に追加したPWAからご利用ください。", "This browser does not support Push notifications. On iPhone, add Echly to your Home Screen first.")}</p> : null}
              {state === "denied" ? <p className="mt-3 rounded-lg bg-[#fff1f2] px-3 py-2 text-xs leading-5 text-[#a43a4a]">{t("通知がブロックされています。端末またはブラウザの設定からEchlyの通知を許可してください。", "Notifications are blocked. Allow Echly in your device or browser settings.")}</p> : null}
              {state === "unconfigured" ? <p className="mt-3 rounded-lg bg-[#fff7e8] px-3 py-2 text-xs leading-5 text-[#8a5c12]">{t("Push通知のサーバー設定が完了していません。", "The Push notification server has not been configured yet.")}</p> : null}
              {message ? <p role="status" className="mt-3 text-xs leading-5 text-[#59617e]">{message}</p> : null}

              {state !== "on" ? (
                <div className="mt-4">
                  <button type="button" disabled={busy || state === "loading" || state === "unsupported" || state === "denied" || state === "unconfigured"} onClick={enableNotifications} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5b42ff] px-4 text-xs font-bold text-white disabled:bg-[#c7c9d4]">
                    {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Bell size={16} />}{t("20:00の通知をオンにする", "Turn on 8:00 PM reminders")}
                  </button>
                </div>
              ) : null}
              {isEnglish ? null : <p className="mt-3 text-center text-[10px] text-[#8a91aa]">通知時刻は端末のタイムゾーンに合わせて自動更新されます</p>}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

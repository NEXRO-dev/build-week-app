"use client";

import { Bell, BellOff, Check, Clock3, LoaderCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";

type PushState = "loading" | "unsupported" | "unconfigured" | "off" | "on" | "denied";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export function NotificationBell({ timeZone }: { timeZone: string }) {
  const { locale, isEnglish, t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
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
        setSubscription(existing);
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
    return () => { cancelled = true; };
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
          applicationServerKey: urlBase64ToUint8Array(publicKey),
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
      setSubscription(nextSubscription);
      setState("on");
      setMessage(t("20:00の通知をオンにしました。", "8:00 PM notifications are on."));
    } catch {
      setMessage(t("通知をオンにできませんでした。もう一度お試しください。", "Notifications could not be enabled. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    if (!subscription) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!response.ok) throw new Error("unsubscribe_failed");
      await subscription.unsubscribe();
      setSubscription(null);
      setState("off");
      setMessage(t("通知をオフにしました。", "Notifications are off."));
    } catch {
      setMessage(t("通知設定を変更できませんでした。", "Notification settings could not be changed."));
    } finally {
      setBusy(false);
    }
  }

  async function sendTestNotification() {
    if (!subscription) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", endpoint: subscription.endpoint }),
      });
      if (!response.ok) throw new Error("test_failed");
      setMessage(t("テスト通知を送信しました。", "Test notification sent."));
    } catch {
      setMessage(t("テスト通知を送信できませんでした。", "The test notification could not be sent."));
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
                  <p className="mt-1 text-xs leading-5 text-[#68708f]">{t("毎日、あなたの現地時刻20:00に振り返りをお知らせします。", "We'll remind you to reflect every day at 8:00 PM local time.")}</p>
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

              <div className="mt-4 flex gap-2">
                {state === "on" ? (
                  <>
                    <button type="button" disabled={busy} onClick={sendTestNotification} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-[#dfe1ea] px-3 text-xs font-bold text-[#4f5878] disabled:opacity-50">
                      {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}{t("テスト送信", "Send test")}
                    </button>
                    <button type="button" disabled={busy} onClick={disableNotifications} className="min-h-10 rounded-lg px-3 text-xs font-bold text-[#a43a4a] disabled:opacity-50">{t("オフにする", "Turn off")}</button>
                  </>
                ) : (
                  <button type="button" disabled={busy || state === "loading" || state === "unsupported" || state === "denied" || state === "unconfigured"} onClick={enableNotifications} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5b42ff] px-4 text-xs font-bold text-white disabled:bg-[#c7c9d4]">
                    {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Bell size={16} />}{t("20:00の通知をオンにする", "Turn on 8:00 PM reminders")}
                  </button>
                )}
              </div>
              {isEnglish ? null : <p className="mt-3 text-center text-[10px] text-[#8a91aa]">通知時刻は端末のタイムゾーンに合わせて自動更新されます</p>}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

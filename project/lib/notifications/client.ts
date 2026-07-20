export const PUSH_NOTIFICATION_CHANGE_EVENT =
  "echly:push-notification-change";

export function isRunningAsPwa() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosNavigator.standalone === true
  );
}

export function vapidKeyToBytes(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export function announcePushNotificationChange() {
  window.dispatchEvent(new Event(PUSH_NOTIFICATION_CHANGE_EVENT));
}

import webPush, { type PushSubscription } from "web-push";

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

export function isWebPushConfigured() {
  return Boolean(getVapidPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());
}

export async function sendWebPush(
  subscriptionJson: string,
  payload: { title: string; body: string; url: string },
) {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) throw new Error("Web Push is not configured.");

  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:notifications@echly.app",
    publicKey,
    privateKey,
  );
  await webPush.sendNotification(
    JSON.parse(subscriptionJson) as PushSubscription,
    JSON.stringify({
      ...payload,
      icon: "/icon-192.png?v=0.3.1",
      badge: "/icon-192.png?v=0.3.1",
      tag: "echly-daily-reflection",
    }),
    { TTL: 60 * 60 * 6, urgency: "normal" },
  );
}

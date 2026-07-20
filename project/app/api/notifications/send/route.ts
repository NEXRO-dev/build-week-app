import {
  claimPushSubscription,
  getDuePushSubscriptions,
  markPushSubscriptionSent,
  removeExpiredPushSubscription,
} from "@/lib/notifications/store";
import { getLocalDateKey } from "@/lib/notifications/time";
import { isWebPushConfigured, sendWebPush } from "@/lib/notifications/webPush";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!isWebPushConfigured()) {
    return Response.json({ code: "PUSH_NOT_CONFIGURED" }, { status: 503 });
  }

  const now = new Date();
  const due = await getDuePushSubscriptions(now);
  let sent = 0;
  let expired = 0;
  let failed = 0;

  for (const subscription of due) {
    if (!(await claimPushSubscription(subscription, now))) continue;
    try {
      await sendWebPush(subscription.subscription, {
        title: subscription.locale === "us-en" ? "Time to reflect on today" : "今日を振り返る時間です",
        body: subscription.locale === "us-en" ? "Check in with Echly and make tomorrow a little lighter." : "Echlyでチェックインして、明日を少し軽く整えましょう。",
        url: `/${subscription.locale}`,
      });
      await markPushSubscriptionSent(
        subscription,
        now,
        getLocalDateKey(now, subscription.timeZone),
      );
      sent += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await removeExpiredPushSubscription(subscription.endpoint);
        expired += 1;
      } else {
        console.error("Failed to send scheduled push notification", error);
        failed += 1;
      }
    }
  }

  return Response.json({ checked: due.length, sent, expired, failed });
}

import {
  claimPushSubscription,
  getDuePushSubscriptions,
  markPushSubscriptionProcessed,
  removeExpiredPushSubscription,
} from "@/lib/notifications/store";
import { nextDateKey } from "@/lib/date/localTime";
import { getReminderPayload } from "@/lib/notifications/reminder";
import { getLocalDateKey } from "@/lib/notifications/time";
import { isWebPushConfigured, sendWebPush } from "@/lib/notifications/webPush";
import { getDailyInputStatus } from "@/lib/workspace/repository";

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
  let skipped = 0;
  const inputStatusByUserAndDate = new Map<
    string,
    Promise<{ reflectionEntered: boolean; tomorrowEntered: boolean }>
  >();

  for (const subscription of due) {
    if (!(await claimPushSubscription(subscription, now))) continue;
    try {
      const localDate = getLocalDateKey(
        new Date(subscription.nextNotificationAt),
        subscription.timeZone,
      );
      const tomorrowDate = nextDateKey(localDate);
      let payload;

      if (subscription.nextNotificationKind === "follow_up") {
        const statusKey = `${subscription.userId}:${localDate}`;
        let statusPromise = inputStatusByUserAndDate.get(statusKey);
        if (!statusPromise) {
          statusPromise = getDailyInputStatus(
            subscription.userId,
            localDate,
            tomorrowDate,
          );
          inputStatusByUserAndDate.set(statusKey, statusPromise);
        }
        const status = await statusPromise;
        payload = getReminderPayload("follow_up", subscription.locale, status);
        if (!payload) {
          await markPushSubscriptionProcessed(
            subscription,
            now,
            localDate,
            false,
          );
          skipped += 1;
          continue;
        }
      } else {
        payload = getReminderPayload("evening", subscription.locale);
      }

      if (!payload) continue;
      await sendWebPush(subscription.subscription, {
        ...payload,
        url: `/${subscription.locale}`,
      });
      await markPushSubscriptionProcessed(
        subscription,
        now,
        localDate,
        true,
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

  return Response.json({ checked: due.length, sent, skipped, expired, failed });
}

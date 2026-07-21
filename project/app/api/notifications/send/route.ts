import {
  claimPlanNotification,
  claimPushSubscription,
  getDuePushSubscriptions,
  getEnabledPushSubscriptions,
  markPlanNotificationSent,
  markPushSubscriptionProcessed,
  releasePlanNotificationClaim,
  removeExpiredPushSubscription,
} from "@/lib/notifications/store";
import { nextDateKey } from "@/lib/date/localTime";
import {
  getDuePlanReminders,
  getPlanReminderPayload,
} from "@/lib/notifications/planReminder";
import { getReminderPayload } from "@/lib/notifications/reminder";
import { getLocalDateKey } from "@/lib/notifications/time";
import { isWebPushConfigured, sendWebPush } from "@/lib/notifications/webPush";
import {
  getDailyInputStatus,
  getPlanRecordForDate,
  isPlanReminderEnabled,
} from "@/lib/workspace/repository";

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
  let planSent = 0;
  let planFailed = 0;
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

  const planSubscriptions = await getEnabledPushSubscriptions();
  const planByUserAndDate = new Map<
    string,
    ReturnType<typeof getPlanRecordForDate>
  >();
  const planReminderPreferenceByUser = new Map<
    string,
    ReturnType<typeof isPlanReminderEnabled>
  >();

  for (const subscription of planSubscriptions) {
    const localDate = getLocalDateKey(now, subscription.timeZone);
    try {
      let preferencePromise = planReminderPreferenceByUser.get(subscription.userId);
      if (!preferencePromise) {
        preferencePromise = isPlanReminderEnabled(subscription.userId);
        planReminderPreferenceByUser.set(subscription.userId, preferencePromise);
      }
      if (!(await preferencePromise)) continue;

      const planKey = `${subscription.userId}:${localDate}`;
      let planPromise = planByUserAndDate.get(planKey);
      if (!planPromise) {
        planPromise = getPlanRecordForDate(subscription.userId, localDate);
        planByUserAndDate.set(planKey, planPromise);
      }
      const planRecord = await planPromise;
      const reminders = getDuePlanReminders(
        planRecord,
        now,
        subscription.timeZone,
      );
      for (const reminder of reminders) {
        const claimed = await claimPlanNotification(
          subscription.endpoint,
          localDate,
          reminder.itemId,
          now,
        );
        if (!claimed) continue;

        try {
          await sendWebPush(
            subscription.subscription,
            {
              ...getPlanReminderPayload(reminder.title, subscription.locale),
              url: `/${subscription.locale}/plan`,
              tag: `echly-plan-${localDate}-${reminder.itemId}`,
            },
            { ttl: 5 * 60, urgency: "high" },
          );
          await markPlanNotificationSent(
            subscription.endpoint,
            localDate,
            reminder.itemId,
            now,
          );
          planSent += 1;
        } catch (error) {
          const statusCode = typeof error === "object" && error && "statusCode" in error
            ? Number(error.statusCode)
            : 0;
          if (statusCode === 404 || statusCode === 410) {
            await removeExpiredPushSubscription(subscription.endpoint);
            expired += 1;
          } else {
            await releasePlanNotificationClaim(
              subscription.endpoint,
              localDate,
              reminder.itemId,
            );
            console.error("Failed to send plan reminder push notification", error);
            planFailed += 1;
          }
        }
      }
    } catch (error) {
      console.error("Failed to prepare plan reminder push notification", error);
      planFailed += 1;
    }
  }

  return Response.json({
    checked: due.length,
    sent,
    skipped,
    expired,
    failed,
    planChecked: planSubscriptions.length,
    planSent,
    planFailed,
  });
}

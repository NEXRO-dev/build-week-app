import { createClient, type Client } from "@libsql/client";

import {
  getNextNotificationScheduleAfterProcessing,
  getNextNotificationAt,
  type NotificationKind,
} from "@/lib/notifications/time";

export type StoredPushSubscription = {
  endpoint: string;
  userId: string;
  subscription: string;
  timeZone: string;
  locale: "jp-ja" | "us-en";
  nextNotificationAt: string;
  nextNotificationKind: NotificationKind;
};

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function getClient() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error("Turso is not configured.");
  client = createClient({ url, authToken });
  return client;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getClient();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          endpoint TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          subscription_json TEXT NOT NULL,
          time_zone TEXT NOT NULL,
          locale TEXT NOT NULL DEFAULT 'jp-ja',
          enabled INTEGER NOT NULL DEFAULT 1,
          next_notification_at TEXT NOT NULL,
          next_notification_kind TEXT NOT NULL DEFAULT 'evening',
          last_notified_local_date TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      const columns = await db.execute("PRAGMA table_info(push_subscriptions)");
      if (!columns.rows.some((row) => String(row.name) === "next_notification_kind")) {
        try {
          await db.execute(`
            ALTER TABLE push_subscriptions
            ADD COLUMN next_notification_kind TEXT NOT NULL DEFAULT 'evening'
          `);
        } catch (error) {
          // Another serverless instance may complete the same migration after
          // our PRAGMA check but before this ALTER TABLE reaches Turso.
          if (!String(error).toLowerCase().includes("duplicate column")) {
            throw error;
          }
        }
      }
      await db.execute(`
        CREATE INDEX IF NOT EXISTS push_subscriptions_due_idx
        ON push_subscriptions (enabled, next_notification_at)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
        ON push_subscriptions (user_id)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS push_plan_notifications (
          endpoint TEXT NOT NULL,
          target_date TEXT NOT NULL,
          item_id TEXT NOT NULL,
          claimed_at TEXT NOT NULL,
          sent_at TEXT,
          PRIMARY KEY (endpoint, target_date, item_id)
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS push_plan_notifications_date_idx
        ON push_plan_notifications (target_date)
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function savePushSubscription(input: {
  endpoint: string;
  userId: string;
  subscription: unknown;
  timeZone: string;
  locale: "jp-ja" | "us-en";
}) {
  await ensureSchema();
  const now = new Date();
  const nextNotificationAt = getNextNotificationAt(now, input.timeZone);
  await getClient().execute({
    sql: `
      INSERT INTO push_subscriptions (
        endpoint, user_id, subscription_json, time_zone, locale, enabled,
        next_notification_at, next_notification_kind, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, 'evening', ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        subscription_json = excluded.subscription_json,
        locale = excluded.locale,
        enabled = 1,
        next_notification_at = CASE
          WHEN push_subscriptions.time_zone <> excluded.time_zone
            THEN excluded.next_notification_at
          ELSE push_subscriptions.next_notification_at
        END,
        next_notification_kind = CASE
          WHEN push_subscriptions.time_zone <> excluded.time_zone
            THEN excluded.next_notification_kind
          ELSE push_subscriptions.next_notification_kind
        END,
        time_zone = excluded.time_zone,
        updated_at = excluded.updated_at
    `,
    args: [
      input.endpoint,
      input.userId,
      JSON.stringify(input.subscription),
      input.timeZone,
      input.locale,
      nextNotificationAt.toISOString(),
      now.toISOString(),
      now.toISOString(),
    ],
  });
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await ensureSchema();
  await getClient().execute({
    sql: "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
    args: [userId, endpoint],
  });
}

function rowToSubscription(row: Record<string, unknown>): StoredPushSubscription {
  return {
    endpoint: String(row.endpoint),
    userId: String(row.user_id),
    subscription: String(row.subscription_json),
    timeZone: String(row.time_zone),
    locale: row.locale === "us-en" ? "us-en" : "jp-ja",
    nextNotificationAt: String(row.next_notification_at),
    nextNotificationKind: row.next_notification_kind === "follow_up"
      ? "follow_up"
      : "evening",
  };
}

export async function getDuePushSubscriptions(now: Date, limit = 100) {
  await ensureSchema();
  const result = await getClient().execute({
    sql: `
      SELECT endpoint, user_id, subscription_json, time_zone, locale,
             next_notification_at, next_notification_kind
      FROM push_subscriptions
      WHERE enabled = 1 AND next_notification_at <= ?
      ORDER BY next_notification_at ASC
      LIMIT ?
    `,
    args: [now.toISOString(), limit],
  });
  return result.rows.map((row) => rowToSubscription(row));
}

export async function getEnabledPushSubscriptions(limit = 500) {
  await ensureSchema();
  const result = await getClient().execute({
    sql: `
      SELECT endpoint, user_id, subscription_json, time_zone, locale,
             next_notification_at, next_notification_kind
      FROM push_subscriptions
      WHERE enabled = 1
      ORDER BY updated_at DESC
      LIMIT ?
    `,
    args: [limit],
  });
  return result.rows.map((row) => rowToSubscription(row));
}

export async function claimPlanNotification(
  endpoint: string,
  targetDate: string,
  itemId: string,
  now: Date,
) {
  await ensureSchema();
  const retryBefore = new Date(now.getTime() - 2 * 60_000).toISOString();
  const result = await getClient().execute({
    sql: `
      INSERT INTO push_plan_notifications (
        endpoint, target_date, item_id, claimed_at, sent_at
      ) VALUES (?, ?, ?, ?, NULL)
      ON CONFLICT(endpoint, target_date, item_id) DO UPDATE SET
        claimed_at = excluded.claimed_at
      WHERE push_plan_notifications.sent_at IS NULL
        AND push_plan_notifications.claimed_at <= ?
    `,
    args: [endpoint, targetDate, itemId, now.toISOString(), retryBefore],
  });
  return result.rowsAffected === 1;
}

export async function markPlanNotificationSent(
  endpoint: string,
  targetDate: string,
  itemId: string,
  sentAt: Date,
) {
  await ensureSchema();
  await getClient().execute({
    sql: `
      UPDATE push_plan_notifications
      SET sent_at = ?
      WHERE endpoint = ? AND target_date = ? AND item_id = ?
    `,
    args: [sentAt.toISOString(), endpoint, targetDate, itemId],
  });
}

export async function releasePlanNotificationClaim(
  endpoint: string,
  targetDate: string,
  itemId: string,
) {
  await ensureSchema();
  await getClient().execute({
    sql: `
      DELETE FROM push_plan_notifications
      WHERE endpoint = ? AND target_date = ? AND item_id = ? AND sent_at IS NULL
    `,
    args: [endpoint, targetDate, itemId],
  });
}

export async function claimPushSubscription(subscription: StoredPushSubscription, now: Date) {
  const retryAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const result = await getClient().execute({
    sql: `
      UPDATE push_subscriptions
      SET next_notification_at = ?, updated_at = ?
      WHERE endpoint = ? AND next_notification_at = ? AND enabled = 1
    `,
    args: [retryAt, now.toISOString(), subscription.endpoint, subscription.nextNotificationAt],
  });
  return result.rowsAffected === 1;
}

export async function markPushSubscriptionProcessed(
  subscription: StoredPushSubscription,
  processedAt: Date,
  localDate: string,
  sent: boolean,
) {
  const nextSchedule = getNextNotificationScheduleAfterProcessing(
    processedAt,
    subscription.timeZone,
    subscription.nextNotificationKind,
    new Date(subscription.nextNotificationAt),
  );

  await getClient().execute({
    sql: `
      UPDATE push_subscriptions
      SET next_notification_at = ?, next_notification_kind = ?,
          last_notified_local_date = COALESCE(?, last_notified_local_date),
          updated_at = ?
      WHERE endpoint = ?
    `,
    args: [
      nextSchedule.at.toISOString(),
      nextSchedule.kind,
      sent ? localDate : null,
      processedAt.toISOString(),
      subscription.endpoint,
    ],
  });
}

export async function removeExpiredPushSubscription(endpoint: string) {
  await getClient().execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ?",
    args: [endpoint],
  });
}

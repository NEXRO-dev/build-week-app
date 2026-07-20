import { auth } from "@/lib/auth";
import {
  deletePushSubscription,
  savePushSubscription,
} from "@/lib/notifications/store";
import { isValidTimeZone } from "@/lib/notifications/time";
import {
  getVapidPublicKey,
  isWebPushConfigured,
} from "@/lib/notifications/webPush";

export const runtime = "nodejs";

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  expirationTime?: unknown;
};

async function getUser(request: Request) {
  return (await auth.api.getSession({ headers: request.headers }))?.user ?? null;
}

function parseEndpoint(value: unknown) {
  return typeof value === "string" && value.startsWith("https://") ? value : null;
}

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  return Response.json({
    configured: isWebPushConfigured(),
    publicKey: getVapidPublicKey(),
  });
}

export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    if (!isWebPushConfigured()) {
      return Response.json({ code: "PUSH_NOT_CONFIGURED" }, { status: 503 });
    }

    const body = await request.json() as {
      subscription?: SubscriptionInput;
      timeZone?: unknown;
      locale?: unknown;
    };

    const subscription = body.subscription;
    const endpoint = parseEndpoint(subscription?.endpoint);
    const p256dh = subscription?.keys?.p256dh;
    const authKey = subscription?.keys?.auth;
    const timeZone = typeof body.timeZone === "string" ? body.timeZone : "";
    const locale = body.locale === "us-en" ? "us-en" : "jp-ja";
    if (!endpoint || typeof p256dh !== "string" || typeof authKey !== "string" || !isValidTimeZone(timeZone)) {
      return Response.json({ code: "INVALID_SUBSCRIPTION" }, { status: 400 });
    }

    await savePushSubscription({
      endpoint,
      userId: user.id,
      subscription,
      timeZone,
      locale,
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update push notification settings", error);
    return Response.json({ code: "PUSH_UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { endpoint?: unknown };
    const endpoint = parseEndpoint(body.endpoint);
    if (!endpoint) return Response.json({ code: "INVALID_ENDPOINT" }, { status: 400 });
    await deletePushSubscription(user.id, endpoint);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to disable push notifications", error);
    return Response.json({ code: "PUSH_UPDATE_FAILED" }, { status: 500 });
  }
}

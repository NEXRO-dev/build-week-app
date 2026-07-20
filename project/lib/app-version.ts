export const APP_VERSION =
  process.env.NEXT_PUBLIC_ECHLY_APP_VERSION?.trim() || "0.1.0";

export const APP_RELEASE_ID =
  process.env.NEXT_PUBLIC_ECHLY_RELEASE_ID?.trim() || "local";

export const APP_BUILD_TIME =
  process.env.NEXT_PUBLIC_ECHLY_BUILD_TIME?.trim() || null;

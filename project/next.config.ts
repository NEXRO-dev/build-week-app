import type { NextConfig } from "next";

const buildTimestamp = new Date().toISOString();
const appVersion = process.env.npm_package_version?.trim() || "0.1.0";
const releaseId =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 7) ||
  process.env.VERCEL_DEPLOYMENT_ID?.trim().slice(-7) ||
  "local";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ECHLY_APP_VERSION: appVersion,
    NEXT_PUBLIC_ECHLY_BUILD_TIME: buildTimestamp,
    NEXT_PUBLIC_ECHLY_RELEASE_ID: releaseId,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

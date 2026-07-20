"use client";

import { useEffect } from "react";

import { isRunningAsPwa } from "@/lib/notifications/client";

const PWA_DEPLOYMENT_STORAGE_KEY = "echly.pwa-deployment.v1";

type DeploymentVersionResponse = {
  version?: string | null;
};

export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let checking = false;

    async function checkForDeploymentUpdate(registration: ServiceWorkerRegistration) {
      if (cancelled || checking || !isRunningAsPwa()) return;
      checking = true;

      try {
        const response = await fetch("/api/pwa/version", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok || cancelled) return;

        const data = await response.json() as DeploymentVersionResponse;
        const currentVersion = data.version?.trim();
        if (!currentVersion) return;

        let previousVersion: string | null;
        try {
          previousVersion = window.localStorage.getItem(PWA_DEPLOYMENT_STORAGE_KEY);
          if (!previousVersion) {
            window.localStorage.setItem(PWA_DEPLOYMENT_STORAGE_KEY, currentVersion);
            return;
          }
          if (previousVersion === currentVersion) return;

          // Save first so the refreshed app cannot enter an update loop.
          window.localStorage.setItem(PWA_DEPLOYMENT_STORAGE_KEY, currentVersion);
        } catch {
          // A persistent version marker is required to reload safely.
          return;
        }

        await registration.update().catch(() => undefined);
        if (!cancelled) window.location.reload();
      } catch {
        // Stay on the current deployment when the version check is unavailable.
      } finally {
        checking = false;
      }
    }

    let registration: ServiceWorkerRegistration | null = null;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registered) => {
        registration = registered;
        return checkForDeploymentUpdate(registered);
      })
      .catch(() => {
        // Offline support is optional; the web app remains usable if registration fails.
      });

    function checkWhenVisible() {
      if (document.visibilityState === "visible" && registration) {
        void checkForDeploymentUpdate(registration);
      }
    }

    document.addEventListener("visibilitychange", checkWhenVisible);
    window.addEventListener("pageshow", checkWhenVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", checkWhenVisible);
      window.removeEventListener("pageshow", checkWhenVisible);
    };
  }, []);

  return null;
}

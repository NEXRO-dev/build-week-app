import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EchlyApp } from "@/components/EchlyApp";
import { I18nProvider } from "@/lib/i18n";
import { isAppLocale } from "@/lib/i18n-config";
import type { WorkspaceView } from "@/types/echly";

export async function renderLocaleWorkspace(
  locale: string,
  initialView: WorkspaceView,
  initialHistoryId: string | null = null,
) {
  if (!isAppLocale(locale)) notFound();

  await connection();
  const todayLabel = new Intl.DateTimeFormat(
    locale === "us-en" ? "en-US" : "ja-JP",
    {
      month: "long",
      day: "numeric",
      weekday: "long",
    },
  ).format(new Date());

  return (
    <I18nProvider locale={locale}>
      <EchlyApp
        todayLabel={todayLabel}
        initialView={initialView}
        initialHistoryId={initialHistoryId}
      />
    </I18nProvider>
  );
}

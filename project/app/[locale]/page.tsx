import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EchlyApp } from "@/components/EchlyApp";
import { I18nProvider } from "@/lib/i18n";
import { isAppLocale } from "@/lib/i18n-config";

export function generateStaticParams() {
  return [{ locale: "jp-ja" }, { locale: "us-en" }];
}

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};

  return locale === "us-en"
    ? { title: "Echly | A calmer plan for tomorrow", description: "A work assistant that turns your voice and schedule into a manageable plan for tomorrow." }
    : { title: "Echly | 明日を整える音声チェックイン", description: "声と予定から、無理のない翌日プランを提案するワークアシスタント。" };
}

export default async function LocaleHome({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  await connection();
  const todayLabel = new Intl.DateTimeFormat(locale === "us-en" ? "en-US" : "ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  return (
    <I18nProvider locale={locale}>
      <EchlyApp todayLabel={todayLabel} />
    </I18nProvider>
  );
}

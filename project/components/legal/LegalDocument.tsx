import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { AppLocale } from "@/lib/i18n-config";

export type LegalSection = {
  title: string;
  paragraphs: string[];
  items?: string[];
};

type Props = {
  locale: AppLocale;
  title: string;
  description: string;
  sections: LegalSection[];
};

export function LegalDocument({ locale, title, description, sections }: Props) {
  const isEnglish = locale === "us-en";

  return (
    <main lang={isEnglish ? "en-US" : "ja-JP"} className="min-h-dvh bg-[#f7f8fc] px-4 py-6 text-[#111735] sm:py-10">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-[#e3e5ef] bg-white shadow-[0_16px_50px_rgba(42,49,83,0.08)]">
        <header className="border-b border-[#ececf3] px-5 py-6 sm:px-10 sm:py-9">
          <Link
            href={`/${locale}/setting`}
            className="mb-6 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-[#5b42ff] outline-none hover:text-[#402ac9] focus-visible:ring-2 focus-visible:ring-[#6a50ff] focus-visible:ring-offset-4"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            {isEnglish ? "Back to Settings" : "設定に戻る"}
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6a50ff]">Echly</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-3 text-sm leading-7 text-[#66708f]">{description}</p>
          <p className="mt-3 text-xs text-[#8990a8]">
            {isEnglish ? "Effective: July 20, 2026" : "制定日：2026年7月20日"}
          </p>
        </header>

        <div className="space-y-9 px-5 py-7 sm:px-10 sm:py-10">
          {sections.map((section, index) => (
            <section key={section.title} aria-labelledby={`legal-section-${index}`}>
              <h2 id={`legal-section-${index}`} className="text-base font-bold sm:text-lg">
                {index + 1}. {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-[#4f5877]">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.items ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}

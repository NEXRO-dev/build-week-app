export const appLocales = ["jp-ja", "us-en"] as const;
export type AppLocale = (typeof appLocales)[number];

export const LOCALE_COOKIE_NAME = "echly-locale";

export function isAppLocale(value: string): value is AppLocale {
  return appLocales.includes(value as AppLocale);
}

export function localeFromAcceptLanguage(value: string | null): AppLocale {
  if (!value) return "jp-ja";

  const languages = value
    .split(",")
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;

      return {
        tag: tag.toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter(({ quality }) => quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const { tag } of languages) {
    if (tag === "ja" || tag.startsWith("ja-")) return "jp-ja";
    if (tag === "en" || tag.startsWith("en-")) return "us-en";
  }

  return "jp-ja";
}

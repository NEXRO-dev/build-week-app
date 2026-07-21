import assert from "node:assert/strict";
import test from "node:test";

import { getZonedNow } from "../lib/date/localTime.ts";
import {
  createDemoAnalysis,
  SAMPLE_TRANSCRIPT_EN,
} from "../lib/demo/sampleCheckIns.ts";
import { localeFromAcceptLanguage } from "../lib/i18n-config.ts";

test("uses Japanese when it is the browser's preferred supported language", () => {
  assert.equal(
    localeFromAcceptLanguage("ja-JP,ja;q=0.9,en-US;q=0.8"),
    "jp-ja",
  );
});

test("uses English when it has a higher preference than Japanese", () => {
  assert.equal(
    localeFromAcceptLanguage("ja-JP;q=0.7,en-US;q=0.9,en;q=0.8"),
    "us-en",
  );
});

test("falls back to Japanese when no supported language is present", () => {
  assert.equal(localeFromAcceptLanguage("fr-FR,fr;q=0.9"), "jp-ja");
  assert.equal(localeFromAcceptLanguage(null), "jp-ja");
});

test("formats the local date in English for the English locale", () => {
  const now = getZonedNow(
    new Date("2026-07-21T03:00:00.000Z"),
    "Asia/Tokyo",
    "us-en",
  );
  assert.equal(now.label, "Tuesday, July 21");
});

test("keeps the English demo fallback free of Japanese UI text", () => {
  const result = createDemoAnalysis(SAMPLE_TRANSCRIPT_EN, true);
  assert.doesNotMatch(JSON.stringify(result), /[ぁ-んァ-ヶ一-龠々]/u);
});

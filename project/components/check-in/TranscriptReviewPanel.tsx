"use client";

import { Button } from "@heroui/react";
import {
  ArrowLeft,
  Check,
  Headphones,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import { useI18n } from "@/lib/i18n";
import type { TranscriptReview } from "@/types/echly";

type Props = {
  review: TranscriptReview;
  audioBlobs: Array<{ label: string; blob: Blob }>;
  processingStage: string | null;
  error: string | null;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onRetry: () => void;
  onClose: () => void;
};

function qualityMessage(review: TranscriptReview, isEnglish: boolean) {
  if (review.agreement !== null && review.agreement < 0.7) {
    return isEnglish
      ? "The two transcription results differ. Check names, times, and numbers carefully."
      : "2つの音声認識結果に差があります。固有名詞・時刻・数字を特に確認してください。";
  }
  if (review.confidence !== null && review.confidence < 0.8) {
    return isEnglish
      ? "Some parts were difficult to recognize. Play the recording and check the transcript."
      : "聞き取りにくい箇所がありました。音声を再生して確認してください。";
  }
  return isEnglish
    ? "Review the transcript and edit anything that was recognized incorrectly."
    : "認識結果を確認し、違う箇所があればそのまま書き換えてください。";
}

export function TranscriptReviewPanel({
  review,
  audioBlobs,
  processingStage,
  error,
  onChange,
  onConfirm,
  onRetry,
  onClose,
}: Props) {
  const { isEnglish, t } = useI18n();
  const audioItems = useMemo(
    () => audioBlobs.map((item) => ({
      ...item,
      url: URL.createObjectURL(item.blob),
    })),
    [audioBlobs],
  );

  useEffect(
    () => () => {
      audioItems.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [audioItems],
  );

  const confidenceLabel =
    review.confidence === null
      ? null
      : t(
          `認識確信度 ${Math.round(review.confidence * 100)}%`,
          `Recognition confidence ${Math.round(review.confidence * 100)}%`,
        );

  const alternatives = review.alternatives.filter(
    (alternative, index, items) =>
      items.findIndex(
        (item) => item.transcript.trim() === alternative.transcript.trim(),
      ) === index,
  );
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#f5f6fa]">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] shadow-[0_0_36px_rgba(28,35,70,0.08)]">
        <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center">
          <button
            type="button"
            aria-label={t("文字起こしの確認を閉じる", "Close transcript review")}
            onClick={onClose}
            disabled={Boolean(processingStage)}
            className="grid size-11 place-items-center text-[#303857] disabled:opacity-40"
          >
            <ArrowLeft size={21} />
          </button>
          <p className="text-center text-sm font-bold text-[#303857]">
            {t("文字起こしを確認", "Review transcript")}
          </p>
        </header>

        <main className="flex flex-1 flex-col pb-4 pt-5">
          <span className="grid size-12 place-items-center rounded-full bg-[#efedff] text-[#5b42ff]">
            <Headphones size={23} />
          </span>
          <h1 className="mt-4 text-xl font-bold text-[#111735]">
            {t("AIに渡す前に確認してください", "Review before sending to AI")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#68708f]">
            {qualityMessage(review, isEnglish)}
          </p>

          {confidenceLabel ? (
            <p className="mt-3 text-xs font-semibold text-[#59617d]">
              {confidenceLabel}
            </p>
          ) : null}

          {audioItems.length ? (
            <div className="mt-4 grid gap-3">
              {audioItems.map((item) => (
                <div key={item.label}>
                  <p className="mb-1 text-xs font-bold text-[#59617d]">{item.label}</p>
                  <audio
                    controls
                    src={item.url}
                    className="h-10 w-full"
                    aria-label={item.label}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {alternatives.length > 1 ? (
            <section className="mt-5">
              <p className="text-xs font-bold text-[#303857]">
                {t("2つの聞き取り候補", "Two transcription options")}
              </p>
              <div className="mt-2 divide-y divide-[#e7e8f0] border-y border-[#e7e8f0]">
                {alternatives.map((alternative, index) => {
                  const selected =
                    review.transcript.trim() === alternative.transcript.trim();
                  return (
                    <button
                      key={alternative.provider + "-" + index}
                      type="button"
                      onClick={() => onChange(alternative.transcript)}
                      disabled={Boolean(processingStage)}
                      className="flex w-full items-start gap-3 py-3 text-left disabled:opacity-50"
                    >
                      <span
                        className={
                          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border " +
                          (selected
                            ? "border-[#5b42ff] bg-[#5b42ff] text-white"
                            : "border-[#cfd3e1] text-transparent")
                        }
                      >
                        <Check size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold text-[#737b99]">
                          {t(`聞き取り候補 ${index + 1}`, `Option ${index + 1}`)}
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-[#303857]">
                          {alternative.transcript}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          <label
            htmlFor="transcript-review"
            className="mt-6 text-xs font-bold text-[#303857]"
          >
            {t("聞き取った内容", "Transcript")}
          </label>
          <textarea
            id="transcript-review"
            value={review.transcript}
            onChange={(event) => onChange(event.currentTarget.value)}
            disabled={Boolean(processingStage)}
            rows={9}
            className="mt-2 min-h-52 w-full resize-none rounded-lg border border-[#dfe2ec] bg-white px-3 py-3 text-base leading-7 text-[#202743] outline-none focus:border-[#6d58ff] focus:ring-2 focus:ring-[#ded9ff] disabled:bg-[#f7f8fc]"
          />

          {error ? (
            <div
              role="alert"
              className="mt-3 rounded-lg bg-[#fff4f5] p-3 text-xs leading-5 text-[#b43d4d]"
            >
              {error}
            </div>
          ) : null}

          {processingStage ? (
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#5039ce]">
              <LoaderCircle size={17} className="animate-spin" />
              <span>{processingStage}</span>
            </div>
          ) : null}

          <div className="mt-auto grid gap-2 pt-6">
            <Button
              variant="primary"
              onPress={onConfirm}
              isDisabled={!review.transcript.trim() || Boolean(processingStage)}
              className="min-h-12 bg-[#5b42ff] text-white"
            >
              <Check size={18} />
              {t("この内容でAI処理へ", "Continue with this transcript")}
            </Button>
            <Button
              variant="outline"
              onPress={onRetry}
              isDisabled={Boolean(processingStage)}
              className="min-h-11"
            >
              <RotateCcw size={17} />
              {t("録音し直す", "Record again")}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}

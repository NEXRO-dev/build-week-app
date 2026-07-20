import { Buffer } from "node:buffer";

import {
  getCloudflareTranscriptionFallbackModel,
  getCloudflareTranscriptionModel,
  runCloudflareAudioModel,
  runCloudflareModel,
} from "@/lib/cloudflare/client";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

type TranscriptionCandidate = {
  transcript: string;
  hallucination: boolean;
  provider: "nova-3" | "whisper";
  confidence: number | null;
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalFormNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textFromVtt(value: unknown) {
  if (typeof value !== "string") return null;

  const transcript = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        line !== "WEBVTT" &&
        !/^\d+$/.test(line) &&
        !line.includes("-->"),
    )
    .join(" ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return transcript || null;
}

function extractWhisperTranscription(result: unknown): string {
  const queue: unknown[] = [result];
  const visited = new Set<object>();

  while (queue.length) {
    const candidate = queue.shift();
    const directText = textValue(candidate);
    if (directText) return directText;

    if (!candidate || typeof candidate !== "object") continue;
    if (visited.has(candidate)) continue;
    visited.add(candidate);

    const record = candidate as Record<string, unknown>;
    for (const key of ["text", "transcript", "transcription", "output_text"]) {
      const value = textValue(record[key]);
      if (value) return value;
    }

    if (Array.isArray(record.segments)) {
      const segments = record.segments
        .map((segment) =>
          segment && typeof segment === "object"
            ? textValue((segment as Record<string, unknown>).text)
            : null,
        )
        .filter((value): value is string => Boolean(value));
      if (segments.length) return segments.join(" ").replace(/\s+/g, " ").trim();
    }

    const vtt = textFromVtt(record.vtt);
    if (vtt) return vtt;

    for (const key of [
      "transcription_info",
      "result",
      "data",
      "output",
      "response",
    ]) {
      if (record[key] !== undefined) queue.push(record[key]);
    }
  }

  return "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractNovaTranscription(result: unknown) {
  let root: unknown = result;
  if (typeof root === "string") {
    try {
      root = JSON.parse(root);
    } catch {
      return { transcript: "", confidence: null };
    }
  }

  const rootRecord = recordValue(root);
  const results = recordValue(rootRecord?.results);
  const channels = Array.isArray(results?.channels) ? results.channels : [];
  const firstChannel = recordValue(channels[0]);
  const alternatives = Array.isArray(firstChannel?.alternatives)
    ? firstChannel.alternatives
    : [];
  const alternative = recordValue(alternatives[0]);
  const transcript = textValue(alternative?.transcript) ?? "";
  const directConfidence =
    typeof alternative?.confidence === "number" ? alternative.confidence : null;
  const words = Array.isArray(alternative?.words) ? alternative.words : [];
  const wordConfidences = words
    .map((word) => recordValue(word)?.confidence)
    .filter((value): value is number => typeof value === "number");

  const confidence =
    directConfidence ??
    (wordConfidences.length
      ? wordConfidences.reduce((sum, value) => sum + value, 0) /
        wordConfidences.length
      : null);

  return {
    transcript,
    confidence:
      confidence === null ? null : Number(Math.max(0, Math.min(1, confidence)).toFixed(3)),
  };
}

function isLikelySilenceHallucination(transcript: string) {
  const normalized = transcript
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s。、,.!！?？「」『』"'()[\]【】]/g, "");

  return (
    /^(ご視聴ありがとうございました)+$/.test(normalized) ||
    /^(ご視聴ありがとうございます)+$/.test(normalized) ||
    /^(最後までご視聴ありがとうございました)+$/.test(normalized) ||
    /^(ご清聴ありがとうございました)+$/.test(normalized) ||
    /^(お聞きいただきありがとうございました)+$/.test(normalized) ||
    /チャンネル登録.*(お願い|ありがとう)/.test(normalized) ||
    /字幕.*(提供|作成)/.test(normalized) ||
    /^(thankyou|thanks)for(watching|listening)$/.test(normalized) ||
    /^pleasesubscribe/.test(normalized) ||
    /^(音楽|拍手|無音)$/.test(normalized)
  );
}

function isUsable(candidate: TranscriptionCandidate | undefined) {
  return Boolean(
    candidate &&
      candidate.transcript &&
      !candidate.hallucination,
  );
}

function normalizeForComparison(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s。、,.!！?？「」『』"'()[\]【】]/g, "");
}

function transcriptAgreement(left: string, right: string) {
  const a = normalizeForComparison(left);
  const b = normalizeForComparison(right);
  if (!a || !b) return null;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }

  return Number((1 - previous[b.length] / Math.max(a.length, b.length)).toFixed(3));
}

function formatTranscript(transcript: string) {
  const japaneseOrNumber =
    "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{N}";

  return transcript
    .replace(new RegExp(`([${japaneseOrNumber}])\\s+(?=[${japaneseOrNumber}])`, "gu"), "$1")
    .replace(/\s+([、。！？])/gu, "$1")
    .replace(/([、。！？])\s+/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
function noSpeechResponse(context: FormDataEntryValue | null) {
  const recordingLabel =
    context === "reflection"
      ? "今日の振り返り"
      : context === "planning"
        ? "明日の予定・タスク"
        : "録音";
  return Response.json(
    {
      error: `${recordingLabel}の音声を認識できませんでした。マイク音量を確認し、もう一度録音してください。`,
      code: "NO_SPEECH_DETECTED",
    },
    { status: 422 },
  );
}

async function transcribeWithWhisper(model: string, audioBase64: string) {
  const result = await runCloudflareModel(model, {
    audio: audioBase64,
    task: "transcribe",
    language: "ja",
    vad_filter: true,
    beam_size: 10,
    condition_on_previous_text: false,
    no_speech_threshold: 0.5,
    compression_ratio_threshold: 2.4,
    log_prob_threshold: -1.2,
    hallucination_silence_threshold: 1.5,
  });
  const transcript = extractWhisperTranscription(result);
  return {
    transcript,
    hallucination:
      transcript !== "" && isLikelySilenceHallucination(transcript),
    provider: "whisper" as const,
    confidence: null,
  };
}

async function transcribeWithNova(
  model: string,
  audioBuffer: ArrayBuffer,
  contentType: string,
) {
  const result = await runCloudflareAudioModel(
    model,
    audioBuffer,
    contentType,
    {
      language: "ja",
      smart_format: true,
      punctuate: true,
      filler_words: true,
      numerals: true,
      utterances: true,
    },
  );
  const extracted = extractNovaTranscription(result);
  return {
    ...extracted,
    hallucination:
      extracted.transcript !== "" &&
      isLikelySilenceHallucination(extracted.transcript),
    provider: "nova-3" as const,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const context = formData.get("context");
    const durationSec = optionalFormNumber(formData.get("durationSec"));
    const averageVolume = optionalFormNumber(formData.get("averageVolume"));
    const silenceRatio = optionalFormNumber(formData.get("silenceRatio"));

    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json(
        { error: "音声ファイルが必要です。", code: "AUDIO_REQUIRED" },
        { status: 400 },
      );
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: "音声ファイルは4MB以下にしてください。", code: "AUDIO_TOO_LARGE" },
        { status: 413 },
      );
    }

    const primaryModel = getCloudflareTranscriptionModel();
    const fallbackModel = getCloudflareTranscriptionFallbackModel();
    const audioBuffer = await audio.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");
    const candidates: TranscriptionCandidate[] = [];
    let primaryError: unknown = null;

    try {
      const primary = primaryModel.includes("/deepgram/nova-3")
        ? await transcribeWithNova(
            primaryModel,
            audioBuffer,
            audio.type || "application/octet-stream",
          )
        : await transcribeWithWhisper(primaryModel, audioBase64);
      candidates.push(primary);
    } catch (error) {
      primaryError = error;
    }

    const primaryCandidate = candidates[0];

    if (fallbackModel !== primaryModel) {
      try {
        candidates.push(
          await transcribeWithWhisper(fallbackModel, audioBase64),
        );
      } catch (fallbackError) {
        if (!primaryCandidate) throw primaryError ?? fallbackError;
      }
    }

    const usableCandidates = candidates.filter(isUsable);
    const novaCandidate = usableCandidates.find(
      (candidate) => candidate.provider === "nova-3",
    );
    const whisperCandidate = usableCandidates.find(
      (candidate) => candidate.provider === "whisper",
    );
    const agreement =
      novaCandidate && whisperCandidate
        ? transcriptAgreement(
            novaCandidate.transcript,
            whisperCandidate.transcript,
          )
        : null;
    const accepted =
      novaCandidate && whisperCandidate
        ? normalizeForComparison(whisperCandidate.transcript).length >
          normalizeForComparison(novaCandidate.transcript).length
          ? whisperCandidate
          : novaCandidate
        : usableCandidates[0];

    if (!accepted) {
      if (primaryError && candidates.length === 0) throw primaryError;
      return noSpeechResponse(context);
    }

    const transcript = formatTranscript(accepted.transcript);
    const alternatives = usableCandidates.map((candidate) => ({
      provider: candidate.provider,
      transcript: formatTranscript(candidate.transcript),
      confidence: candidate.confidence,
    }));
    const quality =
      accepted.confidence !== null &&
      accepted.confidence >= 0.85 &&
      (agreement === null || agreement >= 0.7)
        ? "high"
        : "review";
    console.info("[transcribe]", {
      context: typeof context === "string" ? context : "unknown",
      audioBytes: audio.size,
      audioType: audio.type || "unknown",
      durationSec,
      averageVolume,
      silenceRatio,
      provider: accepted.provider,
      confidence: accepted.confidence,
      comparedWithFallback: usableCandidates.length > 1,
      agreement,
      quality,
      acceptedCharacters: transcript.length,
    });

    return Response.json({
      transcript,
      rawTranscript: accepted.transcript,
      corrected: transcript !== accepted.transcript,
      provider: accepted.provider,
      confidence: accepted.confidence,
      agreement,
      quality,
      requiresConfirmation: true,
      alternatives,
    });
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
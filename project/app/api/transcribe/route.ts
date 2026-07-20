import { Buffer } from "node:buffer";

import { getAuthErrorResponse } from "@/lib/auth-api";
import {
  isLikelySilenceHallucination,
  isStrongNovaCandidate,
  selectTranscriptionCandidate,
  type TranscriptionCandidate,
} from "@/lib/audio/transcriptionQuality";
import {
  CloudflareWorkersAiError,
  getCloudflareTranscriptionFallbackModel,
  getCloudflareTranscriptionModel,
  runCloudflareAudioModel,
  runCloudflareModel,
} from "@/lib/cloudflare/client";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

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

type WhisperSegmentQuality = {
  transcript: string;
  speechProbability: number | null;
  totalSegments: number;
  acceptedSegments: number;
};

function extractWhisperSegmentQuality(result: unknown): WhisperSegmentQuality {
  const queue: unknown[] = [result];
  const visited = new Set<object>();

  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object") continue;
    if (visited.has(candidate)) continue;
    visited.add(candidate);

    const record = candidate as Record<string, unknown>;
    if (Array.isArray(record.segments) && record.segments.length) {
      const segments = record.segments
        .map(recordValue)
        .filter((segment): segment is Record<string, unknown> => Boolean(segment));
      const accepted = segments.filter((segment) => {
        const noSpeechProbability =
          typeof segment.no_speech_prob === "number"
            ? segment.no_speech_prob
            : null;
        const averageLogProbability =
          typeof segment.avg_logprob === "number"
            ? segment.avg_logprob
            : null;
        const likelyNoSpeech =
          noSpeechProbability !== null &&
          noSpeechProbability > 0.6 &&
          averageLogProbability !== null &&
          averageLogProbability < -1;
        return !likelyNoSpeech;
      });
      const noSpeechProbabilities = segments
        .map((segment) => segment.no_speech_prob)
        .filter((value): value is number => typeof value === "number");
      const averageNoSpeechProbability = noSpeechProbabilities.length
        ? noSpeechProbabilities.reduce((sum, value) => sum + value, 0) /
          noSpeechProbabilities.length
        : null;

      return {
        transcript: accepted
          .map((segment) => textValue(segment.text))
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
        speechProbability:
          averageNoSpeechProbability === null
            ? null
            : Number(
                Math.max(0, Math.min(1, 1 - averageNoSpeechProbability)).toFixed(3),
              ),
        totalSegments: segments.length,
        acceptedSegments: accepted.length,
      };
    }

    for (const key of ["result", "data", "output", "response"]) {
      if (record[key] !== undefined) queue.push(record[key]);
    }
  }

  return {
    transcript: "",
    speechProbability: null,
    totalSegments: 0,
    acceptedSegments: 0,
  };
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
function noSpeechResponse(
  context: FormDataEntryValue | null,
  isEnglish: boolean,
) {
  const recordingLabel =
    context === "combined"
      ? isEnglish
        ? "today's reflection and tomorrow's plans"
        : "今日の振り返りと明日の予定"
      : context === "reflection"
      ? isEnglish
        ? "today's reflection"
        : "今日の振り返り"
      : context === "planning"
        ? isEnglish
          ? "tomorrow's plans and tasks"
          : "明日の予定・タスク"
        : isEnglish
          ? "recording"
          : "録音";
  return Response.json(
    {
      error: isEnglish
        ? "Could not transcribe " + recordingLabel + ". Your recording is still available—play it back, record again, or add the details as text."
        : recordingLabel + "の音声を文字にできませんでした。録音は残っています。再生して確認し、もう一度録音するか「テキストで入力」をお試しください。",
      code: "NO_SPEECH_DETECTED",
    },
    { status: 422 },
  );
}
async function transcribeWithWhisper(
  model: string,
  audioBase64: string,
  language: "ja" | "en",
  mode: "filtered" | "unfiltered" = "filtered",
) {
  const filtered = mode === "filtered";
  const input: Record<string, unknown> = {
    audio: audioBase64,
    task: "transcribe",
    language,
    vad_filter: filtered,
    condition_on_previous_text: false,
    no_speech_threshold: filtered ? 0.6 : 0.8,
    compression_ratio_threshold: filtered ? 2.4 : 2.8,
    log_prob_threshold: filtered ? -1 : -1.5,
  };

  const result = await runCloudflareModel(model, input);
  const extractedTranscript = extractWhisperTranscription(result);
  const segmentQuality = extractWhisperSegmentQuality(result);
  const removedUnreliableSegments =
    segmentQuality.totalSegments > segmentQuality.acceptedSegments;
  const transcript = removedUnreliableSegments
    ? segmentQuality.transcript
    : extractedTranscript;
  return {
    transcript,
    hallucination:
      (segmentQuality.totalSegments > 0 &&
        segmentQuality.acceptedSegments === 0) ||
      (transcript !== "" && isLikelySilenceHallucination(transcript)),
    provider: "whisper" as const,
    confidence: null,
    speechProbability: segmentQuality.speechProbability,
  };
}

async function transcribeWithNova(
  model: string,
  audioBuffer: ArrayBuffer,
  contentType: string,
  language: "ja" | "en",
) {
  const result = await runCloudflareAudioModel(
    model,
    audioBuffer,
    contentType,
    {
      language,
      smart_format: true,
      punctuate: true,
      numerals: true,
    },
  );
  const extracted = extractNovaTranscription(result);
  return {
    ...extracted,
    hallucination:
      extracted.transcript !== "" &&
      isLikelySilenceHallucination(extracted.transcript),
    provider: "nova-3" as const,
    speechProbability: null,
  };
}

async function transcribeWithModel(
  model: string,
  audioBuffer: ArrayBuffer,
  audioBase64: string,
  contentType: string,
  language: "ja" | "en",
  whisperMode: "filtered" | "unfiltered" = "filtered",
) {
  return model.includes("/deepgram/nova-3")
    ? transcribeWithNova(model, audioBuffer, contentType, language)
    : transcribeWithWhisper(model, audioBase64, language, whisperMode);
}

function providerErrorDetails(model: string, error: unknown) {
  return error instanceof CloudflareWorkersAiError
    ? { model, status: error.status, code: error.code }
    : { model, status: null, code: null };
}

export async function POST(request: Request) {
  try {
    const authError = await getAuthErrorResponse(request);
    if (authError) return authError;

    const formData = await request.formData();
    const audio = formData.get("audio");
    const context = formData.get("context");
    const isEnglish = formData.get("locale") === "us-en";
    const language = isEnglish ? "en" : "ja";
    const durationSec = optionalFormNumber(formData.get("durationSec"));
    const averageVolume = optionalFormNumber(formData.get("averageVolume"));
    const silenceRatio = optionalFormNumber(formData.get("silenceRatio"));

    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json(
        {
          error: isEnglish
            ? "An audio file is required."
            : "音声ファイルが必要です。",
          code: "AUDIO_REQUIRED",
        },
        { status: 400 },
      );
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json(
        {
          error: isEnglish
            ? "Audio files must be 4 MB or smaller."
            : "音声ファイルは4MB以下にしてください。",
          code: "AUDIO_TOO_LARGE",
        },
        { status: 413 },
      );
    }

    const primaryModel = getCloudflareTranscriptionModel();
    const fallbackModel = getCloudflareTranscriptionFallbackModel();
    const audioBuffer = await audio.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");
    const contentType = audio.type || "application/octet-stream";
    const models = [...new Set([primaryModel, fallbackModel])].sort(
      (left, right) =>
        Number(right.includes("/deepgram/nova-3")) -
        Number(left.includes("/deepgram/nova-3")),
    );
    const candidates: TranscriptionCandidate[] = [];
    const providerErrors: Array<{ model: string; error: unknown }> = [];

    for (const model of models) {
      try {
        const candidate = await transcribeWithModel(
          model,
          audioBuffer,
          audioBase64,
          contentType,
          language,
        );
        candidates.push(candidate);
        if (isStrongNovaCandidate(candidate)) break;
      } catch (error) {
        providerErrors.push({ model, error });
      }
    }

    let selection = selectTranscriptionCandidate(candidates);

    if (!selection.accepted) {
      const whisperModel = models.find((model) =>
        model.includes("/whisper"),
      );

      if (whisperModel) {
        try {
          candidates.push(
            await transcribeWithWhisper(
              whisperModel,
              audioBase64,
              language,
              "unfiltered",
            ),
          );
        } catch (error) {
          providerErrors.push({ model: whisperModel, error });
        }
        selection = selectTranscriptionCandidate(candidates);
      }
    }

    const { accepted, agreement } = selection;

    if (!accepted) {
      const dailyLimitError = providerErrors.find(
        ({ error }) =>
          error instanceof CloudflareWorkersAiError && error.code === 3036,
      );
      if (dailyLimitError) throw dailyLimitError.error;
      if (providerErrors.length) {
        throw providerErrors[0].error;
      }
      console.warn("[transcribe:rejected]", {
        context: typeof context === "string" ? context : "unknown",
        audioBytes: audio.size,
        audioType: audio.type || "unknown",
        durationSec,
        averageVolume,
        silenceRatio,
        candidates: candidates.map((candidate) => ({
          provider: candidate.provider,
          characters: candidate.transcript.length,
          confidence: candidate.confidence,
          speechProbability: candidate.speechProbability,
          hallucination: candidate.hallucination,
        })),
        providerErrors: providerErrors.map(({ model, error }) =>
          providerErrorDetails(model, error),
        ),
      });
      return noSpeechResponse(context, isEnglish);
    }

    const transcript = formatTranscript(accepted.transcript);
    const alternatives = selection.candidates.map((candidate) => ({
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
      speechProbability: accepted.speechProbability,
      comparedWithFallback: selection.candidates.length > 1,
      agreement,
      quality,
      acceptedCharacters: transcript.length,
      providerErrors: providerErrors.map(({ model, error }) =>
        providerErrorDetails(model, error),
      ),
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

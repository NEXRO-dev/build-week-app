import assert from "node:assert/strict";
import test from "node:test";

import { analyzePcmChannels } from "../lib/audio/analyzeAudio.ts";
import {
  encodePcm16Wav,
  normalizePcmForSpeech,
} from "../lib/audio/normalizeTranscriptionAudio.ts";
import {
  isLikelySilenceHallucination,
  selectTranscriptionCandidate,
  transcriptAgreement,
} from "../lib/audio/transcriptionQuality.ts";

function candidate(overrides) {
  return {
    transcript: "明日は10時に会議があります",
    hallucination: false,
    provider: "nova-3",
    confidence: 0.9,
    speechProbability: null,
    ...overrides,
  };
}

test("a longer unrelated Whisper result never outranks confident Nova", () => {
  const nova = candidate({ confidence: 0.93 });
  const whisper = candidate({
    provider: "whisper",
    confidence: null,
    speechProbability: 0.97,
    transcript:
      "今日は一日とても疲れていて、明日の予定をすべて整理する必要があります。資料も準備します。",
  });

  const selection = selectTranscriptionCandidate([nova, whisper]);

  assert.equal(selection.accepted, nova);
  assert.ok(selection.agreement < 0.6);
  assert.deepEqual(selection.candidates, [nova, whisper]);
});

test("transcript length does not outrank moderate native confidence", () => {
  const nova = candidate({ confidence: 0.65, transcript: "明日は休みます" });
  const whisper = candidate({
    provider: "whisper",
    confidence: null,
    speechProbability: 0.98,
    transcript:
      "明日は朝から会議に参加して、午後には資料を作成し、夕方までにすべて提出する予定です",
  });

  const selection = selectTranscriptionCandidate([nova, whisper]);

  assert.equal(selection.accepted, nova);
});

test("a near-zero-confidence Nova result defers to reliable speech", () => {
  const nova = candidate({ confidence: 0.05, transcript: "関係のない文章" });
  const whisper = candidate({
    provider: "whisper",
    confidence: null,
    speechProbability: 0.92,
  });

  const selection = selectTranscriptionCandidate([nova, whisper]);

  assert.equal(selection.accepted, whisper);
  assert.deepEqual(selection.candidates, [nova, whisper]);
});

test("a short low-confidence utterance still reaches mandatory review", () => {
  const nova = candidate({ confidence: 0.2, transcript: "今日は疲れました" });

  const selection = selectTranscriptionCandidate([nova]);

  assert.equal(selection.accepted, nova);
});

test("known silence hallucinations are rejected", () => {
  const canned = candidate({
    transcript: "ご視聴ありがとうございました。",
    hallucination: isLikelySilenceHallucination("ご視聴ありがとうございました。"),
  });
  const selection = selectTranscriptionCandidate([canned]);

  assert.equal(selection.accepted, null);
  assert.deepEqual(selection.candidates, []);
});

test("low speech probability remains reviewable when text is not a hallucination", () => {
  const whisper = candidate({
    provider: "whisper",
    confidence: null,
    speechProbability: 0.1,
    transcript: "今日は疲れました",
  });

  const selection = selectTranscriptionCandidate([whisper]);

  assert.equal(selection.accepted, whisper);
});

test("agreement ignores spacing and punctuation", () => {
  assert.equal(
    transcriptAgreement("明日は、10時に会議です。", "明日は 10時に会議です"),
    1,
  );
});

function speechFixture(amplitude, sampleRate = 1_000) {
  const samples = new Float32Array(sampleRate);
  for (
    let index = Math.floor(sampleRate * 0.2);
    index < Math.floor(sampleRate * 0.8);
    index += 1
  ) {
    samples[index] = Math.sin(index * 0.35) * amplitude;
  }
  return samples;
}

test("relative speech activity survives lower input gain", () => {
  const normal = analyzePcmChannels([speechFixture(0.08)], 1_000);
  const quiet = analyzePcmChannels([speechFixture(0.02)], 1_000);

  assert.notEqual(normal.silenceRatio, 1);
  assert.notEqual(quiet.silenceRatio, 1);
  assert.ok(Math.abs(normal.silenceRatio - quiet.silenceRatio) < 0.05);
});

test("speech on a non-primary channel is analyzed", () => {
  const silent = new Float32Array(1_000);
  const result = analyzePcmChannels([silent, speechFixture(0.05)], 1_000);

  assert.notEqual(result.silenceRatio, 1);
  assert.ok(result.averageVolume > 0);
});

test("actual digital silence remains silence", () => {
  const result = analyzePcmChannels([new Float32Array(1_000)], 1_000);

  assert.equal(result.silenceRatio, 1);
  assert.equal(result.averageVolume, 0);
});

test("normalized transcription WAV has a valid mono PCM header", () => {
  const wav = encodePcm16Wav(new Float32Array([0, 0.5, -0.5]), 16_000);
  const view = new DataView(wav);
  const text = (offset, length) =>
    String.fromCharCode(
      ...Array.from({ length }, (_, index) => view.getUint8(offset + index)),
    );

  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 4), "WAVE");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(wav.byteLength, 50);
});

test("very low speech level is amplified before transcription", () => {
  const input = speechFixture(0.0005, 16_000);
  const normalized = normalizePcmForSpeech(input, 16_000);
  const inputPeak = Math.max(...input.map(Math.abs));
  const outputPeak = Math.max(...normalized.samples.map(Math.abs));

  assert.equal(normalized.gain, 64);
  assert.ok(outputPeak > inputPeak * 60);
});

test("digital silence is never amplified", () => {
  const input = new Float32Array(16_000);
  const normalized = normalizePcmForSpeech(input, 16_000);

  assert.equal(normalized.gain, 1);
  assert.equal(Math.max(...normalized.samples), 0);
});

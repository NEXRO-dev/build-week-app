"use client";

import { Button, Tooltip } from "@heroui/react";
import { Mic, Pause, RotateCcw, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeAudioBlob } from "@/lib/audio/analyzeAudio";
import { normalizeTranscriptionAudio } from "@/lib/audio/normalizeTranscriptionAudio";
import { useI18n } from "@/lib/i18n";
import type { AudioMeta } from "@/types/echly";

type Props = {
  audioBlob: Blob | null;
  onAudioReady: (blob: Blob, meta: AudioMeta) => void;
  onDiscard: () => void;
  onError: (message: string) => void;
  onPrimaryAction: () => void;
  isProcessing: boolean;
  idleLabel: string;
  recordingLabel: string;
  recordedLabel: string;
  durationHint: string;
  primaryActionLabel: string;
  isPrimaryDisabled?: boolean;
  tone: "reflection" | "planning";
};

const waveform = [10,16,25,15,31,20,42,27,18,35,51,24,40,18,29,46,22,34,14,25,38,20,31,15,22,34,18,27,12,20];
const toneStyles = {
  reflection: {
    panel: "border-[#e2ddff] bg-[#fbfaff]",
    haloOuter: "bg-[#efedff]",
    haloInner: "bg-[#dfdbff]",
    button: "bg-[#5b42ff] shadow-[0_12px_28px_rgba(91,66,255,.28)]",
    primary: "bg-[#5b42ff]",
    wave: "#b9b1ff",
    activeWave: "#6a50ff",
  },
  planning: {
    panel: "border-[#d5efe7] bg-[#f8fdfa]",
    haloOuter: "bg-[#e7f8f2]",
    haloInner: "bg-[#cdeee4]",
    button: "bg-[#168f78] shadow-[0_12px_28px_rgba(22,143,120,.24)]",
    primary: "bg-[#168f78]",
    wave: "#a7ddd0",
    activeWave: "#168f78",
  },
};

function preferredMimeType() {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
}

const audioConstraints: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    sampleRate: { ideal: 48_000 },
    sampleSize: { ideal: 16 },
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

function isSilentMeta(meta: AudioMeta) {
  return meta.averageVolume === 0 && meta.silenceRatio === 1;
}

function audioQualityHint(meta: AudioMeta | null, isEnglish: boolean) {
  if (!meta) return null;
  if (meta.durationSec < 3) {
    return isEnglish
      ? "This recording is short. Speaking for at least 5 seconds improves recognition."
      : "録音が短めです。5秒以上話すと認識しやすくなります。";
  }
  if (isSilentMeta(meta)) {
    return isEnglish
      ? "No microphone signal was detected. Play the recording and check your device's input microphone."
      : "マイクの音声信号を確認できませんでした。録音を再生し、端末の入力マイクを確認してください。";
  }
  return null;
}
export function RecorderPanel({
  audioBlob,
  onAudioReady,
  onDiscard,
  onError,
  onPrimaryAction,
  isProcessing,
  idleLabel,
  recordingLabel,
  recordedLabel,
  durationHint,
  primaryActionLabel,
  isPrimaryDisabled = false,
  tone,
}: Props) {
  const { isEnglish, t } = useI18n();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const audioUrl = useMemo(() => audioBlob ? URL.createObjectURL(audioBlob) : null, [audioBlob]);
  const [lastAudioMeta, setLastAudioMeta] = useState<AudioMeta | null>(null);
  const qualityHint = audioQualityHint(lastAudioMeta, isEnglish);
  const colors = toneStyles[tone];

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [isRecording]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError(t("このブラウザでは音声録音を利用できません。テキスト入力を使ってください。", "Audio recording is unavailable in this browser. Please type your check-in instead."));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128_000,
      });
      streamRef.current = stream; recorderRef.current = recorder; chunksRef.current = [];
      startedAtRef.current = Date.now(); setElapsed(0); onDiscard();
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        try {
          const durationSec = Math.max(1, Math.round((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
          const rawBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          let blob = rawBlob;
          const rawMeta = await analyzeAudioBlob(rawBlob, durationSec);
          let meta = rawMeta;

          // Re-encoding to 16 kHz mono WAV with speech-level normalization helps
          // transcription, but must never replace an audible recording with silence.
          const normalizedBlob = await normalizeTranscriptionAudio(rawBlob);
          let normalizedMeta: AudioMeta | null = null;
          if (normalizedBlob !== rawBlob) {
            normalizedMeta = await analyzeAudioBlob(normalizedBlob, durationSec);
            if (!isSilentMeta(normalizedMeta) || isSilentMeta(meta)) {
              blob = normalizedBlob;
              meta = normalizedMeta;
            }
          }

          console.info("[recorder]", {
            mimeType: recorder.mimeType || "unknown",
            rawBytes: rawBlob.size,
            rawAverageVolume: rawMeta.averageVolume,
            rawSilenceRatio: rawMeta.silenceRatio,
            normalizedAverageVolume: normalizedMeta?.averageVolume ?? null,
            normalizedSilenceRatio: normalizedMeta?.silenceRatio ?? null,
            sentNormalized: blob !== rawBlob,
            trackSettings: stream.getAudioTracks()[0]?.getSettings() ?? null,
          });

          setLastAudioMeta(meta);
          onAudioReady(blob, meta);
          if (isSilentMeta(meta)) {
            onError(t("録音データが無音です。録音を再生し、端末で選択されている入力マイクを確認してください。", "The recording is silent. Play it back and check the input microphone selected on your device."));
          }
        } catch {
          onError(t("録音データを作成できませんでした。もう一度録音してください。", "The recording could not be created. Please record again."));
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          startedAtRef.current = null;
        }
      };
      recorder.start(500); setIsRecording(true);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      onError(t("マイクを開始できませんでした。ブラウザのマイク権限を確認してください。", "Could not start the microphone. Check your browser's microphone permission."));
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setIsRecording(false);
  }

  return (
    <div className={`mt-4 flex min-w-0 flex-col items-center rounded-lg border px-4 py-5 ${colors.panel}`}>
      <div
        className={`voice-wave ${isRecording ? "is-recording" : ""}`}
        style={{ "--wave-color": colors.wave, "--wave-recording-color": colors.activeWave } as CSSProperties}
        aria-hidden="true"
      >
        {waveform.map((height, index) => <span key={index} style={{ height: `${isRecording ? height : Math.max(6, height * .34)}px` }} />)}
      </div>
      <div className="relative mt-2 grid place-items-center">
        <span className={`absolute size-32 rounded-full ${colors.haloOuter} ${isRecording ? "record-pulse" : ""}`} />
        <span className={`absolute size-24 rounded-full ${colors.haloInner}`} />
        <Button isIconOnly aria-label={isRecording ? t("録音を停止", "Stop recording") : t("録音を開始", "Start recording")} onPress={isRecording ? stopRecording : startRecording} className={`relative z-10 size-20 rounded-full text-white transition-transform duration-150 ease-out active:scale-[0.97] ${isRecording ? "bg-[#ef476f] shadow-[0_12px_28px_rgba(239,71,111,.24)]" : colors.button}`}>
          {isRecording ? <Pause size={28} fill="currentColor" /> : <Mic size={31} />}
        </Button>
      </div>
      <p className="mt-6 text-sm font-bold">{isRecording ? `${elapsed}${t("秒", "s")} ${recordingLabel}` : audioBlob ? recordedLabel : idleLabel}</p>
      <p className="mt-1 text-xs text-[#68708f]">{durationHint}</p>
      {audioBlob && !isRecording ? (
        <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-2">
          <Tooltip><Tooltip.Trigger><Button isIconOnly size="sm" variant="outline" aria-label={t("録音を破棄", "Discard recording")} onPress={onDiscard}><Trash2 size={16} /></Button></Tooltip.Trigger><Tooltip.Content>{t("録音を破棄", "Discard recording")}</Tooltip.Content></Tooltip>
          <Tooltip><Tooltip.Trigger><Button isIconOnly size="sm" variant="outline" aria-label={t("もう一度録音", "Record again")} onPress={startRecording}><RotateCcw size={16} /></Button></Tooltip.Trigger><Tooltip.Content>{t("もう一度録音", "Record again")}</Tooltip.Content></Tooltip>
          <Button size="sm" variant="primary" onPress={() => onPrimaryAction()} isDisabled={isProcessing || isPrimaryDisabled} className={`min-w-20 text-white ${colors.primary}`}>{primaryActionLabel}</Button>
        </div>
      ) : null}
      {audioBlob && qualityHint ? <p className="mt-2 max-w-full text-center text-xs font-medium text-[#9a5b10]">{qualityHint}</p> : null}
      {audioUrl ? <audio controls src={audioUrl} className="mt-3 h-9 w-full max-w-full" /> : null}
    </div>
  );
}

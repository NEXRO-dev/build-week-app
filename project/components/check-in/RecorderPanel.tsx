"use client";

import { Button, Tooltip } from "@heroui/react";
import { Mic, Pause, RotateCcw, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeAudioBlob } from "@/lib/audio/analyzeAudio";
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

function audioQualityHint(meta: AudioMeta | null) {
  if (!meta) return null;
  if (meta.durationSec < 3) return "録音が短めです。5秒以上話すと認識しやすくなります。";
  if (meta.averageVolume !== null && meta.averageVolume < 0.018) return "声が小さめです。マイクに少し近づくと認識しやすくなります。";
  if (meta.silenceRatio !== null && meta.silenceRatio > 0.65) return "無音が多めです。話し始めてから録音すると安定します。";
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
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const audioUrl = useMemo(() => audioBlob ? URL.createObjectURL(audioBlob) : null, [audioBlob]);
  const [lastAudioMeta, setLastAudioMeta] = useState<AudioMeta | null>(null);
  const qualityHint = audioQualityHint(lastAudioMeta);
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
      onError("このブラウザでは音声録音を利用できません。テキスト入力を使ってください。");
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
        const durationSec = Math.max(1, Math.round((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const meta = await analyzeAudioBlob(blob, durationSec);
        setLastAudioMeta(meta);
        onAudioReady(blob, meta);
        stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; startedAtRef.current = null;
      };
      recorder.start(500); setIsRecording(true);
    } catch { onError("マイクを開始できませんでした。ブラウザのマイク権限を確認してください。"); }
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
        <Button isIconOnly aria-label={isRecording ? "録音を停止" : "録音を開始"} onPress={isRecording ? stopRecording : startRecording} className={`relative z-10 size-20 rounded-full text-white transition-transform duration-150 ease-out active:scale-[0.97] ${isRecording ? "bg-[#ef476f] shadow-[0_12px_28px_rgba(239,71,111,.24)]" : colors.button}`}>
          {isRecording ? <Pause size={28} fill="currentColor" /> : <Mic size={31} />}
        </Button>
      </div>
      <p className="mt-6 text-sm font-bold">{isRecording ? `${elapsed}秒 ${recordingLabel}` : audioBlob ? recordedLabel : idleLabel}</p>
      <p className="mt-1 text-xs text-[#68708f]">{durationHint}</p>
      {audioBlob && !isRecording ? (
        <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-2">
          <Tooltip><Tooltip.Trigger><Button isIconOnly size="sm" variant="outline" aria-label="録音を破棄" onPress={onDiscard}><Trash2 size={16} /></Button></Tooltip.Trigger><Tooltip.Content>録音を破棄</Tooltip.Content></Tooltip>
          <Tooltip><Tooltip.Trigger><Button isIconOnly size="sm" variant="outline" aria-label="もう一度録音" onPress={startRecording}><RotateCcw size={16} /></Button></Tooltip.Trigger><Tooltip.Content>もう一度録音</Tooltip.Content></Tooltip>
          <Button size="sm" variant="primary" onPress={onPrimaryAction} isDisabled={isProcessing || isPrimaryDisabled} className={`min-w-20 text-white ${colors.primary}`}>{primaryActionLabel}</Button>
        </div>
      ) : null}
      {audioBlob && qualityHint ? <p className="mt-2 max-w-full text-center text-xs font-medium text-[#9a5b10]">{qualityHint}</p> : null}
      {audioUrl ? <audio controls src={audioUrl} className="mt-3 h-9 w-full max-w-full" /> : null}
    </div>
  );
}

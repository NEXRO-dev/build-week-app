"use client";

import { Button, Tooltip } from "@heroui/react";
import { Mic, Pause, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeAudioBlob } from "@/lib/audio/analyzeAudio";
import type { AudioMeta } from "@/types/echly";

type Props = {
  audioBlob: Blob | null;
  onAudioReady: (blob: Blob, meta: AudioMeta) => void;
  onDiscard: () => void;
  onError: (message: string) => void;
  onAnalyze: () => void;
  isProcessing: boolean;
};

const waveform = [10,16,25,15,31,20,42,27,18,35,51,24,40,18,29,46,22,34,14,25,38,20,31,15,22,34,18,27,12,20];

function preferredMimeType() {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
}

export function RecorderPanel({ audioBlob, onAudioReady, onDiscard, onError, onAnalyze, isProcessing }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const audioUrl = useMemo(() => audioBlob ? URL.createObjectURL(audioBlob) : null, [audioBlob]);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream; recorderRef.current = recorder; chunksRef.current = [];
      startedAtRef.current = Date.now(); setElapsed(0); onDiscard();
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const durationSec = Math.max(1, Math.round((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        onAudioReady(blob, await analyzeAudioBlob(blob, durationSec));
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
    <div className="mt-5 flex min-w-0 flex-col items-center">
      <div className={`voice-wave ${isRecording ? "is-recording" : ""}`} aria-hidden="true">
        {waveform.map((height, index) => <span key={index} style={{ height: `${isRecording ? height : Math.max(6, height * .34)}px` }} />)}
      </div>
      <div className="relative mt-2 grid place-items-center">
        <span className={`absolute size-32 rounded-full bg-[#efedff] ${isRecording ? "record-pulse" : ""}`} />
        <span className="absolute size-24 rounded-full bg-[#dfdbff]" />
        <Button isIconOnly aria-label={isRecording ? "録音を停止" : "録音を開始"} onPress={isRecording ? stopRecording : startRecording} className={`relative z-10 size-20 rounded-full text-white shadow-[0_10px_26px_rgba(91,66,255,.3)] ${isRecording ? "bg-[#ef476f]" : "bg-[#5b42ff]"}`}>
          {isRecording ? <Pause size={28} fill="currentColor" /> : <Mic size={31} />}
        </Button>
      </div>
      <p className="mt-6 text-sm font-bold">{isRecording ? `${elapsed}秒 録音中` : audioBlob ? "録音できました" : "タップして録音を開始"}</p>
      <p className="mt-1 text-xs text-[#68708f]">目安：30秒〜2分</p>
      {audioBlob && !isRecording ? (
        <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-2">
          <Tooltip><Tooltip.Trigger><Button isIconOnly size="sm" variant="outline" aria-label="録音を破棄" onPress={onDiscard}><Trash2 size={16} /></Button></Tooltip.Trigger><Tooltip.Content>録音を破棄</Tooltip.Content></Tooltip>
          <Tooltip><Tooltip.Trigger><Button isIconOnly size="sm" variant="outline" aria-label="もう一度録音" onPress={startRecording}><RotateCcw size={16} /></Button></Tooltip.Trigger><Tooltip.Content>もう一度録音</Tooltip.Content></Tooltip>
          <Button size="sm" variant="primary" onPress={onAnalyze} isDisabled={isProcessing} className="min-w-20 bg-[#5b42ff] text-white">解析する</Button>
        </div>
      ) : null}
      {audioUrl ? <audio controls src={audioUrl} className="mt-3 h-9 w-full max-w-full" /> : null}
    </div>
  );
}

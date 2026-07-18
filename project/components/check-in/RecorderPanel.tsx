"use client";

import { Button, Card, Chip, Tooltip } from "@heroui/react";
import { Mic, Pause, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeAudioBlob } from "@/lib/audio/analyzeAudio";
import type { AudioMeta } from "@/types/echly";

type RecorderPanelProps = {
  audioBlob: Blob | null;
  onAudioReady: (blob: Blob, meta: AudioMeta) => void;
  onDiscard: () => void;
  onError: (message: string) => void;
};

const waveform = [
  12, 18, 28, 20, 34, 46, 30, 52, 40, 24, 36, 58, 44, 26, 18, 38, 48, 64,
  42, 28, 50, 34, 22, 40, 56, 32, 46, 26, 18, 36, 48, 30, 20, 42, 54, 24,
];

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function preferredMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function RecorderPanel({
  audioBlob,
  onAudioReady,
  onDiscard,
  onError,
}: RecorderPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);

  const audioUrl = useMemo(
    () => (audioBlob ? URL.createObjectURL(audioBlob) : null),
    [audioBlob],
  );

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  useEffect(() => {
    if (!isRecording) return;

    const intervalId = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isRecording]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("このブラウザでは音声録音を利用できません。テキスト入力を使ってください。");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setElapsed(0);
      onDiscard();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const durationSec = Math.max(
          1,
          Math.round((Date.now() - (startedAtRef.current ?? Date.now())) / 1000),
        );
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const meta = await analyzeAudioBlob(blob, durationSec);
        onAudioReady(blob, meta);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        startedAtRef.current = null;
      };

      recorder.start(500);
      setIsRecording(true);
    } catch {
      onError("マイクを開始できませんでした。ブラウザのマイク権限を確認してください。");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  }

  return (
    <Card className="overflow-hidden border border-[#d5ddda] bg-white shadow-[0_10px_30px_rgba(28,48,44,0.07)]">
      <Card.Content className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">今日のふり返り・明日の予定</p>
            <p className="mt-1 text-xs text-[#74807d]">30秒から2分が目安です</p>
          </div>
          <Chip size="sm" color={isRecording ? "danger" : audioBlob ? "success" : "default"} variant="soft">
            {isRecording ? "録音中" : audioBlob ? "録音済み" : "待機中"}
          </Chip>
        </div>

        <div className="flex min-h-[280px] flex-col items-center justify-center py-5">
          <div className={`waveform ${isRecording ? "is-recording" : ""}`} aria-hidden="true">
            {waveform.map((height, index) => (
              <span
                key={`${height}-${index}`}
                style={{ height: `${isRecording ? height : Math.max(7, height * 0.28)}px` }}
              />
            ))}
          </div>

          <div className="relative mt-4 flex items-center justify-center">
            {isRecording ? <span className="absolute size-28 rounded-full border border-[#eab8ad] record-pulse" /> : null}
            <Button
              isIconOnly
              variant={isRecording ? "danger" : "primary"}
              aria-label={isRecording ? "録音を停止" : "録音を開始"}
              onPress={isRecording ? stopRecording : startRecording}
              className={`relative z-10 size-24 rounded-full shadow-[0_12px_32px_rgba(25,91,82,0.24)] ${
                isRecording ? "bg-[#bb4a39] text-white" : "bg-[#195b52] text-white"
              }`}
            >
              {isRecording ? <Pause size={30} fill="currentColor" /> : <Mic size={34} />}
            </Button>
          </div>

          <p className="mt-4 font-mono text-xl font-semibold tabular-nums text-[#26302e]">
            {formatDuration(elapsed)}
          </p>
          <p className="mt-1 text-xs text-[#7b8582]">
            {isRecording ? "タップして録音を停止" : audioBlob ? "録音を確認して解析へ進めます" : "タップして録音を開始"}
          </p>

          {audioBlob && !isRecording ? (
            <div className="mt-4 flex items-center gap-2">
              <Tooltip delay={300}>
                <Tooltip.Trigger>
                  <Button isIconOnly variant="outline" aria-label="録音を破棄" onPress={onDiscard}>
                    <Trash2 size={17} />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>録音を破棄</Tooltip.Content>
              </Tooltip>
              <Tooltip delay={300}>
                <Tooltip.Trigger>
                  <Button isIconOnly variant="outline" aria-label="もう一度録音" onPress={startRecording}>
                    <RotateCcw size={17} />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>もう一度録音</Tooltip.Content>
              </Tooltip>
            </div>
          ) : null}
        </div>

        {audioUrl ? <audio controls src={audioUrl} className="h-10 w-full" /> : null}
      </Card.Content>
    </Card>
  );
}

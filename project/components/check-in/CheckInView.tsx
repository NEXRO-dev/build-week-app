"use client";

import { Button, Label, TextArea, TextField } from "@heroui/react";
import { Activity, Bell, FlaskConical, LoaderCircle } from "lucide-react";

import { SAMPLE_TRANSCRIPT } from "@/lib/demo/sampleCheckIns";
import type { AudioMeta } from "@/types/echly";

import { RecorderPanel } from "./RecorderPanel";

type CheckInViewProps = {
  todayLabel: string;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  audioBlob: Blob | null;
  onAudioReady: (blob: Blob, meta: AudioMeta) => void;
  onAudioDiscard: () => void;
  onAnalyze: () => void;
  onError: (message: string) => void;
  processingStage: string | null;
  error: string | null;
};

export function CheckInView(props: CheckInViewProps) {
  const {
    todayLabel, transcript, onTranscriptChange, audioBlob, onAudioReady,
    onAudioDiscard, onAnalyze, onError, processingStage, error,
  } = props;

  return (
    <div>
      <header className="flex h-16 items-center justify-between border-b border-[#ececf3] px-5 pt-[env(safe-area-inset-top)]">
        <button type="button" className="flex items-center gap-2 text-lg font-bold" aria-label="Echly ホーム">
          <span className="echly-logo" aria-hidden="true"><i /><i /><i /></span>
          Echly
        </button>
        <button type="button" aria-label="通知" className="grid size-10 place-items-center text-[#555d7d] active:scale-95">
          <Bell size={20} />
        </button>
      </header>

      <div className="px-5 pb-8 pt-5">
        <h1 className="text-[20px] font-bold leading-7">おつかれさまです、Ryoさん</h1>
        <p className="mt-1 text-xs text-[#606985]">{todayLabel}</p>

        <section className="mt-5 flex min-w-0 items-center gap-3 rounded-lg border border-[#e4e6ef] p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#eff4ff] text-[#4266e8]">
            <Activity size={21} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#626b89]">前回の状態</p>
            <p className="mt-1 text-sm font-bold">通常よりやや高い</p>
          </div>
        </section>

        {error ? <div role="alert" className="mt-4 rounded-lg border border-[#ffc9c9] bg-[#fff5f5] px-4 py-3 text-sm text-[#b43d4d]">{error}</div> : null}
        {processingStage ? <div className="mt-4 flex min-w-0 items-center gap-2 rounded-lg bg-[#f1efff] px-4 py-3 text-sm text-[#5039ce]"><LoaderCircle size={17} className="shrink-0 animate-spin" /><span className="min-w-0 break-words">{processingStage}</span></div> : null}

        <p className="mt-6 text-center text-sm font-semibold leading-6">
          今日のふり返り・明日の予定・悩みなど<br />何でも話してください
        </p>

        <RecorderPanel
          audioBlob={audioBlob}
          onAudioReady={onAudioReady}
          onDiscard={onAudioDiscard}
          onError={onError}
          onAnalyze={onAnalyze}
          isProcessing={Boolean(processingStage)}
        />

        <details className="group mt-5 rounded-lg border border-[#e7e8f0] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-xs font-medium text-[#5e6683] [&::-webkit-details-marker]:hidden">
            <FlaskConical size={14} /> テキストで入力
          </summary>
          <div className="border-t border-[#ececf3] p-3">
            <TextField fullWidth className="w-full">
              <Label className="sr-only">チェックイン内容</Label>
              <TextArea value={transcript} onInput={(event) => onTranscriptChange(event.currentTarget.value)} rows={4} fullWidth placeholder="今日のことを自由に入力してください" className="min-h-28 w-full resize-none rounded-md border border-[#dfe2ec] bg-white px-3 py-2 text-sm leading-6 text-[#27304d] outline-none focus:border-[#6d58ff] focus:ring-2 focus:ring-[#ded9ff]" />
            </TextField>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onPress={() => onTranscriptChange(SAMPLE_TRANSCRIPT)} className="min-w-0">デモ文を入力</Button>
              <Button size="sm" variant="primary" isDisabled={!transcript.trim() || Boolean(processingStage)} onPress={onAnalyze} className="ml-auto min-w-20 bg-[#5b42ff] text-white">解析する</Button>
            </div>
          </div>
        </details>

        <aside className="mt-5 rounded-lg border border-[#e4e6ef] px-4 py-3.5">
          <p className="text-xs font-bold text-[#6653d9]">ヒント</p>
          <p className="mt-1 text-xs leading-5 text-[#505975]">うまく話そうとしなくて大丈夫。思ったまま話してください。</p>
        </aside>
      </div>
    </div>
  );
}

"use client";

import { Button, Card, Label, TextArea, TextField } from "@heroui/react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  FlaskConical,
  LoaderCircle,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";

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

const tomorrowSchedule = [
  { time: "10:00", title: "A社 予算会議", tone: "bg-[#39806f]" },
  { time: "13:00", title: "提案資料の仕上げ", tone: "bg-[#d0a049]" },
  { time: "17:00", title: "Cさんとブレスト", tone: "bg-[#c8765e]" },
];

export function CheckInView({
  todayLabel,
  transcript,
  onTranscriptChange,
  audioBlob,
  onAudioReady,
  onAudioDiscard,
  onAnalyze,
  onError,
  processingStage,
  error,
}: CheckInViewProps) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <section>
        <p className="text-xs font-medium text-[#687370]">{todayLabel}</p>
        <h1 className="mt-1.5 text-[22px] font-semibold leading-8 text-[#17201e] sm:text-2xl">
          おつかれさまです、Ryoさん
        </h1>
        <p className="mt-1 text-sm leading-6 text-[#66716e]">
          まとまっていなくても大丈夫です。今日のことをそのまま話してください。
        </p>
      </section>

      <section className="grid grid-cols-2 divide-x divide-[#e0e5e3] overflow-hidden rounded-lg border border-[#dbe1df] bg-white shadow-[0_5px_18px_rgba(34,54,49,0.04)]">
        <div className="flex min-w-0 items-center gap-3 p-3.5 sm:p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#edf3f1] text-[#2d6b5f]">
            <Activity size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-[#76817e]">前回の状態</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[#34403d]">少し注意</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3 p-3.5 sm:p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#edf2f5] text-[#456d82]">
            <CalendarDays size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-[#76817e]">明日の予定</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[#34403d]">3件</p>
          </div>
        </div>
      </section>

      {error ? (
        <div role="alert" className="rounded-md border border-[#efc6bc] bg-[#fff5f2] px-4 py-3 text-sm leading-6 text-[#883e2e]">
          {error}
        </div>
      ) : null}

      {processingStage ? (
        <div className="flex items-center gap-3 rounded-md border border-[#cdded9] bg-[#edf6f3] px-4 py-3 text-sm text-[#22584f]">
          <LoaderCircle size={17} className="shrink-0 animate-spin" />
          <span>{processingStage}</span>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <RecorderPanel
            audioBlob={audioBlob}
            onAudioReady={onAudioReady}
            onDiscard={onAudioDiscard}
            onError={onError}
          />

          <Card className="border border-[#dbe1df] bg-white shadow-none">
            <Card.Header className="px-4 pt-4 sm:px-5 sm:pt-5">
              <Card.Title className="text-sm font-semibold">テキストで補足</Card.Title>
              <Card.Description className="mt-1 text-xs leading-5 text-[#74807d]">
                マイクを使えない時や、名前・時刻を正確に伝えたい時に入力できます
              </Card.Description>
            </Card.Header>
            <Card.Content className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
              <TextField fullWidth>
                <Label className="sr-only">チェックイン内容</Label>
                <TextArea
                  value={transcript}
                  onChange={(event) => onTranscriptChange(event.target.value)}
                  placeholder="例: 明日は10時から予算会議。午後に資料を仕上げたいけれど、今日はあまり眠れていなくて..."
                  rows={4}
                  fullWidth
                  className="min-h-28 resize-y"
                />
              </TextField>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => onTranscriptChange(SAMPLE_TRANSCRIPT)}
                className="mt-2 px-1 text-[#45625d]"
              >
                <FlaskConical size={15} />
                デモ用の発話を入力
              </Button>
            </Card.Content>
          </Card>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            isDisabled={(!transcript.trim() && !audioBlob) || Boolean(processingStage)}
            onPress={onAnalyze}
            className="h-12 bg-[#195b52] text-white"
          >
            <WandSparkles size={18} />
            チェックインを解析
            <ArrowRight size={18} />
          </Button>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-[#dbe1df] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">明日の予定</h2>
              <span className="text-[11px] text-[#74807d]">Calendar・デモ</span>
            </div>
            <div className="mt-3 divide-y divide-[#e6eae9]">
              {tomorrowSchedule.map((item) => (
                <div key={item.time} className="grid grid-cols-[44px_8px_1fr] items-start gap-2.5 py-3 first:pt-1 last:pb-0">
                  <span className="font-mono text-xs font-medium text-[#596461]">{item.time}</span>
                  <span className={`mt-1 size-2 rounded-full ${item.tone}`} />
                  <p className="text-sm font-medium leading-5 text-[#303a37]">{item.title}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex gap-3 rounded-lg border border-[#cfe0da] bg-[#eaf3f0] p-4 text-[#315f56]">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold">音声は保存しません</h2>
              <p className="mt-1 text-xs leading-5 text-[#5b746d]">
                解析後に破棄し、予定の変更も確認するまで実行しません。
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

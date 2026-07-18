"use client";

import { Button, Label, TextArea, TextField } from "@heroui/react";
import { Activity, ArrowLeft, Bell, CalendarCheck, Check, FlaskConical, LoaderCircle, MessageSquareText } from "lucide-react";
import { useState } from "react";

import { SAMPLE_TRANSCRIPT } from "@/lib/demo/sampleCheckIns";
import type { AudioMeta, ConditionSignal, WorkloadSelfReport } from "@/types/echly";

import { RecorderPanel } from "./RecorderPanel";

export type CheckInStep = 1 | 2;
type StepTone = "reflection" | "planning";

const stepContent: Record<CheckInStep, {
  title: string;
  subtitle: string;
  prompt: string;
  examples: string[];
  icon: typeof MessageSquareText;
  tone: StepTone;
  activeClassName: string;
  iconClassName: string;
  promptClassName: string;
}> = {
  1: {
    title: "今日の振り返り",
    subtitle: "Step 1",
    prompt: "まず、今日起きたことや気になったことを話してください。",
    examples: ["進んだこと", "詰まったこと", "疲れや集中度"],
    icon: MessageSquareText,
    tone: "reflection",
    activeClassName: "border-[#6d58ff] bg-[#f7f5ff] text-[#3420bc]",
    iconClassName: "bg-[#efedff] text-[#5b42ff]",
    promptClassName: "bg-[#faf9ff]",
  },
  2: {
    title: "明日の予定・タスク",
    subtitle: "Step 2",
    prompt: "次に、明日やる予定・締切・調整したいタスクを話してください。",
    examples: ["明日の会議", "やるべき作業", "動かせない予定"],
    icon: CalendarCheck,
    tone: "planning",
    activeClassName: "border-[#41b69d] bg-[#f0fbf7] text-[#13705f]",
    iconClassName: "bg-[#e8f8f2] text-[#18957d]",
    promptClassName: "bg-[#f7fcfa]",
  },
};

type AssessmentQuestion = {
  key: keyof WorkloadSelfReport;
  eyebrow: string;
  question: string;
  options: Array<{ label: string; value: number }>;
};

const workloadOptions = [
  { label: "ほとんどない", value: 0 },
  { label: "少ない", value: 25 },
  { label: "普通", value: 50 },
  { label: "多い", value: 75 },
  { label: "かなり多い", value: 100 },
];

const assessmentQuestions: AssessmentQuestion[] = [
  {
    key: "mentalDemand",
    eyebrow: "精神的な要求",
    question: "今日は、考えたり集中したりする負担がどのくらいありましたか？",
    options: workloadOptions,
  },
  {
    key: "physicalDemand",
    eyebrow: "身体的な要求",
    question: "今日は、体を使う負担がどのくらいありましたか？",
    options: workloadOptions,
  },
  {
    key: "temporalDemand",
    eyebrow: "時間的な切迫",
    question: "今日は、時間に追われる感覚がどのくらいありましたか？",
    options: workloadOptions,
  },
  {
    key: "performance",
    eyebrow: "達成度への不満",
    question: "今日の出来に対する不満はどのくらいありますか？",
    options: [
      { label: "満足している", value: 0 },
      { label: "やや満足", value: 25 },
      { label: "どちらでもない", value: 50 },
      { label: "やや不満", value: 75 },
      { label: "とても不満", value: 100 },
    ],
  },
  {
    key: "effort",
    eyebrow: "必要だった努力",
    question: "今日を乗り切るために、どのくらい努力が必要でしたか？",
    options: workloadOptions,
  },
  {
    key: "frustration",
    eyebrow: "不安・いらだち",
    question: "今日は、不安やいらだちをどのくらい感じましたか？",
    options: workloadOptions,
  },
  {
    key: "sleepiness",
    eyebrow: "現在の眠気",
    question: "今の眠気に最も近いものはどれですか？",
    options: [
      { label: "非常にはっきり目覚めている", value: 1 },
      { label: "とても目覚めている", value: 2 },
      { label: "目覚めている", value: 3 },
      { label: "やや目覚めている", value: 4 },
      { label: "どちらでもない", value: 5 },
      { label: "少し眠い", value: 6 },
      { label: "眠いが、起きていられる", value: 7 },
      { label: "眠くて、起きているのがつらい", value: 8 },
      { label: "とても眠く、起きているのが困難", value: 9 },
    ],
  },
];

type CheckInViewProps = {
  todayLabel: string;
  previousCondition: ConditionSignal | null;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  audioByStep: Record<CheckInStep, Blob | null>;
  onAudioReady: (step: CheckInStep, blob: Blob, meta: AudioMeta) => void;
  onAudioDiscard: (step: CheckInStep) => void;
  selfReport: Partial<WorkloadSelfReport>;
  onSelfReportChange: (key: keyof WorkloadSelfReport, value: number) => void;
  onAnalyze: (completedReport?: WorkloadSelfReport) => void;
  onError: (message: string) => void;
  processingStage: string | null;
  error: string | null;
};

export function CheckInView(props: CheckInViewProps) {
  const {
    todayLabel, previousCondition, transcript, onTranscriptChange, audioByStep, onAudioReady,
    onAudioDiscard, selfReport, onSelfReportChange, onAnalyze, onError,
    processingStage, error,
  } = props;
  const [activeStep, setActiveStep] = useState<CheckInStep>(1);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [assessmentIndex, setAssessmentIndex] = useState(0);
  const currentStep = stepContent[activeStep];
  const CurrentIcon = currentStep.icon;
  const currentAudioBlob = audioByStep[activeStep];
  const assessmentQuestion = assessmentQuestions[assessmentIndex];
  const completedSteps = ([1, 2] as const).filter((step) => Boolean(audioByStep[step]));

  function handlePrimaryRecordingAction() {
    if (activeStep === 1) {
      setActiveStep(2);
      return;
    }
    startAssessment();
  }

  function startAssessment() {
    const firstUnanswered = assessmentQuestions.findIndex(
      (question) => !Number.isFinite(selfReport[question.key]),
    );
    setAssessmentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
    setAssessmentOpen(true);
  }

  function answerAssessment(question: AssessmentQuestion, value: number) {
    const nextReport = { ...selfReport, [question.key]: value };
    onSelfReportChange(question.key, value);

    if (assessmentIndex < assessmentQuestions.length - 1) {
      setAssessmentIndex((current) => current + 1);
      return;
    }

    if (Object.values(nextReport).filter(Number.isFinite).length === 7) {
      onAnalyze(nextReport as WorkloadSelfReport);
    }
  }

  function selectStep(step: CheckInStep) {
    setActiveStep(step);
  }

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
            <p className="mt-1 text-sm font-bold">
              {previousCondition?.score !== undefined ? `${previousCondition.score}/100・${previousCondition.label}` : "まだ記録がありません"}
            </p>
          </div>
        </section>

        {error ? <div role="alert" className="mt-4 rounded-lg border border-[#ffc9c9] bg-[#fff5f5] px-4 py-3 text-sm text-[#b43d4d]">{error}</div> : null}
        {processingStage ? <div className="mt-4 flex min-w-0 items-center gap-2 rounded-lg bg-[#f1efff] px-4 py-3 text-sm text-[#5039ce]"><LoaderCircle size={17} className="shrink-0 animate-spin" /><span className="min-w-0 break-words">{processingStage}</span></div> : null}

        <section className="mt-5 overflow-hidden rounded-lg border border-[#e2e5f0] bg-white shadow-[0_10px_28px_rgba(32,39,80,0.05)]">
          <div className="px-4 pb-3 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-normal text-[#68708f]">Voice check-in</p>
                <h2 className="mt-1 text-base font-bold text-[#111735]">2ステップで明日を整える</h2>
              </div>
              <span className="shrink-0 rounded-md bg-[#f2f4fa] px-2.5 py-1 text-[10px] font-bold text-[#5e6683]">
                {activeStep}/2
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1" aria-hidden="true">
              {([1, 2] as const).map((step) => {
                const filled = step <= activeStep || completedSteps.includes(step);
                return (
                  <span key={step} className="h-1.5 overflow-hidden rounded-full bg-[#eceef6]">
                    <span
                      className={`block h-full rounded-full transition-transform duration-200 ease-out ${
                        step === 1 ? "bg-[#5b42ff]" : "bg-[#168f78]"
                      } ${filled ? "translate-x-0" : "-translate-x-full"}`}
                    />
                  </span>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            {([1, 2] as const).map((step) => {
              const item = stepContent[step];
              const Icon = item.icon;
              const active = activeStep === step;
              const done = completedSteps.includes(step);
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => selectStep(step)}
                  className={`flex min-h-16 min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.98] ${
                    active ? item.activeClassName : "border-[#e5e7f1] bg-[#f8f9fd] text-[#5e6683]"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full ${active || done ? item.iconClassName : "bg-white text-[#737b99]"}`}>
                    {done ? <Check size={16} /> : <Icon size={16} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold">{item.subtitle}</span>
                    <span className="block truncate text-xs font-bold">{item.title}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className={`border-t border-[#eceef6] px-4 py-4 ${currentStep.promptClassName}`}>
            <div className="flex items-start gap-3">
              <span className={`grid size-11 shrink-0 place-items-center rounded-full ${currentStep.iconClassName}`}>
                <CurrentIcon size={21} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-[#68708f]">{currentStep.subtitle}</p>
                <h3 className="mt-1 text-base font-bold text-[#111735]">{currentStep.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#303857]">{currentStep.prompt}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {currentStep.examples.map((example) => (
                    <span key={example} className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-[#606985] shadow-[inset_0_0_0_1px_rgba(213,217,233,0.9)]">{example}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <RecorderPanel
          audioBlob={currentAudioBlob}
          onAudioReady={(blob, meta) => onAudioReady(activeStep, blob, meta)}
          onDiscard={() => onAudioDiscard(activeStep)}
          onError={onError}
          onPrimaryAction={handlePrimaryRecordingAction}
          isProcessing={Boolean(processingStage)}
          idleLabel={`${currentStep.title}を録音`}
          recordingLabel="録音中"
          recordedLabel={`${currentStep.title}を録音できました`}
          isPrimaryDisabled={
            activeStep === 2 &&
            (!audioByStep[1] || !audioByStep[2])
          }
          durationHint={activeStep === 1 ? "目安：30秒〜1分" : "目安：30秒〜2分"}
          primaryActionLabel={activeStep === 1 ? "Step2へ" : "自己評価へ"}
          tone={currentStep.tone}
        />

        <details className="group mt-5 rounded-lg border border-[#e7e8f0] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-xs font-medium text-[#5e6683] [&::-webkit-details-marker]:hidden">
            <FlaskConical size={14} /> テキストで入力
          </summary>
          <div className="border-t border-[#ececf3] p-3">
            <TextField fullWidth className="w-full">
              <Label className="sr-only">チェックイン内容</Label>
              <TextArea value={transcript} onInput={(event) => onTranscriptChange(event.currentTarget.value)} rows={5} fullWidth placeholder={"Step1: 今日の振り返り\nStep2: 明日の予定・タスク"} className="min-h-32 w-full resize-none rounded-md border border-[#dfe2ec] bg-white px-3 py-2 text-sm leading-6 text-[#27304d] outline-none focus:border-[#6d58ff] focus:ring-2 focus:ring-[#ded9ff]" />
            </TextField>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onPress={() => onTranscriptChange(SAMPLE_TRANSCRIPT)} className="min-w-0">デモ文を入力</Button>
              <Button size="sm" variant="primary" isDisabled={!transcript.trim() || Boolean(processingStage)} onPress={startAssessment} className="ml-auto min-w-20 bg-[#5b42ff] text-white">自己評価へ</Button>
            </div>
          </div>
        </details>

        <aside className="mt-5 rounded-lg border border-[#e4e6ef] px-4 py-3.5">
          <p className="text-xs font-bold text-[#6653d9]">ヒント</p>
          <p className="mt-1 text-xs leading-5 text-[#505975]">うまく話そうとしなくて大丈夫。思ったまま話してください。</p>
        </aside>
      </div>

      {assessmentOpen ? (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#f5f6fa]">
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] shadow-[0_0_36px_rgba(28,35,70,0.08)]">
            <header className="grid h-16 grid-cols-[44px_1fr_44px] items-center">
              <button
                type="button"
                aria-label={assessmentIndex === 0 ? "自己評価を閉じる" : "前の質問に戻る"}
                onClick={() => {
                  if (processingStage) return;
                  if (assessmentIndex === 0) setAssessmentOpen(false);
                  else setAssessmentIndex((current) => current - 1);
                }}
                className="grid size-11 place-items-center text-[#303857] disabled:opacity-40"
                disabled={Boolean(processingStage)}
              >
                <ArrowLeft size={21} />
              </button>
              <p className="text-center text-sm font-bold text-[#303857]">今日の負荷を確認</p>
            </header>

            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {assessmentQuestions.map((question, index) => (
                <span key={question.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e8eaf2]">
                  <span className={`block h-full rounded-full bg-[#5b42ff] transition-transform duration-200 ${index <= assessmentIndex ? "translate-x-0" : "-translate-x-full"}`} />
                </span>
              ))}
            </div>

            {processingStage ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                <span className="grid size-20 place-items-center rounded-full bg-[#efedff] text-[#5b42ff]">
                  <LoaderCircle size={34} className="animate-spin" />
                </span>
                <h2 className="mt-6 text-xl font-bold text-[#111735]">回答をもとに解析中</h2>
                <p className="mt-2 text-sm text-[#68708f]">{processingStage}</p>
              </div>
            ) : (
              <main className="flex flex-1 flex-col py-7">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-[#5b42ff]">{assessmentQuestion.eyebrow}</p>
                  <p className="text-xs font-bold tabular-nums text-[#7b829c]">{assessmentIndex + 1} / {assessmentQuestions.length}</p>
                </div>
                <h1 className="mt-5 text-[24px] font-bold leading-9 text-[#111735]">{assessmentQuestion.question}</h1>
                <div
                  className={`mt-8 grid ${assessmentQuestion.key === "sleepiness" ? "gap-1.5 pb-2" : "my-auto gap-2.5"}`}
                  role="group"
                  aria-label={assessmentQuestion.question}
                >
                  {assessmentQuestion.options.map((option) => {
                    const selected = selfReport[assessmentQuestion.key] === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => answerAssessment(assessmentQuestion, option.value)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 text-left font-semibold transition-[background-color,border-color,transform] active:scale-[0.98] ${assessmentQuestion.key === "sleepiness" ? "min-h-11 py-2 text-xs" : "min-h-[52px] py-3 text-sm"} ${selected ? "border-[#5b42ff] bg-[#f3f1ff] text-[#3f2bc7]" : "border-[#dfe2ec] bg-white text-[#303857]"}`}
                        aria-pressed={selected}
                      >
                        <span>{option.label}</span>
                        {selected ? <Check size={18} className="shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
              </main>
            )}

            {error ? <div role="alert" className="mb-2 rounded-lg bg-[#fff4f5] p-3 text-xs leading-5 text-[#b43d4d]">{error}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

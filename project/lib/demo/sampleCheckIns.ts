import type {
  AnalysisResult,
  AudioMeta,
  CheckIn,
  ConditionLevel,
  ExtractedTask,
  TaskStatus,
  TemporalContext,
  TomorrowPlan,
} from "@/types/echly";

export const SAMPLE_TRANSCRIPT =
  "明日は10時にA社の予算会議。午後は資料の仕上げ、17時からCさんとブレスト。でも、今日はほとんど寝てなくて、正直もう頭が回らない。";
export const SAMPLE_TRANSCRIPT_EN =
  "Tomorrow I have a budget meeting with Acme at 10 AM, need to finish the proposal deck in the afternoon, and have a brainstorm with Chris at 5 PM. I barely slept last night and I'm having trouble focusing.";

const DISCLAIMER = "診断ではなく、音声と発話内容からの推定です。";

function inferCondition(transcript: string): AnalysisResult["condition"] {
  const highWords = ["寝てない", "寝てなく", "頭が回らない", "限界", "無理"];
  const cautionWords = ["疲れ", "焦", "眠い", "しんどい", "余裕がない"];
  const highEvidence = highWords.filter((word) => transcript.includes(word));
  const cautionEvidence = cautionWords.filter((word) => transcript.includes(word));
  const level: ConditionLevel = highEvidence.length
    ? "high"
    : cautionEvidence.length
      ? "caution"
      : "normal";

  return {
    level,
    label: level === "high" ? "高負荷" : level === "caution" ? "注意" : "通常",
    summary:
      level === "high"
        ? "休息を先に確保し、動かせる予定を減らした方がよさそうです。"
        : level === "caution"
          ? "重要な予定を絞り、回復時間を確保すると進めやすそうです。"
          : "大きな負荷表現は見つかりませんでした。余白を残して進めましょう。",
    evidence: [
      ...(highEvidence.length ? highEvidence : cautionEvidence).map(
        (word) => `発話に「${word}」という表現`,
      ),
      "夜のチェックイン内容をもとにした簡易推定",
    ],
    disclaimer: DISCLAIMER,
  };
}

function createGenericTasks(transcript: string): ExtractedTask[] {
  const sentences = transcript
    .split(/[。！？\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 4)
    .slice(0, 5);

  let inheritedTemporalContext: TemporalContext = "unspecified";

  return sentences.map((sentence, index) => {
    const hasPendingIntent = /ないと|必要|予定|つもり|する$|やる$|仕上げる|送る|連絡する/.test(sentence);
    const explicitTemporalContext: TemporalContext = /昨日|先週|先月/.test(sentence)
      ? "past"
      : /明日|あした|翌日/.test(sentence)
        ? "tomorrow"
        : /今日|きょう|さっき|先ほど/.test(sentence)
          ? "today"
          : /来週|来月|再来週|月末|今度/.test(sentence)
            ? "future"
            : "unspecified";
    const temporalContext = explicitTemporalContext !== "unspecified"
      ? explicitTemporalContext
      : inheritedTemporalContext === "past" && hasPendingIntent
        ? "unspecified"
        : inheritedTemporalContext;

    if (explicitTemporalContext !== "unspecified") {
      inheritedTemporalContext = explicitTemporalContext;
    }

    const status: TaskStatus = /終わった|終えた|やった|済ませた|完了した|提出した|した$/.test(sentence)
      ? "completed"
      : /中止|キャンセル/.test(sentence)
        ? "cancelled"
        : /途中|進めている|対応中/.test(sentence)
          ? "in_progress"
          : temporalContext === "tomorrow" || temporalContext === "future" || hasPendingIntent
            ? "pending"
            : "unknown";
    const isEvent = /会議|面談|打ち合わせ|ミーティング|予約/.test(sentence);
    const isLoadTopic = /疲れ|眠|寝て|しんど|頭が回ら|焦|不安/.test(sentence);

    return {
      id: `demo-task-${index + 1}`,
      title: sentence.length > 34 ? `${sentence.slice(0, 34)}...` : sentence,
      kind: isLoadTopic ? "topic" : isEvent ? "event" : "task",
      temporalContext,
      status,
      type: isEvent
        ? "meeting"
        : sentence.includes("資料")
          ? "focus_work"
          : "unknown",
      date:
        temporalContext === "tomorrow"
          ? "明日"
          : temporalContext === "today"
            ? "今日"
            : null,
      startTime: sentence.match(/(\d{1,2})時/)?.[1]
        ? `${sentence.match(/(\d{1,2})時/)?.[1]?.padStart(2, "0")}:00`
        : null,
      endTime: null,
      deadline: null,
      people: [],
      importance: index === 0 ? "high" : "medium",
      movable: !isEvent,
      burden: isLoadTopic ? "high" : index === 0 ? "medium" : "high",
      sourceText: sentence,
    };
  });
}

export function createDemoAnalysis(transcript: string): AnalysisResult {
  const isPlanSample =
    transcript.includes("A社") &&
    transcript.includes("資料") &&
    transcript.includes("Cさん");

  const tasks: ExtractedTask[] = isPlanSample
    ? [
        {
          id: "task-budget",
          title: "A社の予算会議",
          kind: "event",
          temporalContext: "tomorrow",
          status: "pending",
          type: "meeting",
          date: "明日",
          startTime: "10:00",
          endTime: "11:00",
          deadline: null,
          people: ["A社"],
          importance: "high",
          movable: false,
          burden: "high",
          sourceText: "明日は10時にA社の予算会議",
        },
        {
          id: "task-deck",
          title: "提案資料の仕上げ",
          kind: "task",
          temporalContext: "tomorrow",
          status: "pending",
          type: "focus_work",
          date: "明日",
          startTime: null,
          endTime: null,
          deadline: "明日",
          people: [],
          importance: "high",
          movable: true,
          burden: "high",
          sourceText: "午後は資料の仕上げ",
        },
        {
          id: "task-brainstorm",
          title: "Cさんとブレスト",
          kind: "event",
          temporalContext: "tomorrow",
          status: "pending",
          type: "meeting",
          date: "明日",
          startTime: "17:00",
          endTime: "18:00",
          deadline: null,
          people: ["Cさん"],
          importance: "medium",
          movable: true,
          burden: "medium",
          sourceText: "17時からCさんとブレスト",
        },
      ]
    : createGenericTasks(transcript);

  return {
    tasks:
      tasks.length > 0
        ? tasks
        : [
            {
              id: "demo-task-1",
              title: "発話内容",
              kind: "topic",
              temporalContext: "unspecified",
              status: "unknown",
              type: "unknown",
              date: null,
              startTime: null,
              endTime: null,
              deadline: null,
              people: [],
              importance: "medium",
              movable: true,
              burden: "medium",
              sourceText: transcript,
            },
          ],
    condition: inferCondition(transcript),
  };
}

export function createDemoPlan(
  tasks: ExtractedTask[],
  condition: AnalysisResult["condition"],
  isEnglish = false,
): TomorrowPlan {
  const fixedTask = tasks.find((task) => !task.movable) ?? tasks[0];
  const focusTask =
    tasks.find((task) => task.type === "focus_work") ?? tasks[1] ?? tasks[0];
  const rescheduleTask =
    [...tasks].reverse().find((task) => task.movable && task.id !== focusTask?.id) ??
    tasks.find((task) => task.movable);

  return {
    condition,
    keep: fixedTask
      ? [
          {
            id: `keep-${fixedTask.id}`,
            taskId: fixedTask.id,
            title: fixedTask.title,
            originalTime: fixedTask.startTime,
            proposedTime: fixedTask.startTime,
            reason: isEnglish ? "Keep this high-priority commitment with other people." : "重要度が高く、関係者との約束を優先します。",
            impact: "high",
          },
        ]
      : [],
    move:
      focusTask && focusTask.id !== fixedTask?.id
        ? [
            {
              id: `move-${focusTask.id}`,
              taskId: focusTask.id,
              title: focusTask.title,
              originalTime: focusTask.startTime ?? "13:00",
              proposedTime: "15:00",
              reason: isEnglish ? "Protect a 90-minute focus block after some recovery time." : "休息のあとに、90分の集中枠として確保します。",
              impact: "medium",
            },
          ]
        : [],
    reschedule: rescheduleTask
      ? [
          {
            id: `reschedule-${rescheduleTask.id}`,
            taskId: rescheduleTask.id,
            title: rescheduleTask.title,
            originalTime: rescheduleTask.startTime,
            proposedTime: isEnglish ? "Next business day, 4:00 PM" : "翌営業日 16:00",
            reason: isEnglish ? "Move a flexible commitment to reduce tomorrow's load." : "明日の負荷を下げるため、調整可能な予定を後ろへ移します。",
            impact: "low",
          },
        ]
      : [],
    restBlocks:
      condition.level === "normal"
        ? [
            {
              id: "rest-short",
              startTime: "12:30",
              endTime: "13:00",
              reason: isEnglish ? "A short break to support focus in the afternoon." : "午後の集中を保つための短い休息です。",
            },
          ]
        : [
            {
              id: "rest-recovery",
              startTime: "13:00",
              endTime: "15:00",
              reason: isEnglish ? "Leave this time open for recovery based on signs of insufficient sleep." : "睡眠不足の表現を踏まえ、予定を入れない回復時間にします。",
            },
          ],
    emailDrafts: rescheduleTask
      ? [
          {
            id: `email-${rescheduleTask.id}`,
            to: rescheduleTask.people.length ? rescheduleTask.people : [isEnglish ? "Attendees" : "関係者"],
            subject: isEnglish ? `Request to reschedule ${rescheduleTask.title}` : `${rescheduleTask.title}の日程調整のお願い`,
            body: isEnglish ? `Hello,\n\nWould it be possible to reschedule tomorrow's ${rescheduleTask.title}? If possible, I would appreciate moving it to after 4:00 PM on the next business day. Please let me know what works for you.\n\nThank you.` : `お疲れさまです。\n\n明日予定している「${rescheduleTask.title}」について、進行上の都合により日程を調整させていただけないでしょうか。\n\n可能でしたら、翌営業日の16時以降で再調整できればと考えています。ご都合のよい時間をお知らせいただけますと幸いです。\n\nどうぞよろしくお願いいたします。`,
            relatedTaskId: rescheduleTask.id,
            tone: "polite",
            caution: isEnglish ? "Review the recipients and proposed time before using this draft." : "宛先と候補日時を確認してから下書きを利用してください。",
          },
        ]
      : [],
    rationale: [
      isEnglish ? "Protected the most important fixed commitment first." : "動かしにくい重要予定を先に固定しました。",
      condition.level === "high"
        ? isEnglish ? "Kept the early afternoon open for recovery because the load signal is high." : "高負荷シグナルを踏まえ、午後の前半を回復時間として空けました。"
        : isEnglish ? "Added a short break to support afternoon focus." : "午後の集中力を保つため、短い休息を確保しました。",
      isEnglish ? "Only flexible commitments are included as approval options." : "調整可能な予定だけを承認候補にしています。",
    ],
  };
}

const sampleAudioMeta: AudioMeta = {
  durationSec: 38,
  averageVolume: 0.31,
  silenceRatio: 0.18,
  speechRate: 5.1,
};

export function getSampleHistory(): CheckIn[] {
  return [
    {
      id: "history-1",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      transcript: "明日はレビューと資料修正。少し疲れているので早めに切り上げたい。",
      audioMeta: sampleAudioMeta,
      condition: {
        level: "caution",
        label: "注意",
        summary: "予定を絞り、早めに終える余白が必要そうです。",
        evidence: ["疲れへの明示的な言及"],
        disclaimer: DISCLAIMER,
      },
      tasks: [],
      plan: {
        condition: {
          level: "caution",
          label: "注意",
          summary: "予定を絞り、早めに終える余白が必要そうです。",
          evidence: ["疲れへの明示的な言及"],
          disclaimer: DISCLAIMER,
        },
        keep: [],
        move: [],
        reschedule: [],
        restBlocks: [],
        emailDrafts: [],
        rationale: [],
      },
      approvalStatus: "partially_approved",
      approvedActionIds: ["rest-yesterday"],
      source: "demo",
    },
    {
      id: "history-2",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      transcript: "明日は定例だけ。体調はいつも通り。",
      audioMeta: sampleAudioMeta,
      condition: {
        level: "normal",
        label: "通常",
        summary: "大きな負荷表現は見つかりませんでした。",
        evidence: ["通常通りという自己申告"],
        disclaimer: DISCLAIMER,
      },
      tasks: [],
      plan: {
        condition: {
          level: "normal",
          label: "通常",
          summary: "大きな負荷表現は見つかりませんでした。",
          evidence: ["通常通りという自己申告"],
          disclaimer: DISCLAIMER,
        },
        keep: [],
        move: [],
        reschedule: [],
        restBlocks: [],
        emailDrafts: [],
        rationale: [],
      },
      approvalStatus: "approved",
      approvedActionIds: [],
      source: "demo",
    },
  ];
}

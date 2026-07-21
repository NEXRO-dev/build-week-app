export type ConditionLevel = "normal" | "caution" | "high";

export type TaskType =
  | "meeting"
  | "focus_work"
  | "admin"
  | "communication"
  | "personal"
  | "unknown";

export type Importance = "high" | "medium" | "low";
export type Burden = "high" | "medium" | "low";
export type Impact = "low" | "medium" | "high";
export type ExtractedItemKind = "task" | "event" | "topic";
export type TopicType = "reflection" | "concern" | "other";
export type TemporalContext =
  | "past"
  | "today"
  | "tomorrow"
  | "future"
  | "unspecified";
export type TaskStatus =
  | "completed"
  | "in_progress"
  | "pending"
  | "cancelled"
  | "unknown";

export type AudioMeta = {
  durationSec: number;
  averageVolume: number | null;
  silenceRatio: number | null;
  speechRate: number | null;
};

export type TranscriptAlternative = {
  provider: "nova-3" | "whisper";
  transcript: string;
  confidence: number | null;
};

export type TranscriptReview = {
  mode: "reflection" | "planning";
  transcript: string;
  provider: "nova-3" | "whisper";
  confidence: number | null;
  agreement: number | null;
  quality: "high" | "review";
  alternatives: TranscriptAlternative[];
};

export type WorkloadSelfReport = {
  mentalDemand: number;
  physicalDemand: number;
  temporalDemand: number;
  performance: number;
  effort: number;
  frustration: number;
  sleepiness: number;
};

export type LoadSignalComponents = {
  selfReport: WorkloadSelfReport;
  rawTlx: number;
  sleepiness: number;
  voiceDeviation: number | null;
  voiceBaselineCount: number;
  voiceBaselineTarget?: number;
  voiceSamplesCollected?: number;
  voiceCurrentEligible?: boolean;
  voiceFeaturesAvailable?: Array<"speechRate" | "pauseRatio">;
  voiceFeaturesUsed?: Array<"speechRate" | "pauseRatio">;
  voiceFeatureCoverage?: number;
  voiceMinimumDurationSec?: number;
  voiceEligibilityReason?: "eligible" | "too_short" | "no_features";
  workloadWeight: number;
  sleepinessWeight: number;
  voiceWeight: number;
};

export type LoadSignalConfidence = "standard" | "limited";
export type LoadSignalMethod = "echly-load-v1" | "echly-load-v2";

export type ConditionSignal = {
  level: ConditionLevel;
  label: string;
  summary: string;
  evidence: string[];
  score?: number;
  confidence?: LoadSignalConfidence;
  components?: LoadSignalComponents;
  methodVersion?: LoadSignalMethod;
  disclaimer: string;
};

export type ExtractedTask = {
  id: string;
  title: string;
  kind: ExtractedItemKind;
  topicType?: TopicType | null;
  temporalContext: TemporalContext;
  status: TaskStatus;
  type: TaskType;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  deadline: string | null;
  people: string[];
  importance: Importance;
  movable: boolean;
  burden: Burden;
  sourceText: string;
};

export type PlanItem = {
  id: string;
  taskId: string | null;
  title: string;
  originalTime: string | null;
  proposedTime: string | null;
  endTime?: string | null;
  reason: string;
  impact: Impact;
};

export type RestBlock = {
  id: string;
  startTime: string;
  endTime: string;
  reason: string;
};

export type TomorrowPlan = {
  condition: ConditionSignal;
  keep: PlanItem[];
  move: PlanItem[];
  reschedule: PlanItem[];
  restBlocks: RestBlock[];
  rationale: string[];
};

export type PlanRecord = {
  targetDate: string;
  createdAt: string;
  updatedAt: string;
  plan: TomorrowPlan;
  approvalStatus: ApprovalStatus;
  approvedActionIds: string[];
  generationSource: "cloudflare" | "fallback";
};

export type CalendarEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  movable: boolean;
  importance: Importance;
  allDay?: boolean;
  busy?: boolean;
};

export type AnalysisResult = {
  tasks: ExtractedTask[];
  condition: ConditionSignal;
};

export type ScheduleEntry = {
  id: string;
  createdAt: string;
  localDate?: string;
  timeZone?: string;
  targetDate: string;
  transcript: string;
  audioMeta: AudioMeta;
  tasks: ExtractedTask[];
  source: "cloudflare" | "demo" | "manual";
};

export type HistoryTranscriptEntry = {
  id: string;
  createdAt: string;
  localDate: string;
  timeZone?: string;
  kind: "reflection" | "planning";
  transcript: string;
  tasks: ExtractedTask[];
};

export type ApprovalStatus =
  | "draft"
  | "approved"
  | "partially_approved"
  | "rejected";

export type CheckIn = {
  id: string;
  createdAt: string;
  localDate?: string;
  timeZone?: string;
  transcript: string;
  audioMeta: AudioMeta;
  condition: ConditionSignal;
  tasks: ExtractedTask[];
  plan: TomorrowPlan;
  approvalStatus: ApprovalStatus;
  approvedActionIds: string[];
  source: "cloudflare" | "openai" | "demo";
};

export type WorkspaceView =
  | "checkin"
  | "analysis"
  | "plan"
  | "approval"
  | "history"
  | "settings";

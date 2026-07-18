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
export type EmailTone = "polite" | "casual" | "formal";

export type AudioMeta = {
  durationSec: number;
  averageVolume: number | null;
  silenceRatio: number | null;
  speechRate: number | null;
};

export type ConditionSignal = {
  level: ConditionLevel;
  label: string;
  summary: string;
  evidence: string[];
  disclaimer: string;
};

export type ExtractedTask = {
  id: string;
  title: string;
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
  reason: string;
  impact: Impact;
};

export type RestBlock = {
  id: string;
  startTime: string;
  endTime: string;
  reason: string;
};

export type EmailDraft = {
  id: string;
  to: string[];
  subject: string;
  body: string;
  relatedTaskId: string | null;
  tone: EmailTone;
  caution: string;
};

export type TomorrowPlan = {
  condition: ConditionSignal;
  keep: PlanItem[];
  move: PlanItem[];
  reschedule: PlanItem[];
  restBlocks: RestBlock[];
  emailDrafts: EmailDraft[];
  rationale: string[];
};

export type CalendarEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  movable: boolean;
  importance: Importance;
};

export type AnalysisResult = {
  tasks: ExtractedTask[];
  condition: ConditionSignal;
};

export type ApprovalStatus =
  | "draft"
  | "approved"
  | "partially_approved"
  | "rejected";

export type CheckIn = {
  id: string;
  createdAt: string;
  transcript: string;
  audioMeta: AudioMeta;
  condition: ConditionSignal;
  tasks: ExtractedTask[];
  plan: TomorrowPlan;
  approvalStatus: ApprovalStatus;
  approvedActionIds: string[];
  source: "openai" | "demo";
};

export type WorkspaceView =
  | "checkin"
  | "analysis"
  | "plan"
  | "approval"
  | "history"
  | "settings";

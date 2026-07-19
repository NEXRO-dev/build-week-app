import { z } from "zod";

export const AudioMetaSchema = z.object({
  durationSec: z.number().min(0).max(7200),
  averageVolume: z.number().min(0).max(1).nullable(),
  silenceRatio: z.number().min(0).max(1).nullable(),
  speechRate: z.number().min(0).nullable(),
});

export const WorkloadSelfReportSchema = z.object({
  mentalDemand: z.number().min(0).max(100),
  physicalDemand: z.number().min(0).max(100),
  temporalDemand: z.number().min(0).max(100),
  performance: z.number().min(0).max(100),
  effort: z.number().min(0).max(100),
  frustration: z.number().min(0).max(100),
  sleepiness: z.number().int().min(1).max(9),
});

const LoadSignalComponentsSchema = z.object({
  rawTlx: z.number().min(0).max(100),
  selfReport: WorkloadSelfReportSchema,
  sleepiness: z.number().min(0).max(100),
  voiceDeviation: z.number().min(0).max(100).nullable(),
  voiceBaselineCount: z.number().int().min(0),
  workloadWeight: z.number().min(0).max(1),
  sleepinessWeight: z.number().min(0).max(1),
  voiceWeight: z.number().min(0).max(1),
});


export const ConditionSignalSchema = z.object({
  score: z.number().int().min(0).max(100),
  level: z.enum(["normal", "caution", "high"]),
  label: z.string(),
  summary: z.string(),
  evidence: z.array(z.string()),
  disclaimer: z.string(),
  confidence: z.enum(["standard", "limited"]),
  components: LoadSignalComponentsSchema,
  methodVersion: z.literal("echly-load-v1"),
});

export const ExtractedTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["task", "event", "topic"]),
  topicType: z.enum(["reflection", "concern", "other"]).nullable(),
  temporalContext: z.enum([
    "past",
    "today",
    "tomorrow",
    "future",
    "unspecified",
  ]),
  status: z.enum([
    "completed",
    "in_progress",
    "pending",
    "cancelled",
    "unknown",
  ]),
  type: z.enum([
    "meeting",
    "focus_work",
    "admin",
    "communication",
    "personal",
    "unknown",
  ]),
  date: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  deadline: z.string().nullable(),
  people: z.array(z.string()),
  importance: z.enum(["high", "medium", "low"]),
  movable: z.boolean(),
  burden: z.enum(["high", "medium", "low"]),
  sourceText: z.string(),
});

export const TaskExtractionResultSchema = z.object({
  tasks: z.array(ExtractedTaskSchema),
});

export const AnalysisResultSchema = z.object({
  tasks: z.array(ExtractedTaskSchema),
  condition: ConditionSignalSchema,
});

export const PlanItemSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  title: z.string(),
  originalTime: z.string().nullable(),
  proposedTime: z.string().nullable(),
  reason: z.string(),
  impact: z.enum(["low", "medium", "high"]),
});

export const RestBlockSchema = z.object({
  id: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  reason: z.string(),
});

export const EmailDraftSchema = z.object({
  id: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  relatedTaskId: z.string().nullable(),
  tone: z.enum(["polite", "casual", "formal"]),
  caution: z.string(),
});

export const TomorrowPlanSchema = z.object({
  condition: ConditionSignalSchema,
  keep: z.array(PlanItemSchema),
  move: z.array(PlanItemSchema),
  reschedule: z.array(PlanItemSchema),
  restBlocks: z.array(RestBlockSchema),
  emailDrafts: z.array(EmailDraftSchema),
  rationale: z.array(z.string()),
});

export const PlanGenerationSchema = TomorrowPlanSchema.omit({
  condition: true,
});


export const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  movable: z.boolean(),
  importance: z.enum(["high", "medium", "low"]),
});

export const AnalyzeRequestSchema = z.object({
  locale: z.enum(["jp-ja", "us-en"]).default("jp-ja"),
  transcript: z.string().trim().min(1).max(12000),
  audioMeta: AudioMetaSchema,
  audioBaseline: z.array(AudioMetaSchema).max(30).default([]),
  selfReport: WorkloadSelfReportSchema,
  referenceDate: z.string().datetime(),
  timeZone: z.string().min(1).max(100),
});

export const PlanRequestSchema = z.object({
  locale: z.enum(["jp-ja", "us-en"]).default("jp-ja"),
  tasks: z.array(ExtractedTaskSchema).max(30),
  condition: ConditionSignalSchema,
  calendarEvents: z.array(CalendarEventSchema).max(50),
});

export const DraftEmailRequestSchema = z.object({
  locale: z.enum(["jp-ja", "us-en"]).default("jp-ja"),
  rescheduleItem: PlanItemSchema,
  tone: z.enum(["polite", "casual", "formal"]),
});

import { z } from "zod";

import {
  AudioMetaSchema,
  ConditionSignalSchema,
  ExtractedTaskSchema,
  TomorrowPlanSchema,
} from "@/lib/openai/schemas";

const PersistedConditionSignalSchema = ConditionSignalSchema.partial({
  score: true,
  confidence: true,
  components: true,
  methodVersion: true,
});

const PersistedTomorrowPlanSchema = TomorrowPlanSchema.extend({
  condition: PersistedConditionSignalSchema,
});

const PersistedExtractedTaskSchema = ExtractedTaskSchema.partial({
  topicType: true,
});

export const CheckInRecordSchema = z.object({
  id: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  localDate: z.string().min(1).max(20).optional(),
  timeZone: z.string().min(1).max(100).optional(),
  transcript: z.string().max(12000),
  audioMeta: AudioMetaSchema,
  condition: PersistedConditionSignalSchema,
  tasks: z.array(PersistedExtractedTaskSchema).max(100),
  plan: PersistedTomorrowPlanSchema,
  approvalStatus: z.enum([
    "draft",
    "approved",
    "partially_approved",
    "rejected",
  ]),
  approvedActionIds: z.array(z.string().max(200)).max(200),
  source: z.enum(["cloudflare", "openai", "demo"]),
});

export const ScheduleEntryRecordSchema = z.object({
  id: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  localDate: z.string().min(1).max(20).optional(),
  timeZone: z.string().min(1).max(100).optional(),
  targetDate: z.string().min(1).max(20),
  transcript: z.string().max(12000),
  audioMeta: AudioMetaSchema,
  tasks: z.array(PersistedExtractedTaskSchema).min(1).max(100),
  source: z.enum(["cloudflare", "demo"]),
});

export const HistoryTranscriptEntrySchema = z.object({
  id: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  localDate: z.string().min(1).max(20),
  timeZone: z.string().min(1).max(100).optional(),
  kind: z.enum(["reflection", "planning"]),
  transcript: z.string().max(12000),
  tasks: z.array(PersistedExtractedTaskSchema).max(100),
});

export const WorkspacePreferencesSchema = z.object({
  saveTranscript: z.boolean(),
});

export const CheckInWriteSchema = z.object({
  checkIn: CheckInRecordSchema,
});

export const ScheduleEntryWriteSchema = z.object({
  scheduleEntry: ScheduleEntryRecordSchema,
});

export const ScheduleEntryDeleteSchema = z.object({
  id: z.string().min(1).max(200),
});

export const WorkspaceImportSchema = z.object({
  history: z.array(CheckInRecordSchema).max(30).default([]),
  scheduleEntries: z.array(ScheduleEntryRecordSchema).max(60).default([]),
});

import { database, ensureEchlySchema } from "@/lib/database";
import {
  CheckInRecordSchema,
  HistoryTranscriptEntrySchema,
  PlanRecordSchema,
  ScheduleEntryRecordSchema,
} from "@/lib/workspace/schemas";
import type {
  CheckIn,
  HistoryTranscriptEntry,
  PlanRecord,
  ScheduleEntry,
} from "@/types/echly";

function parseCheckIn(payload: string): CheckIn | null {
  try {
    const parsed = CheckInRecordSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseScheduleEntry(payload: string): ScheduleEntry | null {
  try {
    const parsed = ScheduleEntryRecordSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parsePlanRecord(payload: string): PlanRecord | null {
  try {
    const parsed = PlanRecordSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function loadWorkspace(userId: string) {
  await ensureEchlySchema();

  const [
    checkInRows,
    scheduleRows,
    historyTranscriptRows,
    planRows,
    preferences,
  ] = await Promise.all([
    database
      .selectFrom("echly_check_ins")
      .select("payload")
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(365)
      .execute(),
    database
      .selectFrom("echly_schedule_entries")
      .select("payload")
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(60)
      .execute(),
    database
      .selectFrom("echly_history_transcripts")
      .select([
        "id",
        "local_date",
        "time_zone",
        "kind",
        "transcript",
        "tasks_json",
        "created_at",
      ])
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(730)
      .execute(),
    database
      .selectFrom("echly_plans")
      .select("payload")
      .where("user_id", "=", userId)
      .orderBy("target_date", "desc")
      .limit(30)
      .execute(),
    database
      .selectFrom("echly_user_preferences")
      .select("save_transcript")
      .where("user_id", "=", userId)
      .executeTakeFirst(),
  ]);

  return {
    history: checkInRows
      .map((row) => parseCheckIn(row.payload))
      .filter((value): value is CheckIn => value !== null),
    scheduleEntries: scheduleRows
      .map((row) => parseScheduleEntry(row.payload))
      .filter((value): value is ScheduleEntry => value !== null),
    historyTranscripts: historyTranscriptRows
      .map((row) => {
        try {
          const parsed = HistoryTranscriptEntrySchema.safeParse({
            id: row.id,
            createdAt: row.created_at,
            localDate: row.local_date,
            timeZone: row.time_zone ?? undefined,
            kind: row.kind,
            transcript: row.transcript,
            tasks: JSON.parse(row.tasks_json),
          });
          return parsed.success ? parsed.data : null;
        } catch {
          return null;
        }
      })
      .filter((value): value is HistoryTranscriptEntry => value !== null),
    plans: planRows
      .map((row) => parsePlanRecord(row.payload))
      .filter((value): value is PlanRecord => value !== null),
    preferences: {
      saveTranscript: preferences ? preferences.save_transcript === 1 : true,
    },
  };
}

async function upsertHistoryTranscript(
  userId: string,
  entry: HistoryTranscriptEntry,
) {
  const updatedAt = new Date().toISOString();
  await database
    .insertInto("echly_history_transcripts")
    .values({
      user_id: userId,
      id: entry.id,
      local_date: entry.localDate,
      time_zone: entry.timeZone ?? null,
      kind: entry.kind,
      transcript: entry.transcript,
      tasks_json: JSON.stringify(entry.tasks),
      created_at: entry.createdAt,
      updated_at: updatedAt,
    })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "id"]).doUpdateSet({
        local_date: entry.localDate,
        time_zone: entry.timeZone ?? null,
        kind: entry.kind,
        transcript: entry.transcript,
        tasks_json: JSON.stringify(entry.tasks),
        created_at: entry.createdAt,
        updated_at: updatedAt,
      }),
    )
    .execute();
}

export async function upsertCheckIn(userId: string, checkIn: CheckIn) {
  await ensureEchlySchema();
  const updatedAt = new Date().toISOString();

  await database.transaction().execute(async (transaction) => {
    if (checkIn.localDate) {
      await transaction
        .deleteFrom("echly_check_ins")
        .where("user_id", "=", userId)
        .where("local_date", "=", checkIn.localDate)
        .where("id", "!=", checkIn.id)
        .execute();
      await transaction
        .deleteFrom("echly_history_transcripts")
        .where("user_id", "=", userId)
        .where("local_date", "=", checkIn.localDate)
        .where("kind", "=", "reflection")
        .where("id", "!=", checkIn.id)
        .execute();
    }

    await transaction
      .insertInto("echly_check_ins")
      .values({
        user_id: userId,
        id: checkIn.id,
        local_date: checkIn.localDate ?? null,
        created_at: checkIn.createdAt,
        updated_at: updatedAt,
        payload: JSON.stringify(checkIn),
      })
      .onConflict((conflict) =>
        conflict.columns(["user_id", "id"]).doUpdateSet({
          local_date: checkIn.localDate ?? null,
          created_at: checkIn.createdAt,
          updated_at: updatedAt,
          payload: JSON.stringify(checkIn),
        }),
      )
      .execute();
  });

  await upsertHistoryTranscript(userId, {
    id: checkIn.id,
    createdAt: checkIn.createdAt,
    localDate: checkIn.localDate ?? checkIn.createdAt.slice(0, 10),
    timeZone: checkIn.timeZone,
    kind: "reflection",
    transcript: checkIn.transcript,
    tasks: checkIn.tasks,
  });
}

export async function upsertScheduleEntry(
  userId: string,
  scheduleEntry: ScheduleEntry,
) {
  await ensureEchlySchema();
  const updatedAt = new Date().toISOString();

  await database
    .insertInto("echly_schedule_entries")
    .values({
      user_id: userId,
      id: scheduleEntry.id,
      target_date: scheduleEntry.targetDate,
      created_at: scheduleEntry.createdAt,
      updated_at: updatedAt,
      payload: JSON.stringify(scheduleEntry),
    })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "id"]).doUpdateSet({
        target_date: scheduleEntry.targetDate,
        created_at: scheduleEntry.createdAt,
        updated_at: updatedAt,
        payload: JSON.stringify(scheduleEntry),
      }),
    )
    .execute();

  await upsertHistoryTranscript(userId, {
    id: scheduleEntry.id,
    createdAt: scheduleEntry.createdAt,
    localDate: scheduleEntry.localDate ?? scheduleEntry.createdAt.slice(0, 10),
    timeZone: scheduleEntry.timeZone,
    kind: "planning",
    transcript: scheduleEntry.transcript,
    tasks: scheduleEntry.tasks,
  });
}

export async function deleteScheduleEntry(userId: string, id: string) {
  await ensureEchlySchema();
  const result = await database
    .deleteFrom("echly_schedule_entries")
    .where("user_id", "=", userId)
    .where("id", "=", id)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

export async function upsertPlanRecord(userId: string, planRecord: PlanRecord) {
  await ensureEchlySchema();

  await database
    .insertInto("echly_plans")
    .values({
      user_id: userId,
      target_date: planRecord.targetDate,
      created_at: planRecord.createdAt,
      updated_at: planRecord.updatedAt,
      payload: JSON.stringify(planRecord),
    })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "target_date"]).doUpdateSet({
        updated_at: planRecord.updatedAt,
        payload: JSON.stringify(planRecord),
      }),
    )
    .execute();
}

export async function deletePlanRecord(userId: string, targetDate: string) {
  await ensureEchlySchema();
  const result = await database
    .deleteFrom("echly_plans")
    .where("user_id", "=", userId)
    .where("target_date", "=", targetDate)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}

export async function updateWorkspacePreferences(
  userId: string,
  saveTranscript: boolean,
) {
  await ensureEchlySchema();
  const updatedAt = new Date().toISOString();
  const value = saveTranscript ? 1 : 0;

  await database
    .insertInto("echly_user_preferences")
    .values({
      user_id: userId,
      save_transcript: value,
      updated_at: updatedAt,
    })
    .onConflict((conflict) =>
      conflict.column("user_id").doUpdateSet({
        save_transcript: value,
        updated_at: updatedAt,
      }),
    )
    .execute();
}

export async function importWorkspace(
  userId: string,
  history: CheckIn[],
  scheduleEntries: ScheduleEntry[],
) {
  for (const checkIn of [...history].reverse()) {
    await upsertCheckIn(userId, checkIn);
  }
  for (const scheduleEntry of scheduleEntries) {
    await upsertScheduleEntry(userId, scheduleEntry);
  }
}
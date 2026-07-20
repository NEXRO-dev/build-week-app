import { database, ensureEchlySchema } from "@/lib/database";
import {
  CheckInRecordSchema,
  ScheduleEntryRecordSchema,
} from "@/lib/workspace/schemas";
import type { CheckIn, ScheduleEntry } from "@/types/echly";

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

export async function loadWorkspace(userId: string) {
  await ensureEchlySchema();

  const [checkInRows, scheduleRows, preferences] = await Promise.all([
    database
      .selectFrom("echly_check_ins")
      .select("payload")
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(30)
      .execute(),
    database
      .selectFrom("echly_schedule_entries")
      .select("payload")
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(60)
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
    preferences: {
      saveTranscript: preferences ? preferences.save_transcript === 1 : true,
    },
  };
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

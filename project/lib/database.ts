import { LibsqlDialect } from "@libsql/kysely-libsql";
import { Kysely, sql } from "kysely";

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to start Echly.`);
  return value;
}

export function createLibsqlDialect() {
  return new LibsqlDialect({
    url: requiredEnv("TURSO_DATABASE_URL"),
    authToken: requiredEnv("TURSO_AUTH_TOKEN"),
  });
}

export type EchlyDatabase = {
  echly_check_ins: {
    user_id: string;
    id: string;
    local_date: string | null;
    created_at: string;
    updated_at: string;
    payload: string;
  };
  echly_schedule_entries: {
    user_id: string;
    id: string;
    target_date: string;
    created_at: string;
    updated_at: string;
    payload: string;
  };
  echly_history_transcripts: {
    user_id: string;
    id: string;
    local_date: string;
    time_zone: string | null;
    kind: "reflection" | "planning";
    transcript: string;
    tasks_json: string;
    created_at: string;
    updated_at: string;
  };
  echly_plans: {
    user_id: string;
    target_date: string;
    created_at: string;
    updated_at: string;
    payload: string;
  };
  echly_user_preferences: {
    user_id: string;
    save_transcript: number;
    updated_at: string;
  };
};

const databaseGlobal = globalThis as typeof globalThis & {
  echlyDatabase?: Kysely<EchlyDatabase>;
  echlySchemaPromise?: Promise<void>;
  echlySchemaVersion?: number;
};

// Increment whenever createEchlySchema adds or changes database objects. This
// ensures a Next.js dev server re-runs migrations after a hot reload instead of
// reusing a schema promise created by an older version of this module.
const ECHLY_SCHEMA_VERSION = 3;

export const database =
  databaseGlobal.echlyDatabase ??
  new Kysely<EchlyDatabase>({ dialect: createLibsqlDialect() });

if (process.env.NODE_ENV !== "production") {
  databaseGlobal.echlyDatabase = database;
}

export function ensureEchlySchema() {
  if (
    !databaseGlobal.echlySchemaPromise ||
    databaseGlobal.echlySchemaVersion !== ECHLY_SCHEMA_VERSION
  ) {
    const schemaPromise = createEchlySchema().catch((error) => {
      if (databaseGlobal.echlySchemaPromise === schemaPromise) {
        databaseGlobal.echlySchemaPromise = undefined;
        databaseGlobal.echlySchemaVersion = undefined;
      }
      throw error;
    });
    databaseGlobal.echlySchemaPromise = schemaPromise;
    databaseGlobal.echlySchemaVersion = ECHLY_SCHEMA_VERSION;
  }
  return databaseGlobal.echlySchemaPromise;
}

async function createEchlySchema() {
  await database.schema
    .createTable("echly_check_ins")
    .ifNotExists()
    .addColumn("user_id", "text", (column) => column.notNull())
    .addColumn("id", "text", (column) => column.notNull())
    .addColumn("local_date", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addColumn("payload", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("echly_check_ins_pk", ["user_id", "id"])
    .execute();

  await database.schema
    .createIndex("echly_check_ins_user_date_idx")
    .ifNotExists()
    .on("echly_check_ins")
    .columns(["user_id", "local_date"])
    .execute();

  await database.schema
    .createTable("echly_schedule_entries")
    .ifNotExists()
    .addColumn("user_id", "text", (column) => column.notNull())
    .addColumn("id", "text", (column) => column.notNull())
    .addColumn("target_date", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addColumn("payload", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("echly_schedule_entries_pk", ["user_id", "id"])
    .execute();

  await database.schema
    .createIndex("echly_schedule_entries_user_date_idx")
    .ifNotExists()
    .on("echly_schedule_entries")
    .columns(["user_id", "target_date"])
    .execute();

  await database.schema
    .createTable("echly_history_transcripts")
    .ifNotExists()
    .addColumn("user_id", "text", (column) => column.notNull())
    .addColumn("id", "text", (column) => column.notNull())
    .addColumn("local_date", "text", (column) => column.notNull())
    .addColumn("time_zone", "text")
    .addColumn("kind", "text", (column) => column.notNull())
    .addColumn("transcript", "text", (column) => column.notNull())
    .addColumn("tasks_json", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("echly_history_transcripts_pk", ["user_id", "id"])
    .execute();

  await database.schema
    .createIndex("echly_history_transcripts_user_date_idx")
    .ifNotExists()
    .on("echly_history_transcripts")
    .columns(["user_id", "local_date"])
    .execute();

  // Backfill the explicit history store from the existing JSON records.
  await sql`
    INSERT OR IGNORE INTO echly_history_transcripts
      (user_id, id, local_date, time_zone, kind, transcript, tasks_json, created_at, updated_at)
    SELECT
      user_id,
      id,
      COALESCE(local_date, substr(created_at, 1, 10)),
      json_extract(payload, '$.timeZone'),
      'reflection',
      COALESCE(json_extract(payload, '$.transcript'), ''),
      COALESCE(json_extract(payload, '$.tasks'), '[]'),
      created_at,
      updated_at
    FROM echly_check_ins
  `.execute(database);

  await sql`
    INSERT OR IGNORE INTO echly_history_transcripts
      (user_id, id, local_date, time_zone, kind, transcript, tasks_json, created_at, updated_at)
    SELECT
      user_id,
      id,
      COALESCE(json_extract(payload, '$.localDate'), substr(created_at, 1, 10)),
      json_extract(payload, '$.timeZone'),
      'planning',
      COALESCE(json_extract(payload, '$.transcript'), ''),
      COALESCE(json_extract(payload, '$.tasks'), '[]'),
      created_at,
      updated_at
    FROM echly_schedule_entries
  `.execute(database);

  await database.schema
    .createTable("echly_plans")
    .ifNotExists()
    .addColumn("user_id", "text", (column) => column.notNull())
    .addColumn("target_date", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addColumn("payload", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("echly_plans_pk", ["user_id", "target_date"])
    .execute();

  await database.schema
    .createIndex("echly_plans_user_date_idx")
    .ifNotExists()
    .on("echly_plans")
    .columns(["user_id", "target_date"])
    .execute();

  await database.schema
    .createTable("echly_user_preferences")
    .ifNotExists()
    .addColumn("user_id", "text", (column) => column.primaryKey())
    .addColumn("save_transcript", "integer", (column) =>
      column.notNull().defaultTo(1),
    )
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();
}

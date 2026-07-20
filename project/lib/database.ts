import { LibsqlDialect } from "@libsql/kysely-libsql";
import { Kysely } from "kysely";

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
  echly_user_preferences: {
    user_id: string;
    save_transcript: number;
    updated_at: string;
  };
};

const databaseGlobal = globalThis as typeof globalThis & {
  echlyDatabase?: Kysely<EchlyDatabase>;
  echlySchemaPromise?: Promise<void>;
};

export const database =
  databaseGlobal.echlyDatabase ??
  new Kysely<EchlyDatabase>({ dialect: createLibsqlDialect() });

if (process.env.NODE_ENV !== "production") {
  databaseGlobal.echlyDatabase = database;
}

export function ensureEchlySchema() {
  if (!databaseGlobal.echlySchemaPromise) {
    databaseGlobal.echlySchemaPromise = createEchlySchema().catch((error) => {
      databaseGlobal.echlySchemaPromise = undefined;
      throw error;
    });
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
    .createTable("echly_user_preferences")
    .ifNotExists()
    .addColumn("user_id", "text", (column) => column.primaryKey())
    .addColumn("save_transcript", "integer", (column) =>
      column.notNull().defaultTo(1),
    )
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();
}

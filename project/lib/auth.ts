import { LibsqlDialect } from "@libsql/kysely-libsql";
import { betterAuth } from "better-auth";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to start authentication.`);
  }

  return value;
}

const dialect = new LibsqlDialect({
  url: requiredEnv("TURSO_DATABASE_URL"),
  authToken: requiredEnv("TURSO_AUTH_TOKEN"),
});

export const auth = betterAuth({
  appName: "Echly",
  baseURL: requiredEnv("BETTER_AUTH_URL"),
  secret: requiredEnv("BETTER_AUTH_SECRET"),
  database: {
    dialect,
    type: "sqlite",
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  socialProviders: {
    google: {
      clientId: requiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      prompt: "select_account",
    },
  },
});

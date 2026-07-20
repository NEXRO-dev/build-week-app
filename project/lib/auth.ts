import { betterAuth } from "better-auth";

import { createLibsqlDialect, requiredEnv } from "@/lib/database";

export const auth = betterAuth({
  appName: "Echly",
  baseURL: requiredEnv("BETTER_AUTH_URL"),
  secret: requiredEnv("BETTER_AUTH_SECRET"),
  database: {
    dialect: createLibsqlDialect(),
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
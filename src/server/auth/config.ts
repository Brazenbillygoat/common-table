import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins";

import { getDatabase } from "@/server/db/client";
import { account, session, user, verification } from "@/server/db/schema";

const authSecret = process.env.BETTER_AUTH_SECRET;
const authUrl = process.env.BETTER_AUTH_URL;

if (!authSecret || authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
}

if (!authUrl) {
  throw new Error("BETTER_AUTH_URL is required.");
}

export const auth = betterAuth({
  appName: "Common Table",
  baseURL: authUrl,
  secret: authSecret,
  database: drizzleAdapter(getDatabase(), {
    provider: "pg",
    schema: {
      account,
      session,
      user,
      verification,
    },
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
  ],
});

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins";

import { resolveAuthUrl } from "@/server/auth/url";
import { getDatabase } from "@/server/db/client";
import { account, session, user, verification } from "@/server/db/schema";

const authSecret = process.env.BETTER_AUTH_SECRET;
const authUrl = resolveAuthUrl();

if (!authSecret || authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
}

if (!authUrl) {
  throw new Error("Set BETTER_AUTH_URL or expose VERCEL_PROJECT_PRODUCTION_URL on Vercel.");
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

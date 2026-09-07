import { resolveAuthUrl } from "../src/server/auth/url";

const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
const authUrl = resolveAuthUrl();

const errors: string[] = [];

if (!databaseUrl) {
  errors.push("DATABASE_URL is missing.");
} else if (databaseUrl.includes("localhost")) {
  errors.push("DATABASE_URL still points to localhost.");
}

if (!authSecret || authSecret.length < 32) {
  errors.push("BETTER_AUTH_SECRET must contain at least 32 characters.");
} else if (authSecret.startsWith("development-only-common-table")) {
  errors.push("BETTER_AUTH_SECRET still uses the development-only value.");
}

if (!authUrl) {
  errors.push("Set BETTER_AUTH_URL or expose VERCEL_PROJECT_PRODUCTION_URL on Vercel.");
} else {
  try {
    const url = new URL(authUrl);

    if (url.protocol !== "https:") {
      errors.push("The resolved authentication URL must use HTTPS in production.");
    }
  } catch {
    errors.push("The resolved authentication URL is not a valid URL.");
  }
}

if (errors.length > 0) {
  throw new Error(`Production environment validation failed:\n- ${errors.join("\n- ")}`);
}

console.log("Production environment values passed validation.");

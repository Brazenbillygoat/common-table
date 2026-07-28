const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
const authUrl = process.env.BETTER_AUTH_URL;

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
  errors.push("BETTER_AUTH_URL is missing.");
} else {
  try {
    const url = new URL(authUrl);

    if (url.protocol !== "https:") {
      errors.push("BETTER_AUTH_URL must use HTTPS in production.");
    }
  } catch {
    errors.push("BETTER_AUTH_URL is not a valid URL.");
  }
}

if (errors.length > 0) {
  throw new Error(`Production environment validation failed:\n- ${errors.join("\n- ")}`);
}

console.log("Production environment values passed validation.");

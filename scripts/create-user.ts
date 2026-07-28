import "dotenv/config";

import { auth } from "../src/server/auth/config";
import { closeDatabase } from "../src/server/db/client";

const email = process.env.NEW_USER_EMAIL;
const name = process.env.NEW_USER_NAME;
const password = process.env.NEW_USER_PASSWORD;
const role = process.env.NEW_USER_ROLE === "admin" ? "admin" : "user";

if (!email || !name || !password) {
  throw new Error(
    "NEW_USER_EMAIL, NEW_USER_NAME, and NEW_USER_PASSWORD are required. Do not store them in .env.",
  );
}

auth.api
  .createUser({
    body: {
      email,
      name,
      password,
      role,
    },
  })
  .then(({ user }) => {
    console.log(`Created ${user.email} with role ${role}.`);
  })
  .catch((error: unknown) => {
    console.error("User creation failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });

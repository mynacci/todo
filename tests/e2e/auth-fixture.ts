import { test as base, expect, type BrowserContext } from "@playwright/test";
import mongoose from "mongoose";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { User } from "@/models/User";

const mongoUri = `mongodb://127.0.0.1:${Number(process.env.E2E_MONGO_PORT ?? 27118)}/todo`;
let counter = 0;

/** Inserts a User + DB Session straight into the e2e Mongo (same hashing as the app) and returns the raw cookie token. */
async function seedUser(login: string) {
  const user = await User.create({
    githubId: Date.now() * 1000 + counter++,
    login,
    avatarUrl: "",
  });
  return (await createSession(user._id)).token;
}

export async function loginContext(context: BrowserContext, baseURL: string, login: string) {
  const token = await seedUser(login);
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL }]);
  return login;
}

export const test = base.extend<{ login: string }, { mongo: void }>({
  mongo: [
    async ({}, provide) => {
      await mongoose.connect(mongoUri);
      await provide();
      await mongoose.disconnect();
    },
    { scope: "worker", auto: true },
  ],
  // Logged-in by default: `page` and `request` share this context's session cookie.
  login: async ({ context, baseURL }, provide) => {
    const login = `user${Date.now()}x${counter}`;
    await loginContext(context, baseURL!, login);
    await provide(login);
  },
  request: async ({ context, login }, provide) => {
    void login;
    await provide(context.request);
  },
});

export { expect };

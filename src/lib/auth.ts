import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type mongoose from "mongoose";
import { fail, handle } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Session } from "@/models/Session";
import { User } from "@/models/User";

export const SESSION_COOKIE = "todo_session";
export const STATE_COOKIE = "todo_oauth_state";
export const NEXT_COOKIE = "todo_oauth_next";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
export const STATE_TTL_SECONDS = 60 * 10; // 10 minutes

export interface AuthUser {
  id: mongoose.Types.ObjectId;
  login: string;
  avatarUrl: string;
}

export const sessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

/** Short-lived OAuth cookies are only sent back to /auth/github/*. */
export const oauthCookieOptions = (maxAge: number) => ({
  ...sessionCookieOptions(maxAge),
  path: "/auth/github",
});

export const randomToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** Constant-time string comparison (hashing first equalises lengths). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/**
 * Origin of the app: APP_URL when set, otherwise the request's own origin.
 * In production APP_URL is required (the request origin/Host header is not trusted).
 */
export function appOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL must be set in production (see .env.example)");
  }
  return new URL(req.url).origin;
}

export async function createSession(userId: mongoose.Types.ObjectId) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await Session.create({ userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(token: string | undefined) {
  if (!token) return 0;
  return (await Session.deleteOne({ tokenHash: hashToken(token) })).deletedCount;
}

/** The user behind the request's session cookie, or null. Requires a DB connection. */
async function getSessionUser(req: Request): Promise<AuthUser | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  // expiresAt is checked explicitly: the TTL monitor only runs about once a minute.
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const user = await User.findById(session.userId);
  if (!user) return null;
  return { id: user._id, login: user.login, avatarUrl: user.avatarUrl ?? "" };
}

/** The session user, or a 401 UNAUTHORIZED response. */
async function requireUser(req: Request): Promise<AuthUser | Response> {
  await connectDB();
  return (
    (await getSessionUser(req)) ??
    fail("UNAUTHORIZED", "Authentication required", 401)
  );
}

/** `handle` plus authentication: unauthenticated requests get 401 before `fn` runs. */
export function authed<A extends unknown[]>(
  fn: (user: AuthUser, req: Request, ...rest: A) => Promise<Response> | Response,
) {
  return handle(async (req: Request, ...rest: A) => {
    const user = await requireUser(req);
    if (user instanceof Response) return user;
    return fn(user, req, ...rest);
  });
}

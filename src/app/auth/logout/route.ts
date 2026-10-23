import { NextResponse } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { SESSION_COOKIE, appOrigin, deleteSession, readCookie, sessionCookieOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";

async function logout<R extends NextResponse>(req: Request, res: R): Promise<R> {
  await connectDB();
  await deleteSession(readCookie(req, SESSION_COOKIE));
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  res.headers.set("Cache-Control", "no-store");
  return res;
}

const originOf = (value: string | null) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const forbidden = () => fail("FORBIDDEN", "Cross-site logout request rejected", 403);

/** appOrigin() throws in production without APP_URL; report that as a config error. */
function originOrConfigError(req: Request): string | Response {
  try {
    return appOrigin(req);
  } catch {
    return fail("CONFIG", "APP_URL must be set in production", 500);
  }
}

/**
 * POST /auth/logout -> 200 { data: { loggedOut: true } }.
 * The session cookie is SameSite=Lax, so browsers never attach it to cross-site POSTs;
 * an Origin header from another site is rejected as well.
 */
export const POST = handle(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin) {
    const app = originOrConfigError(req);
    if (typeof app !== "string") return app;
    if (origin !== app) return forbidden();
  }
  return logout(req, ok({ loggedOut: true }));
});

/**
 * GET /auth/logout (convenience link) -> 302 to "/".
 * Lax cookies ARE sent on cross-site top-level GET navigations, so GET only logs out
 * when the browser marks the request same-origin (Sec-Fetch-Site), or, for clients
 * that do not send it, when the Referer is this app. Anything else gets 403.
 */
export const GET = handle(async (req: Request) => {
  const app = originOrConfigError(req);
  if (typeof app !== "string") return app;
  const site = req.headers.get("sec-fetch-site");
  const sameOrigin = site
    ? site === "same-origin"
    : originOf(req.headers.get("referer")) === app;
  if (!sameOrigin) return forbidden();
  return logout(req, NextResponse.redirect(new URL("/", app), 302));
});

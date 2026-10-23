import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import {
  NEXT_COOKIE,
  STATE_COOKIE,
  STATE_TTL_SECONDS,
  oauthCookieOptions,
  randomToken,
} from "@/lib/auth";
import { GITHUB_AUTHORIZE_URL, callbackUrl, githubConfig } from "@/lib/github";
import { safeNextPath } from "@/lib/safe-next";

/** Starts the GitHub OAuth flow. Optional `?next=/path` (same-origin path only) is where to land after login. */
export const GET = handle(async (req: Request) => {
  const cfg = githubConfig();
  if (cfg instanceof Response) return cfg;

  const state = randomToken();
  const next = safeNextPath(new URL(req.url).searchParams.get("next"));
  const authorize = new URL(GITHUB_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", callbackUrl(req));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "true");

  const res = NextResponse.redirect(authorize, 302);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(STATE_COOKIE, state, oauthCookieOptions(STATE_TTL_SECONDS));
  res.cookies.set(NEXT_COOKIE, next, oauthCookieOptions(STATE_TTL_SECONDS));
  return res;
});

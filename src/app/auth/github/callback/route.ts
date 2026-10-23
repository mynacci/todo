import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import {
  NEXT_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  STATE_COOKIE,
  appOrigin,
  createSession,
  deleteSession,
  oauthCookieOptions,
  readCookie,
  safeEqual,
  sessionCookieOptions,
} from "@/lib/auth";
import { connectDB } from "@/lib/db";
import {
  GitHubError,
  callbackUrl,
  exchangeCode,
  fetchGitHubUser,
  githubConfig,
} from "@/lib/github";
import { safeNextPath } from "@/lib/safe-next";
import { User } from "@/models/User";

/** The one-time OAuth cookies are cleared on every callback outcome. */
function clearOAuthCookies<R extends NextResponse>(res: R): R {
  res.cookies.set(STATE_COOKIE, "", oauthCookieOptions(0));
  res.cookies.set(NEXT_COOKIE, "", oauthCookieOptions(0));
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Top-level browser navigation: send the user back to the login page with an error code. */
const reject = (req: Request, code: string) =>
  clearOAuthCookies(
    NextResponse.redirect(new URL(`/login?error=${code}`, appOrigin(req)), 302),
  );

const isDuplicateKey = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;

export const GET = handle(async (req: Request) => {
  const cfg = githubConfig();
  if (cfg instanceof Response) return cfg;

  const params = new URL(req.url).searchParams;
  const state = params.get("state");
  const expected = readCookie(req, STATE_COOKIE);
  if (!state || !expected || !safeEqual(state, expected)) {
    return reject(req, "OAUTH_STATE");
  }
  if (params.get("error")) return reject(req, "OAUTH_DENIED");
  const code = params.get("code");
  if (!code) return reject(req, "OAUTH_CODE");

  let profile: Awaited<ReturnType<typeof fetchGitHubUser>>;
  try {
    const token = await exchangeCode(cfg, code, callbackUrl(req));
    profile = await fetchGitHubUser(token);
  } catch (err) {
    if (err instanceof GitHubError) {
      console.error(`[auth] ${err.message}`);
      return reject(req, "OAUTH_GITHUB");
    }
    throw err;
  }

  await connectDB();
  const upsert = () =>
    User.findOneAndUpdate(
      { githubId: profile.githubId },
      { $set: { login: profile.login, avatarUrl: profile.avatarUrl } },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
    );
  let user;
  try {
    user = await upsert();
  } catch (err) {
    // Concurrent first logins can both try to insert: retry once, the user now exists.
    if (!isDuplicateKey(err)) throw err;
    user = await upsert();
  }
  // Never reuse a pre-existing session token across a login (session fixation).
  await deleteSession(readCookie(req, SESSION_COOKIE));
  const session = await createSession(user._id);

  const next = safeNextPath(readCookie(req, NEXT_COOKIE));
  const res = clearOAuthCookies(NextResponse.redirect(new URL(next, appOrigin(req)), 302));
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(SESSION_TTL_SECONDS));
  return res;
});

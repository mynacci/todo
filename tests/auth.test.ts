import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as login from "@/app/auth/github/route";
import * as callback from "@/app/auth/github/callback/route";
import * as logout from "@/app/auth/logout/route";
import * as me from "@/app/api/me/route";
import {
  NEXT_COOKIE,
  SESSION_COOKIE,
  STATE_COOKIE,
  appOrigin,
  hashToken,
  safeEqual,
  sessionCookieOptions,
} from "@/lib/auth";
import { GITHUB_TOKEN_URL, GITHUB_USER_URL } from "@/lib/github";
import { safeNextPath } from "@/lib/safe-next";
import { Session } from "@/models/Session";
import { User } from "@/models/User";
import { createTestUser } from "./helpers/auth";
import { clearTestDB, startTestDB, stopTestDB } from "./helpers/db";

const APP = "http://app.test";
const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";

function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`${APP}${path}`, { headers });
}
const cookieHeader = (c: Record<string, string>) =>
  Object.entries(c)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");

/** name -> raw Set-Cookie string */
function setCookies(res: Response): Record<string, string> {
  return Object.fromEntries(
    res.headers.getSetCookie().map((c) => [c.slice(0, c.indexOf("=")), c]),
  );
}
const cookieValue = (setCookie: string) =>
  decodeURIComponent(setCookie.slice(setCookie.indexOf("=") + 1).split(";")[0]);

async function json(res: Response) {
  return (await res.json()) as { data?: any; error?: { code: string; message: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;
let fetchMock: FetchMock;

/** Mocks GitHub's token + user endpoints. */
function mockGitHub({
  token = { access_token: "gho_test" } as unknown,
  tokenStatus = 200,
  user = { id: 4242, login: "octocat", avatar_url: "https://avatars.example/octo.png" } as unknown,
  userStatus = 200,
} = {}) {
  fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === GITHUB_TOKEN_URL) return Response.json(token, { status: tokenStatus });
    if (url === GITHUB_USER_URL) return Response.json(user, { status: userStatus });
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function callbackReq(
  query: string,
  cookies: Record<string, string> = { [STATE_COOKIE]: "s-123", [NEXT_COOKIE]: "/weeks" },
) {
  return get(`/auth/github/callback${query}`, { cookie: cookieHeader(cookies) });
}

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(async () => {
  await clearTestDB();
  vi.stubEnv("GITHUB_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GITHUB_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("APP_URL", APP);
  mockGitHub();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** 302 to /login?error=CODE, OAuth cookies cleared, no session issued. */
function expectLoginError(res: Response, code: string) {
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe(`${APP}/login?error=${code}`);
  const c = setCookies(res);
  expect(c[STATE_COOKIE]).toMatch(/Max-Age=0/);
  expect(c[NEXT_COOKIE]).toMatch(/Max-Age=0/);
  expect(c[SESSION_COOKIE]).toBeUndefined();
}

describe("GET /auth/github", () => {
  it("redirects to GitHub with a random state stored in an httpOnly cookie", async () => {
    const res = await login.GET(get("/auth/github?next=/goals"));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(loc.searchParams.get("redirect_uri")).toBe(`${APP}/auth/github/callback`);
    expect(res.headers.get("location")).not.toContain(CLIENT_SECRET);

    const state = loc.searchParams.get("state")!;
    expect(state.length).toBeGreaterThanOrEqual(40);
    const c = setCookies(res);
    expect(cookieValue(c[STATE_COOKIE])).toBe(state);
    expect(c[STATE_COOKIE]).toMatch(/HttpOnly/i);
    expect(c[STATE_COOKIE]).toMatch(/SameSite=lax/i);
    expect(c[STATE_COOKIE]).toMatch(/Path=\/auth\/github/);
    expect(c[STATE_COOKIE]).toMatch(/Max-Age=600/);
    expect(cookieValue(c[NEXT_COOKIE])).toBe("/goals");

    const again = new URL((await login.GET(get("/auth/github"))).headers.get("location")!);
    expect(again.searchParams.get("state")).not.toBe(state);
  });

  it("never stores an off-site redirect target", async () => {
    for (const next of ["//evil.example", "https://evil.example/x", "/\\evil.example", "evil"]) {
      const res = await login.GET(get(`/auth/github?next=${encodeURIComponent(next)}`));
      expect(cookieValue(setCookies(res)[NEXT_COOKIE])).toBe("/");
    }
  });

  it("fails clearly when the client id or secret is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    const res = await login.GET(get("/auth/github"));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error?.code).toBe("CONFIG");
    expect(body.error?.message).toContain("GITHUB_CLIENT_SECRET");
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    expect((await json(await callback.GET(callbackReq("?code=c&state=s-123")))).error?.message).toContain(
      "GITHUB_CLIENT_ID",
    );
    vi.mocked(console.error).mockRestore();
  });
});

describe("GET /auth/github/callback", () => {
  it("exchanges the code, upserts the user and starts a hashed server-side session", async () => {
    const res = await callback.GET(callbackReq("?code=abc&state=s-123"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/weeks`);

    // token exchange: secret only sent to GitHub's token endpoint, in the POST body
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe(GITHUB_TOKEN_URL);
    expect(tokenInit?.method).toBe("POST");
    expect(JSON.parse(String(tokenInit?.body))).toEqual({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: "abc",
      redirect_uri: `${APP}/auth/github/callback`,
    });
    const [userUrl, userInit] = fetchMock.mock.calls[1];
    expect(userUrl).toBe(GITHUB_USER_URL);
    expect(new Headers(userInit?.headers).get("authorization")).toBe("Bearer gho_test");

    const users = await User.find();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      githubId: 4242,
      login: "octocat",
      avatarUrl: "https://avatars.example/octo.png",
    });

    const c = setCookies(res);
    const token = cookieValue(c[SESSION_COOKIE]);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(c[SESSION_COOKIE]).toMatch(/HttpOnly/i);
    expect(c[SESSION_COOKIE]).toMatch(/SameSite=lax/i);
    expect(c[SESSION_COOKIE]).toMatch(/Path=\/(;|$)/);
    expect(c[SESSION_COOKIE]).not.toMatch(/Secure/i); // NODE_ENV=test
    // one-time OAuth cookies are cleared
    expect(c[STATE_COOKIE]).toMatch(/Max-Age=0/);
    expect(c[NEXT_COOKIE]).toMatch(/Max-Age=0/);

    const sessions = await Session.find();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(hashToken(token));
    expect(sessions[0].tokenHash).not.toContain(token);
    expect(String(sessions[0].userId)).toBe(String(users[0]._id));
    expect(sessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    const who = await me.GET(get("/api/me", { cookie: `${SESSION_COOKIE}=${token}` }));
    expect(who.status).toBe(200);
    expect((await json(who)).data).toEqual({
      login: "octocat",
      avatarUrl: "https://avatars.example/octo.png",
    });
  });

  it("updates the same user on a later login (githubId is unique)", async () => {
    await callback.GET(callbackReq("?code=a&state=s-123"));
    mockGitHub({ user: { id: 4242, login: "renamed", avatar_url: "https://avatars.example/new.png" } });
    const res = await callback.GET(callbackReq("?code=b&state=s-123", { [STATE_COOKIE]: "s-123" }));
    expect(res.headers.get("location")).toBe(`${APP}/`);
    const users = await User.find();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ login: "renamed", avatarUrl: "https://avatars.example/new.png" });
  });

  it("replaces a pre-existing session cookie instead of reusing it", async () => {
    const { cookie, token } = await createTestUser("old");
    const res = await callback.GET(
      callbackReq("?code=a&state=s-123", { [STATE_COOKIE]: "s-123", [SESSION_COOKIE]: token }),
    );
    expect(res.status).toBe(302);
    expect(await Session.exists({ tokenHash: hashToken(token) })).toBeNull();
    expect((await me.GET(get("/api/me", { cookie }))).status).toBe(401);
  });

  it("retries the upsert once on a duplicate-key error (concurrent first login)", async () => {
    const spy = vi
      .spyOn(User, "findOneAndUpdate")
      .mockImplementationOnce((() => {
        throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
      }) as unknown as typeof User.findOneAndUpdate);
    const res = await callback.GET(callbackReq("?code=abc&state=s-123"));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/weeks`);
    expect(await User.countDocuments()).toBe(1);
    expect(await Session.countDocuments()).toBe(1);
    spy.mockRestore();
  });

  it("does not retry other upsert errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const spy = vi
      .spyOn(User, "findOneAndUpdate")
      .mockImplementation((() => {
        throw Object.assign(new Error("boom"), { code: 1 });
      }) as unknown as typeof User.findOneAndUpdate);
    const res = await callback.GET(callbackReq("?code=abc&state=s-123"));
    expect(res.status).toBe(500);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    vi.mocked(console.error).mockRestore();
  });

  it("rejects a mismatched or missing state without calling GitHub", async () => {
    const cases = [
      callbackReq("?code=abc&state=other"),
      callbackReq("?code=abc"),
      callbackReq("?code=abc&state=s-123", {}),
      callbackReq("?code=abc&state=", { [STATE_COOKIE]: "" }),
    ];
    for (const r of cases) {
      const res = await callback.GET(r);
      expectLoginError(res, "OAUTH_STATE");
      expect(setCookies(res)[SESSION_COOKIE]).toBeUndefined();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await User.countDocuments()).toBe(0);
    expect(await Session.countDocuments()).toBe(0);
  });

  it("rejects a denied authorization or a missing code", async () => {
    const denied = await callback.GET(callbackReq("?error=access_denied&state=s-123"));
    expectLoginError(denied, "OAUTH_DENIED");
    const noCode = await callback.GET(callbackReq("?state=s-123"));
    expectLoginError(noCode, "OAUTH_CODE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects to /login?error=OAUTH_GITHUB and creates nothing when GitHub fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const scenarios: Array<() => void> = [
      () => mockGitHub({ token: { error: "bad_verification_code" } }),
      () => mockGitHub({ tokenStatus: 500 }),
      () => mockGitHub({ userStatus: 401, user: { message: "Bad credentials" } }),
      () => mockGitHub({ user: { login: "no-id" } }),
      () => {
        fetchMock = vi.fn<typeof fetch>(async () => {
          throw new TypeError("network down");
        });
        vi.stubGlobal("fetch", fetchMock);
      },
    ];
    for (const setup of scenarios) {
      setup();
      const res = await callback.GET(callbackReq("?code=abc&state=s-123"));
      expectLoginError(res, "OAUTH_GITHUB");
      expect(res.headers.get("location")).not.toContain(CLIENT_SECRET);
    }
    expect(await User.countDocuments()).toBe(0);
    expect(await Session.countDocuments()).toBe(0);
    spy.mockRestore();
  });
});

describe("sessions and logout", () => {
  it("POST /auth/logout deletes the DB session and expires the cookie; the token is then invalid", async () => {
    const { cookie, token } = await createTestUser();
    expect((await me.GET(get("/api/me", { cookie }))).status).toBe(200);

    const res = await logout.POST(
      new Request(`${APP}/auth/logout`, { method: "POST", headers: { cookie, origin: APP } }),
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ loggedOut: true });
    const c = setCookies(res)[SESSION_COOKIE];
    expect(cookieValue(c)).toBe("");
    expect(c).toMatch(/Max-Age=0/);
    expect(c).toMatch(/HttpOnly/i);
    expect(await Session.exists({ tokenHash: hashToken(token) })).toBeNull();

    const after = await me.GET(get("/api/me", { cookie }));
    expect(after.status).toBe(401);
    expect((await json(after)).error?.code).toBe("UNAUTHORIZED");
  });

  it("logout only removes the caller's session", async () => {
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    await logout.POST(new Request(`${APP}/auth/logout`, { method: "POST", headers: { cookie: a.cookie } }));
    expect((await me.GET(get("/api/me", { cookie: a.cookie }))).status).toBe(401);
    expect((await me.GET(get("/api/me", { cookie: b.cookie }))).status).toBe(200);
  });

  it("rejects cross-site logout attempts and keeps the session", async () => {
    const { cookie } = await createTestUser();
    const post = await logout.POST(
      new Request(`${APP}/auth/logout`, { method: "POST", headers: { cookie, origin: "https://evil.example" } }),
    );
    expect(post.status).toBe(403);
    for (const headers of [
      { cookie, "sec-fetch-site": "cross-site" } as Record<string, string>,
      { cookie, "sec-fetch-site": "same-site" },
      { cookie, referer: "https://evil.example/page" },
      { cookie },
    ]) {
      expect((await logout.GET(get("/auth/logout", headers))).status).toBe(403);
    }
    expect((await me.GET(get("/api/me", { cookie }))).status).toBe(200);
  });

  it("GET /auth/logout works for same-origin navigations", async () => {
    const { cookie } = await createTestUser();
    const res = await logout.GET(get("/auth/logout", { cookie, "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/`);
    expect(setCookies(res)[SESSION_COOKIE]).toMatch(/Max-Age=0/);
    expect((await me.GET(get("/api/me", { cookie }))).status).toBe(401);

    const legacy = await createTestUser("legacy");
    const viaReferer = await logout.GET(get("/auth/logout", { cookie: legacy.cookie, referer: `${APP}/board` }));
    expect(viaReferer.status).toBe(302);
    expect((await me.GET(get("/api/me", { cookie: legacy.cookie }))).status).toBe(401);
  });

  it("treats expired, unknown and malformed session cookies as unauthenticated", async () => {
    const { cookie, token } = await createTestUser();
    await Session.updateOne({ tokenHash: hashToken(token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await me.GET(get("/api/me", { cookie }))).status).toBe(401);
    for (const c of [`${SESSION_COOKIE}=nope`, `${SESSION_COOKIE}=`, "other=1", `${SESSION_COOKIE}=%E0%A4%A`]) {
      expect((await me.GET(get("/api/me", { cookie: c }))).status).toBe(401);
    }
    expect((await me.GET(get("/api/me"))).status).toBe(401);
  });

  it("fails closed in production when APP_URL is unset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(() => appOrigin(get("/x"))).toThrow(/APP_URL/);
    for (const res of [await login.GET(get("/auth/github")), await callback.GET(callbackReq("?code=c&state=s-123"))]) {
      expect(res.status).toBe(500);
      const body = await json(res);
      expect(body.error?.code).toBe("CONFIG");
      expect(body.error?.message).toContain("APP_URL");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "development");
    expect(appOrigin(get("/x"))).toBe(APP);
    vi.mocked(console.error).mockRestore();
  });

  it("reports a CONFIG error from logout in production without APP_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    const post = await logout.POST(
      new Request(`${APP}/auth/logout`, { method: "POST", headers: { origin: APP } }),
    );
    expect(post.status).toBe(500);
    expect((await json(post)).error?.code).toBe("CONFIG");
    const getRes = await logout.GET(get("/auth/logout", { "sec-fetch-site": "same-origin" }));
    expect(getRes.status).toBe(500);
    expect((await json(getRes)).error?.code).toBe("CONFIG");
    vi.stubEnv("NODE_ENV", "development");
  });

  it("marks cookies Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions(1).secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions(1).secure).toBe(false);
  });
});

describe("auth helpers", () => {
  it("safeNextPath only allows same-origin paths", () => {
    expect(safeNextPath("/board?weekId=1#x")).toBe("/board?weekId=1#x");
    for (const bad of [null, "", "board", "//evil.example", "/\\evil.example", "https://evil.example", "/\t/evil.example"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });

  it("safeEqual compares strings of any length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

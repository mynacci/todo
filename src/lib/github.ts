import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { fail } from "@/lib/api";
import { appOrigin } from "@/lib/auth";

export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";
const TIMEOUT_MS = 10_000;

export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
}

/** Reads the OAuth App credentials from the environment, or a 500 CONFIG response naming what is missing. */
export function githubConfig(): GitHubConfig | Response {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  const missing = [
    !clientId && "GITHUB_CLIENT_ID",
    !clientSecret && "GITHUB_CLIENT_SECRET",
    process.env.NODE_ENV === "production" && !process.env.APP_URL?.trim() && "APP_URL",
  ].filter(Boolean);
  if (missing.length > 0) {
    const message = `GitHub OAuth is not configured: set ${missing.join(" and ")} (see .env.example)`;
    console.error(message);
    return fail("CONFIG", message, 500);
  }
  return { clientId: clientId!, clientSecret: clientSecret! };
}

export const callbackUrl = (req: Request) => `${appOrigin(req)}/auth/github/callback`;

export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

const tokenResponse = z.object({ access_token: z.string().min(1) });
const userResponse = z.object({
  id: z.number().int(),
  login: z.string().min(1),
  avatar_url: z.string().nullish(),
});

async function readJsonBody(res: Response, what: string): Promise<unknown> {
  if (!res.ok) throw new GitHubError(`${what} failed with HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new GitHubError(`${what} returned invalid JSON`);
  }
}

/** Exchanges an authorization code for an access token. */
export async function exchangeCode(
  cfg: GitHubConfig,
  code: string,
  redirectUri: string,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    unstable_rethrow(err);
    throw new GitHubError("Could not reach GitHub token endpoint");
  }
  const body = await readJsonBody(res, "Token exchange");
  const parsed = tokenResponse.safeParse(body);
  if (!parsed.success) {
    // GitHub reports errors (bad_verification_code, ...) with HTTP 200 and an `error` field.
    const err = (body as { error?: unknown } | null)?.error;
    throw new GitHubError(
      `Token exchange rejected${typeof err === "string" ? `: ${err}` : ""}`,
    );
  }
  return parsed.data.access_token;
}

/** Fetches the authenticated GitHub user's id, login and avatar. */
export async function fetchGitHubUser(accessToken: string) {
  let res: Response;
  try {
    res = await fetch(GITHUB_USER_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "todo-app",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    unstable_rethrow(err);
    throw new GitHubError("Could not reach GitHub user API");
  }
  const parsed = userResponse.safeParse(await readJsonBody(res, "User lookup"));
  if (!parsed.success) throw new GitHubError("User lookup returned an unexpected shape");
  return {
    githubId: parsed.data.id,
    login: parsed.data.login,
    avatarUrl: parsed.data.avatar_url ?? "",
  };
}

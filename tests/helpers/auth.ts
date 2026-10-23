import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { User } from "@/models/User";

let nextGithubId = 1000;

/** Creates a user plus a live DB session; returns the Cookie header value that authenticates as them. */
export async function createTestUser(login = "alice") {
  const user = await User.create({
    githubId: nextGithubId++,
    login,
    avatarUrl: `https://avatars.example/${login}.png`,
  });
  const { token } = await createSession(user._id);
  return { user, token, cookie: `${SESSION_COOKIE}=${token}` };
}

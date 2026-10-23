import { ok } from "@/lib/api";
import { authed } from "@/lib/auth";

export const GET = authed(async (user) =>
  ok({ login: user.login, avatarUrl: user.avatarUrl }),
);

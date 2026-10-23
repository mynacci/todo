import { ok } from "@/lib/api";
import { authed } from "@/lib/auth";
import { countsByWeek, sumCounts, withProgress } from "@/lib/progress";
import { readJson } from "@/lib/route-utils";
import { goalCreate } from "@/lib/schemas";
import { serializeGoal } from "@/lib/serialize";
import { Goal } from "@/models/Goal";
import { Week } from "@/models/Week";

export const GET = authed(async (user) => {
  const userId = user.id;
  const goals = await Goal.find({ userId }).sort({ year: -1, createdAt: 1 });
  const weeks = await Week.find({ userId, goalId: { $in: goals.map((g) => g._id) } });
  const counts = await countsByWeek(userId, weeks.map((w) => w._id));
  return ok(
    goals.map((g) => {
      const mine = weeks.filter((w) => String(w.goalId) === String(g._id));
      return {
        ...serializeGoal(g),
        weekCount: mine.length,
        ...withProgress(sumCounts(mine.map((w) => counts.get(String(w._id))!))),
      };
    }),
  );
});

export const POST = authed(async (user, req: Request) => {
  const input = goalCreate.parse(await readJson(req));
  const goal = await Goal.create({ ...input, userId: user.id });
  return ok(
    { ...serializeGoal(goal), weekCount: 0, ...withProgress({ done: 0, total: 0 }) },
    201,
  );
});

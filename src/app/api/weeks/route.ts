import { z } from "zod";
import { ok } from "@/lib/api";
import { authed } from "@/lib/auth";
import { countsByWeek, withProgress } from "@/lib/progress";
import { notFound, readJson } from "@/lib/route-utils";
import { objectId, weekCreate, ymd } from "@/lib/schemas";
import { serializeWeek } from "@/lib/serialize";
import { Goal } from "@/models/Goal";
import { Week } from "@/models/Week";

const listQuery = z.object({
  goalId: objectId.optional(),
  from: ymd.optional(),
  to: ymd.optional(),
});

export const GET = authed(async (user, req: Request) => {
  const q = listQuery.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const filter: Record<string, unknown> = { userId: user.id };
  if (q.goalId) filter.goalId = q.goalId;
  // weeks overlapping [from, to]
  if (q.from) filter.endDate = { $gte: q.from };
  if (q.to) filter.startDate = { $lte: q.to };
  const weeks = await Week.find(filter).sort({ startDate: 1 });
  const counts = await countsByWeek(user.id, weeks.map((w) => w._id));
  return ok(
    weeks.map((w) => ({
      ...serializeWeek(w),
      ...withProgress(counts.get(String(w._id))!),
    })),
  );
});

export const POST = authed(async (user, req: Request) => {
  const input = weekCreate.parse(await readJson(req));
  if (input.goalId && !(await Goal.exists({ _id: input.goalId, userId: user.id }))) {
    return notFound("Goal");
  }
  const week = await Week.create({ ...input, userId: user.id });
  return ok(
    { ...serializeWeek(week), ...withProgress({ done: 0, total: 0 }) },
    201,
  );
});

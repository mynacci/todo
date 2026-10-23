import type mongoose from "mongoose";
import { ok } from "@/lib/api";
import { authed } from "@/lib/auth";
import { countsByWeek, sumCounts, withProgress } from "@/lib/progress";
import {
  badId,
  notFound,
  parseChildren,
  readJson,
  type IdCtx,
} from "@/lib/route-utils";
import { goalUpdate } from "@/lib/schemas";
import { serializeGoal, serializeWeek } from "@/lib/serialize";
import { Goal } from "@/models/Goal";
import { Todo } from "@/models/Todo";
import { Week } from "@/models/Week";

async function detail(
  userId: mongoose.Types.ObjectId,
  goal: Parameters<typeof serializeGoal>[0],
) {
  const weeks = await Week.find({ userId, goalId: goal._id }).sort({ startDate: 1 });
  const counts = await countsByWeek(userId, weeks.map((w) => w._id));
  const list = weeks.map((w) => counts.get(String(w._id))!);
  return {
    ...serializeGoal(goal),
    ...withProgress(sumCounts(list)),
    weeks: weeks.map((w, i) => ({ ...serializeWeek(w), ...withProgress(list[i]) })),
  };
}

export const GET = authed(async (user, _req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const goal = await Goal.findOne({ _id: id, userId: user.id });
  if (!goal) return notFound("Goal");
  return ok(await detail(user.id, goal));
});

export const PATCH = authed(async (user, req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const input = goalUpdate.parse(await readJson(req));
  const goal = await Goal.findOneAndUpdate({ _id: id, userId: user.id }, input, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!goal) return notFound("Goal");
  return ok(await detail(user.id, goal));
});

export const DELETE = authed(async (user, req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const children = parseChildren(req);
  const userId = user.id;
  const goal = await Goal.findOne({ _id: id, userId });
  if (!goal) return notFound("Goal");
  const weeks = await Week.find({ userId, goalId: id }, { _id: 1 });
  let deletedTodos = 0;
  if (children === "cascade") {
    const r = await Todo.deleteMany({ userId, weekId: { $in: weeks.map((w) => w._id) } });
    deletedTodos = r.deletedCount;
    await Week.deleteMany({ userId, _id: { $in: weeks.map((w) => w._id) } });
    await Week.updateMany({ userId, goalId: id }, { $set: { goalId: null } });
  } else {
    await Week.updateMany({ userId, goalId: id }, { $set: { goalId: null } });
  }
  await Goal.deleteOne({ _id: id, userId });
  return ok({
    id,
    children,
    affectedWeeks: weeks.length,
    deletedTodos,
  });
});

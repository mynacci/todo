import type mongoose from "mongoose";
import { fail, ok } from "@/lib/api";
import { authed } from "@/lib/auth";
import { countsByWeek, withProgress } from "@/lib/progress";
import {
  badId,
  notFound,
  parseChildren,
  readJson,
  type IdCtx,
} from "@/lib/route-utils";
import { weekUpdate } from "@/lib/schemas";
import { serializeWeek } from "@/lib/serialize";
import { Goal } from "@/models/Goal";
import { Todo } from "@/models/Todo";
import { Week } from "@/models/Week";

async function detail(
  userId: mongoose.Types.ObjectId,
  week: Parameters<typeof serializeWeek>[0],
) {
  const counts = await countsByWeek(userId, [week._id]);
  return {
    ...serializeWeek(week),
    ...withProgress(counts.get(String(week._id))!),
  };
}

export const GET = authed(async (user, _req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const week = await Week.findOne({ _id: id, userId: user.id });
  if (!week) return notFound("Week");
  return ok(await detail(user.id, week));
});

export const PATCH = authed(async (user, req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const input = weekUpdate.parse(await readJson(req));
  const current = await Week.findOne({ _id: id, userId: user.id });
  if (!current) return notFound("Week");
  const startDate = input.startDate ?? current.startDate;
  const endDate = input.endDate ?? current.endDate;
  if (endDate < startDate) {
    return fail("VALIDATION", "endDate: must not be before startDate", 400);
  }
  if (input.goalId && !(await Goal.exists({ _id: input.goalId, userId: user.id }))) {
    return notFound("Goal");
  }
  const week = await Week.findOneAndUpdate({ _id: id, userId: user.id }, input, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!week) return notFound("Week");
  return ok(await detail(user.id, week));
});

export const DELETE = authed(async (user, req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const children = parseChildren(req);
  const userId = user.id;
  const week = await Week.findOne({ _id: id, userId });
  if (!week) return notFound("Week");
  let affectedTodos = 0;
  if (children === "cascade") {
    affectedTodos = (await Todo.deleteMany({ userId, weekId: id })).deletedCount;
  } else {
    affectedTodos = (
      await Todo.updateMany({ userId, weekId: id }, { $set: { weekId: null } })
    ).modifiedCount;
  }
  await Week.deleteOne({ _id: id, userId });
  return ok({ id, children, affectedTodos });
});

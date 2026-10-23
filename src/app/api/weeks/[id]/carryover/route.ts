import { ok } from "@/lib/api";
import { authed } from "@/lib/auth";
import { addDays } from "@/lib/dates";
import { badId, notFound, type IdCtx } from "@/lib/route-utils";
import { serializeWeek } from "@/lib/serialize";
import { Todo } from "@/models/Todo";
import { Week } from "@/models/Week";

export const POST = authed(async (user, _req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const userId = user.id;
  const week = await Week.findOne({ _id: id, userId });
  if (!week) return notFound("Week");

  const pending = await Todo.countDocuments({
    userId,
    weekId: id,
    status: { $ne: "done" },
  });
  if (pending === 0) {
    const next = await Week.findOne({
      userId,
      startDate: addDays(week.startDate, 7),
      goalId: week.goalId ?? null,
    });
    return ok({ moved: 0, nextWeek: next ? serializeWeek(next) : null });
  }

  const startDate = addDays(week.startDate, 7);
  const goalId = week.goalId ?? null;
  const next =
    (await Week.findOne({ userId, startDate, goalId })) ??
    (await Week.create({
      title: `${week.title} (이월)`,
      startDate,
      endDate: addDays(week.endDate, 7),
      goalId,
      userId,
    }));

  const res = await Todo.updateMany(
    { userId, weekId: id, status: { $ne: "done" } },
    { $set: { weekId: next._id } },
  );
  return ok({ moved: res.modifiedCount, nextWeek: serializeWeek(next) });
});

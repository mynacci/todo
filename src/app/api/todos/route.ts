import { z } from "zod";
import { ok } from "@/lib/api";
import { authed } from "@/lib/auth";
import { notFound, readJson } from "@/lib/route-utils";
import { objectId, todoCreate, TODO_STATUS, ymd } from "@/lib/schemas";
import { serializeTodo } from "@/lib/serialize";
import { Todo } from "@/models/Todo";
import { Week } from "@/models/Week";

const listQuery = z.object({
  q: z.string().optional(),
  status: TODO_STATUS.optional(),
  weekId: objectId.optional(),
  goalId: objectId.optional(),
  date: ymd.optional(),
  sort: z.enum(["date", "-date"]).optional(),
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const GET = authed(async (user, req: Request) => {
  const q = listQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const filter: Record<string, unknown> = { userId: user.id };
  if (q.q?.trim()) {
    filter.title = { $regex: escapeRegex(q.q.trim()), $options: "i" };
  }
  if (q.status) filter.status = q.status;
  if (q.date) filter.date = q.date;
  if (q.goalId) {
    const weeks = await Week.find({ userId: user.id, goalId: q.goalId }, { _id: 1 });
    const ids = weeks.map((w) => String(w._id));
    if (q.weekId && !ids.includes(q.weekId.toLowerCase())) {
      return ok([]);
    }
    filter.weekId = q.weekId ? q.weekId : { $in: ids };
  } else if (q.weekId) {
    filter.weekId = q.weekId;
  }
  const sort: Record<string, 1 | -1> =
    q.sort === "date"
      ? ({ date: 1, order: 1, createdAt: 1 })
      : q.sort === "-date"
        ? ({ date: -1, order: 1, createdAt: 1 })
        : ({ order: 1, createdAt: 1 });
  const todos = await Todo.find(filter).sort(sort);
  return ok(todos.map((t) => serializeTodo(t)));
});

export const POST = authed(async (user, req: Request) => {
  const input = todoCreate.parse(await readJson(req));
  if (input.weekId && !(await Week.exists({ _id: input.weekId, userId: user.id }))) {
    return notFound("Week");
  }
  if (input.order === undefined) {
    const last = await Todo.findOne({
      userId: user.id,
      weekId: input.weekId ?? null,
      status: input.status ?? "todo",
    }).sort({ order: -1 });
    input.order = last ? last.order + 1 : 0;
  }
  const todo = await Todo.create({ ...input, userId: user.id });
  return ok(serializeTodo(todo), 201);
});

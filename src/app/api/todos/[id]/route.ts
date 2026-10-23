import { ok } from "@/lib/api";
import { authed } from "@/lib/auth";
import { badId, notFound, readJson, type IdCtx } from "@/lib/route-utils";
import { todoUpdate } from "@/lib/schemas";
import { serializeTodo } from "@/lib/serialize";
import { Todo } from "@/models/Todo";
import { Week } from "@/models/Week";

export const GET = authed(async (user, _req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const todo = await Todo.findOne({ _id: id, userId: user.id });
  if (!todo) return notFound("Todo");
  return ok(serializeTodo(todo));
});

export const PATCH = authed(async (user, req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const input = todoUpdate.parse(await readJson(req));
  if (input.weekId && !(await Week.exists({ _id: input.weekId, userId: user.id }))) {
    return notFound("Week");
  }
  const todo = await Todo.findOneAndUpdate({ _id: id, userId: user.id }, input, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!todo) return notFound("Todo");
  return ok(serializeTodo(todo));
});

export const DELETE = authed(async (user, _req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const todo = await Todo.findOneAndDelete({ _id: id, userId: user.id });
  if (!todo) return notFound("Todo");
  return ok({ id });
});

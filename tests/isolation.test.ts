import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import * as goals from "@/app/api/goals/route";
import * as goalById from "@/app/api/goals/[id]/route";
import * as weeks from "@/app/api/weeks/route";
import * as weekById from "@/app/api/weeks/[id]/route";
import * as carryover from "@/app/api/weeks/[id]/carryover/route";
import * as retro from "@/app/api/weeks/[id]/retro/route";
import * as todos from "@/app/api/todos/route";
import * as todoById from "@/app/api/todos/[id]/route";
import * as me from "@/app/api/me/route";
import { SESSION_COOKIE } from "@/lib/auth";
import { Goal } from "@/models/Goal";
import { Todo } from "@/models/Todo";
import { Week } from "@/models/Week";
import { createTestUser } from "./helpers/auth";
import { clearTestDB, startTestDB, stopTestDB } from "./helpers/db";

type Res = { data?: any; error?: { code: string; message: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Res;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function as(cookie: string | null) {
  return (path: string, method = "GET", body?: unknown) =>
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(clearTestDB);

describe("unauthenticated requests", () => {
  it("get 401 UNAUTHORIZED on every API route and change nothing", async () => {
    const owner = as((await createTestUser("owner")).cookie);
    const g = (await json(await goals.POST(owner("/goals", "POST", { title: "G" })))).data;
    const w = (
      await json(
        await weeks.POST(owner("/weeks", "POST", { title: "W", startDate: "2025-01-06", endDate: "2025-01-12" })),
      )
    ).data;
    const t = (await json(await todos.POST(owner("/todos", "POST", { title: "T", weekId: w.id })))).data;
    const ghost = new mongoose.Types.ObjectId().toString();

    for (const cookie of [null, `${SESSION_COOKIE}=forged`, `${SESSION_COOKIE}=`]) {
      const r = as(cookie);
      const calls: Array<[string, () => Promise<Response>]> = [
        ["GET /goals", () => goals.GET(r("/goals"))],
        ["POST /goals", () => goals.POST(r("/goals", "POST", { title: "x" }))],
        ["GET /goals/:id", () => goalById.GET(r("/x"), ctx(g.id))],
        ["PATCH /goals/:id", () => goalById.PATCH(r("/x", "PATCH", { title: "x" }), ctx(g.id))],
        ["DELETE /goals/:id", () => goalById.DELETE(r("/x?children=cascade", "DELETE"), ctx(g.id))],
        ["GET /weeks", () => weeks.GET(r("/weeks"))],
        ["POST /weeks", () => weeks.POST(r("/weeks", "POST", { title: "x", startDate: "2025-01-06", endDate: "2025-01-12" }))],
        ["GET /weeks/:id", () => weekById.GET(r("/x"), ctx(w.id))],
        ["PATCH /weeks/:id", () => weekById.PATCH(r("/x", "PATCH", { title: "x" }), ctx(w.id))],
        ["DELETE /weeks/:id", () => weekById.DELETE(r("/x", "DELETE"), ctx(w.id))],
        ["POST /weeks/:id/carryover", () => carryover.POST(r("/x", "POST"), ctx(w.id))],
        ["GET /weeks/:id/retro", () => retro.GET(r("/x"), ctx(w.id))],
        ["GET /todos", () => todos.GET(r("/todos"))],
        ["POST /todos", () => todos.POST(r("/todos", "POST", { title: "x" }))],
        ["GET /todos/:id", () => todoById.GET(r("/x"), ctx(t.id))],
        ["PATCH /todos/:id", () => todoById.PATCH(r("/x", "PATCH", { status: "done" }), ctx(t.id))],
        ["DELETE /todos/:id", () => todoById.DELETE(r("/x", "DELETE"), ctx(t.id))],
        ["GET /me", () => me.GET(r("/me"))],
        // auth runs before id / body validation
        ["GET /todos/:bad", () => todoById.GET(r("/x"), ctx("not-an-id"))],
        ["POST /todos invalid", () => todos.POST(r("/todos", "POST", {}))],
        ["GET /weeks/:ghost", () => weekById.GET(r("/x"), ctx(ghost))],
      ];
      for (const [name, call] of calls) {
        const res = await call();
        expect(res.status, `${name} (${cookie})`).toBe(401);
        expect((await json(res)).error?.code, name).toBe("UNAUTHORIZED");
      }
    }
    expect(await Goal.countDocuments()).toBe(1);
    expect(await Week.countDocuments()).toBe(1);
    expect(await Todo.countDocuments()).toBe(1);
    expect(await Goal.findById(g.id)).toMatchObject({ title: "G" });
    expect(await Todo.findById(t.id)).toMatchObject({ title: "T", status: "todo" });
  });
});

describe("two-user isolation", () => {
  async function setup() {
    const ua = await createTestUser("alice");
    const ub = await createTestUser("bob");
    const A = as(ua.cookie);
    const B = as(ub.cookie);
    const g = (await json(await goals.POST(A("/goals", "POST", { title: "A goal", year: 2025 })))).data;
    const w = (
      await json(
        await weeks.POST(
          A("/weeks", "POST", { title: "A week", startDate: "2025-01-06", endDate: "2025-01-12", goalId: g.id }),
        ),
      )
    ).data;
    const t = (await json(await todos.POST(A("/todos", "POST", { title: "A todo", weekId: w.id })))).data;
    await todos.POST(A("/todos", "POST", { title: "A done", weekId: w.id, status: "done" }));
    return { ua, ub, A, B, g, w, t };
  }

  async function snapshot() {
    const pick = (docs: Array<{ toObject(): Record<string, unknown> }>) =>
      JSON.stringify(docs.map((d) => d.toObject()));
    return [
      pick(await Goal.find().sort({ _id: 1 })),
      pick(await Week.find().sort({ _id: 1 })),
      pick(await Todo.find().sort({ _id: 1 })),
    ].join("|");
  }

  it("B gets 404 on A's goal/week/todo for GET, PATCH, DELETE and A's data is unchanged", async () => {
    const { A, B, g, w, t } = await setup();
    const before = await snapshot();
    const calls: Array<[string, () => Promise<Response>]> = [
      ["GET goal", () => goalById.GET(B("/x"), ctx(g.id))],
      ["PATCH goal", () => goalById.PATCH(B("/x", "PATCH", { title: "pwned" }), ctx(g.id))],
      ["DELETE goal unlink", () => goalById.DELETE(B("/x", "DELETE"), ctx(g.id))],
      ["DELETE goal cascade", () => goalById.DELETE(B("/x?children=cascade", "DELETE"), ctx(g.id))],
      ["GET week", () => weekById.GET(B("/x"), ctx(w.id))],
      ["PATCH week", () => weekById.PATCH(B("/x", "PATCH", { title: "pwned" }), ctx(w.id))],
      ["DELETE week unlink", () => weekById.DELETE(B("/x", "DELETE"), ctx(w.id))],
      ["DELETE week cascade", () => weekById.DELETE(B("/x?children=cascade", "DELETE"), ctx(w.id))],
      ["carryover", () => carryover.POST(B("/x", "POST"), ctx(w.id))],
      ["retro", () => retro.GET(B("/x"), ctx(w.id))],
      ["GET todo", () => todoById.GET(B("/x"), ctx(t.id))],
      ["PATCH todo", () => todoById.PATCH(B("/x", "PATCH", { status: "done", title: "pwned" }), ctx(t.id))],
      ["DELETE todo", () => todoById.DELETE(B("/x", "DELETE"), ctx(t.id))],
    ];
    for (const [name, call] of calls) {
      const res = await call();
      expect(res.status, name).toBe(404);
      expect((await json(res)).error?.code, name).toBe("NOT_FOUND");
    }
    expect(await snapshot()).toBe(before);
    // A still sees everything
    expect((await json(await goalById.GET(A("/x"), ctx(g.id)))).data).toMatchObject({ title: "A goal", done: 1, total: 2 });
    expect((await json(await todoById.GET(A("/x"), ctx(t.id)))).data.title).toBe("A todo");
  });

  it("A's records never appear in B's lists or filters", async () => {
    const { A, B, g, w } = await setup();
    await goals.POST(B("/goals", "POST", { title: "B goal" }));
    const bGoals = (await json(await goals.GET(B("/goals")))).data;
    expect(bGoals.map((x: { title: string }) => x.title)).toEqual(["B goal"]);
    expect((await json(await weeks.GET(B("/weeks")))).data).toEqual([]);
    expect((await json(await weeks.GET(B(`/weeks?goalId=${g.id}`)))).data).toEqual([]);
    expect((await json(await todos.GET(B("/todos")))).data).toEqual([]);
    expect((await json(await todos.GET(B(`/todos?weekId=${w.id}`)))).data).toEqual([]);
    expect((await json(await todos.GET(B(`/todos?goalId=${g.id}`)))).data).toEqual([]);
    expect((await json(await todos.GET(B("/todos?q=A")))).data).toEqual([]);
    // and A's lists don't include B's goal
    const aGoals = (await json(await goals.GET(A("/goals")))).data;
    expect(aGoals.map((x: { title: string }) => x.title)).toEqual(["A goal"]);
    expect(aGoals[0]).toMatchObject({ weekCount: 1, done: 1, total: 2, progress: 50 });
  });

  it("B cannot link its records to A's goal or week (404, nothing written)", async () => {
    const { B, g, w } = await setup();
    const own = (await json(await todos.POST(B("/todos", "POST", { title: "B todo" })))).data;
    const ownWeek = (
      await json(await weeks.POST(B("/weeks", "POST", { title: "B week", startDate: "2025-01-06", endDate: "2025-01-12" })))
    ).data;
    const before = await snapshot();
    const calls: Array<[string, () => Promise<Response>]> = [
      ["POST todo weekId", () => todos.POST(B("/todos", "POST", { title: "x", weekId: w.id }))],
      ["PATCH todo weekId", () => todoById.PATCH(B("/x", "PATCH", { weekId: w.id }), ctx(own.id))],
      ["POST week goalId", () => weeks.POST(B("/weeks", "POST", { title: "x", startDate: "2025-01-06", endDate: "2025-01-12", goalId: g.id }))],
      ["PATCH week goalId", () => weekById.PATCH(B("/x", "PATCH", { goalId: g.id }), ctx(ownWeek.id))],
    ];
    for (const [name, call] of calls) {
      const res = await call();
      expect(res.status, name).toBe(404);
    }
    expect(await snapshot()).toBe(before);
    expect((await json(await todoById.GET(B("/x"), ctx(own.id)))).data.weekId).toBeNull();
    expect((await json(await weekById.GET(B("/x"), ctx(ownWeek.id)))).data.goalId).toBeNull();
  });

  it("B's deletes, cascades and carryover only touch B's data", async () => {
    const { ub, A, B, w } = await setup();
    const aNext = (
      await json(await weeks.POST(A("/weeks", "POST", { title: "A next", startDate: "2025-01-13", endDate: "2025-01-19" })))
    ).data;
    const bLoose = (
      await json(await weeks.POST(B("/weeks", "POST", { title: "B loose", startDate: "2025-01-06", endDate: "2025-01-12" })))
    ).data;
    await todos.POST(B("/todos", "POST", { title: "B pending", weekId: bLoose.id }));

    // carryover: A's week with the same startDate/goalId is NOT reused; B gets its own
    const out = (await json(await carryover.POST(B("/x", "POST"), ctx(bLoose.id)))).data;
    expect(out.moved).toBe(1);
    expect(out.nextWeek.id).not.toBe(aNext.id);
    const next = await Week.findById(out.nextWeek.id);
    expect(String(next?.userId)).toBe(String(ub.user._id));
    expect(await Todo.countDocuments({ weekId: aNext.id })).toBe(0);
    expect(await Todo.countDocuments({ weekId: w.id })).toBe(2);

    const bg = (await json(await goals.POST(B("/goals", "POST", { title: "B goal" })))).data;
    await weeks.POST(B("/weeks", "POST", { title: "B week", startDate: "2025-01-06", endDate: "2025-01-12", goalId: bg.id }));

    const res = await goalById.DELETE(B(`/x?children=cascade`, "DELETE"), ctx(bg.id));
    expect((await json(res)).data).toMatchObject({ affectedWeeks: 1, deletedTodos: 0 });
    expect(await Week.countDocuments({ _id: w.id })).toBe(1);
    expect(await Todo.countDocuments({ weekId: w.id })).toBe(2);
    expect(await Goal.countDocuments()).toBe(1);
  });

  it("progress only counts the owner's todos even if foreign todos reference the week", async () => {
    const { ub, A, w, g } = await setup();
    // a corrupt/foreign row pointing at A's week must not leak into A's numbers
    await Todo.create({ title: "foreign", weekId: w.id, status: "done", userId: ub.user._id });
    await Todo.create({ title: "foreign2", weekId: w.id, status: "todo", userId: ub.user._id });
    expect((await json(await weekById.GET(A("/x"), ctx(w.id)))).data).toMatchObject({ done: 1, total: 2, progress: 50 });
    expect((await json(await retro.GET(A("/x"), ctx(w.id)))).data).toEqual({ progress: 50, done: 1, total: 2 });
    expect((await json(await goalById.GET(A("/x"), ctx(g.id)))).data).toMatchObject({ done: 1, total: 2 });
    expect((await json(await weeks.GET(A("/weeks")))).data[0]).toMatchObject({ done: 1, total: 2 });
    // A's unlink only touches A's todos
    const del = await weekById.DELETE(A("/x", "DELETE"), ctx(w.id));
    expect((await json(del)).data.affectedTodos).toBe(2);
    expect(await Todo.countDocuments({ weekId: w.id })).toBe(2);
  });

  it("cascades only delete the owner's todos even if foreign todos reference the week", async () => {
    const { ub, A, w, g } = await setup();
    await Todo.create({ title: "foreign", weekId: w.id, userId: ub.user._id });
    const res = await goalById.DELETE(A("/x?children=cascade", "DELETE"), ctx(g.id));
    expect((await json(res)).data).toMatchObject({ affectedWeeks: 1, deletedTodos: 2 });
    expect(await Todo.find().then((ts) => ts.map((t) => t.title))).toEqual(["foreign"]);

    const w2 = (
      await json(await weeks.POST(A("/weeks", "POST", { title: "w2", startDate: "2025-01-06", endDate: "2025-01-12" })))
    ).data;
    await todos.POST(A("/todos", "POST", { title: "mine", weekId: w2.id }));
    await Todo.create({ title: "foreign2", weekId: w2.id, userId: ub.user._id });
    const del = await weekById.DELETE(A("/x?children=cascade", "DELETE"), ctx(w2.id));
    expect((await json(del)).data.affectedTodos).toBe(1);
    expect(await Todo.countDocuments({ title: "foreign2" })).toBe(1);
  });

  it("ignores userId in request bodies", async () => {
    const { ua, ub, A, t, g, w } = await setup();
    const bId = String(ub.user._id);
    const aId = String(ua.user._id);
    const created = [
      await goals.POST(A("/goals", "POST", { title: "g2", userId: bId })),
      await weeks.POST(A("/weeks", "POST", { title: "w2", startDate: "2025-02-03", endDate: "2025-02-09", userId: bId })),
      await todos.POST(A("/todos", "POST", { title: "t2", userId: bId })),
    ];
    for (const res of created) {
      expect(res.status).toBe(201);
      expect((await json(res)).data).not.toHaveProperty("userId");
    }
    await goalById.PATCH(A("/x", "PATCH", { userId: bId, title: "g!" }), ctx(g.id));
    await weekById.PATCH(A("/x", "PATCH", { userId: bId, title: "w!" }), ctx(w.id));
    await todoById.PATCH(A("/x", "PATCH", { userId: bId, title: "t!" }), ctx(t.id));
    for (const M of [Goal, Week, Todo] as const) {
      const owners = await (M as typeof Goal).distinct("userId");
      expect(owners.map(String)).toEqual([aId]);
    }
  });
});

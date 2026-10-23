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
import { Todo } from "@/models/Todo";
import { Week } from "@/models/Week";
import { createTestUser } from "./helpers/auth";
import { clearTestDB, startTestDB, stopTestDB } from "./helpers/db";

const URL_BASE = "http://localhost/api";
// Every request is authenticated as a fresh user created in beforeEach.
let cookie = "";

function req(path: string, method = "GET", body?: unknown) {
  return new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response) {
  return (await res.json()) as { data?: any; error?: { code: string; message: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function mkGoal(title = "Goal", year = 2025) {
  const res = await goals.POST(req("/goals", "POST", { title, year }));
  expect(res.status).toBe(201);
  return (await json(res)).data;
}
async function mkWeek(over: Record<string, unknown> = {}) {
  const res = await weeks.POST(
    req("/weeks", "POST", {
      title: "W",
      startDate: "2025-01-06",
      endDate: "2025-01-12",
      ...over,
    }),
  );
  expect(res.status).toBe(201);
  return (await json(res)).data;
}
async function mkTodo(over: Record<string, unknown> = {}) {
  const res = await todos.POST(req("/todos", "POST", { title: "T", ...over }));
  expect(res.status).toBe(201);
  return (await json(res)).data;
}
async function weekDetail(id: string) {
  return (await json(await weekById.GET(req(`/weeks/${id}`), ctx(id)))).data;
}
async function setStatus(id: string, status: string) {
  return todoById.PATCH(req(`/todos/${id}`, "PATCH", { status }), ctx(id));
}

beforeAll(async () => {
  await startTestDB();
});
afterAll(async () => {
  await stopTestDB();
});
beforeEach(async () => {
  await clearTestDB();
  ({ cookie } = await createTestUser());
});

describe("AC-1 todo creation", () => {
  it("defaults status to todo", async () => {
    const t = await mkTodo({ title: "Write" });
    expect(t.status).toBe("todo");
    expect(t.weekId).toBeNull();
    expect(t.date).toBeNull();
    expect(t.overdue).toBe(false);
  });

  it("rejects missing, empty and blank titles with 400", async () => {
    for (const body of [{}, { title: "" }, { title: "   " }]) {
      const res = await todos.POST(req("/todos", "POST", body));
      expect(res.status).toBe(400);
      expect((await json(res)).error?.code).toBe("VALIDATION");
    }
    expect(await Todo.countDocuments()).toBe(0);
  });

  it("rejects malformed JSON and bad dates", async () => {
    const bad = new Request(`${URL_BASE}/todos`, { method: "POST", body: "{", headers: { cookie } });
    expect((await todos.POST(bad)).status).toBe(400);
    const res = await todos.POST(req("/todos", "POST", { title: "x", date: "2025-13-40" }));
    expect(res.status).toBe(400);
  });

  it("verifies the week exists on create", async () => {
    const ghost = new mongoose.Types.ObjectId().toString();
    const res = await todos.POST(req("/todos", "POST", { title: "x", weekId: ghost }));
    expect(res.status).toBe(404);
    expect(await Todo.countDocuments()).toBe(0);
    const bad = await todos.POST(req("/todos", "POST", { title: "x", weekId: "nope" }));
    expect(bad.status).toBe(400);
  });
});

describe("CRUD", () => {
  it("goal create/read/update/delete", async () => {
    const g = await mkGoal("Read books", 2025);
    expect(g).toMatchObject({ title: "Read books", year: 2025, progress: 0, total: 0 });
    const list = (await json(await goals.GET(req("/goals")))).data;
    expect(list).toHaveLength(1);
    const upd = await goalById.PATCH(req(`/goals/${g.id}`, "PATCH", { title: "Read more" }), ctx(g.id));
    expect((await json(upd)).data.title).toBe("Read more");
    expect((await goalById.PATCH(req("/x", "PATCH", { title: "" }), ctx(g.id))).status).toBe(400);
    const del = await goalById.DELETE(req(`/goals/${g.id}`, "DELETE"), ctx(g.id));
    expect(del.status).toBe(200);
    expect((await goalById.GET(req("/x"), ctx(g.id))).status).toBe(404);
  });

  it("goal rejects empty title", async () => {
    expect((await goals.POST(req("/goals", "POST", { title: "" }))).status).toBe(400);
  });

  it("week create validates range and goal", async () => {
    const r1 = await weeks.POST(
      req("/weeks", "POST", { title: "W", startDate: "2025-01-12", endDate: "2025-01-06" }),
    );
    expect(r1.status).toBe(400);
    const r2 = await weeks.POST(
      req("/weeks", "POST", {
        title: "W",
        startDate: "2025-01-06",
        endDate: "2025-01-12",
        goalId: new mongoose.Types.ObjectId().toString(),
      }),
    );
    expect(r2.status).toBe(404);
    expect((await weeks.POST(req("/weeks", "POST", { startDate: "2025-01-06", endDate: "2025-01-12" }))).status).toBe(400);
  });

  it("week update and list filters", async () => {
    const g = await mkGoal();
    const w1 = await mkWeek({ goalId: g.id });
    await mkWeek({ title: "Other", startDate: "2025-02-03", endDate: "2025-02-09" });
    const upd = await weekById.PATCH(req("/x", "PATCH", { title: "Renamed" }), ctx(w1.id));
    expect((await json(upd)).data.title).toBe("Renamed");
    const bad = await weekById.PATCH(req("/x", "PATCH", { endDate: "2025-01-01" }), ctx(w1.id));
    expect(bad.status).toBe(400);
    const byGoal = (await json(await weeks.GET(req(`/weeks?goalId=${g.id}`)))).data;
    expect(byGoal.map((w: { id: string }) => w.id)).toEqual([w1.id]);
    const range = (await json(await weeks.GET(req("/weeks?from=2025-02-01&to=2025-02-28")))).data;
    expect(range).toHaveLength(1);
    expect(range[0].title).toBe("Other");
  });

  it("todo read/update/delete and move between weeks", async () => {
    const w = await mkWeek();
    const t = await mkTodo({ title: "a" });
    const upd = await todoById.PATCH(
      req("/x", "PATCH", { title: "b", date: "2025-01-07", weekId: w.id }),
      ctx(t.id),
    );
    expect((await json(upd)).data).toMatchObject({ title: "b", date: "2025-01-07", weekId: w.id });
    expect((await json(await todoById.GET(req("/x"), ctx(t.id)))).data.title).toBe("b");
    const unl = await todoById.PATCH(req("/x", "PATCH", { weekId: null }), ctx(t.id));
    expect((await json(unl)).data.weekId).toBeNull();
    const ghost = await todoById.PATCH(
      req("/x", "PATCH", { weekId: new mongoose.Types.ObjectId().toString() }),
      ctx(t.id),
    );
    expect(ghost.status).toBe(404);
    expect((await todoById.DELETE(req("/x", "DELETE"), ctx(t.id))).status).toBe(200);
    expect((await todoById.DELETE(req("/x", "DELETE"), ctx(t.id))).status).toBe(404);
  });

  it("invalid and nonexistent ids", async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    for (const handler of [todoById.GET, todoById.DELETE, weekById.GET, weekById.DELETE, goalById.GET, goalById.DELETE]) {
      const bad = await handler(req("/x"), ctx("not-an-id"));
      expect(bad.status).toBe(400);
      expect((await json(bad)).error?.code).toBe("INVALID_ID");
      expect((await handler(req("/x"), ctx(missing))).status).toBe(404);
    }
    expect((await todoById.PATCH(req("/x", "PATCH", { title: "a" }), ctx("zzz"))).status).toBe(400);
    expect((await todoById.PATCH(req("/x", "PATCH", { title: "a" }), ctx(missing))).status).toBe(404);
    expect((await carryover.POST(req("/x", "POST"), ctx("zzz"))).status).toBe(400);
    expect((await retro.GET(req("/x"), ctx(missing))).status).toBe(404);
  });
});

describe("AC-2/AC-3 week progress", () => {
  it("computes 25 / 100 / 0 and never NaN", async () => {
    const w = await mkWeek();
    expect(await weekDetail(w.id)).toMatchObject({ progress: 0, done: 0, total: 0 });
    const ts = [];
    for (let i = 0; i < 4; i++) ts.push(await mkTodo({ title: `t${i}`, weekId: w.id }));
    await setStatus(ts[0].id, "done");
    expect(await weekDetail(w.id)).toMatchObject({ progress: 25, done: 1, total: 4 });
    for (const t of ts.slice(1)) await setStatus(t.id, "done");
    expect(await weekDetail(w.id)).toMatchObject({ progress: 100, done: 4, total: 4 });
  });

  it("changes immediately on create, status change and delete", async () => {
    const w = await mkWeek();
    const a = await mkTodo({ weekId: w.id });
    expect((await weekDetail(w.id)).progress).toBe(0);
    await setStatus(a.id, "done");
    expect((await weekDetail(w.id)).progress).toBe(100);
    const b = await mkTodo({ weekId: w.id });
    expect((await weekDetail(w.id)).progress).toBe(50);
    await setStatus(a.id, "doing");
    expect((await weekDetail(w.id)).progress).toBe(0);
    await setStatus(a.id, "done");
    await todoById.DELETE(req("/x", "DELETE"), ctx(b.id));
    expect(await weekDetail(w.id)).toMatchObject({ progress: 100, total: 1 });
    await todoById.DELETE(req("/x", "DELETE"), ctx(a.id));
    expect(await weekDetail(w.id)).toMatchObject({ progress: 0, total: 0 });
  });

  it("reflects moving a todo to another week", async () => {
    const w1 = await mkWeek();
    const w2 = await mkWeek({ startDate: "2025-01-13", endDate: "2025-01-19" });
    const t = await mkTodo({ weekId: w1.id, status: "done" });
    await todoById.PATCH(req("/x", "PATCH", { weekId: w2.id }), ctx(t.id));
    expect((await weekDetail(w1.id)).total).toBe(0);
    expect((await weekDetail(w2.id)).progress).toBe(100);
  });
});

describe("AC-4 delete policies", () => {
  it("week unlink (default) keeps todos with weekId null", async () => {
    const w = await mkWeek();
    await mkTodo({ weekId: w.id });
    await mkTodo({ weekId: w.id });
    const res = await weekById.DELETE(req(`/weeks/${w.id}`, "DELETE"), ctx(w.id));
    expect((await json(res)).data).toMatchObject({ children: "unlink", affectedTodos: 2 });
    expect(await Todo.countDocuments()).toBe(2);
    expect(await Todo.countDocuments({ weekId: null })).toBe(2);
    expect(await Week.countDocuments()).toBe(0);
  });

  it("week cascade deletes todos", async () => {
    const w = await mkWeek();
    const other = await mkWeek({ startDate: "2025-01-13", endDate: "2025-01-19" });
    await mkTodo({ weekId: w.id });
    await mkTodo({ weekId: other.id });
    const res = await weekById.DELETE(req(`/weeks/${w.id}?children=cascade`, "DELETE"), ctx(w.id));
    expect(res.status).toBe(200);
    expect(await Todo.countDocuments({ weekId: w.id })).toBe(0);
    expect(await Todo.countDocuments()).toBe(1);
  });

  it("rejects unknown children policy without deleting", async () => {
    const w = await mkWeek();
    const res = await weekById.DELETE(req(`/weeks/${w.id}?children=nuke`, "DELETE"), ctx(w.id));
    expect(res.status).toBe(400);
    expect(await Week.countDocuments()).toBe(1);
  });

  it("goal unlink keeps weeks (goalId null) and their todos", async () => {
    const g = await mkGoal();
    const w = await mkWeek({ goalId: g.id });
    await mkTodo({ weekId: w.id });
    const res = await goalById.DELETE(req(`/goals/${g.id}`, "DELETE"), ctx(g.id));
    expect(res.status).toBe(200);
    expect(await Week.countDocuments({ goalId: null })).toBe(1);
    expect(await Todo.countDocuments({ weekId: w.id })).toBe(1);
  });

  it("goal cascade deletes weeks and their todos only", async () => {
    const g = await mkGoal();
    const keep = await mkWeek({ title: "keep" });
    const w1 = await mkWeek({ goalId: g.id });
    const w2 = await mkWeek({ goalId: g.id, startDate: "2025-01-13", endDate: "2025-01-19" });
    await mkTodo({ weekId: w1.id });
    await mkTodo({ weekId: w2.id });
    await mkTodo({ weekId: keep.id });
    const res = await goalById.DELETE(req(`/goals/${g.id}?children=cascade`, "DELETE"), ctx(g.id));
    expect((await json(res)).data).toMatchObject({ affectedWeeks: 2, deletedTodos: 2 });
    expect(await Week.countDocuments()).toBe(1);
    expect(await Todo.countDocuments()).toBe(1);
  });
});

describe("AC-5 goal progress", () => {
  it("is total done / total todos across weeks (1/2 + 3/4 -> 67)", async () => {
    const g = await mkGoal();
    const a = await mkWeek({ goalId: g.id });
    const b = await mkWeek({ goalId: g.id, startDate: "2025-01-13", endDate: "2025-01-19" });
    await mkTodo({ weekId: a.id, status: "done" });
    await mkTodo({ weekId: a.id });
    for (let i = 0; i < 3; i++) await mkTodo({ weekId: b.id, status: "done" });
    await mkTodo({ weekId: b.id, status: "doing" });
    const d = (await json(await goalById.GET(req("/x"), ctx(g.id)))).data;
    expect(d).toMatchObject({ done: 4, total: 6, progress: 67 });
    expect(d.weeks).toHaveLength(2);
    expect(d.weeks[0]).toMatchObject({ id: a.id, progress: 50 });
    expect(d.weeks[1]).toMatchObject({ id: b.id, progress: 75 });
    const list = (await json(await goals.GET(req("/goals")))).data;
    expect(list[0]).toMatchObject({ progress: 67, weekCount: 2 });
  });

  it("is 0 for a goal with no weeks or no todos", async () => {
    const g = await mkGoal();
    expect((await json(await goalById.GET(req("/x"), ctx(g.id)))).data).toMatchObject({ progress: 0, weeks: [] });
    await mkWeek({ goalId: g.id });
    expect((await json(await goalById.GET(req("/x"), ctx(g.id)))).data.progress).toBe(0);
  });
});

describe("AC-6 invalid status", () => {
  it("PATCH with invalid status -> 400 and DB unchanged", async () => {
    const t = await mkTodo({ title: "keep", status: "doing" });
    for (const status of ["x", "", null, 3]) {
      const res = await todoById.PATCH(req("/x", "PATCH", { status, title: "changed" }), ctx(t.id));
      expect(res.status).toBe(400);
    }
    const doc = await Todo.findById(t.id);
    expect(doc?.status).toBe("doing");
    expect(doc?.title).toBe("keep");
  });

  it("POST with invalid status -> 400", async () => {
    expect((await todos.POST(req("/todos", "POST", { title: "a", status: "x" }))).status).toBe(400);
  });
});

describe("AC-9/10 search, filter, sort", () => {
  async function seed() {
    const g = await mkGoal();
    const w1 = await mkWeek({ goalId: g.id });
    const w2 = await mkWeek({ startDate: "2025-01-13", endDate: "2025-01-19" });
    await mkTodo({ title: "Buy Milk", date: "2025-01-08", weekId: w1.id });
    await mkTodo({ title: "milk run (done)", date: "2025-01-06", weekId: w1.id, status: "done" });
    await mkTodo({ title: "Write report", date: "2025-01-14", weekId: w2.id, status: "doing" });
    await mkTodo({ title: "C++ (basics)", date: "2025-01-07" });
    return { g, w1, w2 };
  }
  const titles = async (qs: string) =>
    (await json(await todos.GET(req(`/todos${qs}`)))).data.map((t: { title: string }) => t.title);

  it("searches titles case-insensitively", async () => {
    await seed();
    const r = await titles("?q=MILK");
    expect(r.sort()).toEqual(["Buy Milk", "milk run (done)"]);
    expect(await titles("?q=nomatch")).toEqual([]);
  });

  it("escapes regex characters in q", async () => {
    await seed();
    expect(await titles("?q=" + encodeURIComponent("C++ (basics)"))).toEqual(["C++ (basics)"]);
    expect(await titles("?q=" + encodeURIComponent(".*"))).toEqual([]);
    expect(await titles("?q=" + encodeURIComponent("("))).toEqual(["milk run (done)", "C++ (basics)"]);
  });

  it("filters by status, weekId, goalId and date", async () => {
    const { g, w1, w2 } = await seed();
    expect(await titles("?status=done")).toEqual(["milk run (done)"]);
    expect((await titles(`?weekId=${w2.id}`))).toEqual(["Write report"]);
    expect((await titles(`?goalId=${g.id}`)).sort()).toEqual(["Buy Milk", "milk run (done)"]);
    expect(await titles(`?goalId=${g.id}&weekId=${w2.id}`)).toEqual([]);
    expect(await titles(`?goalId=${g.id}&weekId=${w1.id}&status=todo`)).toEqual(["Buy Milk"]);
    expect(await titles("?date=2025-01-07")).toEqual(["C++ (basics)"]);
    expect(await titles("?q=milk&status=todo")).toEqual(["Buy Milk"]);
  });

  it("rejects invalid filter values with 400", async () => {
    expect((await todos.GET(req("/todos?status=bogus"))).status).toBe(400);
    expect((await todos.GET(req("/todos?weekId=bad"))).status).toBe(400);
    expect((await todos.GET(req("/todos?sort=title"))).status).toBe(400);
    expect((await todos.GET(req("/todos?date=2025-99-99"))).status).toBe(400);
  });

  it("sorts by date asc and desc", async () => {
    await seed();
    expect(await titles("?sort=date")).toEqual(["milk run (done)", "C++ (basics)", "Buy Milk", "Write report"]);
    expect(await titles("?sort=-date")).toEqual(["Write report", "Buy Milk", "C++ (basics)", "milk run (done)"]);
  });
});

describe("AC-10 overdue flag", () => {
  it("is computed against the local today and status", async () => {
    const past = await mkTodo({ title: "past", date: "2000-01-01" });
    const pastDone = await mkTodo({ title: "pastdone", date: "2000-01-01", status: "done" });
    const future = await mkTodo({ title: "future", date: "2999-01-01" });
    const nodate = await mkTodo({ title: "nodate" });
    expect(past.overdue).toBe(true);
    expect(pastDone.overdue).toBe(false);
    expect(future.overdue).toBe(false);
    expect(nodate.overdue).toBe(false);
    const list = (await json(await todos.GET(req("/todos")))).data;
    expect(Object.fromEntries(list.map((t: { title: string; overdue: boolean }) => [t.title, t.overdue]))).toEqual({
      past: true,
      pastdone: false,
      future: false,
      nodate: false,
    });
    const done = await setStatus(past.id, "done");
    expect((await json(done)).data.overdue).toBe(false);
  });
});

describe("AC-11 carryover", () => {
  it("moves only non-done todos to the next week, creating it, idempotently", async () => {
    const g = await mkGoal();
    const w = await mkWeek({ title: "Week 2", goalId: g.id });
    const d = await mkTodo({ title: "d", weekId: w.id, status: "done" });
    const a = await mkTodo({ title: "a", weekId: w.id });
    const b = await mkTodo({ title: "b", weekId: w.id, status: "doing" });

    const res = await carryover.POST(req("/x", "POST"), ctx(w.id));
    expect(res.status).toBe(200);
    const out = (await json(res)).data;
    expect(out.moved).toBe(2);
    expect(out.nextWeek).toMatchObject({ startDate: "2025-01-13", endDate: "2025-01-19", goalId: g.id });
    expect(out.nextWeek.title).toContain("Week 2");

    expect((await Todo.findById(d.id))?.weekId?.toString()).toBe(w.id);
    expect((await Todo.findById(a.id))?.weekId?.toString()).toBe(out.nextWeek.id);
    expect((await Todo.findById(b.id))?.weekId?.toString()).toBe(out.nextWeek.id);
    expect((await Todo.findById(b.id))?.status).toBe("doing");

    const again = (await json(await carryover.POST(req("/x", "POST"), ctx(w.id)))).data;
    expect(again.moved).toBe(0);
    expect(await Week.countDocuments()).toBe(2);
    expect(await Todo.countDocuments({ weekId: w.id })).toBe(1);
  });

  it("reuses an existing following week", async () => {
    const w = await mkWeek();
    const next = await mkWeek({ title: "Next", startDate: "2025-01-13", endDate: "2025-01-19" });
    await mkTodo({ weekId: w.id });
    const out = (await json(await carryover.POST(req("/x", "POST"), ctx(w.id)))).data;
    expect(out).toMatchObject({ moved: 1 });
    expect(out.nextWeek.id).toBe(next.id);
    expect(await Week.countDocuments()).toBe(2);
  });

  it("does not create a week when nothing is pending", async () => {
    const w = await mkWeek();
    await mkTodo({ weekId: w.id, status: "done" });
    const out = (await json(await carryover.POST(req("/x", "POST"), ctx(w.id)))).data;
    expect(out).toEqual({ moved: 0, nextWeek: null });
    expect(await Week.countDocuments()).toBe(1);
  });
});

describe("AC-12 retro", () => {
  it("returns progress, done and total", async () => {
    const w = await mkWeek();
    await mkTodo({ weekId: w.id, status: "done" });
    await mkTodo({ weekId: w.id });
    await mkTodo({ weekId: w.id });
    const out = (await json(await retro.GET(req("/x"), ctx(w.id)))).data;
    expect(out).toEqual({ progress: 33, done: 1, total: 3 });
  });

  it("returns zeros for an empty week", async () => {
    const w = await mkWeek();
    expect((await json(await retro.GET(req("/x"), ctx(w.id)))).data).toEqual({ progress: 0, done: 0, total: 0 });
  });
});

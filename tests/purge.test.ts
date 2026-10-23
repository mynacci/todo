import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { purgeUnowned, redactUri } from "../scripts/purge-unowned.mjs";
import { clearTestDB, startTestDB, stopTestDB } from "./helpers/db";

// Runs only against the throwaway mongodb-memory-server started by startTestDB.
const db = () => mongoose.connection.db!;
const owner = new mongoose.Types.ObjectId();

async function seed() {
  await db().collection("goals").insertMany([
    { title: "owned goal", userId: owner },
    { title: "legacy goal" },
    { title: "null goal", userId: null },
  ]);
  await db().collection("weeks").insertMany([
    { title: "owned week", startDate: "2025-01-06", endDate: "2025-01-12", userId: owner },
    { title: "legacy week", startDate: "2025-01-06", endDate: "2025-01-12" },
  ]);
  await db().collection("todos").insertMany([
    { title: "owned todo", status: "todo", userId: owner },
    { title: "owned todo 2", status: "done", userId: owner },
    { title: "legacy todo", status: "todo" },
    { title: "legacy todo 2", status: "done" },
    { title: "legacy todo 3", status: "doing", userId: null },
  ]);
}
const titles = async (name: string) =>
  (await db().collection(name).find().sort({ title: 1 }).toArray()).map((d) => d.title);

beforeAll(startTestDB);
afterAll(stopTestDB);
beforeEach(async () => {
  await clearTestDB();
  await seed();
});

describe("migrate:purge-unowned", () => {
  it("dry-run (default) only counts and deletes nothing", async () => {
    const out = await purgeUnowned(db());
    expect(out).toEqual({
      apply: false,
      counts: { todos: 3, weeks: 1, goals: 2 },
      deleted: { todos: 0, weeks: 0, goals: 0 },
    });
    expect(await db().collection("todos").countDocuments()).toBe(5);
    expect(await db().collection("weeks").countDocuments()).toBe(2);
    expect(await db().collection("goals").countDocuments()).toBe(3);
  });

  it("with apply deletes only documents without userId and keeps owned ones", async () => {
    const out = await purgeUnowned(db(), { apply: true });
    expect(out.deleted).toEqual({ todos: 3, weeks: 1, goals: 2 });
    expect(await titles("todos")).toEqual(["owned todo", "owned todo 2"]);
    expect(await titles("weeks")).toEqual(["owned week"]);
    expect(await titles("goals")).toEqual(["owned goal"]);
    // idempotent
    expect((await purgeUnowned(db(), { apply: true })).deleted).toEqual({ todos: 0, weeks: 0, goals: 0 });
  });

  it("does not touch other collections", async () => {
    await db().collection("users").insertOne({ githubId: 1, login: "x" });
    await db().collection("sessions").insertOne({ tokenHash: "h" });
    await purgeUnowned(db(), { apply: true });
    expect(await db().collection("users").countDocuments()).toBe(1);
    expect(await db().collection("sessions").countDocuments()).toBe(1);
  });

  it("redacts credentials when printing the target", () => {
    expect(redactUri("mongodb+srv://u:p@cluster.example/todo")).toBe("mongodb+srv://***@cluster.example/todo");
    expect(redactUri("mongodb://u:p@ss@host:27017/todo?x=a@b")).toBe("mongodb://***@host:27017/todo?x=a@b");
    expect(redactUri("mongodb://127.0.0.1:27017/todo")).toBe("mongodb://127.0.0.1:27017/todo");
  });
});

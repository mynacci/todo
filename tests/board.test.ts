import { describe, expect, it } from "vitest";
import { applyMove, columnOf, computeMove } from "@/lib/board";
import type { Todo } from "@/lib/types";

const mk = (id: string, status: Todo["status"], order: number, overdue = false): Todo => ({
  id,
  title: id,
  date: null,
  status,
  weekId: null,
  order,
  overdue,
  createdAt: `2026-01-01T00:00:0${order >= 0 ? order : 0}Z`,
  updatedAt: "",
});

const todos = [mk("a", "todo", 0), mk("b", "todo", 1), mk("c", "todo", 2), mk("d", "doing", 0, true)];

describe("computeMove", () => {
  it("appends to the end of an empty column", () => {
    expect(computeMove(todos, "a", "done", null)).toEqual({ status: "done", order: 0 });
  });
  it("appends after the last card of another column", () => {
    expect(computeMove(todos, "a", "doing", null)).toEqual({ status: "doing", order: 1 });
  });
  it("inserts before the target card using the midpoint", () => {
    expect(computeMove(todos, "d", "todo", "b")).toEqual({ status: "todo", order: 0.5 });
  });
  it("inserts before the first card", () => {
    expect(computeMove(todos, "d", "todo", "a")).toEqual({ status: "todo", order: -1 });
  });
  it("moving down within a column lands after the target (arrayMove semantics)", () => {
    const m = computeMove(todos, "a", "todo", "c")!;
    const result = columnOf(applyMove(todos, "a", m), "todo").map((t) => t.id);
    expect(result).toEqual(["b", "c", "a"]);
  });
  it("moving up within a column lands before the target", () => {
    const m = computeMove(todos, "c", "todo", "a")!;
    const result = columnOf(applyMove(todos, "c", m), "todo").map((t) => t.id);
    expect(result).toEqual(["c", "a", "b"]);
  });
  it("returns null for an unknown todo", () => {
    expect(computeMove(todos, "zzz", "done", null)).toBeNull();
  });
});

describe("applyMove", () => {
  it("is pure, updates status/order and clears overdue when done", () => {
    const next = applyMove(todos, "d", { status: "done", order: 5 });
    expect(next.find((t) => t.id === "d")).toMatchObject({ status: "done", order: 5, overdue: false });
    expect(todos.find((t) => t.id === "d")).toMatchObject({ status: "doing", overdue: true });
    expect(next.find((t) => t.id === "a")).toBe(todos[0]);
  });
});

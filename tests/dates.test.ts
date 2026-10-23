import { describe, expect, it } from "vitest";
import { addDays, isValidYMD, todayLocal, weekRange, weekStart } from "@/lib/dates";
import { isOverdue } from "@/lib/overdue";
import { calcProgress, sumCounts } from "@/lib/progress";

describe("week date helper", () => {
  it("returns Monday for every day of a week", () => {
    // 2025-01-06 is a Monday
    for (const d of ["2025-01-06", "2025-01-08", "2025-01-12"]) {
      expect(weekStart(d)).toBe("2025-01-06");
    }
    expect(weekStart("2025-01-13")).toBe("2025-01-13");
  });

  it("handles year boundaries", () => {
    expect(weekRange("2025-01-01")).toEqual({
      startDate: "2024-12-30",
      endDate: "2025-01-05",
    });
    expect(weekRange("2024-12-31")).toEqual({
      startDate: "2024-12-30",
      endDate: "2025-01-05",
    });
    expect(weekRange("2021-01-01").startDate).toBe("2020-12-28");
  });

  it("handles leap days and month ends", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2025-12-29", 7)).toBe("2026-01-05");
    expect(weekRange("2024-03-03")).toEqual({
      startDate: "2024-02-26",
      endDate: "2024-03-03",
    });
  });

  it("validates YYYY-MM-DD strings", () => {
    expect(isValidYMD("2025-02-28")).toBe(true);
    expect(isValidYMD("2025-02-30")).toBe(false);
    expect(isValidYMD("2025-2-3")).toBe(false);
    expect(isValidYMD("abc")).toBe(false);
  });

  it("formats local today without timezone shift", () => {
    expect(todayLocal(new Date(2025, 0, 1, 0, 30))).toBe("2025-01-01");
    expect(todayLocal(new Date(2025, 11, 31, 23, 59))).toBe("2025-12-31");
  });
});

describe("pure helpers", () => {
  it("calcProgress rounds and never returns NaN", () => {
    expect(calcProgress(0, 0)).toBe(0);
    expect(calcProgress(1, 4)).toBe(25);
    expect(calcProgress(4, 4)).toBe(100);
    expect(calcProgress(4, 6)).toBe(67);
  });

  it("sumCounts adds done and total", () => {
    expect(
      sumCounts([
        { done: 1, total: 2 },
        { done: 3, total: 4 },
      ]),
    ).toEqual({ done: 4, total: 6 });
    expect(sumCounts([])).toEqual({ done: 0, total: 0 });
  });

  it("isOverdue uses injected today", () => {
    const today = "2025-06-10";
    expect(isOverdue({ date: "2025-06-09", status: "todo" }, today)).toBe(true);
    expect(isOverdue({ date: "2025-06-09", status: "doing" }, today)).toBe(true);
    expect(isOverdue({ date: "2025-06-09", status: "done" }, today)).toBe(false);
    expect(isOverdue({ date: "2025-06-10", status: "todo" }, today)).toBe(false);
    expect(isOverdue({ date: null, status: "todo" }, today)).toBe(false);
  });
});

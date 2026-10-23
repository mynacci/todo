import type { GoalDoc } from "@/models/Goal";
import type { WeekDoc } from "@/models/Week";
import type { TodoDoc } from "@/models/Todo";
import { isOverdue } from "@/lib/overdue";

export const serializeGoal = (g: GoalDoc) => ({
  id: String(g._id),
  title: g.title,
  year: g.year,
  createdAt: g.createdAt,
  updatedAt: g.updatedAt,
});

export const serializeWeek = (w: WeekDoc) => ({
  id: String(w._id),
  title: w.title,
  startDate: w.startDate,
  endDate: w.endDate,
  goalId: w.goalId ? String(w.goalId) : null,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

export const serializeTodo = (t: TodoDoc, today?: string) => ({
  id: String(t._id),
  title: t.title,
  date: t.date ?? null,
  status: t.status,
  weekId: t.weekId ? String(t.weekId) : null,
  order: t.order,
  overdue: isOverdue(t, today),
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

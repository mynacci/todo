import { todayLocal } from "@/lib/dates";

export function isOverdue(
  todo: { date?: string | null; status: string },
  today: string = todayLocal(),
): boolean {
  return !!todo.date && todo.date < today && todo.status !== "done";
}

import type { Todo, TodoStatus } from "@/lib/types";

/** Todos of one column in display order (order, then createdAt), or in the given (server-sorted) order when `keepOrder`. */
export function columnOf(todos: Todo[], status: TodoStatus, keepOrder = false): Todo[] {
  const col = todos.filter((t) => t.status === status);
  if (keepOrder) return col;
  return col.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Status/order for `id` when dropped into `toStatus`, before the card `overId`
 * (or at the end of the column when overId is null). Uses neighbour midpoints so only
 * the moved card needs to be saved. Returns null if the todo does not exist.
 */
export function computeMove(
  todos: Todo[],
  id: string,
  toStatus: TodoStatus,
  overId: string | null,
): { status: TodoStatus; order: number } | null {
  if (!todos.some((t) => t.id === id)) return null;
  const original = columnOf(todos, toStatus);
  const overIdx = overId ? original.findIndex((t) => t.id === overId) : -1;
  const rest = original.filter((t) => t.id !== id);
  const at = overIdx === -1 ? rest.length : overIdx;
  const prev = rest[at - 1];
  const next = rest[at];
  let order = 0;
  if (prev && next) order = (prev.order + next.order) / 2;
  else if (prev) order = prev.order + 1;
  else if (next) order = next.order - 1;
  return { status: toStatus, order };
}

/** Pure optimistic patch of a todo list. */
export function applyMove(
  todos: Todo[],
  id: string,
  move: { status: TodoStatus; order: number },
): Todo[] {
  return todos.map((t) =>
    t.id === id
      ? { ...t, ...move, overdue: move.status === "done" ? false : t.overdue }
      : t,
  );
}

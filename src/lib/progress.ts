import mongoose from "mongoose";
import { Todo } from "@/models/Todo";

export interface Counts {
  done: number;
  total: number;
}

/** done / total * 100, rounded; 0 when there are no todos. */
export function calcProgress(done: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/** Per-week done/total counts of the user's todos. Weeks without todos map to {0,0}. */
export async function countsByWeek(
  userId: mongoose.Types.ObjectId,
  weekIds: (string | mongoose.Types.ObjectId)[],
): Promise<Map<string, Counts>> {
  const map = new Map<string, Counts>();
  const oids = weekIds.map((i) => new mongoose.Types.ObjectId(String(i)));
  for (const id of oids) map.set(id.toHexString(), { done: 0, total: 0 });
  if (oids.length === 0) return map;
  const rows = await Todo.aggregate<{ _id: mongoose.Types.ObjectId } & Counts>([
    { $match: { userId, weekId: { $in: oids } } },
    {
      $group: {
        _id: "$weekId",
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
      },
    },
  ]);
  for (const r of rows) map.set(String(r._id), { done: r.done, total: r.total });
  return map;
}

export function sumCounts(list: Counts[]): Counts {
  return list.reduce(
    (a, c) => ({ done: a.done + c.done, total: a.total + c.total }),
    { done: 0, total: 0 },
  );
}

export function withProgress(c: Counts) {
  return {
    done: c.done,
    total: c.total,
    progress: calcProgress(c.done, c.total),
  };
}

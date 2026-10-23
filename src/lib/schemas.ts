import { z } from "zod";
import { isValidYMD } from "@/lib/dates";

export const TODO_STATUS = z.enum(["todo", "doing", "done"]);
export const ymd = z
  .string()
  .refine(isValidYMD, "must be a valid YYYY-MM-DD date");
export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "invalid id");
const title = z.string().trim().min(1, "title is required");

export const goalCreate = z.object({
  title,
  year: z.number().int().min(1900).max(3000).optional(),
});
export const goalUpdate = goalCreate.partial();

const weekBase = z.object({
  title,
  startDate: ymd,
  endDate: ymd,
  goalId: objectId.nullable().optional(),
});
export const weekCreate = weekBase.refine((w) => w.endDate >= w.startDate, {
  message: "endDate must not be before startDate",
  path: ["endDate"],
});
export const weekUpdate = weekBase.partial();

export const todoCreate = z.object({
  title,
  date: ymd.nullable().optional(),
  status: TODO_STATUS.optional(),
  weekId: objectId.nullable().optional(),
  order: z.number().optional(),
});
export const todoUpdate = todoCreate.partial();

export const childrenPolicy = z.enum(["unlink", "cascade"]).default("unlink");

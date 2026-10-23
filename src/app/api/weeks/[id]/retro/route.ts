import { ok } from "@/lib/api";
import { authed } from "@/lib/auth";
import { countsByWeek, withProgress } from "@/lib/progress";
import { badId, notFound, type IdCtx } from "@/lib/route-utils";
import { Week } from "@/models/Week";

export const GET = authed(async (user, _req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const week = await Week.findOne({ _id: id, userId: user.id }, { _id: 1 });
  if (!week) return notFound("Week");
  const counts = await countsByWeek(user.id, [week._id]);
  const { progress, done, total } = withProgress(counts.get(String(week._id))!);
  return ok({ progress, done, total });
});

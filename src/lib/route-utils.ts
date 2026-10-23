import { fail } from "@/lib/api";
import { childrenPolicy, objectId } from "@/lib/schemas";

export type IdCtx = { params: Promise<{ id: string }> };

export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => undefined);
}

/** Returns an error response for a malformed id, otherwise null. */
export function badId(id: string) {
  return objectId.safeParse(id).success
    ? null
    : fail("INVALID_ID", `Invalid id: ${id}`, 400);
}

export function notFound(what: string) {
  return fail("NOT_FOUND", `${what} not found`, 404);
}

export function parseChildren(req: Request) {
  const raw = new URL(req.url).searchParams.get("children") ?? undefined;
  return childrenPolicy.parse(raw);
}

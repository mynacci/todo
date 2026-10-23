import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { ZodError } from "zod";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<Response> | Response,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      // Let Next.js internal control-flow errors (e.g. the prerender bailout raised
      // when a handler reads request.url / headers at build time) propagate.
      unstable_rethrow(err);
      if (err instanceof ZodError) {
        const message = err.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        return fail("VALIDATION", message, 400);
      }
      if (
        err instanceof mongoose.Error.CastError &&
        err.kind === "ObjectId"
      ) {
        return fail("INVALID_ID", `Invalid id: ${String(err.value)}`, 400);
      }
      console.error(err);
      return fail("INTERNAL", "Internal server error", 500);
    }
  };
}

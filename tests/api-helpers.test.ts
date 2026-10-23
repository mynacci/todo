import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { z } from "zod";
import { fail, handle, ok } from "@/lib/api";
import { startTestDB, stopTestDB } from "./helpers/db";

describe("api helpers", () => {
  it("ok wraps data with status", async () => {
    const res = ok({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { a: 1 } });
  });

  it("fail returns error envelope", async () => {
    const res = fail("NOT_FOUND", "nope", 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "nope" },
    });
  });

  it("handle passes through successful responses", async () => {
    const res = await handle(async () => ok("x"))();
    expect(res.status).toBe(200);
  });

  it("handle maps ZodError to 400 VALIDATION", async () => {
    const res = await handle(async () => {
      z.object({ title: z.string() }).parse({});
      return ok(null);
    })();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toContain("title");
  });

  it("handle maps invalid ObjectId CastError to 400", async () => {
    const res = await handle(async () => {
      const M = mongoose.model("CastProbe", new mongoose.Schema({}));
      await M.findById("bad-id");
      return ok(null);
    })();
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_ID");
  });

  it("handle maps unknown errors to 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handle(async () => {
      throw new Error("boom");
    })();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL");
    spy.mockRestore();
  });
});

describe("memory mongo helper", () => {
  beforeAll(startTestDB);
  afterAll(stopTestDB);

  it("connects mongoose to the in-memory server", async () => {
    expect(mongoose.connection.readyState).toBe(1);
    const ping = await mongoose.connection.db!.admin().ping();
    expect(ping.ok).toBe(1);
  });
});

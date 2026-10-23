import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/client";

afterEach(() => vi.unstubAllGlobals());

const respond = (body: unknown, status = 200) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("api client", () => {
  it("returns data on success", async () => {
    respond({ data: { id: "1" } });
    await expect(api("/api/x")).resolves.toEqual({ id: "1" });
  });
  it("throws ApiError with code and message on {error}", async () => {
    respond({ error: { code: "VALIDATION", message: "title: required" } }, 400);
    await expect(api("/api/x")).rejects.toMatchObject({
      name: "ApiError",
      code: "VALIDATION",
      message: "title: required",
      status: 400,
    });
  });
  it("throws on non-JSON failure and on network errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    await expect(api("/api/x")).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("x"))));
    await expect(api("/api/x")).rejects.toMatchObject({ code: "NETWORK" });
  });
  it("sends JSON bodies", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: 1 })));
    vi.stubGlobal("fetch", f);
    await api("/api/x", { method: "PATCH", body: { a: 1 } });
    expect(f).toHaveBeenCalledWith("/api/x", expect.objectContaining({ method: "PATCH", body: '{"a":1}' }));
  });
});

describe("api client 401 handling", () => {
  const stubWindow = (pathname: string) => {
    const assign = vi.fn();
    const loc = { pathname, search: "?a=1" } as { pathname: string; search: string; href?: string };
    Object.defineProperty(loc, "href", { set: assign });
    vi.stubGlobal("window", { location: loc });
    return assign;
  };
  const unauthorized = () => ({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });

  it("navigates to /login (keeping next) on 401", async () => {
    const assign = stubWindow("/board");
    respond(unauthorized(), 401);
    await expect(api("/api/x")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fboard%3Fa%3D1");
  });
  it("does not redirect again when already on /login", async () => {
    const assign = stubWindow("/login");
    respond(unauthorized(), 401);
    await expect(api("/api/me")).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });
});

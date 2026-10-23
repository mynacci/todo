import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it("rejects off-site and control-character tricks", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "board",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "http://evil.com/x",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(bad)).toBe("/");
      expect(safeNextPath(bad, "/board")).toBe("/board");
    }
  });

  it("keeps valid paths with query strings and hashes", () => {
    expect(safeNextPath("/board")).toBe("/board");
    expect(safeNextPath("/board?weekId=1&x=%2F#top", "/board")).toBe("/board?weekId=1&x=%2F#top");
    expect(safeNextPath("/weeks/abc")).toBe("/weeks/abc");
  });
});

/**
 * Dependency-free (safe to import from client components).
 * Only same-origin relative paths are accepted as post-login redirect targets
 * ("/board", not "//evil.com", "/\evil.com", "/\t/evil.com" or "https://...").
 * URL parsing strips tab/LF/CR, so the check is made on the parsed result.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return fallback;
  }
  try {
    const u = new URL(raw, "http://local.invalid");
    if (u.origin !== "http://local.invalid" || u.pathname.startsWith("//")) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

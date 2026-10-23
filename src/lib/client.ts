export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * An API call came back 401: the session is gone. A full navigation drops every
 * in-memory cache (TanStack Query included). Never loops on /login itself.
 */
function redirectToLogin() {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const here = window.location.pathname + window.location.search;
  // Deliberate full-page navigation (not router.push) so all client caches are discarded.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/login?next=${encodeURIComponent(here)}`;
}

/** Typed fetch wrapper: returns `data` on success, throws ApiError on `{error}` or network failure. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const hasBody = init.body !== undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("NETWORK", "서버에 연결할 수 없습니다.", 0);
  }
  let json: { data?: T; error?: { code?: string; message?: string } } | undefined;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  if (res.status === 401) redirectToLogin();
  if (json === undefined || json.error || !res.ok) {
    throw new ApiError(
      json?.error?.code ?? `HTTP_${res.status}`,
      json?.error?.message ?? `요청에 실패했습니다 (${res.status})`,
      res.status,
    );
  }
  return json.data as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
}

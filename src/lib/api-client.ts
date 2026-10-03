/** An API error as the UI sees it: the server's user-facing message and its stable code. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * Calls one of Nazar's JSON endpoints from the browser. Sends `body` as JSON (or as-is for file
 * uploads), and throws an ApiError with the server's message when the response isn't OK.
 */
export async function apiCall<T = any>(url: string, method = "GET", body?: unknown, fallbackError = "Something went wrong."): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body == null || isForm ? undefined : { "content-type": "application/json" },
    body: body == null ? undefined : isForm ? body : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(j.error ?? fallbackError, j.code);
  return j as T;
}

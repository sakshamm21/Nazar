/** An error with an HTTP status and a stable code the UI can switch on. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "ERROR",
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code = "BAD_REQUEST") => new AppError(400, m, code);
export const unauthenticated = (m = "Please sign in.", code = "UNAUTHENTICATED") => new AppError(401, m, code);
export const forbidden = (m: string, code = "FORBIDDEN") => new AppError(403, m, code);
export const notFound = (m = "Not found.", code = "NOT_FOUND") => new AppError(404, m, code);
export const conflict = (m: string, code = "CONFLICT") => new AppError(409, m, code);
export const tooMany = (m: string, code = "RATE_LIMITED", details?: Record<string, unknown>) => new AppError(429, m, code, details);

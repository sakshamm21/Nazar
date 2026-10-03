import pino from "pino";

/** Structured logs (pino). JSON in production, plain lines in development. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

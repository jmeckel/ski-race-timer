/**
 * Structured API Logger
 * Outputs JSON-formatted log lines for better parsing in Vercel/production.
 * Includes request ID tracing support.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: unknown;
}

function formatLog(level: LogLevel, msg: string, meta?: LogMeta): string {
  return JSON.stringify({
    level,
    ts: new Date().toISOString(),
    msg,
    ...meta,
  });
}

export const apiLogger = {
  debug(msg: string, meta?: LogMeta): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(formatLog('debug', msg, meta));
    }
  },

  info(msg: string, meta?: LogMeta): void {
    console.log(formatLog('info', msg, meta));
  },

  warn(msg: string, meta?: LogMeta): void {
    console.warn(formatLog('warn', msg, meta));
  },

  error(msg: string, meta?: LogMeta): void {
    console.error(formatLog('error', msg, meta));
  },

  /** Create a child logger with a request ID pre-attached */
  withRequestId(requestId: string) {
    return {
      debug: (msg: string, meta?: LogMeta) =>
        apiLogger.debug(msg, { requestId, ...meta }),
      info: (msg: string, meta?: LogMeta) =>
        apiLogger.info(msg, { requestId, ...meta }),
      warn: (msg: string, meta?: LogMeta) =>
        apiLogger.warn(msg, { requestId, ...meta }),
      error: (msg: string, meta?: LogMeta) =>
        apiLogger.error(msg, { requestId, ...meta }),
    };
  },
};

/**
 * Extract or generate a request ID from request headers
 */
export function getRequestId(
  headers: Record<string, string | string[] | undefined>,
): string {
  const forwarded = headers['x-request-id'] || headers['x-vercel-id'];
  if (forwarded) {
    return Array.isArray(forwarded) ? (forwarded[0] ?? '') : forwarded;
  }
  // Generate a short random ID for tracing
  return Math.random().toString(36).slice(2, 10);
}

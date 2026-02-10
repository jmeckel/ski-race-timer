/**
 * Environment-aware logger
 * - In development: all logs shown
 * - In production: only errors and warnings
 */

const isDev = import.meta.env.DEV;

export const logger = {
  debug: isDev ? console.log.bind(console) : () => {},
  log: isDev ? console.log.bind(console) : () => {},
  info: isDev ? console.info.bind(console) : () => {},
  warn: console.warn.bind(console), // Keep in production
  error: console.error.bind(console), // Keep in production
};

export default logger;

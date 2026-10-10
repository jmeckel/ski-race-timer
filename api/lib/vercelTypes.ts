/**
 * Minimal request/response types for Vercel Node.js functions.
 *
 * Local replacement for the type-only `@vercel/node` import: that package drags
 * a large, vulnerable dev-dependency tree (undici, path-to-regexp, ts-morph) into
 * the project just for these declarations. Shapes match the runtime helpers that
 * Vercel attaches to Node's IncomingMessage/ServerResponse.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export type VercelRequest = IncomingMessage & {
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
  /** Parsed body — untrusted input, validate before use. */
  body: unknown;
};

export type VercelResponse = ServerResponse & {
  send: (body: unknown) => VercelResponse;
  json: (jsonBody: unknown) => VercelResponse;
  status: (statusCode: number) => VercelResponse;
  redirect: (statusOrUrl: string | number, url?: string) => VercelResponse;
};

import type { Request, Response } from 'express';
import { isSameOrigin, requireRole, type SessionIdentity, type SessionRole } from './_session.js';
import { isV13IsolatedTestMode } from './_v13Collections.js';

export class V13WritesDisabledError extends Error {
  statusCode = 503;
  code = 'V13_WRITES_DISABLED';
}

export function requireV13WritesEnabled(environment: NodeJS.ProcessEnv = process.env): void {
  if (environment.OT_V13_WRITES_ENABLED !== 'true') throw new V13WritesDisabledError('OT V1.3 writes are disabled');
  if (environment.VERCEL_ENV === 'preview' && !isV13IsolatedTestMode(environment)) {
    throw new V13WritesDisabledError('OT V1.3 Preview writes require isolated test mode');
  }
}

export async function requireV13Mutation(request: Request, ...roles: SessionRole[]): Promise<SessionIdentity> {
  if (!isSameOrigin(request)) throw Object.assign(new Error('Origin rejected'), { statusCode: 403 });
  const session = await requireRole(request, ...roles);
  requireV13WritesEnabled();
  return session;
}

export function sendApiError(response: Response, error: unknown): Response {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode : 500;
  const code = error instanceof V13WritesDisabledError ? error.code : statusCode === 401 ? 'UNAUTHENTICATED' : statusCode === 403 ? 'FORBIDDEN' : statusCode === 409 ? 'CONFLICT' : 'REQUEST_FAILED';
  if (statusCode >= 500 && !(error instanceof V13WritesDisabledError)) {
    console.error('V1.3 API failed', error instanceof Error ? error.message : 'Unknown error');
  }
  return response.status(statusCode).json({ error: code, ...(error instanceof V13WritesDisabledError ? { message: error.message } : {}) });
}

export const conflict = (message: string) => Object.assign(new Error(message), { statusCode: 409 });
export const badRequest = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

export const safeString = (value: unknown, maxLength = 200): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export const safeStringArray = (value: unknown, maxItems = 500): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, maxItems) : [];

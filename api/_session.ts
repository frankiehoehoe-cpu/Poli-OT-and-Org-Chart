import type { Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE_NAME = 'otpro_session';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const SESSION_VERSION = 1;
const SESSION_ALGORITHM = 'HS256';

export type SessionRole = 'employee' | 'supervisor' | 'manager';

export interface SessionIdentity {
  version: number;
  role: SessionRole;
  subject: string;
  issuedAt: number;
  expiresAt: number;
  employeeId?: string;
  employeeName?: string;
}

interface SessionInput {
  role: SessionRole;
  subject: string;
  employeeId?: string;
  employeeName?: string;
}

function sessionKey(): Uint8Array {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_SESSION_SECRET must contain at least 32 bytes');
  }
  return new TextEncoder().encode(secret);
}

function safeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export async function createSession(input: SessionInput): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_MAX_AGE_SECONDS;
  const subject = safeText(input.subject, 128);
  if (!subject) throw new Error('Session subject is required');

  return new SignJWT({
    version: SESSION_VERSION,
    role: input.role,
    subject,
    issuedAt,
    expiresAt,
    ...(input.employeeId ? { employeeId: safeText(input.employeeId, 128) } : {}),
    ...(input.employeeName ? { employeeName: safeText(input.employeeName, 160) } : {})
  })
    .setProtectedHeader({ alg: SESSION_ALGORITHM, typ: 'JWT' })
    .setSubject(subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(sessionKey());
}

function cookieValue(request: Request): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(';')) {
    const [name, ...parts] = item.trim().split('=');
    if (name === SESSION_COOKIE_NAME) return parts.join('=') || null;
  }
  return null;
}

export async function readSession(request: Request): Promise<SessionIdentity | null> {
  const token = cookieValue(request);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: [SESSION_ALGORITHM] });
    const role = payload.role;
    const subject = payload.subject;
    const issuedAt = payload.issuedAt;
    const expiresAt = payload.expiresAt;
    if (
      payload.version !== SESSION_VERSION ||
      (role !== 'employee' && role !== 'supervisor' && role !== 'manager') ||
      typeof subject !== 'string' || subject !== payload.sub ||
      typeof issuedAt !== 'number' || issuedAt !== payload.iat ||
      typeof expiresAt !== 'number' || expiresAt !== payload.exp
    ) return null;

    if (role === 'employee') {
      if (typeof payload.employeeId !== 'string' || typeof payload.employeeName !== 'string') return null;
      if (payload.employeeId !== subject) return null;
    }

    return {
      version: SESSION_VERSION,
      role,
      subject,
      issuedAt,
      expiresAt,
      ...(role === 'employee' ? {
        employeeId: safeText(payload.employeeId as string, 128),
        employeeName: safeText(payload.employeeName as string, 160)
      } : {})
    };
  } catch {
    return null;
  }
}

const cookieAttributes = `Path=/; HttpOnly; Secure; SameSite=Lax`;

export function setSessionCookie(response: Response, token: string): void {
  response.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${token}; Max-Age=${SESSION_MAX_AGE_SECONDS}; ${cookieAttributes}`);
}

export function clearSessionCookie(response: Response): void {
  response.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${cookieAttributes}`);
}

export async function requireSession(request: Request): Promise<SessionIdentity> {
  const session = await readSession(request);
  if (!session) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return session;
}

export async function requireRole(request: Request, ...roles: SessionRole[]): Promise<SessionIdentity> {
  const session = await requireSession(request);
  if (!roles.includes(session.role)) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  return session;
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  const forwardedHost = request.headers['x-forwarded-host'];
  const forwardedProto = request.headers['x-forwarded-proto'];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host;
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'https';
  if (!host) return false;
  try {
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

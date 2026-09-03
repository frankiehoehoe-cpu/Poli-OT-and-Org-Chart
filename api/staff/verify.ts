import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

const equal = (candidate: string, expected: string) => {
  const left = Buffer.from(candidate); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

export default function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ verified: false });
  const role = request.body?.role;
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  const expected = role === 'supervisor' ? process.env.SUPERVISOR_PASSWORD : role === 'manager' ? process.env.MANAGER_PASSWORD : undefined;
  if (!expected || !password || password.length > 128 || !equal(password, expected)) return response.status(401).json({ verified: false });
  return response.status(200).json({ verified: true, role });
}

import type { Request, Response } from 'express';
import { readSession } from '../_session.js';

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  if (request.method !== 'GET') return response.status(405).json({ authenticated: false });
  const session = await readSession(request);
  if (!session) return response.status(401).json({ authenticated: false });
  return response.status(200).json({ authenticated: true, identity: session });
}

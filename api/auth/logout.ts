import type { Request, Response } from 'express';
import { clearSessionCookie, isSameOrigin } from '../_session.js';

export default function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ authenticated: false });
  if (!isSameOrigin(request)) return response.status(403).json({ authenticated: false });
  clearSessionCookie(response);
  return response.status(200).json({ authenticated: false });
}

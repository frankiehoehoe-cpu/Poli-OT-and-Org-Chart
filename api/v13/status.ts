import type { Request, Response } from 'express';
import { isV13IsolatedTestMode } from '../_v13Collections.js';

export default function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  if (request.method !== 'GET') return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  return response.status(200).json({ isolatedTestMode: isV13IsolatedTestMode() });
}

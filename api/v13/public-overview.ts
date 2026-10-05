import type { Request, Response } from 'express';
import { ensureCurrentPublicOverview, publicOverviewRealtimeLocation } from '../_publicOverview.js';

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  if (request.method !== 'GET') return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const snapshot = await ensureCurrentPublicOverview();
    return response.status(200).json({
      ...snapshot,
      realtime: publicOverviewRealtimeLocation()
    });
  } catch (error) {
    console.error('Public V1.3 overview failed', error instanceof Error ? error.message : 'Unknown error');
    return response.status(503).json({ error: 'PUBLIC_V13_OVERVIEW_UNAVAILABLE' });
  }
}

import type { Request, Response } from 'express';
import { listEmployees, publicEmployee } from './_firebaseAdmin.js';

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  try {
    const employees = (await listEmployees()).map(publicEmployee);
    response.setHeader('Cache-Control', 'private, no-store');
    return response.status(200).json({ employees });
  } catch (error) {
    console.error('Safe employee list failed', error instanceof Error ? error.message : 'Unknown error');
    return response.status(503).json({ error: 'Employee service unavailable' });
  }
}

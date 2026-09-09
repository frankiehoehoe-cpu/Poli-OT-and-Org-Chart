import type { Request, Response } from 'express';
import { getEmployee, publicEmployee, verifyPassword } from '../_firebaseAdmin.js';

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST') return response.status(405).json({ verified: false });
  const employeeId = typeof request.body?.employeeId === 'string' ? request.body.employeeId : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!employeeId || !password || password.length > 128) return response.status(400).json({ verified: false });
  try {
    const employee = await getEmployee(employeeId);
    if (!employee || employee.role !== 'employee' || !verifyPassword(employee, password)) return response.status(401).json({ verified: false });
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json({ verified: true, employee: publicEmployee(employee) });
  } catch (error) {
    console.error('Employee verification failed', error instanceof Error ? error.message : 'Unknown error');
    return response.status(503).json({ verified: false });
  }
}

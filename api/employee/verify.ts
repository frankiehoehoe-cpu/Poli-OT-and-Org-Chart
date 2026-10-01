import type { Request, Response } from 'express';
import { publicEmployee, verifyPassword } from '../_firebaseAdmin.js';
import { getEffectiveEmployee } from '../_v13Employees.js';
import { createSession, isSameOrigin, setSessionCookie } from '../_session.js';

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ verified: false });
  if (!isSameOrigin(request)) return response.status(403).json({ verified: false });
  const employeeId = typeof request.body?.employeeId === 'string' ? request.body.employeeId : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!employeeId || !password || password.length > 128) return response.status(400).json({ verified: false });
  try {
    const employee = await getEffectiveEmployee(employeeId);
    if (!employee || employee.role !== 'employee' || !verifyPassword(employee, password)) return response.status(401).json({ verified: false });
    const safeEmployee = publicEmployee(employee);
    const token = await createSession({ role: 'employee', subject: safeEmployee.id, employeeId: safeEmployee.id, employeeName: safeEmployee.name });
    setSessionCookie(response, token);
    return response.status(200).json({ verified: true, employee: safeEmployee });
  } catch (error) {
    console.error('Employee verification failed', error instanceof Error ? error.message : 'Unknown error');
    return response.status(503).json({ verified: false });
  }
}

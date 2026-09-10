import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { createServerDocument, deleteServerDocument, getEmployee, getServerDocument, hashPassword, publicEmployee, type ServerEmployee, updateServerDocument } from '../_firebaseAdmin.js';
import { isSameOrigin, requireRole } from '../_session.js';
import { badRequest, requireV13WritesEnabled, safeString, sendApiError } from '../_v13.js';
import type { EmploymentType } from '../../src/lib/workflows.js';

const requestedEmploymentType = (value: unknown): EmploymentType | undefined =>
  value === 'part-time' ? 'part-time' : value === 'full-time' ? 'full-time' : undefined;

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  try {
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    if (!isSameOrigin(request)) return response.status(403).json({ error: 'FORBIDDEN' });
    await requireRole(request, 'manager');

    if (request.method === 'POST') {
      const name = safeString(request.body?.name, 160);
      const password = safeString(request.body?.password, 128);
      const department = safeString(request.body?.department, 120) || 'deptOther';
      const employmentType = requestedEmploymentType(request.body?.employmentType);
      if (!name || !password) throw badRequest('Name and password are required');
      if (request.body?.employmentType !== undefined) requireV13WritesEnabled();
      const id = randomUUID();
      const employee: ServerEmployee = { id, name, role: 'employee', department, passwordHash: hashPassword(password), ...(employmentType ? { employmentType } : {}) };
      await createServerDocument('employees', id, employee as unknown as Record<string, unknown>);
      return response.status(201).json({ employee: publicEmployee(employee) });
    }

    const id = safeString(request.body?.id, 128);
    const document = await getServerDocument<Record<string, unknown>>('employees', id);
    const existing = await getEmployee(id);
    if (!document || !existing) return response.status(404).json({ error: 'EMPLOYEE_NOT_FOUND' });

    if (request.method === 'DELETE') {
      await deleteServerDocument('employees', id, document.updateTime);
      return response.status(200).json({ deleted: true });
    }

    const employmentType = requestedEmploymentType(request.body?.employmentType);
    if (request.body?.employmentType !== undefined) requireV13WritesEnabled();
    const password = safeString(request.body?.password, 128);
    const updated: ServerEmployee = {
      ...existing,
      name: safeString(request.body?.name, 160) || existing.name,
      department: safeString(request.body?.department, 120) || existing.department,
      ...(employmentType ? { employmentType } : {}),
      ...(password ? { password: undefined, passwordHash: hashPassword(password) } : {})
    };
    await updateServerDocument('employees', id, updated as unknown as Record<string, unknown>, document.updateTime);
    return response.status(200).json({ employee: publicEmployee(updated) });
  } catch (error) {
    return sendApiError(response, error);
  }
}

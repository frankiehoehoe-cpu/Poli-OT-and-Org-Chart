import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { createServerDocument, getServerDocument, listEmployees, listServerDocuments, updateServerDocument } from '../_firebaseAdmin.js';
import { readSession } from '../_session.js';
import { badRequest, requireV13Mutation, safeString, safeStringArray, sendApiError } from '../_v13.js';
import { getSingaporeDate, type ShiftNotice } from '../../src/lib/workflows.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  try {
    if (request.method === 'GET') {
      const session = await readSession(request);
      const date = safeString(request.query?.date, 10) || getSingaporeDate();
      const notices = (await listServerDocuments<ShiftNotice>('shiftNotices')).map((document) => ({ ...document.data, id: document.id }));
      return response.status(200).json({
        notices: session?.role === 'supervisor' || session?.role === 'manager'
          ? notices
          : notices.filter((notice) => notice.status === 'ACTIVE' && notice.visibility === 'VISIBLE' && date >= notice.effectiveStartDate && date <= notice.effectiveEndDate)
      });
    }

    if (request.method === 'POST') {
      const session = await requireV13Mutation(request, 'supervisor');
      const now = new Date().toISOString();
      const employeeIds = safeStringArray(request.body?.assignedEmployeeIds);
      const employees = new Map((await listEmployees()).map((employee) => [employee.id, employee]));
      const names = employeeIds.map((id) => employees.get(id)?.name).filter((name): name is string => Boolean(name));
      const effectiveStartDate = safeString(request.body?.effectiveStartDate, 10);
      const effectiveEndDate = safeString(request.body?.effectiveEndDate, 10);
      const startTime = safeString(request.body?.startTime, 5);
      const endTime = safeString(request.body?.endTime, 5);
      if (!safeString(request.body?.shiftName, 160) || !employeeIds.length || names.length !== employeeIds.length || !datePattern.test(effectiveStartDate) || !datePattern.test(effectiveEndDate) || effectiveStartDate > effectiveEndDate || !timePattern.test(startTime) || !timePattern.test(endTime)) {
        throw badRequest('Invalid shift notice');
      }
      const notice: ShiftNotice = {
        id: randomUUID(),
        shiftName: safeString(request.body.shiftName, 160),
        status: 'ACTIVE',
        visibility: request.body?.visibility === 'HIDDEN' ? 'HIDDEN' : 'VISIBLE',
        effectiveStartDate,
        effectiveEndDate,
        startTime,
        endTime,
        assignedEmployeeIds: employeeIds,
        assignedEmployeeNamesSnapshot: names,
        department: safeString(request.body?.department, 120) || undefined,
        note: safeString(request.body?.note, 1000) || undefined,
        createdBy: session.subject,
        createdAt: now,
        updatedAt: now
      };
      await createServerDocument('shiftNotices', notice.id, notice as unknown as Record<string, unknown>);
      return response.status(201).json({ notice });
    }

    if (request.method === 'PATCH') {
      const session = await requireV13Mutation(request, 'supervisor');
      const id = safeString(request.body?.id, 128);
      const document = await getServerDocument<ShiftNotice>('shiftNotices', id);
      if (!document) return response.status(404).json({ error: 'NOTICE_NOT_FOUND' });
      const now = new Date().toISOString();
      const action = safeString(request.body?.action, 40);
      const notice: ShiftNotice = action === 'end'
        ? { ...document.data, id, status: 'ENDED', endedAt: now, endedBy: session.subject, updatedAt: now }
        : action === 'visibility'
          ? { ...document.data, id, visibility: request.body?.visibility === 'HIDDEN' ? 'HIDDEN' : 'VISIBLE', updatedAt: now }
          : { ...document.data, id, note: safeString(request.body?.note, 1000) || undefined, updatedAt: now };
      await updateServerDocument('shiftNotices', id, notice as unknown as Record<string, unknown>, document.updateTime);
      return response.status(200).json({ notice });
    }

    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendApiError(response, error);
  }
}

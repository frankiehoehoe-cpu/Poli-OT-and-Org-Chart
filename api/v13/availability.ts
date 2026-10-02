import type { Request, Response } from 'express';
import { createServerDocument, deleteServerDocument, getServerDocument, listServerDocuments } from '../_firebaseAdmin.js';
import { getV13Collections } from '../_v13Collections.js';
import { getEffectiveEmployee } from '../_v13Employees.js';
import { requireSession } from '../_session.js';
import { badRequest, conflict, requireV13Mutation, safeString, sendApiError } from '../_v13.js';
import { getEmploymentType, getSingaporeDate, type PartTimeAvailability } from '../../src/lib/workflows.js';

const availabilityId = (employeeId: string, date: string) => `${employeeId}__${date}`;

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  try {
    const collections = getV13Collections();

    if (request.method === 'GET') {
      const session = await requireSession(request);
      const month = safeString(request.query?.month, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('Valid month is required');
      const items = (await listServerDocuments<PartTimeAvailability>(collections.partTimeAvailability))
        .map((document) => ({ ...document.data, id: document.id }))
        .filter((item) => item.date.startsWith(month));

      return response.status(200).json({
        availability: session.role === 'employee'
          ? items.filter((item) => item.employeeId === session.employeeId)
          : items
      });
    }

    if (request.method === 'POST') {
      const session = await requireV13Mutation(request, 'employee');
      if (!session.employeeId) throw Object.assign(new Error('Employee identity required'), { statusCode: 401 });
      const employee = await getEffectiveEmployee(session.employeeId);
      if (!employee || employee.role !== 'employee') throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
      if (getEmploymentType(employee) !== 'part-time') throw conflict('Only Part-Time employees can mark availability');

      const date = safeString(request.body?.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Valid date is required');

      const today = getSingaporeDate();
      const currentMonth = today.slice(0, 7);
      if (!date.startsWith(currentMonth)) throw conflict('Availability can only be marked for the current Singapore month');
      if (date < today) throw conflict('Past dates cannot be marked available');

      const id = availabilityId(session.employeeId, date);
      const existing = await getServerDocument<PartTimeAvailability>(collections.partTimeAvailability, id);
      if (existing) return response.status(200).json({ availability: { ...existing.data, id } });

      const now = new Date().toISOString();
      const availability: PartTimeAvailability = {
        id,
        employeeId: session.employeeId,
        employeeNameSnapshot: employee.name,
        date,
        createdAt: now,
        updatedAt: now
      };
      await createServerDocument(collections.partTimeAvailability, id, availability as unknown as Record<string, unknown>);
      return response.status(201).json({ availability });
    }

    if (request.method === 'DELETE') {
      const session = await requireV13Mutation(request, 'employee');
      if (!session.employeeId) throw Object.assign(new Error('Employee identity required'), { statusCode: 401 });
      const date = safeString(request.body?.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Valid date is required');
      const id = availabilityId(session.employeeId, date);
      const document = await getServerDocument<PartTimeAvailability>(collections.partTimeAvailability, id);
      if (!document) return response.status(200).json({ deleted: true });
      if (document.data.employeeId !== session.employeeId) throw conflict('Availability belongs to another employee');
      if (date < getSingaporeDate()) throw conflict('Past availability cannot be removed');
      await deleteServerDocument(collections.partTimeAvailability, id, document.updateTime);
      return response.status(200).json({ deleted: true });
    }

    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendApiError(response, error);
  }
}

import type { Request, Response } from 'express';
import { listServerDocuments } from '../_firebaseAdmin.js';
import { getV13Collections } from '../_v13Collections.js';
import { listEffectiveEmployees } from '../_v13Employees.js';
import { requireSession } from '../_session.js';
import { safeString, sendApiError } from '../_v13.js';
import { aggregateMixedMonth, getEmploymentType, getPartTimeMonthlyForecast, type LegacyOtRecord, type WorkAssignment, type WorkSubmission } from '../../src/lib/workflows.js';

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  try {
    if (request.method !== 'GET') return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const session = await requireSession(request);
    const collections = getV13Collections();
    const month = safeString(request.query?.month, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return response.status(400).json({ error: 'INVALID_MONTH' });
    const [legacyDocuments, submissionDocuments, assignmentDocuments, employees] = await Promise.all([
      listServerDocuments<LegacyOtRecord>('overtime'),
      listServerDocuments<WorkSubmission>(collections.submissions),
      listServerDocuments<WorkAssignment>(collections.assignments),
      listEffectiveEmployees()
    ]);
    const legacy = legacyDocuments.map((document) => ({ ...document.data, id: document.id }));
    const submissions = submissionDocuments.map((document) => ({ ...document.data, id: document.id }));
    const assignments = assignmentDocuments.map((document) => ({ ...document.data, id: document.id }));
    const aggregates = aggregateMixedMonth(month, legacy, submissions);
    const filtered = session.role === 'employee' ? aggregates.filter((aggregate) => aggregate.employeeId === session.employeeId) : aggregates;
    const partTimeEmployees = employees.filter((employee) => getEmploymentType(employee) === 'part-time');
    const visiblePartTimeEmployees = session.role === 'employee'
      ? partTimeEmployees.filter((employee) => employee.id === session.employeeId)
      : partTimeEmployees;
    const forecasts = visiblePartTimeEmployees.map((employee) => ({
      employeeId: employee.id,
      employeeName: employee.name,
      ...getPartTimeMonthlyForecast(assignments, submissions, employee.id, month)
    }));
    return response.status(200).json({ aggregates: filtered, forecasts });
  } catch (error) {
    return sendApiError(response, error);
  }
}

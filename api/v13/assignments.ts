import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { getServerDocument, listServerDocuments, updateServerDocument, createServerDocument, deleteServerDocument } from '../_firebaseAdmin.js';
import { getV13Collections } from '../_v13Collections.js';
import { getEffectiveEmployee, listEffectiveEmployees } from '../_v13Employees.js';
import { rebuildCurrentPublicOverview } from '../_publicOverview.js';
import { requireSession } from '../_session.js';
import { badRequest, conflict, requireV13Mutation, safeString, safeStringArray, sendApiError } from '../_v13.js';
import { getEffectiveShiftType, getEmploymentType, getSingaporeDate, isEmployeeEligibleForAssignment, type AssignmentMode, type FullTimeOtAvailability, type PartTimeAvailability, type ShiftType, type WorkAssignment, type WorkSubmission } from '../../src/lib/workflows.js';

const validDate = /^\d{4}-\d{2}-\d{2}$/;
const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;

const availabilityId = (employeeId: string, date: string) => `${employeeId}__${date}`;

const addCalendarDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};


function assignmentInput(body: Record<string, unknown>, existing?: WorkAssignment): WorkAssignment {
  const assignmentMode = body.assignmentMode === 'work-shift' ? 'work-shift' : body.assignmentMode === 'ot-task' ? 'ot-task' : existing?.assignmentMode;
  const date = safeString(body.date ?? existing?.date, 10);
  const plannedStart = safeString(body.plannedStart ?? existing?.plannedStart, 5);
  const plannedEnd = safeString(body.plannedEnd ?? existing?.plannedEnd, 5);
  const assignedEmployeeIds = safeStringArray(body.assignedEmployeeIds ?? existing?.assignedEmployeeIds);
  const shiftType = body.shiftType === 'PART_TIME_SHIFT' || body.shiftType === 'SECOND_SHIFT' ? body.shiftType : existing?.shiftType;
  if (!assignmentMode || !validDate.test(date) || !validTime.test(plannedStart) || !validTime.test(plannedEnd) || !assignedEmployeeIds.length || (assignmentMode === 'work-shift' && !shiftType) || (assignmentMode === 'ot-task' && shiftType)) {
    throw badRequest('Invalid assignment');
  }
  return {
    id: existing?.id || safeString(body.id, 128) || randomUUID(),
    date,
    department: safeString(body.department ?? existing?.department, 120),
    workstation: safeString(body.workstation ?? existing?.workstation, 200),
    product: safeString(body.product ?? existing?.product, 200) || undefined,
    batchNo: safeString(body.batchNo ?? existing?.batchNo, 120) || undefined,
    plannedStart,
    plannedEnd,
    taskType: body.taskType === 'non-output' ? 'non-output' : body.taskType === 'output' ? 'output' : existing?.taskType || 'output',
    assignmentMode,
    ...(shiftType ? { shiftType } : {}),
    targetRequirement: safeString(body.targetRequirement ?? existing?.targetRequirement, 1000),
    status: existing?.status || 'PLANNED',
    assignedEmployeeIds,
    createdBy: existing?.createdBy || '',
    createdAt: existing?.createdAt || '',
    updatedAt: existing?.updatedAt || '',
    revision: existing?.revision || 0,
    actualResult: existing?.actualResult,
    completionStatus: existing?.completionStatus,
    supervisorNote: existing?.supervisorNote,
    closedAt: existing?.closedAt,
    closedBy: existing?.closedBy,
    cancelledAt: existing?.cancelledAt,
    cancelledBy: existing?.cancelledBy
  };
}

async function validateAssignedEmployees(ids: string[], mode: AssignmentMode, shiftType?: ShiftType) {
  const employees = await listEffectiveEmployees();
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  for (const id of ids) {
    const employee = byId.get(id);
    if (!employee || employee.role !== 'employee') throw badRequest('Unknown employee');
    if (!isEmployeeEligibleForAssignment(getEmploymentType(employee), mode, shiftType)) throw badRequest('Employee is not eligible for this assignment mode');
  }
}

async function validateNoDuplicateDailyAssignments(
  collectionName: string,
  employeeIds: string[],
  date: string,
  excludeAssignmentId?: string
) {
  const requested = new Set(employeeIds);
  const conflicts = (await listServerDocuments<WorkAssignment>(collectionName))
    .map((document) => ({ ...document.data, id: document.id }))
    .filter((assignment) =>
      assignment.id !== excludeAssignmentId &&
      assignment.date === date &&
      assignment.status !== 'CANCELLED' &&
      assignment.assignedEmployeeIds.some((employeeId) => requested.has(employeeId))
    );

  if (!conflicts.length) return;

  const conflictingIds = new Set(
    conflicts.flatMap((assignment) => assignment.assignedEmployeeIds.filter((employeeId) => requested.has(employeeId)))
  );
  const employees = await listEffectiveEmployees();
  const names = employees
    .filter((employee) => conflictingIds.has(employee.id))
    .map((employee) => employee.name)
    .sort((a, b) => a.localeCompare(b));

  throw conflict(`Employee already assigned on ${date}: ${names.join(', ') || [...conflictingIds].join(', ')}`);
}

async function resolveLegacyShiftType(assignment: WorkAssignment): Promise<WorkAssignment> {
  if (assignment.assignmentMode !== 'work-shift' || assignment.shiftType) return assignment;
  const employees = await listEffectiveEmployees();
  const types = employees.filter((employee) => assignment.assignedEmployeeIds.includes(employee.id)).map(getEmploymentType);
  return { ...assignment, shiftType: getEffectiveShiftType(assignment, types) };
}

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  try {
    const collections = getV13Collections();
    if (request.method === 'GET') {
      const session = await requireSession(request);
      if (request.query?.resource === 'ft-availability') {
        const items = (await listServerDocuments<FullTimeOtAvailability>(collections.fullTimeOtAvailability))
          .map((document) => ({ ...document.data, id: document.id }));
        return response.status(200).json({
          availability: session.role === 'employee'
            ? items.filter((item) => item.employeeId === session.employeeId)
            : items
        });
      }
      if (request.query?.resource === 'availability') {
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
      const assignments = await Promise.all((await listServerDocuments<WorkAssignment>(collections.assignments)).map((document) => resolveLegacyShiftType({ ...document.data, id: document.id })));
      return response.status(200).json({
        assignments: session.role === 'employee'
          ? assignments.filter((assignment) => session.employeeId && assignment.assignedEmployeeIds.includes(session.employeeId))
          : assignments
      });
    }

    if (request.method === 'POST' && request.body?.action === 'ft-availability-add') {
      const session = await requireV13Mutation(request, 'employee');
      if (!session.employeeId) throw Object.assign(new Error('Employee identity required'), { statusCode: 401 });
      const employee = await getEffectiveEmployee(session.employeeId);
      if (!employee || employee.role !== 'employee') throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
      if (getEmploymentType(employee) !== 'full-time') throw conflict('Only Full-Time employees can mark OT availability');

      const date = safeString(request.body?.date, 10);
      if (!validDate.test(date)) throw badRequest('Valid date is required');
      const today = getSingaporeDate();
      const lastAllowed = addCalendarDays(today, 6);
      if (date < today || date > lastAllowed) throw conflict('Full-Time OT availability can only be planned for the next 7 Singapore calendar days');

      const id = availabilityId(session.employeeId, date);
      const existing = await getServerDocument<FullTimeOtAvailability>(collections.fullTimeOtAvailability, id);
      if (existing) return response.status(200).json({ availability: { ...existing.data, id } });

      const now = new Date().toISOString();
      const availability: FullTimeOtAvailability = {
        id,
        employeeId: session.employeeId,
        employeeNameSnapshot: employee.name,
        date,
        createdAt: now,
        updatedAt: now
      };
      await createServerDocument(collections.fullTimeOtAvailability, id, availability as unknown as Record<string, unknown>);
      await rebuildCurrentPublicOverview().catch((error) => {
        console.error('Public overview refresh after FT availability add failed', error instanceof Error ? error.message : error);
      });
      return response.status(201).json({ availability });
    }

    if (request.method === 'DELETE' && request.body?.action === 'ft-availability-remove') {
      const session = await requireV13Mutation(request, 'employee');
      if (!session.employeeId) throw Object.assign(new Error('Employee identity required'), { statusCode: 401 });
      const date = safeString(request.body?.date, 10);
      if (!validDate.test(date)) throw badRequest('Valid date is required');

      const id = availabilityId(session.employeeId, date);
      const document = await getServerDocument<FullTimeOtAvailability>(collections.fullTimeOtAvailability, id);
      if (!document) return response.status(200).json({ deleted: true });
      if (document.data.employeeId !== session.employeeId) throw conflict('OT availability belongs to another employee');
      if (date < getSingaporeDate()) throw conflict('Past OT availability cannot be removed');

      await deleteServerDocument(collections.fullTimeOtAvailability, id, document.updateTime);
      await rebuildCurrentPublicOverview().catch((error) => {
        console.error('Public overview refresh after FT availability remove failed', error instanceof Error ? error.message : error);
      });
      return response.status(200).json({ deleted: true });
    }

    if (request.method === 'POST' && request.body?.action === 'availability-add') {
      const session = await requireV13Mutation(request, 'employee');
      if (!session.employeeId) throw Object.assign(new Error('Employee identity required'), { statusCode: 401 });
      const employee = await getEffectiveEmployee(session.employeeId);
      if (!employee || employee.role !== 'employee') throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
      if (getEmploymentType(employee) !== 'part-time') throw conflict('Only Part-Time employees can mark availability');
      const date = safeString(request.body?.date, 10);
      if (!validDate.test(date)) throw badRequest('Valid date is required');
      const today = getSingaporeDate();
      if (!date.startsWith(today.slice(0, 7))) throw conflict('Availability can only be marked for the current Singapore month');
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

    if (request.method === 'DELETE' && request.body?.action === 'availability-remove') {
      const session = await requireV13Mutation(request, 'employee');
      if (!session.employeeId) throw Object.assign(new Error('Employee identity required'), { statusCode: 401 });
      const date = safeString(request.body?.date, 10);
      if (!validDate.test(date)) throw badRequest('Valid date is required');
      const id = availabilityId(session.employeeId, date);
      const document = await getServerDocument<PartTimeAvailability>(collections.partTimeAvailability, id);
      if (!document) return response.status(200).json({ deleted: true });
      if (document.data.employeeId !== session.employeeId) throw conflict('Availability belongs to another employee');
      if (date < getSingaporeDate()) throw conflict('Past availability cannot be removed');
      await deleteServerDocument(collections.partTimeAvailability, id, document.updateTime);
      return response.status(200).json({ deleted: true });
    }

    if (request.method === 'POST') {
      const session = await requireV13Mutation(request, 'supervisor');
      const now = new Date().toISOString();
      const assignment = assignmentInput(request.body || {});
      await validateAssignedEmployees(assignment.assignedEmployeeIds, assignment.assignmentMode, assignment.shiftType);
      await validateNoDuplicateDailyAssignments(collections.assignments, assignment.assignedEmployeeIds, assignment.date);
      const created: WorkAssignment = { ...assignment, createdBy: session.subject, createdAt: now, updatedAt: now, revision: 1 };
      await createServerDocument(collections.assignments, created.id, created as unknown as Record<string, unknown>);
      await rebuildCurrentPublicOverview().catch((error) => {
        console.error('Public overview refresh after assignment create failed', error instanceof Error ? error.message : error);
      });
      return response.status(201).json({ assignment: created });
    }

    if (request.method === 'PATCH') {
      const session = await requireV13Mutation(request, 'supervisor');
      const id = safeString(request.body?.id, 128);
      const action = safeString(request.body?.action, 40);
      const document = await getServerDocument<WorkAssignment>(collections.assignments, id);
      if (!document) return response.status(404).json({ error: 'NOT_FOUND' });
      const assignment = await resolveLegacyShiftType({ ...document.data, id });
      const expectedRevision = Number(request.body?.expectedRevision);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== assignment.revision) throw conflict('Assignment changed');
      const submissions = (await listServerDocuments<WorkSubmission>(collections.submissions)).map((item) => item.data).filter((submission) => submission.assignmentId === id);
      const submittedIds = new Set(submissions.map((submission) => submission.employeeId));
      const now = new Date().toISOString();
      let updated: WorkAssignment;

      if (action === 'edit' || action === 'manpower') {
        if (assignment.status === 'CLOSED' || assignment.status === 'CANCELLED') throw conflict('Assignment is not open');
        updated = assignmentInput(request.body?.assignment || {}, assignment);
        if (submissions.length && (updated.date !== assignment.date || updated.assignmentMode !== assignment.assignmentMode || updated.shiftType !== assignment.shiftType)) throw conflict('Date, mode and shift type are locked after submission');
        if ([...submittedIds].some((employeeId) => !updated.assignedEmployeeIds.includes(employeeId))) throw conflict('Submitted employee cannot be removed');
        await validateAssignedEmployees(updated.assignedEmployeeIds, updated.assignmentMode, updated.shiftType);
        await validateNoDuplicateDailyAssignments(collections.assignments, updated.assignedEmployeeIds, updated.date, assignment.id);
      } else if (action === 'cancel') {
        if (submissions.length) throw conflict('Assignment with submissions cannot be cancelled');
        if (assignment.status === 'CLOSED') throw conflict('Closed assignment cannot be cancelled');
        updated = { ...assignment, status: 'CANCELLED', cancelledAt: now, cancelledBy: session.subject };
      } else if (action === 'close' || action === 'late-close') {
        if (assignment.status === 'CLOSED' || assignment.status === 'CANCELLED') throw conflict('Assignment is not open');
        updated = {
          ...assignment,
          status: 'CLOSED',
          actualResult: safeString(request.body?.actualResult, 1000),
          completionStatus: request.body?.completionStatus === 'PARTIALLY_COMPLETED' ? 'PARTIALLY_COMPLETED' : request.body?.completionStatus === 'NOT_COMPLETED' ? 'NOT_COMPLETED' : 'COMPLETED',
          supervisorNote: safeString(request.body?.supervisorNote, 1000) || undefined,
          closedAt: now,
          closedBy: session.subject
        };
      } else {
        throw badRequest('Unknown assignment action');
      }

      updated = { ...updated, updatedAt: now, revision: assignment.revision + 1 };
      await updateServerDocument(collections.assignments, id, updated as unknown as Record<string, unknown>, document.updateTime);
      await rebuildCurrentPublicOverview().catch((error) => {
        console.error('Public overview refresh after assignment update failed', error instanceof Error ? error.message : error);
      });
      return response.status(200).json({ assignment: updated });
    }

    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendApiError(response, error);
  }
}

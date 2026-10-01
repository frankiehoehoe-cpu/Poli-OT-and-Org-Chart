import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { getServerDocument, listServerDocuments, updateServerDocument, createServerDocument } from '../_firebaseAdmin.js';
import { getV13Collections } from '../_v13Collections.js';
import { listEffectiveEmployees } from '../_v13Employees.js';
import { requireSession } from '../_session.js';
import { badRequest, conflict, requireV13Mutation, safeString, safeStringArray, sendApiError } from '../_v13.js';
import { getEffectiveShiftType, getEmploymentType, isEmployeeEligibleForAssignment, type AssignmentMode, type ShiftType, type WorkAssignment, type WorkSubmission } from '../../src/lib/workflows.js';

const validDate = /^\d{4}-\d{2}-\d{2}$/;
const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;

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
      const assignments = await Promise.all((await listServerDocuments<WorkAssignment>(collections.assignments)).map((document) => resolveLegacyShiftType({ ...document.data, id: document.id })));
      return response.status(200).json({
        assignments: session.role === 'employee'
          ? assignments.filter((assignment) => session.employeeId && assignment.assignedEmployeeIds.includes(session.employeeId))
          : assignments
      });
    }

    if (request.method === 'POST') {
      const session = await requireV13Mutation(request, 'supervisor');
      const now = new Date().toISOString();
      const assignment = assignmentInput(request.body || {});
      await validateAssignedEmployees(assignment.assignedEmployeeIds, assignment.assignmentMode, assignment.shiftType);
      const created: WorkAssignment = { ...assignment, createdBy: session.subject, createdAt: now, updatedAt: now, revision: 1 };
      await createServerDocument(collections.assignments, created.id, created as unknown as Record<string, unknown>);
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
      return response.status(200).json({ assignment: updated });
    }

    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendApiError(response, error);
  }
}

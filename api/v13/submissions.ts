import type { Request, Response } from 'express';
import { commitServerDocuments, getEmployee, getServerDocument, listServerDocuments, updateServerDocument } from '../_firebaseAdmin.js';
import { requireSession } from '../_session.js';
import { badRequest, conflict, requireV13Mutation, safeString, sendApiError } from '../_v13.js';
import {
  applyEffectiveCorrection,
  calculateWorkedHours,
  canEmployeeSubmit,
  deterministicSubmissionId,
  getEmploymentType,
  getSingaporeDate,
  type WorkAssignment,
  type WorkSubmission
} from '../../src/lib/workflows.js';

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  try {
    if (request.method === 'GET') {
      const session = await requireSession(request);
      const month = safeString(request.query?.month, 7);
      const submissions = (await listServerDocuments<WorkSubmission>('workSubmissions'))
        .map((document) => ({ ...document.data, id: document.id }))
        .filter((submission) => !month || submission.taskDate.startsWith(month));
      return response.status(200).json({
        submissions: session.role === 'employee'
          ? submissions.filter((submission) => submission.employeeId === session.employeeId)
          : submissions
      });
    }

    if (request.method === 'POST') {
      const session = await requireV13Mutation(request, 'employee');
      if (!session.employeeId) throw Object.assign(new Error('Employee identity required'), { statusCode: 401 });
      const assignmentId = safeString(request.body?.assignmentId, 128);
      const assignmentDocument = await getServerDocument<WorkAssignment>('workAssignments', assignmentId);
      if (!assignmentDocument) return response.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
      const assignment = { ...assignmentDocument.data, id: assignmentId };
      const employee = await getEmployee(session.employeeId);
      if (!employee || employee.role !== 'employee') throw Object.assign(new Error('Employee not found'), { statusCode: 401 });
      const employmentType = getEmploymentType(employee);
      const id = deterministicSubmissionId(assignmentId, session.employeeId);
      const existing = await getServerDocument<WorkSubmission>('workSubmissions', id);
      if (!canEmployeeSubmit({ employeeId: session.employeeId, employmentType, assignment, singaporeDate: getSingaporeDate(), submissionExists: Boolean(existing) })) {
        throw conflict('Submission is not permitted');
      }
      const now = new Date().toISOString();
      const actualWorkstation = safeString(request.body?.actualWorkstation, 200) || assignment.workstation;
      const common = {
        id,
        assignmentId,
        employeeId: session.employeeId,
        employeeNameSnapshot: employee.name,
        employmentTypeSnapshot: employmentType,
        assignmentMode: assignment.assignmentMode,
        taskDate: assignment.date,
        assignedWorkstation: assignment.workstation,
        actualWorkstation,
        submissionStatus: 'SUBMITTED' as const,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
        correctionHistory: []
      };
      let submission: WorkSubmission;
      if (employmentType === 'full-time') {
        const hours = Number(request.body?.otHours);
        if (!Number.isFinite(hours) || hours < 0.5 || hours > 12 || !Number.isInteger(hours * 2)) throw badRequest('OT hours must use 0.5-hour increments between 0.5 and 12');
        submission = { ...common, originalOtHours: hours, effectiveOtHours: hours };
      } else {
        const originalStart = safeString(request.body?.actualStart, 5);
        const originalEnd = safeString(request.body?.actualEnd, 5);
        const workedHours = calculateWorkedHours(originalStart, originalEnd);
        if (workedHours === null) throw badRequest('Actual start and end are invalid');
        submission = { ...common, originalStart, originalEnd, originalWorkedHours: workedHours, effectiveWorkedHours: workedHours };
      }
      const updatedAssignment: WorkAssignment = {
        ...assignment,
        status: assignment.status === 'PLANNED' ? 'IN_PROGRESS' : assignment.status,
        updatedAt: now,
        revision: assignment.revision + 1
      };
      await commitServerDocuments([
        { collection: 'workSubmissions', id, data: submission as unknown as Record<string, unknown>, exists: false },
        { collection: 'workAssignments', id: assignmentId, data: updatedAssignment as unknown as Record<string, unknown>, updateTime: assignmentDocument.updateTime }
      ]);
      return response.status(201).json({ submission });
    }

    if (request.method === 'PATCH') {
      const session = await requireV13Mutation(request, 'supervisor');
      const id = safeString(request.body?.id, 256);
      const document = await getServerDocument<WorkSubmission>('workSubmissions', id);
      if (!document) return response.status(404).json({ error: 'SUBMISSION_NOT_FOUND' });
      const correctedAt = new Date().toISOString();
      const corrected = applyEffectiveCorrection({ ...document.data, id }, {
        hours: request.body?.hours === undefined ? undefined : Number(request.body.hours),
        start: safeString(request.body?.start, 5) || undefined,
        end: safeString(request.body?.end, 5) || undefined,
        note: safeString(request.body?.note, 1000),
        correctedBy: session.subject,
        correctedAt
      });
      await updateServerDocument('workSubmissions', id, corrected as unknown as Record<string, unknown>, document.updateTime);
      return response.status(200).json({ submission: corrected });
    }

    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendApiError(response, error);
  }
}

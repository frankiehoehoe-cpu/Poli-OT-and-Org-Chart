import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { commitServerDocuments, getServerDocument, listServerDocuments, updateServerDocument } from '../_firebaseAdmin.js';
import { getV13Collections } from '../_v13Collections.js';
import { getEffectiveEmployee } from '../_v13Employees.js';
import { updateCurrentOverviewForSubmission } from '../_publicOverview.js';
import { requireSession } from '../_session.js';
import { badRequest, conflict, requireV13Mutation, safeString, sendApiError } from '../_v13.js';
import {
  applyEffectiveCorrection,
  calculateWorkedHours,
  canEmployeeSubmit,
  deterministicSubmissionId,
  getEffectiveShiftType,
  getEmploymentType,
  getSingaporeDate,
  getSingaporeTime,
  isFullTimeOtSubmissionOpen,
  isPartTimeWorkSubmissionOpen,
  type WorkAssignment,
  type WorkSubmission
} from '../../src/lib/workflows.js';

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  try {
    const collections = getV13Collections();
    if (request.method === 'GET') {
      const session = await requireSession(request);
      const month = safeString(request.query?.month, 7);
      const submissions = (await listServerDocuments<WorkSubmission>(collections.submissions))
        .map((document) => ({ ...document.data, id: document.id }))
        .filter((submission) => !month || submission.taskDate.startsWith(month));
      return response.status(200).json({
        submissions: session.role === 'employee'
          ? submissions.filter((submission) => submission.employeeId === session.employeeId)
          : submissions
      });
    }

    if (request.method === 'POST' && request.body?.action === 'manual-entry') {
      const session = await requireV13Mutation(request, 'supervisor');
      const employeeId = safeString(request.body?.employeeId, 128);
      const date = safeString(request.body?.date, 10);
      const startTime = safeString(request.body?.startTime, 5);
      const endTime = safeString(request.body?.endTime, 5);
      const hours = Number(request.body?.hours);
      if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
        throw badRequest('Employee, date, start time and end time are required');
      }
      if (date > getSingaporeDate()) throw conflict('Supervisor manual entry cannot use a future date');

      const employee = await getEffectiveEmployee(employeeId);
      if (!employee || employee.role !== 'employee') throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
      const employmentType = getEmploymentType(employee);
      const elapsedHours = calculateWorkedHours(startTime, endTime);
      if (elapsedHours === null) throw badRequest('Start and end time are invalid');
      const validHours = employmentType === 'full-time'
        ? Number.isFinite(hours) && hours >= 0.5 && hours <= 12 && Number.isInteger(hours * 2)
        : Number.isFinite(hours) && hours > 0 && hours <= 24 && Number.isInteger(hours * 4);
      if (!validHours) throw badRequest(employmentType === 'full-time'
        ? 'Full-Time OT hours must use 0.5-hour increments between 0.5 and 12'
        : 'Part-Time worked hours must use 0.25-hour increments');
      if (hours > elapsedHours) throw badRequest('Recorded hours cannot exceed the start/end time span');

      const sameDaySubmissions = (await listServerDocuments<WorkSubmission>(collections.submissions))
        .map((document) => document.data)
        .filter((submission) => submission.employeeId === employeeId && submission.taskDate === date && submission.shiftTypeSnapshot !== 'SECOND_SHIFT');
      if (sameDaySubmissions.length) throw conflict('A V1.3 record already exists for this employee/date. Use Correct instead');

      const now = new Date().toISOString();
      const assignmentId = randomUUID();
      const submissionId = deterministicSubmissionId(assignmentId, employeeId);
      const assignmentMode = employmentType === 'part-time' ? 'work-shift' as const : 'ot-task' as const;
      const shiftType = employmentType === 'part-time' ? 'PART_TIME_SHIFT' as const : undefined;
      const workstation = 'Supervisor Manual Entry / 主管补录';
      const assignment: WorkAssignment = {
        id: assignmentId,
        date,
        department: employee.department || 'Production',
        workstation,
        plannedStart: startTime,
        plannedEnd: endTime,
        taskType: 'non-output',
        assignmentMode,
        ...(shiftType ? { shiftType } : {}),
        targetRequirement: 'Supervisor manual entry / 主管补录',
        status: 'CLOSED',
        assignedEmployeeIds: [employeeId],
        createdBy: session.subject,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        completionStatus: 'COMPLETED',
        actualResult: 'Supervisor manual entry',
        supervisorNote: 'Supervisor manual entry',
        closedAt: now,
        closedBy: session.subject,
        manualEntry: true
      };
      const common = {
        id: submissionId,
        assignmentId,
        employeeId,
        employeeNameSnapshot: employee.name,
        employmentTypeSnapshot: employmentType,
        assignmentMode,
        ...(shiftType ? { shiftTypeSnapshot: shiftType } : {}),
        taskDate: date,
        assignedWorkstation: workstation,
        actualWorkstation: workstation,
        submissionStatus: 'SUBMITTED' as const,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
        correctionHistory: [],
        lateEntry: true,
        enteredByRole: 'supervisor' as const,
        enteredBy: session.subject,
        lateEntryReason: 'Supervisor manual entry',
        lateEnteredAt: now
      };
      const submission: WorkSubmission = employmentType === 'part-time'
        ? { ...common, originalStart: startTime, originalEnd: endTime, originalWorkedHours: hours, effectiveWorkedHours: hours }
        : { ...common, originalOtHours: hours, effectiveOtHours: hours };

      await commitServerDocuments([
        { collection: collections.assignments, id: assignmentId, data: assignment as unknown as Record<string, unknown>, exists: false },
        { collection: collections.submissions, id: submissionId, data: submission as unknown as Record<string, unknown>, exists: false }
      ]);
      return response.status(201).json({ submission });
    }

    if (request.method === 'POST' && request.body?.action === 'late-submit') {
      const session = await requireV13Mutation(request, 'supervisor');
      const assignmentId = safeString(request.body?.assignmentId, 128);
      const employeeId = safeString(request.body?.employeeId, 128);
      const reason = safeString(request.body?.reason, 1000);
      if (!assignmentId || !employeeId || !reason) throw badRequest('Assignment, employee and late-entry reason are required');
      const assignmentDocument = await getServerDocument<WorkAssignment>(collections.assignments, assignmentId);
      if (!assignmentDocument) return response.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
      const assignment = { ...assignmentDocument.data, id: assignmentId };
      if (assignment.status === 'CANCELLED') throw conflict('Cancelled assignment cannot receive a late submission');
      if (assignment.date >= getSingaporeDate()) throw conflict('Late submission is only available for past assignment dates');
      if (!assignment.assignedEmployeeIds.includes(employeeId)) throw conflict('Employee is not assigned to this assignment');
      const employee = await getEffectiveEmployee(employeeId);
      if (!employee || employee.role !== 'employee') throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
      const employmentType = getEmploymentType(employee);
      const shiftType = getEffectiveShiftType(assignment, [employmentType]);
      if (shiftType === 'SECOND_SHIFT') throw conflict('Second Shift does not accept hours submissions');
      if (employmentType === 'full-time' && assignment.assignmentMode !== 'ot-task') throw conflict('Full-Time late entry requires an OT task');
      if (employmentType === 'part-time' && assignment.assignmentMode !== 'work-shift') throw conflict('Part-Time late entry requires a work shift');
      const id = deterministicSubmissionId(assignmentId, employeeId);
      const existing = await getServerDocument<WorkSubmission>(collections.submissions, id);
      if (existing) throw conflict('Submission already exists');
      const now = new Date().toISOString();
      const common = {
        id,
        assignmentId,
        employeeId,
        employeeNameSnapshot: employee.name,
        employmentTypeSnapshot: employmentType,
        assignmentMode: assignment.assignmentMode,
        ...(shiftType ? { shiftTypeSnapshot: shiftType } : {}),
        taskDate: assignment.date,
        assignedWorkstation: assignment.workstation,
        actualWorkstation: safeString(request.body?.actualWorkstation, 200) || assignment.workstation,
        submissionStatus: 'SUBMITTED' as const,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
        correctionHistory: [],
        lateEntry: true,
        enteredByRole: 'supervisor' as const,
        enteredBy: session.subject,
        lateEntryReason: reason,
        lateEnteredAt: now
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
      await commitServerDocuments([
        { collection: collections.submissions, id, data: submission as unknown as Record<string, unknown>, exists: false }
      ]);
      await updateCurrentOverviewForSubmission(submission).catch((error) => {
        console.error('Public overview refresh after late submission failed', error instanceof Error ? error.message : error);
      });
      return response.status(201).json({ submission });
    }

    if (request.method === 'POST') {
      const session = await requireV13Mutation(request, 'employee');
      if (!session.employeeId) throw Object.assign(new Error('Employee identity required'), { statusCode: 401 });
      const assignmentId = safeString(request.body?.assignmentId, 128);
      const assignmentDocument = await getServerDocument<WorkAssignment>(collections.assignments, assignmentId);
      if (!assignmentDocument) return response.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
      const assignment = { ...assignmentDocument.data, id: assignmentId };
      const employee = await getEffectiveEmployee(session.employeeId);
      if (!employee || employee.role !== 'employee') throw Object.assign(new Error('Employee not found'), { statusCode: 401 });
      const employmentType = getEmploymentType(employee);
      const shiftType = getEffectiveShiftType(assignment, [employmentType]);
      const effectiveAssignment = shiftType ? { ...assignment, shiftType } : assignment;
      const id = deterministicSubmissionId(assignmentId, session.employeeId);
      const existing = await getServerDocument<WorkSubmission>(collections.submissions, id);
      const singaporeDate = getSingaporeDate();
      const singaporeTime = getSingaporeTime();
      if (!canEmployeeSubmit({
        employeeId: session.employeeId,
        employmentType,
        assignment: effectiveAssignment,
        singaporeDate,
        singaporeTime,
        submissionExists: Boolean(existing)
      })) {
        if (employmentType === 'full-time' && effectiveAssignment.assignmentMode === 'ot-task') {
          if (effectiveAssignment.date !== singaporeDate) {
            throw conflict('OT submission is only allowed on the assigned Singapore date. Missed submissions require Supervisor late entry');
          }
          if (!isFullTimeOtSubmissionOpen(employmentType, effectiveAssignment, singaporeDate, singaporeTime)) {
            throw conflict('Full-Time OT submission is only allowed from 20:00 to 23:59 Singapore time');
          }
        }
        if (employmentType === 'part-time' && effectiveAssignment.assignmentMode === 'work-shift' && effectiveAssignment.shiftType === 'PART_TIME_SHIFT') {
          if (effectiveAssignment.date !== singaporeDate) {
            throw conflict('Part-Time worked hours are only allowed on the assigned Singapore date. Missed submissions require Supervisor late entry');
          }
          if (!isPartTimeWorkSubmissionOpen(employmentType, effectiveAssignment, singaporeDate, singaporeTime)) {
            throw conflict('Part-Time worked hours are only allowed from 17:00 to 23:59 Singapore time');
          }
        }
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
        ...(shiftType ? { shiftTypeSnapshot: shiftType } : {}),
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
        { collection: collections.submissions, id, data: submission as unknown as Record<string, unknown>, exists: false },
        { collection: collections.assignments, id: assignmentId, data: updatedAssignment as unknown as Record<string, unknown>, updateTime: assignmentDocument.updateTime }
      ]);
      await updateCurrentOverviewForSubmission(submission).catch((error) => {
        console.error('Public overview refresh after submission failed', error instanceof Error ? error.message : error);
      });
      return response.status(201).json({ submission });
    }

    if (request.method === 'PATCH') {
      const session = await requireV13Mutation(request, 'supervisor');
      const id = safeString(request.body?.id, 256);
      const document = await getServerDocument<WorkSubmission>(collections.submissions, id);
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
      await updateServerDocument(collections.submissions, id, corrected as unknown as Record<string, unknown>, document.updateTime);
      await updateCurrentOverviewForSubmission(corrected).catch((error) => {
        console.error('Public overview refresh after correction failed', error instanceof Error ? error.message : error);
      });
      return response.status(200).json({ submission: corrected });
    }

    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendApiError(response, error);
  }
}

import type { Request, Response } from 'express';
import { listServerDocuments } from '../_firebaseAdmin.js';
import { getV13Collections } from '../_v13Collections.js';
import { listEffectiveEmployees } from '../_v13Employees.js';
import { getEffectiveShiftType, getEmploymentType, getSingaporeDate, isEmployeeEligibleForAssignment, type ShiftType, type WorkAssignment, type WorkSubmission } from '../../src/lib/workflows.js';

export interface PublicAssignmentParticipant {
  employeeId: string;
  employeeName: string;
  employmentType: 'full-time' | 'part-time';
  status: 'PENDING' | 'SUBMITTED' | 'MISMATCH';
  effectiveHours?: number;
}

export interface PublicAssignment {
  id: string;
  date: string;
  assignmentMode: 'ot-task' | 'work-shift';
  shiftType?: ShiftType;
  department: string;
  workstation: string;
  product?: string;
  batchNo?: string;
  targetRequirement: string;
  plannedStart: string;
  plannedEnd: string;
  status: WorkAssignment['status'];
  participants: PublicAssignmentParticipant[];
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  if (request.method !== 'GET') return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const today = getSingaporeDate();
    const secondShiftPreviewEnd = addCalendarDays(today, 2);
    const collections = getV13Collections();
    const [assignmentDocuments, submissionDocuments, employees] = await Promise.all([
      listServerDocuments<WorkAssignment>(collections.assignments),
      listServerDocuments<WorkSubmission>(collections.submissions),
      listEffectiveEmployees()
    ]);

    const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
    const submissions = new Map(
      submissionDocuments.map((document) => {
        const submission = { ...document.data, id: document.id };
        return [`${submission.assignmentId}:${submission.employeeId}`, submission] as const;
      })
    );

    const assignments: PublicAssignment[] = assignmentDocuments
      .map((document) => ({ ...document.data, id: document.id }))
      .filter((assignment) => assignment.status !== 'CANCELLED')
      .map((assignment) => {
        const assignedTypes = assignment.assignedEmployeeIds.map((id) => employeeMap.get(id)).filter(Boolean).map((employee) => getEmploymentType(employee!));
        const shiftType = getEffectiveShiftType(assignment, assignedTypes);
        return { assignment, shiftType };
      })
      .filter(({ assignment, shiftType }) => assignment.date === today || (shiftType === 'SECOND_SHIFT' && assignment.date > today && assignment.date <= secondShiftPreviewEnd))
      .sort((left, right) => left.assignment.date.localeCompare(right.assignment.date) || left.assignment.plannedStart.localeCompare(right.assignment.plannedStart))
      .map(({ assignment, shiftType }) => ({
        id: assignment.id,
        date: assignment.date,
        assignmentMode: assignment.assignmentMode,
        ...(shiftType ? { shiftType } : {}),
        department: assignment.department,
        workstation: assignment.workstation,
        product: assignment.product,
        batchNo: assignment.batchNo,
        targetRequirement: assignment.targetRequirement,
        plannedStart: assignment.plannedStart,
        plannedEnd: assignment.plannedEnd,
        status: assignment.status,
        participants: assignment.assignedEmployeeIds.map((employeeId) => {
          const employee = employeeMap.get(employeeId);
          const submission = submissions.get(`${assignment.id}:${employeeId}`);
          const employmentType = employee ? getEmploymentType(employee) : 'full-time';
          const eligible = isEmployeeEligibleForAssignment(employmentType, assignment.assignmentMode, shiftType);
          return {
            employeeId,
            employeeName: employee?.name || employeeId,
            employmentType,
            status: submission ? 'SUBMITTED' as const : eligible ? 'PENDING' as const : 'MISMATCH' as const,
            ...(submission ? {
              effectiveHours: submission.employmentTypeSnapshot === 'part-time'
                ? submission.effectiveWorkedHours ?? submission.originalWorkedHours ?? 0
                : submission.effectiveOtHours ?? submission.originalOtHours ?? 0
            } : {})
          };
        })
      }));

    return response.status(200).json({ date: today, assignments });
  } catch (error) {
    console.error('Public V1.3 overview failed', error instanceof Error ? error.message : 'Unknown error');
    return response.status(503).json({ error: 'PUBLIC_V13_OVERVIEW_UNAVAILABLE' });
  }
}

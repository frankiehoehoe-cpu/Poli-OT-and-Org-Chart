import type { Request, Response } from 'express';
import { listEmployees, listServerDocuments } from '../_firebaseAdmin.js';
import { getV13Collections } from '../_v13Collections.js';
import { getSingaporeDate, type WorkAssignment, type WorkSubmission } from '../../src/lib/workflows.js';

export interface PublicAssignmentParticipant {
  employeeId: string;
  employeeName: string;
  employmentType: 'full-time' | 'part-time';
  status: 'PENDING' | 'SUBMITTED';
  effectiveHours?: number;
}

export interface PublicAssignment {
  id: string;
  date: string;
  assignmentMode: 'ot-task' | 'work-shift';
  workstation: string;
  product?: string;
  batchNo?: string;
  targetRequirement: string;
  plannedStart: string;
  plannedEnd: string;
  status: WorkAssignment['status'];
  participants: PublicAssignmentParticipant[];
}

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store');
  if (request.method !== 'GET') return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const today = getSingaporeDate();
    const collections = getV13Collections();
    const [assignmentDocuments, submissionDocuments, employees] = await Promise.all([
      listServerDocuments<WorkAssignment>(collections.assignments),
      listServerDocuments<WorkSubmission>(collections.submissions),
      listEmployees()
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
      .filter((assignment) => assignment.date === today && assignment.status !== 'CANCELLED')
      .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart))
      .map((assignment) => ({
        id: assignment.id,
        date: assignment.date,
        assignmentMode: assignment.assignmentMode,
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
          const employmentType = employee?.employmentType === 'part-time' ? 'part-time' : 'full-time';
          return {
            employeeId,
            employeeName: employee?.name || employeeId,
            employmentType,
            status: submission ? 'SUBMITTED' : 'PENDING',
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

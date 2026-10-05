import { createServerDocument, getServerDocument, listServerDocuments, updateServerDocument } from './_firebaseAdmin.js';
import { getV13Collections } from './_v13Collections.js';
import { listEffectiveEmployees } from './_v13Employees.js';
import {
  getEffectiveShiftType,
  getEmploymentType,
  getSingaporeDate,
  isEmployeeEligibleForAssignment,
  type ShiftNotice,
  type ShiftType,
  type WorkAssignment,
  type WorkSubmission
} from '../src/lib/workflows.js';

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

export interface PublicOverviewSnapshot {
  schemaVersion: 1;
  date: string;
  assignments: PublicAssignment[];
  notices: ShiftNotice[];
  updatedAt: string;
}

const SNAPSHOT_ID = 'current';

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function effectiveHours(submission: WorkSubmission): number {
  return submission.employmentTypeSnapshot === 'part-time'
    ? submission.effectiveWorkedHours ?? submission.originalWorkedHours ?? 0
    : submission.effectiveOtHours ?? submission.originalOtHours ?? 0;
}

export async function buildPublicOverviewSnapshot(date = getSingaporeDate()): Promise<PublicOverviewSnapshot> {
  const collections = getV13Collections();
  const secondShiftPreviewEnd = addCalendarDays(date, 2);
  const [assignmentDocuments, submissionDocuments, employees, noticeDocuments] = await Promise.all([
    listServerDocuments<WorkAssignment>(collections.assignments),
    listServerDocuments<WorkSubmission>(collections.submissions),
    listEffectiveEmployees(),
    listServerDocuments<ShiftNotice>(collections.shiftNotices)
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
      const assignedTypes = assignment.assignedEmployeeIds
        .map((id) => employeeMap.get(id))
        .filter(Boolean)
        .map((employee) => getEmploymentType(employee!));
      return { assignment, shiftType: getEffectiveShiftType(assignment, assignedTypes) };
    })
    .filter(({ assignment, shiftType }) =>
      assignment.date === date ||
      (shiftType === 'SECOND_SHIFT' && assignment.date > date && assignment.date <= secondShiftPreviewEnd)
    )
    .sort((left, right) =>
      left.assignment.date.localeCompare(right.assignment.date) ||
      left.assignment.plannedStart.localeCompare(right.assignment.plannedStart)
    )
    .map(({ assignment, shiftType }) => ({
      id: assignment.id,
      date: assignment.date,
      assignmentMode: assignment.assignmentMode,
      ...(shiftType ? { shiftType } : {}),
      department: assignment.department,
      workstation: assignment.workstation,
      ...(assignment.product ? { product: assignment.product } : {}),
      ...(assignment.batchNo ? { batchNo: assignment.batchNo } : {}),
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
          ...(submission ? { effectiveHours: effectiveHours(submission) } : {})
        };
      })
    }));

  const notices = noticeDocuments
    .map((document) => ({ ...document.data, id: document.id }))
    .filter((notice) =>
      notice.status === 'ACTIVE' &&
      notice.visibility === 'VISIBLE' &&
      date >= notice.effectiveStartDate &&
      date <= notice.effectiveEndDate
    );

  return {
    schemaVersion: 1,
    date,
    assignments,
    notices,
    updatedAt: new Date().toISOString()
  };
}

async function saveSnapshot(snapshot: PublicOverviewSnapshot): Promise<PublicOverviewSnapshot> {
  const collections = getV13Collections();
  const existing = await getServerDocument<PublicOverviewSnapshot>(collections.publicOverview, SNAPSHOT_ID);
  if (existing) {
    await updateServerDocument(
      collections.publicOverview,
      SNAPSHOT_ID,
      snapshot as unknown as Record<string, unknown>,
      existing.updateTime
    );
  } else {
    await createServerDocument(
      collections.publicOverview,
      SNAPSHOT_ID,
      snapshot as unknown as Record<string, unknown>
    );
  }
  return snapshot;
}

export async function rebuildCurrentPublicOverview(): Promise<PublicOverviewSnapshot> {
  return saveSnapshot(await buildPublicOverviewSnapshot());
}

export async function ensureCurrentPublicOverview(): Promise<PublicOverviewSnapshot> {
  const collections = getV13Collections();
  const today = getSingaporeDate();
  const existing = await getServerDocument<PublicOverviewSnapshot>(collections.publicOverview, SNAPSHOT_ID);
  if (existing?.data?.date === today && existing.data.schemaVersion === 1) {
    return { ...existing.data, date: today };
  }
  return rebuildCurrentPublicOverview();
}

export async function updateCurrentOverviewForSubmission(submission: WorkSubmission): Promise<void> {
  const today = getSingaporeDate();
  if (submission.taskDate !== today) return;

  const collections = getV13Collections();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getServerDocument<PublicOverviewSnapshot>(collections.publicOverview, SNAPSHOT_ID);
    if (!current || current.data.date !== today || current.data.schemaVersion !== 1) {
      await rebuildCurrentPublicOverview();
      return;
    }

    let found = false;
    const assignments = current.data.assignments.map((assignment) => {
      if (assignment.id !== submission.assignmentId) return assignment;
      found = true;
      return {
        ...assignment,
        status: assignment.status === 'PLANNED' ? 'IN_PROGRESS' : assignment.status,
        participants: assignment.participants.map((participant) =>
          participant.employeeId === submission.employeeId
            ? { ...participant, status: 'SUBMITTED' as const, effectiveHours: effectiveHours(submission) }
            : participant
        )
      };
    });

    if (!found) {
      await rebuildCurrentPublicOverview();
      return;
    }

    const next: PublicOverviewSnapshot = {
      ...current.data,
      assignments,
      updatedAt: new Date().toISOString()
    };

    try {
      await updateServerDocument(
        collections.publicOverview,
        SNAPSHOT_ID,
        next as unknown as Record<string, unknown>,
        current.updateTime
      );
      return;
    } catch (error) {
      if (attempt === 2) {
        await rebuildCurrentPublicOverview();
        return;
      }
    }
  }
}

export function publicOverviewRealtimeLocation(): { collection: string; documentId: string } {
  return { collection: getV13Collections().publicOverview, documentId: SNAPSHOT_ID };
}

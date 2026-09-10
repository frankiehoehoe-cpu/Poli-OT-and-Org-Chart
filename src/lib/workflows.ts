export type EmploymentType = 'full-time' | 'part-time';
export type AssignmentMode = 'ot-task' | 'work-shift';
export type WorkAssignmentStatus = 'PLANNED' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED';
export type WorkTaskType = 'output' | 'non-output';

export interface WorkAssignment {
  id: string;
  date: string;
  department: string;
  workstation: string;
  product?: string;
  batchNo?: string;
  plannedStart: string;
  plannedEnd: string;
  taskType: WorkTaskType;
  assignmentMode: AssignmentMode;
  targetRequirement: string;
  status: WorkAssignmentStatus;
  assignedEmployeeIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  actualResult?: string;
  completionStatus?: 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'NOT_COMPLETED';
  supervisorNote?: string;
  closedAt?: string;
  closedBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

export interface CorrectionHistoryItem {
  correctedAt: string;
  correctedBy: string;
  correctionNote: string;
  previousEffectiveOtHours?: number;
  correctedOtHours?: number;
  previousEffectiveWorkedHours?: number;
  correctedWorkedHours?: number;
  correctedStart?: string;
  correctedEnd?: string;
}

export interface WorkSubmission {
  id: string;
  assignmentId: string;
  employeeId: string;
  employeeNameSnapshot: string;
  employmentTypeSnapshot: EmploymentType;
  assignmentMode: AssignmentMode;
  taskDate: string;
  assignedWorkstation: string;
  actualWorkstation: string;
  submissionStatus: 'SUBMITTED';
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  originalOtHours?: number;
  correctedOtHours?: number;
  effectiveOtHours?: number;
  originalStart?: string;
  originalEnd?: string;
  correctedStart?: string;
  correctedEnd?: string;
  originalWorkedHours?: number;
  correctedWorkedHours?: number;
  effectiveWorkedHours?: number;
  correctionNote?: string;
  correctedAt?: string;
  correctedBy?: string;
  correctionHistory?: CorrectionHistoryItem[];
}

export interface ShiftNotice {
  id: string;
  shiftName: string;
  status: 'ACTIVE' | 'ENDED';
  visibility: 'VISIBLE' | 'HIDDEN';
  effectiveStartDate: string;
  effectiveEndDate: string;
  startTime: string;
  endTime: string;
  assignedEmployeeIds: string[];
  assignedEmployeeNamesSnapshot: string[];
  department?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  endedBy?: string;
}

export interface LegacyOtRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  totalHours: number;
  multiplier: number;
  verified?: boolean;
}

export interface EmployeeMonthAggregate {
  employeeId: string;
  employeeName: string;
  legacyOtHours: number;
  v13OtHours: number;
  fullTimeOtHours: number;
  partTimeWorkedHours: number;
  otEntryCount: number;
  partTimeSubmissionCount: number;
}

export interface PartTimeMonthlyForecast {
  actualWorkedHours: number;
  plannedRemainingHours: number;
  projectedMonthTotal: number;
  finalMonthHours: number;
  isFinal: boolean;
}

export const getEmploymentType = (employee: { employmentType?: EmploymentType }): EmploymentType =>
  employee.employmentType ?? 'full-time';

export const deterministicSubmissionId = (assignmentId: string, employeeId: string) =>
  `${assignmentId}__${employeeId}`;

export const getSingaporeDate = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const validTime = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function calculateWorkedHours(start: string, end: string): number | null {
  if (!validTime.test(start) || !validTime.test(end)) return null;
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return minutes > 0 && minutes <= 24 * 60 ? Math.round((minutes / 60) * 100) / 100 : null;
}

export function canEmployeeSubmit(input: {
  employeeId: string;
  employmentType: EmploymentType;
  assignment: WorkAssignment;
  singaporeDate: string;
  submissionExists: boolean;
}): boolean {
  const { employeeId, employmentType, assignment, singaporeDate, submissionExists } = input;
  if (submissionExists || assignment.date !== singaporeDate) return false;
  if (assignment.status === 'CLOSED' || assignment.status === 'CANCELLED') return false;
  if (!assignment.assignedEmployeeIds.includes(employeeId)) return false;
  return employmentType === 'part-time'
    ? assignment.assignmentMode === 'work-shift'
    : assignment.assignmentMode === 'ot-task';
}

export function applyEffectiveCorrection(
  submission: WorkSubmission,
  correction: { hours?: number; start?: string; end?: string; note: string; correctedBy: string; correctedAt: string }
): WorkSubmission {
  const history = [...(submission.correctionHistory || [])];
  if (submission.employmentTypeSnapshot === 'part-time') {
    const workedHours = correction.start && correction.end
      ? calculateWorkedHours(correction.start, correction.end)
      : correction.hours ?? null;
    if (workedHours === null || workedHours <= 0) throw new Error('Invalid corrected worked hours');
    history.push({
      correctedAt: correction.correctedAt,
      correctedBy: correction.correctedBy,
      correctionNote: correction.note,
      previousEffectiveWorkedHours: submission.effectiveWorkedHours ?? submission.originalWorkedHours,
      correctedWorkedHours: workedHours,
      correctedStart: correction.start,
      correctedEnd: correction.end
    });
    return {
      ...submission,
      correctedStart: correction.start ?? submission.correctedStart,
      correctedEnd: correction.end ?? submission.correctedEnd,
      correctedWorkedHours: workedHours,
      effectiveWorkedHours: workedHours,
      correctionNote: correction.note,
      correctedAt: correction.correctedAt,
      correctedBy: correction.correctedBy,
      updatedAt: correction.correctedAt,
      correctionHistory: history
    };
  }
  const hours = correction.hours;
  if (hours === undefined || !Number.isFinite(hours) || hours < 0.5 || hours > 12 || !Number.isInteger(hours * 2)) {
    throw new Error('Invalid corrected OT hours');
  }
  history.push({
    correctedAt: correction.correctedAt,
    correctedBy: correction.correctedBy,
    correctionNote: correction.note,
    previousEffectiveOtHours: submission.effectiveOtHours ?? submission.originalOtHours,
    correctedOtHours: hours
  });
  return {
    ...submission,
    correctedOtHours: hours,
    effectiveOtHours: hours,
    correctionNote: correction.note,
    correctedAt: correction.correctedAt,
    correctedBy: correction.correctedBy,
    updatedAt: correction.correctedAt,
    correctionHistory: history
  };
}

export function aggregateMixedMonth(
  month: string,
  legacy: LegacyOtRecord[],
  submissions: WorkSubmission[]
): EmployeeMonthAggregate[] {
  const values = new Map<string, EmployeeMonthAggregate>();
  const ensure = (id: string, name: string) => {
    const existing = values.get(id);
    if (existing) return existing;
    const created = { employeeId: id, employeeName: name, legacyOtHours: 0, v13OtHours: 0, fullTimeOtHours: 0, partTimeWorkedHours: 0, otEntryCount: 0, partTimeSubmissionCount: 0 };
    values.set(id, created);
    return created;
  };
  legacy.filter((entry) => entry.date.startsWith(month) && entry.multiplier !== 2).forEach((entry) => {
    const aggregate = ensure(entry.employeeId, entry.employeeName);
    aggregate.legacyOtHours += entry.totalHours;
    aggregate.fullTimeOtHours += entry.totalHours;
    aggregate.otEntryCount += 1;
  });
  submissions.filter((submission) => submission.taskDate.startsWith(month)).forEach((submission) => {
    const aggregate = ensure(submission.employeeId, submission.employeeNameSnapshot);
    if (submission.employmentTypeSnapshot === 'part-time') {
      aggregate.partTimeWorkedHours += submission.effectiveWorkedHours ?? submission.originalWorkedHours ?? 0;
      aggregate.partTimeSubmissionCount += 1;
    } else {
      const hours = submission.effectiveOtHours ?? submission.originalOtHours ?? 0;
      aggregate.v13OtHours += hours;
      aggregate.fullTimeOtHours += hours;
      aggregate.otEntryCount += 1;
    }
  });
  return [...values.values()].sort((left, right) => left.employeeName.localeCompare(right.employeeName));
}

export function getPartTimeMonthlyForecast(
  assignments: WorkAssignment[],
  submissions: WorkSubmission[],
  employeeId: string,
  month: string,
  currentDate = getSingaporeDate()
): PartTimeMonthlyForecast {
  const employeeSubmissions = new Map(
    submissions.filter((submission) => submission.employeeId === employeeId).map((submission) => [submission.assignmentId, submission])
  );
  let actualWorkedHours = 0;
  let plannedRemainingHours = 0;
  employeeSubmissions.forEach((submission) => {
    if (submission.taskDate.startsWith(month) && submission.employmentTypeSnapshot === 'part-time') {
      actualWorkedHours += submission.effectiveWorkedHours ?? submission.originalWorkedHours ?? 0;
    }
  });
  assignments.forEach((assignment) => {
    if (
      assignment.assignmentMode !== 'work-shift' ||
      assignment.status === 'CANCELLED' ||
      !assignment.date.startsWith(month) ||
      assignment.date < currentDate ||
      !assignment.assignedEmployeeIds.includes(employeeId) ||
      employeeSubmissions.has(assignment.id)
    ) return;
    plannedRemainingHours += calculateWorkedHours(assignment.plannedStart, assignment.plannedEnd) || 0;
  });
  return {
    actualWorkedHours,
    plannedRemainingHours,
    projectedMonthTotal: actualWorkedHours + plannedRemainingHours,
    finalMonthHours: actualWorkedHours,
    isFinal: plannedRemainingHours === 0
  };
}

export const shiftNoticeCreatesWorkRecord = (_notice: ShiftNotice): false => false;

export type EmploymentType = 'full-time' | 'part-time';
export type AssignmentMode = 'ot-task' | 'work-shift';
export type ShiftType = 'PART_TIME_SHIFT' | 'SECOND_SHIFT';
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
  shiftType?: ShiftType;
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
  manualEntry?: boolean;
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
  shiftTypeSnapshot?: ShiftType;
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
  lateEntry?: boolean;
  enteredByRole?: 'supervisor' | 'manager';
  enteredBy?: string;
  lateEntryReason?: string;
  lateEnteredAt?: string;
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

export interface PartTimeAvailability {
  id: string;
  employeeId: string;
  employeeNameSnapshot: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface FullTimeOtAvailability {
  id: string;
  employeeId: string;
  employeeNameSnapshot: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyOtRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  totalHours: number;
  multiplier: number;
  startTime?: string;
  endTime?: string;
  verified?: boolean;
  status?: 'pending' | 'verified' | 'rejected';
}

export interface EmployeeMonthAggregate {
  employeeId: string;
  employeeName: string;
  legacyOtHours: number;
  v13OtHours: number;
  fullTimeOtHours: number;
  doubleTimeOtHours: number;
  partTimeWorkedHours: number;
  otEntryCount: number;
  doubleTimeEntryCount: number;
  partTimeSubmissionCount: number;
}

export interface PartTimeMonthlyForecast {
  actualWorkedHours: number;
  plannedRemainingHours: number;
  projectedMonthTotal: number;
  finalMonthHours: number;
  isFinal: boolean;
}

export const MONTHLY_FT_OT_LIMIT_HOURS = 72;
export const MONTHLY_FT_OT_WATCH_HOURS = MONTHLY_FT_OT_LIMIT_HOURS * 0.6;
export const MONTHLY_FT_OT_CRITICAL_HOURS = MONTHLY_FT_OT_LIMIT_HOURS * 0.9;

export type MonthlyFtOtRiskLevel = 'NORMAL' | 'WATCH' | 'CRITICAL' | 'LIMIT_REACHED';

export function getMonthlyFtOtRisk(hours: number): {
  level: MonthlyFtOtRiskLevel;
  hours: number;
  percentage: number;
  remainingHours: number;
} {
  const normalizedHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const percentage = Math.min(100, Math.round((normalizedHours / MONTHLY_FT_OT_LIMIT_HOURS) * 1000) / 10);
  const remainingHours = Math.max(0, Math.round((MONTHLY_FT_OT_LIMIT_HOURS - normalizedHours) * 10) / 10);
  const level: MonthlyFtOtRiskLevel = normalizedHours >= MONTHLY_FT_OT_LIMIT_HOURS
    ? 'LIMIT_REACHED'
    : normalizedHours >= MONTHLY_FT_OT_CRITICAL_HOURS
      ? 'CRITICAL'
      : normalizedHours >= MONTHLY_FT_OT_WATCH_HOURS
        ? 'WATCH'
        : 'NORMAL';
  return { level, hours: normalizedHours, percentage, remainingHours };
}

export const getEmploymentType = (employee: { employmentType?: EmploymentType | string }): EmploymentType =>
  employee.employmentType === 'part-time' ? 'part-time' : 'full-time';

export const getEffectiveShiftType = (
  assignment: Pick<WorkAssignment, 'assignmentMode' | 'shiftType'>,
  assignedEmploymentTypes: EmploymentType[] = []
): ShiftType | undefined => {
  if (assignment.assignmentMode !== 'work-shift') return undefined;
  return assignment.shiftType ?? (assignedEmploymentTypes.includes('part-time') ? 'PART_TIME_SHIFT' : 'SECOND_SHIFT');
};

export const isEmployeeEligibleForAssignment = (
  employmentType: EmploymentType,
  assignmentMode: AssignmentMode,
  shiftType?: ShiftType
): boolean => assignmentMode === 'ot-task'
  ? employmentType === 'full-time' && shiftType === undefined
  : shiftType === 'PART_TIME_SHIFT'
    ? employmentType === 'part-time'
    : shiftType === 'SECOND_SHIFT' && employmentType === 'full-time';

export const isFullTimeOtSubmissionOpen = (
  employmentType: EmploymentType,
  assignment: Pick<WorkAssignment, 'assignmentMode' | 'date'>,
  singaporeDate: string,
  singaporeTime: string
): boolean => employmentType !== 'full-time' || assignment.assignmentMode !== 'ot-task' || (
  assignment.date === singaporeDate && singaporeTime >= '20:00' && singaporeTime < '24:00'
);

export const isPartTimeWorkSubmissionOpen = (
  employmentType: EmploymentType,
  assignment: Pick<WorkAssignment, 'assignmentMode' | 'shiftType' | 'date'>,
  singaporeDate: string,
  singaporeTime: string
): boolean => employmentType !== 'part-time' || assignment.assignmentMode !== 'work-shift' || assignment.shiftType !== 'PART_TIME_SHIFT' || (
  assignment.date === singaporeDate && singaporeTime >= '17:00' && singaporeTime < '24:00'
);

export const deterministicSubmissionId = (assignmentId: string, employeeId: string) =>
  `${assignmentId}__${employeeId}`;

export function isSundayDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
}

export const getSingaporeDate = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const getSingaporeTime = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('hour')}:${value('minute')}`;
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
  singaporeTime: string;
  submissionExists: boolean;
}): boolean {
  const { employeeId, employmentType, assignment, singaporeDate, singaporeTime, submissionExists } = input;
  if (submissionExists || assignment.date !== singaporeDate) return false;
  if (assignment.status === 'CLOSED' || assignment.status === 'CANCELLED') return false;
  if (!assignment.assignedEmployeeIds.includes(employeeId)) return false;
  if (assignment.shiftType === 'SECOND_SHIFT') return false;
  if (!isEmployeeEligibleForAssignment(employmentType, assignment.assignmentMode, assignment.shiftType ?? (employmentType === 'part-time' ? 'PART_TIME_SHIFT' : undefined))) return false;
  if (employmentType === 'full-time' && assignment.assignmentMode === 'ot-task') {
    return isFullTimeOtSubmissionOpen(employmentType, assignment, singaporeDate, singaporeTime);
  }
  if (employmentType === 'part-time' && assignment.assignmentMode === 'work-shift' && assignment.shiftType === 'PART_TIME_SHIFT') {
    return isPartTimeWorkSubmissionOpen(employmentType, assignment, singaporeDate, singaporeTime);
  }
  return true;
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

export interface MonthlyOtSession {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  totalHours: number;
  multiplier: 1.5 | 2;
  source: 'legacy' | 'v13';
  startTime?: string;
  endTime?: string;
  verified?: boolean;
  status?: 'pending' | 'verified' | 'rejected';
}

/**
 * Single authoritative session selector for monthly totals AND Management Dashboard.
 * Legacy records on days covered by an active V1.3 OT assignment are excluded,
 * preventing double-counting across sources. PT worked hours and 2nd Shift are not OT.
 */
export function getMonthlyOtSessions(
  month: string,
  legacy: LegacyOtRecord[],
  submissions: WorkSubmission[],
  assignments: WorkAssignment[]
): MonthlyOtSession[] {
  const authoritativeV13OtDays = new Set(
    assignments
      .filter((assignment) =>
        assignment.date.startsWith(month) &&
        assignment.assignmentMode === 'ot-task' &&
        assignment.status !== 'CANCELLED'
      )
      .flatMap((assignment) =>
        assignment.assignedEmployeeIds.map((employeeId) => `${employeeId}:${assignment.date}`)
      )
  );
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const legacySessions: MonthlyOtSession[] = legacy
    .filter((entry) =>
      entry.date.startsWith(month) &&
      entry.status !== 'rejected' &&
      !authoritativeV13OtDays.has(`${entry.employeeId}:${entry.date}`)
    )
    .map((entry) => ({
      id: entry.id,
      employeeId: entry.employeeId,
      employeeName: entry.employeeName,
      date: entry.date,
      totalHours: entry.totalHours,
      multiplier: entry.multiplier === 2 || isSundayDate(entry.date) ? 2 : 1.5,
      source: 'legacy' as const,
      startTime: entry.startTime,
      endTime: entry.endTime,
      verified: entry.verified,
      status: entry.status
    }));
  const v13Sessions: MonthlyOtSession[] = submissions
    .filter((submission) =>
      submission.taskDate.startsWith(month) &&
      submission.shiftTypeSnapshot !== 'SECOND_SHIFT' &&
      submission.employmentTypeSnapshot === 'full-time'
    )
    .map((submission) => {
      const assignment = assignmentById.get(submission.assignmentId);
      return {
        id: submission.id,
        employeeId: submission.employeeId,
        employeeName: submission.employeeNameSnapshot,
        date: submission.taskDate,
        totalHours: submission.effectiveOtHours ?? submission.originalOtHours ?? 0,
        multiplier: isSundayDate(submission.taskDate) ? 2 as const : 1.5 as const,
        source: 'v13' as const,
        startTime: assignment?.plannedStart,
        endTime: assignment?.plannedEnd,
        verified: true,
        status: 'verified' as const
      };
    });
  return [...legacySessions, ...v13Sessions].sort((a,b) =>
    a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId) || a.id.localeCompare(b.id)
  );
}

export function aggregateMixedMonth(
  month: string,
  legacy: LegacyOtRecord[],
  submissions: WorkSubmission[],
  assignments: WorkAssignment[]
): EmployeeMonthAggregate[] {
  const values = new Map<string, EmployeeMonthAggregate>();
  const ensure = (id: string, name: string) => {
    const existing = values.get(id);
    if (existing) return existing;
    const created = { employeeId: id, employeeName: name, legacyOtHours: 0, v13OtHours: 0, fullTimeOtHours: 0, doubleTimeOtHours: 0, partTimeWorkedHours: 0, otEntryCount: 0, doubleTimeEntryCount: 0, partTimeSubmissionCount: 0 };
    values.set(id, created);
    return created;
  };

  getMonthlyOtSessions(month, legacy, submissions, assignments).forEach((session) => {
    const aggregate = ensure(session.employeeId, session.employeeName);
    if (session.multiplier === 2) {
      aggregate.doubleTimeOtHours += session.totalHours;
      aggregate.doubleTimeEntryCount += 1;
    } else {
      aggregate.fullTimeOtHours += session.totalHours;
      aggregate.otEntryCount += 1;
      if (session.source === 'v13') aggregate.v13OtHours += session.totalHours;
      else aggregate.legacyOtHours += session.totalHours;
    }
  });

  submissions
    .filter((submission) =>
      submission.taskDate.startsWith(month) &&
      submission.shiftTypeSnapshot !== 'SECOND_SHIFT' &&
      submission.employmentTypeSnapshot === 'part-time'
    )
    .forEach((submission) => {
      const aggregate = ensure(submission.employeeId, submission.employeeNameSnapshot);
      aggregate.partTimeWorkedHours += submission.effectiveWorkedHours ?? submission.originalWorkedHours ?? 0;
      aggregate.partTimeSubmissionCount += 1;
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
      assignment.shiftType === 'SECOND_SHIFT' ||
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

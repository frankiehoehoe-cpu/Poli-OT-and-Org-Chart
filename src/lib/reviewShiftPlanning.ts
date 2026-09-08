import {
  REVIEW_DATE_OFFSET_KEY,
  calculateWorkedHours,
  getAssignmentMode,
  getParticipantEmploymentType,
  getSingaporeDate,
  type ReviewTask
} from './reviewTasks';

export const REVIEW_SHIFT_NOTICES_KEY = 'otpro_review_shift_notices_v1';
export const REVIEW_SHIFT_NOTICES_CHANGED = 'otpro-review-shift-notices-changed';

export type ReviewShiftNoticeStatus = 'ACTIVE' | 'ENDED';
export type ReviewShiftNoticeVisibility = 'VISIBLE' | 'HIDDEN';

export interface ReviewShiftNotice {
  id: string;
  shiftName: string;
  status: ReviewShiftNoticeStatus;
  visibility: ReviewShiftNoticeVisibility;
  effectiveStartDate: string;
  effectiveEndDate: string;
  startTime: string;
  endTime: string;
  assignedEmployeeIds: string[];
  assignedEmployeeNames: string[];
  department?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
}

export const loadReviewShiftNotices = (): ReviewShiftNotice[] => {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_SHIFT_NOTICES_KEY) || '[]') as ReviewShiftNotice[];
  } catch {
    return [];
  }
};

export const saveReviewShiftNotices = (notices: ReviewShiftNotice[]) => {
  localStorage.setItem(REVIEW_SHIFT_NOTICES_KEY, JSON.stringify(notices));
  window.dispatchEvent(new Event(REVIEW_SHIFT_NOTICES_CHANGED));
};

export const getReviewSingaporeDate = () => {
  const offset = Number(localStorage.getItem(REVIEW_DATE_OFFSET_KEY) || 0);
  const date = new Date(`${getSingaporeDate()}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + (Number.isFinite(offset) ? offset : 0));
  return getSingaporeDate(date);
};

export const isNoticePublicOnDate = (notice: ReviewShiftNotice, date: string) =>
  notice.status === 'ACTIVE' &&
  notice.visibility === 'VISIBLE' &&
  date >= notice.effectiveStartDate &&
  date <= notice.effectiveEndDate;

export interface PartTimeMonthlyForecast {
  actualWorkedHours: number;
  plannedRemainingHours: number;
  projectedMonthTotal: number;
  isFinal: boolean;
}

export const getPlannedShiftHours = (task: ReviewTask) =>
  calculateWorkedHours(task.plannedStart, task.plannedEnd) || 0;

export const getPartTimeMonthlyForecast = (
  tasks: ReviewTask[],
  employeeId: string,
  month: string,
  currentDate = getSingaporeDate()
): PartTimeMonthlyForecast => {
  let actualWorkedHours = 0;
  let plannedRemainingHours = 0;

  tasks.forEach((task) => {
    if (
      task.status === 'CANCELLED' ||
      !task.date.startsWith(month) ||
      getAssignmentMode(task) !== 'work-shift'
    ) return;

    const participant = task.participants.find((item) =>
      item.employeeId === employeeId && getParticipantEmploymentType(item) === 'part-time'
    );
    if (!participant) return;

    if (participant.status === 'COMPLETED') {
      actualWorkedHours += participant.effectiveWorkedHours ?? participant.correctedWorkedHours ?? participant.workedHours ?? 0;
    } else if (task.date >= currentDate) {
      plannedRemainingHours += getPlannedShiftHours(task);
    }
  });

  return {
    actualWorkedHours,
    plannedRemainingHours,
    projectedMonthTotal: actualWorkedHours + plannedRemainingHours,
    isFinal: plannedRemainingHours === 0
  };
};

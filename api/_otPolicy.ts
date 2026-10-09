import { listServerDocuments } from './_firebaseAdmin.js';
import { getV13Collections } from './_v13Collections.js';
import {
  aggregateMixedMonth,
  MONTHLY_FT_OT_LIMIT_HOURS,
  type LegacyOtRecord,
  type WorkAssignment,
  type WorkSubmission
} from '../src/lib/workflows.js';

export async function getMonthlyFullTimeOtHoursMap(month: string): Promise<Map<string, number>> {
  const collections = getV13Collections();
  const [legacyDocuments, submissionDocuments, assignmentDocuments] = await Promise.all([
    listServerDocuments<LegacyOtRecord>('overtime'),
    listServerDocuments<WorkSubmission>(collections.submissions),
    listServerDocuments<WorkAssignment>(collections.assignments)
  ]);

  const legacy = legacyDocuments.map((document) => ({ ...document.data, id: document.id }));
  const submissions = submissionDocuments.map((document) => ({ ...document.data, id: document.id }));
  const assignments = assignmentDocuments.map((document) => ({ ...document.data, id: document.id }));
  const aggregates = aggregateMixedMonth(month, legacy, submissions, assignments);

  return new Map(aggregates.map((aggregate) => [aggregate.employeeId, aggregate.fullTimeOtHours]));
}

export async function getMonthlyFullTimeOtHours(employeeId: string, date: string): Promise<number> {
  const month = date.slice(0, 7);
  const map = await getMonthlyFullTimeOtHoursMap(month);
  return map.get(employeeId) || 0;
}

export async function assertFullTimeOtAssignmentAllowed(employeeIds: string[], date: string): Promise<void> {
  if (!employeeIds.length) return;
  const map = await getMonthlyFullTimeOtHoursMap(date.slice(0, 7));
  const blocked = employeeIds
    .map((employeeId) => ({ employeeId, hours: map.get(employeeId) || 0 }))
    .filter((item) => item.hours >= MONTHLY_FT_OT_LIMIT_HOURS);

  if (blocked.length) {
    const details = blocked.map((item) => `${item.employeeId} (${item.hours.toFixed(1)}h)`).join(', ');
    const error = new Error(`OT LIMIT REACHED / 已达72小时上限: ${details}`) as Error & { statusCode?: number };
    error.statusCode = 409;
    throw error;
  }
}

export async function assertFullTimeOtWriteWithinLimit(input: {
  employeeId: string;
  date: string;
  newHours: number;
  replaceExistingHours?: number;
}): Promise<void> {
  const currentHours = await getMonthlyFullTimeOtHours(input.employeeId, input.date);
  const replaceExistingHours = Math.max(0, input.replaceExistingHours || 0);
  const projected = currentHours - replaceExistingHours + input.newHours;

  if (projected > MONTHLY_FT_OT_LIMIT_HOURS + 1e-9) {
    const remaining = Math.max(0, MONTHLY_FT_OT_LIMIT_HOURS - (currentHours - replaceExistingHours));
    const error = new Error(
      `MONTHLY OT LIMIT / 每月加班上限72小时。Current / 当前: ${(currentHours - replaceExistingHours).toFixed(1)}h, Remaining / 剩余: ${remaining.toFixed(1)}h`
    ) as Error & { statusCode?: number };
    error.statusCode = 409;
    throw error;
  }
}

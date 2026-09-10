import assert from 'node:assert/strict';
import { requireV13WritesEnabled, V13WritesDisabledError } from '../api/_v13.js';
import { getV13Collections } from '../api/_v13Collections.js';
import {
  aggregateMixedMonth,
  applyEffectiveCorrection,
  calculateWorkedHours,
  canEmployeeSubmit,
  deterministicSubmissionId,
  getEmploymentType,
  getPartTimeMonthlyForecast,
  shiftNoticeCreatesWorkRecord,
  type ShiftNotice,
  type WorkAssignment,
  type WorkSubmission
} from '../src/lib/workflows.js';

const assignment: WorkAssignment = {
  id: 'assignment-1', date: '2026-09-10', department: 'Production', workstation: 'Packing',
  plannedStart: '18:00', plannedEnd: '21:00', taskType: 'output', assignmentMode: 'ot-task',
  targetRequirement: '100 units', status: 'PLANNED', assignedEmployeeIds: ['employee-1'],
  createdBy: 'supervisor', createdAt: '2026-09-09T00:00:00Z', updatedAt: '2026-09-09T00:00:00Z', revision: 1
};

const fullTimeSubmission: WorkSubmission = {
  id: 'assignment-1__employee-1', assignmentId: 'assignment-1', employeeId: 'employee-1',
  employeeNameSnapshot: 'Employee One', employmentTypeSnapshot: 'full-time', assignmentMode: 'ot-task',
  taskDate: '2026-09-10', assignedWorkstation: 'Packing', actualWorkstation: 'Packing',
  submissionStatus: 'SUBMITTED', originalOtHours: 2, effectiveOtHours: 2,
  submittedAt: '2026-09-10T13:00:00Z', createdAt: '2026-09-10T13:00:00Z', updatedAt: '2026-09-10T13:00:00Z'
};

assert.equal(getEmploymentType({}), 'full-time', 'legacy employees remain full-time');
assert.equal(deterministicSubmissionId('a', 'e'), 'a__e');
assert.equal(calculateWorkedHours('12:00', '20:30'), 8.5);
assert.equal(canEmployeeSubmit({ employeeId: 'employee-1', employmentType: 'full-time', assignment, singaporeDate: '2026-09-10', submissionExists: false }), true);
assert.equal(canEmployeeSubmit({ employeeId: 'employee-2', employmentType: 'full-time', assignment, singaporeDate: '2026-09-10', submissionExists: false }), false);

const corrected = applyEffectiveCorrection(fullTimeSubmission, { hours: 3, note: 'Approved correction', correctedBy: 'supervisor', correctedAt: '2026-09-11T00:00:00Z' });
assert.equal(corrected.originalOtHours, 2);
assert.equal(corrected.effectiveOtHours, 3);
assert.equal(corrected.correctionHistory?.length, 1);

const partTimeAssignment: WorkAssignment = { ...assignment, id: 'shift-1', assignmentMode: 'work-shift', date: '2026-09-20', plannedStart: '12:00', plannedEnd: '20:00' };
const partTimeSubmission: WorkSubmission = {
  ...fullTimeSubmission, id: 'shift-done__employee-1', assignmentId: 'shift-done', employmentTypeSnapshot: 'part-time',
  assignmentMode: 'work-shift', taskDate: '2026-09-05', originalOtHours: undefined, effectiveOtHours: undefined,
  originalStart: '12:00', originalEnd: '20:00', originalWorkedHours: 8, effectiveWorkedHours: 8
};
const forecast = getPartTimeMonthlyForecast([partTimeAssignment], [partTimeSubmission], 'employee-1', '2026-09', '2026-09-10');
assert.deepEqual(forecast, { actualWorkedHours: 8, plannedRemainingHours: 8, projectedMonthTotal: 16, finalMonthHours: 8, isFinal: false });

const aggregates = aggregateMixedMonth('2026-09', [{ id: 'legacy-1', employeeId: 'employee-1', employeeName: 'Employee One', date: '2026-09-01', totalHours: 1.5, multiplier: 1.5 }], [fullTimeSubmission, partTimeSubmission]);
assert.equal(aggregates[0].fullTimeOtHours, 3.5);
assert.equal(aggregates[0].partTimeWorkedHours, 8);

const notice = { id: 'notice-1' } as ShiftNotice;
assert.equal(shiftNoticeCreatesWorkRecord(notice), false);

assert.deepEqual(getV13Collections({}), {
  assignments: 'workAssignments', submissions: 'workSubmissions', shiftNotices: 'shiftNotices'
});
assert.deepEqual(getV13Collections({ OT_V13_ISOLATED_TEST_MODE: 'true' }), {
  assignments: 'otv13_test_workAssignments',
  submissions: 'otv13_test_workSubmissions',
  shiftNotices: 'otv13_test_shiftNotices'
});
assert.throws(() => requireV13WritesEnabled({}), V13WritesDisabledError);
assert.throws(() => requireV13WritesEnabled({ OT_V13_WRITES_ENABLED: 'false' }), V13WritesDisabledError);
assert.throws(
  () => requireV13WritesEnabled({ OT_V13_WRITES_ENABLED: 'true', VERCEL_ENV: 'preview' }),
  V13WritesDisabledError,
  'Preview must not write normal V1.3 collections'
);
assert.doesNotThrow(() => requireV13WritesEnabled({
  OT_V13_WRITES_ENABLED: 'true',
  OT_V13_ISOLATED_TEST_MODE: 'true',
  VERCEL_ENV: 'preview'
}));
assert.doesNotThrow(() => requireV13WritesEnabled({ OT_V13_WRITES_ENABLED: 'true', VERCEL_ENV: 'production' }));

console.log('OT V1.3 pure workflow tests passed');

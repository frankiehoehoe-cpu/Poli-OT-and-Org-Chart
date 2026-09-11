export interface V13Collections {
  assignments: 'workAssignments' | 'otv13_test_workAssignments';
  submissions: 'workSubmissions' | 'otv13_test_workSubmissions';
  shiftNotices: 'shiftNotices' | 'otv13_test_shiftNotices';
  employeeOverrides: 'otv13_test_employeeOverrides';
}

export function isV13IsolatedTestMode(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.OT_V13_ISOLATED_TEST_MODE === 'true';
}

export function getV13Collections(environment: NodeJS.ProcessEnv = process.env): V13Collections {
  return isV13IsolatedTestMode(environment)
    ? {
        assignments: 'otv13_test_workAssignments',
        submissions: 'otv13_test_workSubmissions',
        shiftNotices: 'otv13_test_shiftNotices',
        employeeOverrides: 'otv13_test_employeeOverrides'
      }
    : {
        assignments: 'workAssignments',
        submissions: 'workSubmissions',
        shiftNotices: 'shiftNotices',
        employeeOverrides: 'otv13_test_employeeOverrides'
      };
}

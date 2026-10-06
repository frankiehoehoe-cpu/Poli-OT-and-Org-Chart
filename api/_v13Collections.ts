export interface V13Collections {
  assignments: 'workAssignments' | 'otv13_test_workAssignments';
  submissions: 'workSubmissions' | 'otv13_test_workSubmissions';
  shiftNotices: 'shiftNotices' | 'otv13_test_shiftNotices';
  partTimeAvailability: 'partTimeAvailability' | 'otv13_test_partTimeAvailability';
  fullTimeOtAvailability: 'fullTimeOtAvailability' | 'otv13_test_fullTimeOtAvailability';
  publicOverview: 'publicOverview' | 'otv13_test_publicOverview';
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
        partTimeAvailability: 'otv13_test_partTimeAvailability',
        fullTimeOtAvailability: 'otv13_test_fullTimeOtAvailability',
        publicOverview: 'otv13_test_publicOverview',
        employeeOverrides: 'otv13_test_employeeOverrides'
      }
    : {
        assignments: 'workAssignments',
        submissions: 'workSubmissions',
        shiftNotices: 'shiftNotices',
        partTimeAvailability: 'partTimeAvailability',
        fullTimeOtAvailability: 'fullTimeOtAvailability',
        publicOverview: 'publicOverview',
        employeeOverrides: 'otv13_test_employeeOverrides'
      };
}

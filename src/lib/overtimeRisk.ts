import type { OvertimeEntry, UserProfile } from '../types';

export const OT_RISK_THRESHOLDS = {
  watch: {
    monthlyHours: 40,
    weeklyHours: 14,
    consecutiveDays: 4,
  },
  high: {
    monthlyHours: 60,
    weeklyHours: 20,
    consecutiveDays: 5,
    longSessionDays: 3,
  },
  critical: {
    monthlyHours: 80,
    weeklyHours: 26,
    consecutiveDays: 7,
    longSessionDays: 5,
  },
  longSessionHours: 4,
} as const;

export type OvertimeRiskLevel = 'NORMAL' | 'WATCH' | 'HIGH' | 'CRITICAL';

export interface WeeklyOvertime {
  weekStart: string;
  weekEnd: string;
  hours: number;
}

export interface EmployeeOvertimeRisk {
  employeeId: string;
  employeeName: string;
  department: string;
  monthlyHours: number;
  weeklyHours: number;
  weeklyBreakdown: WeeklyOvertime[];
  sessionCount: number;
  consecutiveDays: number;
  longSessionCount: number;
  longOtDayCount: number;
  lastOtDate: string | null;
  level: OvertimeRiskLevel;
  primaryReason: string;
  reasons: string[];
  entries: OvertimeEntry[];
}

const DAY_MS = 86_400_000;

const roundHours = (hours: number) => Math.round((hours + Number.EPSILON) * 100) / 100;

const parseCalendarDate = (date: string) => {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatCalendarDate = (date: Date) => date.toISOString().slice(0, 10);

const getMonday = (date: string) => {
  const parsed = parseCalendarDate(date);
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() - day + 1);
  return parsed;
};

const getHighestConsecutiveDays = (dates: string[]) => {
  const uniqueDays = [...new Set(dates)].sort();
  let highest = 0;
  let current = 0;
  let previous: number | null = null;

  uniqueDays.forEach((date) => {
    const day = parseCalendarDate(date).getTime();
    current = previous !== null && day - previous === DAY_MS ? current + 1 : 1;
    highest = Math.max(highest, current);
    previous = day;
  });

  return highest;
};

const getWeeklyBreakdown = (entries: OvertimeEntry[]): WeeklyOvertime[] => {
  const totals = new Map<string, number>();

  entries.forEach((entry) => {
    const weekStart = formatCalendarDate(getMonday(entry.date));
    totals.set(weekStart, (totals.get(weekStart) ?? 0) + entry.totalHours);
  });

  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, hours]) => {
      const end = parseCalendarDate(weekStart);
      end.setUTCDate(end.getUTCDate() + 6);
      return { weekStart, weekEnd: formatCalendarDate(end), hours: roundHours(hours) };
    });
};

export const calculateEmployeeOvertimeRisk = (
  employee: Pick<UserProfile, 'id' | 'name' | 'department'>,
  entries: OvertimeEntry[],
): EmployeeOvertimeRisk => {
  const employeeEntries = entries
    .filter((entry) => entry.employeeId === employee.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const monthlyHours = roundHours(employeeEntries.reduce((total, entry) => total + entry.totalHours, 0));
  const weeklyBreakdown = getWeeklyBreakdown(employeeEntries);
  const weeklyHours = Math.max(0, ...weeklyBreakdown.map((week) => week.hours));
  const consecutiveDays = getHighestConsecutiveDays(employeeEntries.map((entry) => entry.date));
  const longEntries = employeeEntries.filter((entry) => entry.totalHours > OT_RISK_THRESHOLDS.longSessionHours);
  const longOtDayCount = new Set(longEntries.map((entry) => entry.date)).size;

  const isCritical = monthlyHours >= OT_RISK_THRESHOLDS.critical.monthlyHours
    || weeklyHours >= OT_RISK_THRESHOLDS.critical.weeklyHours
    || consecutiveDays >= OT_RISK_THRESHOLDS.critical.consecutiveDays
    || longOtDayCount >= OT_RISK_THRESHOLDS.critical.longSessionDays;
  const isHigh = monthlyHours >= OT_RISK_THRESHOLDS.high.monthlyHours
    || weeklyHours >= OT_RISK_THRESHOLDS.high.weeklyHours
    || consecutiveDays >= OT_RISK_THRESHOLDS.high.consecutiveDays
    || longOtDayCount >= OT_RISK_THRESHOLDS.high.longSessionDays;
  const isWatch = monthlyHours >= OT_RISK_THRESHOLDS.watch.monthlyHours
    || weeklyHours >= OT_RISK_THRESHOLDS.watch.weeklyHours
    || consecutiveDays >= OT_RISK_THRESHOLDS.watch.consecutiveDays;
  const level: OvertimeRiskLevel = isCritical ? 'CRITICAL' : isHigh ? 'HIGH' : isWatch ? 'WATCH' : 'NORMAL';

  // Reasons are deterministic and ordered by management usefulness.
  const reasons: string[] = [];
  if (monthlyHours >= OT_RISK_THRESHOLDS.watch.monthlyHours) reasons.push(`Monthly OT ${monthlyHours.toFixed(1)}h`);
  if (weeklyHours >= OT_RISK_THRESHOLDS.watch.weeklyHours) reasons.push(`Peak week ${weeklyHours.toFixed(1)}h`);
  if (consecutiveDays >= OT_RISK_THRESHOLDS.watch.consecutiveDays) reasons.push(`${consecutiveDays} consecutive OT days`);
  if (longOtDayCount >= OT_RISK_THRESHOLDS.high.longSessionDays) reasons.push(`${longOtDayCount} long OT days`);
  if (!reasons.length) reasons.push('Within internal monitoring thresholds');

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    department: employee.department || 'deptOther',
    monthlyHours,
    weeklyHours,
    weeklyBreakdown,
    sessionCount: employeeEntries.length,
    consecutiveDays,
    longSessionCount: longEntries.length,
    longOtDayCount,
    lastOtDate: employeeEntries[0]?.date ?? null,
    level,
    primaryReason: reasons[0],
    reasons,
    entries: employeeEntries,
  };
};

export const calculateMonthlyOvertimeRisks = (
  employees: UserProfile[],
  entries: OvertimeEntry[],
  month: string,
) => {
  const monthlyEntries = entries.filter((entry) => entry.date.slice(0, 7) === month);
  return employees.map((employee) => calculateEmployeeOvertimeRisk(employee, monthlyEntries));
};

export const getSingaporeMonth = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
};

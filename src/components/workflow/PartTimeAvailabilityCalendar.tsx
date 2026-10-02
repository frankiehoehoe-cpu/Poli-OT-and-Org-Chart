import { useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '../../types';
import { workflowService } from '../../lib/workflowService';
import { getEmploymentType, getSingaporeDate, type PartTimeAvailability, type WorkAssignment } from '../../lib/workflows';

type CalendarMode = 'employee' | 'readonly';

interface PartTimeAvailabilityCalendarProps {
  mode: CalendarMode;
  employees: UserProfile[];
  month: string;
  employeeId?: string;
  title?: string;
}

const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function firstWeekday(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).getDay();
}

function monthDate(month: string, day: number) {
  return `${month}-${String(day).padStart(2, '0')}`;
}

export function PartTimeAvailabilityCalendar({
  mode,
  employees,
  month,
  employeeId,
  title
}: PartTimeAvailabilityCalendarProps) {
  const [availability, setAvailability] = useState<PartTimeAvailability[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [open, setOpen] = useState(mode === 'readonly');
  const [draftDates, setDraftDates] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const singaporeToday = getSingaporeDate();
  const currentSingaporeMonth = singaporeToday.slice(0, 7);

  const partTimeEmployees = useMemo(
    () => employees.filter((employee) => employee.role === 'employee' && getEmploymentType(employee) === 'part-time'),
    [employees]
  );

  const visibleEmployees = useMemo(() => {
    if (mode === 'employee') {
      return partTimeEmployees.filter((employee) => employee.id === employeeId);
    }
    return partTimeEmployees;
  }, [mode, partTimeEmployees, employeeId]);

  const load = async () => {
    try {
      const [nextAvailability, nextAssignments] = await Promise.all([
        workflowService.availability(month),
        workflowService.assignments()
      ]);
      setAvailability(nextAvailability);
      setAssignments(nextAssignments);
      if (mode === 'employee' && employeeId) {
        setDraftDates(new Set(nextAvailability.filter((item) => item.employeeId === employeeId).map((item) => item.date)));
      }
      setMessage('');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to load Part-Time calendar');
    }
  };

  useEffect(() => {
    void load();
    const refresh = () => void load();
    const visibilityRefresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('otpro-workflow-changed', refresh);
    document.addEventListener('visibilitychange', visibilityRefresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('otpro-workflow-changed', refresh);
      document.removeEventListener('visibilitychange', visibilityRefresh);
    };
  }, [month, employeeId, mode]);

  const savedDatesFor = (id: string) =>
    new Set(availability.filter((item) => item.employeeId === id && item.date.startsWith(month)).map((item) => item.date));

  const hasPartTimeShift = (id: string, date: string) =>
    assignments.some((assignment) =>
      assignment.assignmentMode === 'work-shift' &&
      assignment.shiftType === 'PART_TIME_SHIFT' &&
      assignment.status !== 'CANCELLED' &&
      assignment.date === date &&
      assignment.assignedEmployeeIds.includes(id)
    );

  const toggleDraftDate = (date: string) => {
    if (mode !== 'employee' || month !== currentSingaporeMonth || date < singaporeToday) return;
    setDraftDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const confirmDates = async () => {
    if (mode !== 'employee' || !employeeId || month !== currentSingaporeMonth) return;
    setBusy(true);
    setMessage('');
    try {
      const saved = savedDatesFor(employeeId);
      const toAdd = [...draftDates].filter((date) => !saved.has(date));
      const toRemove = [...saved].filter((date) => !draftDates.has(date) && date >= singaporeToday);

      for (const date of toAdd) await workflowService.addAvailability(date);
      for (const date of toRemove) await workflowService.removeAvailability(date);

      await load();
      setOpen(false);
      setMessage('Saved / 已确认');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to save available days');
    } finally {
      setBusy(false);
    }
  };

  const renderCalendar = (employee: UserProfile, interactive: boolean) => {
    const saved = savedDatesFor(employee.id);
    const totalDays = daysInMonth(month);
    const first = firstWeekday(month);
    const cells = Array.from({ length: first + totalDays }, (_, index) => {
      if (index < first) return null;
      return index - first + 1;
    });
    while (cells.length % 7 !== 0) cells.push(null);

    const availableCount = interactive
      ? [...draftDates].filter((date) => date.startsWith(month)).length
      : saved.size;

    return (
      <div key={employee.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-black text-slate-900" translate="no">{employee.name}</p>
            <p className="text-xs font-bold text-slate-500">Available / 可计划：{availableCount} days / 天</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-black">
            <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-600">GREY 未计划</span>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">YELLOW 可上班·未排班</span>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">GREEN 已排班</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-500">
          {weekdays.map((day) => <div key={day} className="py-1">{day}</div>)}
          {cells.map((day, index) => {
            if (!day) return <div key={`blank-${index}`} className="aspect-square" />;
            const date = monthDate(month, day);
            const isAssigned = hasPartTimeShift(employee.id, date);
            const isAvailable = interactive ? draftDates.has(date) : saved.has(date);
            const isPast = date < singaporeToday;
            const disabled = interactive && (month !== currentSingaporeMonth || isPast);

            let className = 'border-slate-200 bg-slate-100 text-slate-500';
            if (isAssigned) className = 'border-emerald-300 bg-emerald-100 text-emerald-800';
            else if (isAvailable) className = 'border-amber-300 bg-amber-100 text-amber-800';

            return (
              <button
                key={date}
                type="button"
                disabled={!interactive || disabled}
                onClick={() => toggleDraftDate(date)}
                className={`aspect-square rounded-xl border text-sm font-black transition-all ${className} ${interactive && !disabled ? 'cursor-pointer hover:scale-[1.03]' : 'cursor-default'} ${disabled ? 'opacity-50' : ''}`}
                title={isAssigned ? 'Part-Time Shift assigned / 已排班' : isAvailable ? 'Available, not assigned / 可上班，尚未排班' : 'Not planned / 未计划'}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!visibleEmployees.length) return null;

  if (mode === 'employee') {
    const employee = visibleEmployees[0];
    const savedCount = savedDatesFor(employee.id).size;

    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-indigo-600">PART-TIME AVAILABILITY / 兼职可上班日期</p>
            <h3 className="text-lg font-black text-slate-900">{title || 'Plan Available Work Days / 计划本月可上班日期'}</h3>
            <p className="mt-1 text-sm text-slate-600">一次打开整个月份，可选择多个日期后再确认。黄色代表可上班但主管尚未排班；绿色代表主管已创建 Part-Time Shift。</p>
          </div>
          <div className="rounded-xl bg-indigo-50 px-4 py-3 text-right">
            <p className="text-[10px] font-black uppercase text-indigo-500">This Month / 本月</p>
            <p className="text-xl font-black text-indigo-700">{savedCount} days / 天</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setDraftDates(savedDatesFor(employee.id));
            setOpen((value) => !value);
          }}
          className="mt-4 w-full rounded-xl bg-indigo-600 px-5 py-3 font-black text-white"
        >
          📅 {open ? 'Close Calendar / 收起日历' : 'Choose Work Days / 选择可上班日期'}
        </button>

        {open && (
          <div className="mt-4">
            {renderCalendar(employee, true)}
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-600">Selected / 已选择：{[...draftDates].filter((date) => date.startsWith(month)).length} days / 天</p>
              <button
                type="button"
                disabled={busy || month !== currentSingaporeMonth}
                onClick={() => void confirmDates()}
                className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-40"
              >
                {busy ? 'Saving...' : 'Confirm / 确认'}
              </button>
            </div>
          </div>
        )}

        {message && <p className="mt-3 text-sm font-bold text-slate-600">{message}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-600">PART-TIME AVAILABILITY / 兼职排班日历</p>
          <h3 className="text-lg font-black text-slate-900">{title || 'Monthly Part-Time Planning / 月度兼职计划'}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{month}</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {visibleEmployees.map((employee) => renderCalendar(employee, false))}
      </div>
      {message && <p className="mt-3 text-sm font-bold text-red-600">{message}</p>}
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '../../types';
import { workflowService } from '../../lib/workflowService';
import { getEmploymentType, getSingaporeDate, getSingaporeTime, type PartTimeAvailability, type WorkAssignment } from '../../lib/workflows';

type CalendarMode = 'employee' | 'supervisor' | 'readonly';

interface PartTimeAvailabilityCalendarProps {
  mode: CalendarMode;
  employees: UserProfile[];
  month: string;
  employeeId?: string;
  title?: string;
}

const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const workstations = [
  'Mixing / 搅拌',
  'Oven Drying / 烘干',
  'Grinding / 研磨',
  'Encapsulation / 进胶囊',
  'Polishing / 抛光',
  'Blistering / 压板',
  'Print Code / 打码',
  'Sacheting / 茶袋包装',
  'Packing / 包装',
  'Cleaning / 清洁',
  'Changeover / 转线',
  'Other Production Work / 其他生产工作'
];

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
  const [open, setOpen] = useState(mode !== 'employee');
  const [draftDates, setDraftDates] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [clockTick, setClockTick] = useState(0);

  const [planning, setPlanning] = useState<{ employee: UserProfile; date: string } | null>(null);
  const [planForm, setPlanForm] = useState({
    workstation: 'Packing / 包装',
    plannedStart: '09:00',
    plannedEnd: '17:00',
    targetRequirement: 'N/A'
  });

  const [actualStart, setActualStart] = useState('09:00');
  const [actualEnd, setActualEnd] = useState('17:00');

  const singaporeToday = getSingaporeDate();
  const singaporeTime = getSingaporeTime();
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

  useEffect(() => {
    if (mode !== 'employee') return;
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, [mode]);

  void clockTick;

  const savedDatesFor = (id: string) =>
    new Set(availability.filter((item) => item.employeeId === id && item.date.startsWith(month)).map((item) => item.date));

  const partTimeAssignmentFor = (id: string, date: string) =>
    assignments.find((assignment) =>
      assignment.assignmentMode === 'work-shift' &&
      assignment.shiftType === 'PART_TIME_SHIFT' &&
      assignment.status !== 'CANCELLED' &&
      assignment.date === date &&
      assignment.assignedEmployeeIds.includes(id)
    );

  const hasPartTimeShift = (id: string, date: string) => Boolean(partTimeAssignmentFor(id, date));

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

  const openSupervisorPlanning = (employee: UserProfile, date: string) => {
    if (mode !== 'supervisor' || date < singaporeToday) return;
    setPlanning({ employee, date });
    setPlanForm({
      workstation: 'Packing / 包装',
      plannedStart: '09:00',
      plannedEnd: '17:00',
      targetRequirement: 'N/A'
    });
    setMessage('');
  };

  const saveSupervisorPlanning = async () => {
    if (!planning) return;
    setBusy(true);
    setMessage('');
    try {
      await workflowService.saveAssignment({
        date: planning.date,
        department: planning.employee.department || 'Production',
        workstation: planForm.workstation,
        plannedStart: planForm.plannedStart,
        plannedEnd: planForm.plannedEnd,
        taskType: 'non-output',
        assignmentMode: 'work-shift',
        shiftType: 'PART_TIME_SHIFT',
        targetRequirement: planForm.targetRequirement || 'N/A',
        assignedEmployeeIds: [planning.employee.id]
      });
      setPlanning(null);
      await load();
      window.dispatchEvent(new Event('otpro-workflow-changed'));
      setMessage('Part-Time shift scheduled / 兼职班次已安排');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to schedule Part-Time shift');
    } finally {
      setBusy(false);
    }
  };

  const submitTodayWorkedHours = async () => {
    if (mode !== 'employee' || !employeeId) return;
    setBusy(true);
    setMessage('');
    try {
      await workflowService.partTimeSelfSubmit({
        date: singaporeToday,
        actualStart,
        actualEnd
      });
      await load();
      window.dispatchEvent(new Event('otpro-workflow-changed'));
      setMessage('Today worked hours submitted / 今日兼职工时已提交');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to submit worked hours');
    } finally {
      setBusy(false);
    }
  };

  const renderCalendar = (employee: UserProfile, employeeInteractive: boolean) => {
    const saved = savedDatesFor(employee.id);
    const totalDays = daysInMonth(month);
    const first = firstWeekday(month);
    const cells = Array.from({ length: first + totalDays }, (_, index) => {
      if (index < first) return null;
      return index - first + 1;
    });
    while (cells.length % 7 !== 0) cells.push(null);

    const availableCount = employeeInteractive
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
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">YELLOW 可上班·待安排</span>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">GREEN 已安排/已记录</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-500">
          {weekdays.map((day) => <div key={day} className="py-1">{day}</div>)}
          {cells.map((day, index) => {
            if (!day) return <div key={`blank-${index}`} className="aspect-square" />;
            const date = monthDate(month, day);
            const isAssigned = hasPartTimeShift(employee.id, date);
            const isAvailable = employeeInteractive ? draftDates.has(date) : saved.has(date);
            const isPast = date < singaporeToday;
            const employeeDisabled = employeeInteractive && (month !== currentSingaporeMonth || isPast);
            const supervisorClickable = mode === 'supervisor' && isAvailable && !isAssigned && !isPast;

            let className = 'border-slate-200 bg-slate-100 text-slate-500';
            if (isAssigned) className = 'border-emerald-300 bg-emerald-100 text-emerald-800';
            else if (isAvailable) className = 'border-amber-300 bg-amber-100 text-amber-800';

            return (
              <button
                key={date}
                type="button"
                disabled={mode === 'readonly' || (employeeInteractive && employeeDisabled) || (mode === 'supervisor' && !supervisorClickable)}
                onClick={() => {
                  if (employeeInteractive) toggleDraftDate(date);
                  else if (supervisorClickable) openSupervisorPlanning(employee, date);
                }}
                className={`aspect-square rounded-xl border text-sm font-black transition-all ${className} ${(employeeInteractive && !employeeDisabled) || supervisorClickable ? 'cursor-pointer hover:scale-[1.03]' : 'cursor-default'} ${employeeDisabled ? 'opacity-50' : ''}`}
                title={
                  isAssigned
                    ? 'Part-Time Shift assigned or worked record exists / 已安排或已有工时记录'
                    : isAvailable
                      ? mode === 'supervisor' && !isPast
                        ? 'Click to schedule this Part-Time work day / 点击安排此兼职工作日'
                        : 'Available, not yet scheduled / 可上班，尚未安排'
                      : 'Not planned / 未计划'
                }
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
    const saved = savedDatesFor(employee.id);
    const savedCount = saved.size;
    const todayAvailable = saved.has(singaporeToday);
    const todayAssignment = partTimeAssignmentFor(employee.id, singaporeToday);
    const selfSubmissionOpen = singaporeTime >= '17:00' && singaporeTime < '24:00';

    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-indigo-600">PART-TIME AVAILABILITY / 兼职可上班日期</p>
            <h3 className="text-lg font-black text-slate-900">{title || 'Plan Available Work Days / 计划本月可上班日期'}</h3>
            <p className="mt-1 text-sm text-slate-600">黄色代表你已标记可上班；绿色代表主管已安排，或当天工时已经建立记录。</p>
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

        {todayAvailable && !todayAssignment && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-amber-700">TODAY AVAILABLE / 今日已计划可上班</p>
            <p className="mt-1 text-sm font-bold text-slate-700">
              即使主管忘记安排班次，你仍可在当天新加坡时间 17:00–23:59 填写实际开始与结束时间。
            </p>
            {selfSubmissionOpen ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-sm font-bold">Actual Start / 实际开始
                  <input type="time" className="mt-1 w-full rounded-xl border p-3" value={actualStart} onChange={(event) => setActualStart(event.target.value)} />
                </label>
                <label className="text-sm font-bold">Actual End / 实际结束
                  <input type="time" className="mt-1 w-full rounded-xl border p-3" value={actualEnd} onChange={(event) => setActualEnd(event.target.value)} />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitTodayWorkedHours()}
                  className="min-h-12 rounded-xl bg-amber-500 px-5 font-black text-white disabled:opacity-40"
                >
                  Submit / 提交
                </button>
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-white p-3 text-sm font-black text-amber-800">
                Worked-hours submission opens at 17:00 Singapore time / 工时填写于新加坡时间17:00开放
              </p>
            )}
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
          {mode === 'supervisor' && <p className="mt-1 text-sm font-bold text-slate-600">点击黄色日期即可安排该员工的 Part-Time Shift / Click a yellow day to schedule.</p>}
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{month}</span>
      </div>

      {mode === 'supervisor' && planning && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3">
            <p className="text-xs font-black uppercase tracking-widest text-amber-700">SCHEDULE PART-TIME SHIFT / 安排兼职上班</p>
            <p className="font-black text-slate-900">{planning.employee.name} · {planning.date}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">Workstation / 工位
              <select className="mt-1 w-full rounded-xl border p-3" value={planForm.workstation} onChange={(event) => setPlanForm({ ...planForm, workstation: event.target.value })}>
                {workstations.map((station) => <option key={station}>{station}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold">Requirement / 要求
              <input className="mt-1 w-full rounded-xl border p-3" value={planForm.targetRequirement} onChange={(event) => setPlanForm({ ...planForm, targetRequirement: event.target.value })} />
            </label>
            <label className="text-sm font-bold">Planned Start / 计划开始
              <input type="time" className="mt-1 w-full rounded-xl border p-3" value={planForm.plannedStart} onChange={(event) => setPlanForm({ ...planForm, plannedStart: event.target.value })} />
            </label>
            <label className="text-sm font-bold">Planned End / 计划结束
              <input type="time" className="mt-1 w-full rounded-xl border p-3" value={planForm.plannedEnd} onChange={(event) => setPlanForm({ ...planForm, plannedEnd: event.target.value })} />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="flex-1 rounded-xl border bg-white p-3 font-bold" onClick={() => setPlanning(null)}>Cancel</button>
            <button type="button" disabled={busy} className="flex-1 rounded-xl bg-emerald-600 p-3 font-black text-white disabled:opacity-40" onClick={() => void saveSupervisorPlanning()}>
              {busy ? 'Saving...' : 'Confirm Shift / 确认安排'}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleEmployees.map((employee) => renderCalendar(employee, false))}
      </div>
      {message && <p className="mt-3 text-sm font-bold text-slate-700">{message}</p>}
    </section>
  );
}

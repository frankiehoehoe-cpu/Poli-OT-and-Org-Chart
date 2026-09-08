import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Eye, EyeOff, Pencil, Plus, StopCircle } from 'lucide-react';
import type { UserProfile } from '../../types';
import {
  getAssignmentMode,
  getParticipantEmploymentType,
  loadReviewTasks,
  REVIEW_TASKS_CHANGED,
  type ReviewTask
} from '../../lib/reviewTasks';
import {
  getPartTimeMonthlyForecast,
  getPlannedShiftHours,
  getReviewSingaporeDate,
  isNoticePublicOnDate,
  loadReviewShiftNotices,
  REVIEW_SHIFT_NOTICES_CHANGED,
  saveReviewShiftNotices,
  type ReviewShiftNotice
} from '../../lib/reviewShiftPlanning';

const formatDate = (date: string) => new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', day: '2-digit', month: 'short', year: 'numeric'
}).format(new Date(`${date}T12:00:00+08:00`));

const useShiftNotices = () => {
  const [notices, setNotices] = useState<ReviewShiftNotice[]>(loadReviewShiftNotices);
  useEffect(() => {
    const refresh = () => setNotices(loadReviewShiftNotices());
    window.addEventListener(REVIEW_SHIFT_NOTICES_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(REVIEW_SHIFT_NOTICES_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const update = (change: (current: ReviewShiftNotice[]) => ReviewShiftNotice[]) => {
    const next = change(loadReviewShiftNotices());
    saveReviewShiftNotices(next);
    setNotices(next);
  };
  return { notices, update };
};

const useReviewTasks = () => {
  const [tasks, setTasks] = useState<ReviewTask[]>(loadReviewTasks);
  useEffect(() => {
    const refresh = () => setTasks(loadReviewTasks());
    window.addEventListener(REVIEW_TASKS_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(REVIEW_TASKS_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return tasks;
};

export function PublicShiftNotice() {
  const { notices } = useShiftNotices();
  const reviewDate = getReviewSingaporeDate();
  const visible = notices.filter((notice) => isNoticePublicOnDate(notice, reviewDate));
  if (!visible.length) return null;
  return <div className="grid gap-3" data-testid="public-shift-notices">{visible.map((notice) => <aside key={notice.id} className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-slate-800"><div className="flex flex-col gap-2 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-sky-700">MIDDLE SHIFT ACTIVE / 中班执行中</p><h2 className="mt-1 text-lg font-black">{notice.shiftName}</h2></div><span className="self-start rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-800">{notice.startTime}–{notice.endTime}</span></div><p className="mt-2 text-sm font-bold">{formatDate(notice.effectiveStartDate)} – {formatDate(notice.effectiveEndDate)}</p><p className="mt-2 text-sm"><strong>Assigned / 安排员工:</strong> {notice.assignedEmployeeNames.join(', ')}</p>{notice.department && <p className="mt-1 text-sm"><strong>Department:</strong> {notice.department}</p>}{notice.note && <p className="mt-1 text-sm text-slate-600"><strong>Note:</strong> {notice.note}</p>}<p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Shift notice only · No overtime implied / 仅为班次公告，不代表加班</p></aside>)}</div>;
}

export function ShiftNoticeControl({ employees, readOnly = false }: { employees?: UserProfile[]; readOnly?: boolean }) {
  const { notices, update } = useShiftNotices();
  const [editing, setEditing] = useState<ReviewShiftNotice | 'new' | null>(null);
  const patchNotice = (id: string, change: Partial<ReviewShiftNotice>) => update((current) => current.map((notice) => notice.id === id ? { ...notice, ...change, updatedAt: new Date().toISOString() } : notice));
  return <section className="rounded-3xl border border-sky-200 bg-white p-4 sm:p-5" data-testid="shift-notice-control"><div className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-sky-700">SHIFT NOTICE / 班次公告</p><h2 className="text-xl font-black">SHIFT NOTICE CONTROL / 班次公告管理</h2></div>{!readOnly && Boolean(employees?.length) && <button onClick={() => setEditing('new')} className="min-h-11 rounded-xl bg-sky-700 px-4 text-xs font-black text-white"><Plus className="mr-2 inline h-4 w-4"/>CREATE NOTICE</button>}</div><div className="mt-4 grid gap-3">{!notices.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No shift notices / 暂无班次公告</p> : notices.map((notice) => { const expired = notice.status === 'ACTIVE' && notice.effectiveEndDate < getReviewSingaporeDate(); return <article key={notice.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><strong>{notice.shiftName}</strong><p className="text-xs text-slate-500">{formatDate(notice.effectiveStartDate)} – {formatDate(notice.effectiveEndDate)} · {notice.startTime}–{notice.endTime}</p><p className="mt-1 text-xs">{notice.assignedEmployeeNames.join(', ')}</p></div><span className={`self-start rounded-full px-3 py-1 text-[10px] font-black ${notice.status === 'ENDED' || expired ? 'bg-slate-100 text-slate-600' : notice.visibility === 'VISIBLE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{notice.status === 'ENDED' ? 'ENDED' : expired ? 'EXPIRED' : `${notice.status} · ${notice.visibility}`}</span></div>{!readOnly && notice.status === 'ACTIVE' && <div className="mt-3 flex flex-wrap gap-2">{Boolean(employees?.length) && <button onClick={() => setEditing(notice)} className="min-h-10 rounded-lg bg-slate-100 px-3 text-xs font-bold"><Pencil className="mr-1 inline h-3 w-3"/>EDIT NOTICE</button>}<button onClick={() => patchNotice(notice.id, { visibility: notice.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE' })} className="min-h-10 rounded-lg bg-sky-50 px-3 text-xs font-bold text-sky-800">{notice.visibility === 'VISIBLE' ? <EyeOff className="mr-1 inline h-3 w-3"/> : <Eye className="mr-1 inline h-3 w-3"/>}{notice.visibility === 'VISIBLE' ? 'HIDE NOTICE / 隐藏公告' : 'SHOW NOTICE / 显示公告'}</button><button onClick={() => patchNotice(notice.id, { status: 'ENDED', endedAt: new Date().toISOString() })} className="min-h-10 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-700"><StopCircle className="mr-1 inline h-3 w-3"/>END NOTICE / 结束公告</button></div>}</article>; })}</div>{editing && !readOnly && <ShiftNoticeEditor notice={editing === 'new' ? undefined : editing} employees={employees || []} close={() => setEditing(null)} save={(notice) => { update((current) => editing === 'new' ? [notice, ...current] : current.map((item) => item.id === notice.id ? notice : item)); setEditing(null); }}/>}</section>;
}

function ShiftNoticeEditor({ notice, employees, close, save }: { notice?: ReviewShiftNotice; employees: UserProfile[]; close: () => void; save: (notice: ReviewShiftNotice) => void }) {
  const [form, setForm] = useState({ shiftName: notice?.shiftName || 'Middle Shift / 中班', effectiveStartDate: notice?.effectiveStartDate || getReviewSingaporeDate(), effectiveEndDate: notice?.effectiveEndDate || getReviewSingaporeDate(), startTime: notice?.startTime || '14:00', endTime: notice?.endTime || '22:00', department: notice?.department || '', note: notice?.note || '' });
  const [selected, setSelected] = useState(notice?.assignedEmployeeIds || []);
  const [error, setError] = useState('');
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (form.effectiveEndDate < form.effectiveStartDate || !selected.length) { setError('Choose employees and a valid date range / 请选择员工及有效日期'); return; } const now = new Date().toISOString(); const assigned = employees.filter((employee) => selected.includes(employee.id)); save({ id: notice?.id || `shift-notice-${Date.now()}`, ...form, status: notice?.status || 'ACTIVE', visibility: notice?.visibility || 'VISIBLE', assignedEmployeeIds: assigned.map((employee) => employee.id), assignedEmployeeNames: assigned.map((employee) => employee.name), createdAt: notice?.createdAt || now, updatedAt: now, endedAt: notice?.endedAt }); };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Shift notice editor"><form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-4 sm:p-6"><div className="flex items-center justify-between"><h3 className="text-xl font-black">{notice ? 'EDIT' : 'CREATE'} MIDDLE SHIFT NOTICE</h3><button type="button" onClick={close} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">CLOSE</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="SHIFT NAME"><input value={form.shiftName} onChange={(event) => setForm((current) => ({ ...current, shiftName: event.target.value }))}/></Field><Field label="DEPARTMENT optional"><input value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}/></Field><Field label="EFFECTIVE START DATE"><input type="date" value={form.effectiveStartDate} onChange={(event) => setForm((current) => ({ ...current, effectiveStartDate: event.target.value }))}/></Field><Field label="EFFECTIVE END DATE"><input type="date" value={form.effectiveEndDate} onChange={(event) => setForm((current) => ({ ...current, effectiveEndDate: event.target.value }))}/></Field><Field label="SHIFT START TIME"><input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}/></Field><Field label="SHIFT END TIME"><input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}/></Field><div className="sm:col-span-2"><Field label="NOTE optional"><textarea rows={2} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}/></Field></div><div className="sm:col-span-2"><p className="text-sm font-bold">ASSIGNED EMPLOYEES</p><div className="mt-1 max-h-48 overflow-auto rounded-xl border p-2">{employees.map((employee) => <label key={employee.id} className="flex min-h-11 items-center gap-2 rounded p-2 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])}/><span className="min-w-0 truncate text-sm font-bold">{employee.name}</span><span className="ml-auto text-[10px] text-slate-500">{employee.department}</span></label>)}</div></div>{error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 sm:col-span-2">{error}</p>}<button className="min-h-12 rounded-xl bg-sky-700 font-black text-white sm:col-span-2">SAVE NOTICE</button></div></form></div>;
}

export function PartTimeWorkSchedule({ employeeId, month = getReviewSingaporeDate().slice(0, 7) }: { employeeId: string; month?: string }) {
  const tasks = useReviewTasks();
  const currentDate = getReviewSingaporeDate();
  const shifts = useMemo(() => tasks.filter((task) => task.status !== 'CANCELLED' && getAssignmentMode(task) === 'work-shift' && task.participants.some((participant) => participant.employeeId === employeeId && getParticipantEmploymentType(participant) === 'part-time')).sort((a, b) => a.date.localeCompare(b.date)), [employeeId, tasks]);
  if (!shifts.length) return null;
  const upcoming = shifts.filter((task) => task.participants.find((participant) => participant.employeeId === employeeId)?.status !== 'COMPLETED' && task.date >= currentDate);
  const completed = shifts.filter((task) => task.participants.find((participant) => participant.employeeId === employeeId)?.status === 'COMPLETED');
  const forecast = getPartTimeMonthlyForecast(tasks, employeeId, month, currentDate);
  return <section className="mb-6 rounded-3xl border border-violet-200 bg-white p-4 sm:p-6" data-testid="part-time-work-schedule"><p className="text-[10px] font-black uppercase tracking-widest text-violet-700">PART-TIME WORK SCHEDULE / 兼职工作安排</p><div className="mt-4 grid gap-3 min-[390px]:grid-cols-3"><Metric label="ACTUAL WORKED HOURS / 实际已工作时数" value={`${forecast.actualWorkedHours.toFixed(1)}h`}/><Metric label="PLANNED REMAINING HOURS / 剩余计划工时" value={`${forecast.plannedRemainingHours.toFixed(1)}h`}/><Metric label={forecast.isFinal ? 'FINAL MONTH HOURS / 最终月工时' : 'PROJECTED MONTH TOTAL / 预计月总工时'} value={`${forecast.projectedMonthTotal.toFixed(1)}h`}/></div><ScheduleList title="UPCOMING PLANNED SHIFTS / 未来工作安排" tasks={upcoming} employeeId={employeeId} planned/><ScheduleList title="COMPLETED WORKED SHIFTS / 已完成工时" tasks={completed} employeeId={employeeId}/></section>;
}

function ScheduleList({ title, tasks, employeeId, planned = false }: { title: string; tasks: ReviewTask[]; employeeId: string; planned?: boolean }) {
  return <div className="mt-5"><h3 className="text-xs font-black uppercase tracking-wider text-slate-600">{title}</h3>{!tasks.length ? <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">None / 无</p> : <div className="mt-2 grid gap-2">{tasks.map((task) => { const participant = task.participants.find((item) => item.employeeId === employeeId); const actual = participant?.effectiveWorkedHours ?? participant?.correctedWorkedHours ?? participant?.workedHours ?? 0; return <article key={task.id} className="flex flex-col gap-2 rounded-xl border p-3 min-[390px]:flex-row min-[390px]:items-center"><CalendarDays className="h-4 w-4 shrink-0 text-violet-600"/><div className="min-w-0"><strong className="block text-sm">{formatDate(task.date)} · {task.workstation}</strong><span className="text-xs text-slate-500">{task.plannedStart}–{task.plannedEnd} · {task.targetRequirement}</span></div><span className={`self-start rounded-full px-3 py-1 text-xs font-black min-[390px]:ml-auto ${planned ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{planned ? `PLANNED ${getPlannedShiftHours(task).toFixed(1)}h` : `WORKED ${actual.toFixed(1)}h`}</span></article>; })}</div>}</div>;
}

export function ManagerPartTimeForecast({ tasks, employeeId, month }: { tasks: ReviewTask[]; employeeId: string; month: string }) {
  const forecast = getPartTimeMonthlyForecast(tasks, employeeId, month, getReviewSingaporeDate());
  return <div className="grid gap-2 min-[390px]:grid-cols-3" data-testid="manager-part-time-forecast"><Metric label="ACTUAL WORKED / 实际已工作时数" value={`${forecast.actualWorkedHours.toFixed(1)}h`}/><Metric label="PLANNED REMAINING / 剩余计划工时" value={`${forecast.plannedRemainingHours.toFixed(1)}h`}/><Metric label={forecast.isFinal ? 'FINAL MONTH HOURS / 最终月工时' : 'PROJECTED MONTH TOTAL / 预计月总工时'} value={`${forecast.projectedMonthTotal.toFixed(1)}h`}/></div>;
}

export function ManagerPartTimeForecasts() {
  const tasks = useReviewTasks();
  const [month, setMonth] = useState(() => getReviewSingaporeDate().slice(0, 7));
  const employees = useMemo(() => {
    const rows = new Map<string, string>();
    tasks.forEach((task) => {
      if (getAssignmentMode(task) !== 'work-shift') return;
      task.participants.forEach((participant) => {
        if (getParticipantEmploymentType(participant) === 'part-time') rows.set(participant.employeeId, participant.employeeName);
      });
    });
    return Array.from(rows, ([id, name]) => ({ id, name }));
  }, [tasks]);
  return <section className="rounded-3xl border border-violet-200 bg-white p-4 sm:p-5"><div className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-violet-700">PAYROLL FORECAST / 薪资预测</p><h2 className="text-xl font-black">PART-TIME MONTHLY PROJECTION</h2></div><input aria-label="Part-Time forecast month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl border px-3 py-2 text-sm font-bold"/></div><div className="mt-4 grid gap-3">{employees.length ? employees.map((employee) => <article key={employee.id} className="rounded-2xl border p-4"><strong className="mb-3 block">{employee.name}</strong><ManagerPartTimeForecast tasks={tasks} employeeId={employee.id} month={month}/></article>) : <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No Part-Time work shifts in review data.</p>}</div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-bold">{label}<div className="mt-1 [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:p-3">{children}</div></label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>; }

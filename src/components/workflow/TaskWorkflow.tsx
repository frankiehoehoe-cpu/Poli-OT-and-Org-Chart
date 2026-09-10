import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Role, UserProfile } from '../../types';
import { getEmploymentType, getSingaporeDate, getSingaporeTime, type EmployeeMonthAggregate, type WorkAssignment, type WorkSubmission } from '../../lib/workflows';
import { workflowService } from '../../lib/workflowService';

const workstations = ['Mixing / 搅拌', 'Oven Drying / 烘干', 'Grinding / 研磨', 'Encapsulation / 进胶囊', 'Polishing / 抛光', 'Blistering / 压板', 'Print Code / 打码', 'Sacheting / 茶袋包装', 'Packing / 包装', 'Cleaning / 清洁', 'Changeover / 转线', 'Other Production Work / 其他生产工作'];

export function TaskWorkflow({ role, employees, employeeId }: { role: Role; employees: UserProfile[]; employeeId?: string }) {
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [editing, setEditing] = useState<WorkAssignment | null | undefined>(undefined);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [nextAssignments, nextSubmissions] = await Promise.all([workflowService.assignments(), workflowService.submissions()]);
      setAssignments(nextAssignments);
      setSubmissions(nextSubmissions);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load workflow');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const byAssignmentEmployee = useMemo(() => new Map(submissions.map((submission) => [`${submission.assignmentId}:${submission.employeeId}`, submission])), [submissions]);
  const visible = employeeId ? assignments.filter((assignment) => assignment.assignedEmployeeIds.includes(employeeId)) : assignments;

  const action = async (assignment: WorkAssignment, value: 'cancel' | 'close' | 'late-close') => {
    try {
      const details = value.includes('close') ? { actualResult: 'Completed', completionStatus: 'COMPLETED' } : {};
      await workflowService.assignmentAction(assignment, value, details);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Action failed'); }
  };

  const correct = async (submission: WorkSubmission) => {
    const note = window.prompt('Correction note') || '';
    if (submission.employmentTypeSnapshot === 'part-time') {
      const start = window.prompt('Corrected actual start', submission.correctedStart || submission.originalStart || '');
      const end = window.prompt('Corrected actual end', submission.correctedEnd || submission.originalEnd || '');
      if (!start || !end) return;
      try { await workflowService.correct(submission.id, { start, end, note }); await load(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Correction failed'); }
      return;
    }
    const candidate = window.prompt('Corrected OT hours', String(submission.effectiveOtHours ?? submission.originalOtHours ?? ''));
    if (!candidate) return;
    try { await workflowService.correct(submission.id, { hours: Number(candidate), note }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Correction failed'); }
  };

  return <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-widest text-indigo-600">OT PRO V1.3</p><h2 className="text-xl font-black">Work Assignments / 工作任务</h2></div>
      {role === 'supervisor' && <button className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white" onClick={() => setEditing(null)}>Create Assignment</button>}
    </div>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
    {editing !== undefined && <AssignmentEditor employees={employees} assignment={editing} close={() => setEditing(undefined)} saved={async () => { setEditing(undefined); await load(); }} />}
    <div className="space-y-3">
      {visible.map((assignment) => <article key={assignment.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black text-indigo-600">{assignment.assignmentMode === 'work-shift' ? 'WORK SHIFT' : 'OT TASK'} · {assignment.date}</p><h3 className="font-black">{assignment.workstation}</h3><p className="text-sm text-slate-600">{assignment.targetRequirement}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{assignment.status}</span></div>
        {role === 'employee' && employeeId && <EmployeeSubmission assignment={assignment} employee={employees.find((employee) => employee.id === employeeId)} existing={byAssignmentEmployee.get(`${assignment.id}:${employeeId}`)} saved={load} setError={setError} />}
        {role === 'supervisor' && <>
          <div className="mt-3 space-y-2">{assignment.assignedEmployeeIds.map((id) => {
            const employee = employees.find((item) => item.id === id);
            const submission = byAssignmentEmployee.get(`${assignment.id}:${id}`);
            return <div key={id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm"><strong>{employee?.name || id}</strong><span className="ml-auto">{submission ? submission.employmentTypeSnapshot === 'part-time' ? `${submission.effectiveWorkedHours ?? 0}h worked` : `${submission.effectiveOtHours ?? 0}h OT` : 'NO SUBMISSION'}</span>{submission && <button className="rounded-lg bg-amber-100 px-3 py-2 font-bold" onClick={() => void correct(submission)}>Correct</button>}</div>;
          })}</div>
          {!['CLOSED', 'CANCELLED'].includes(assignment.status) && <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold" onClick={() => setEditing(assignment)}>Edit</button><button className="rounded-lg bg-indigo-100 px-3 py-2 text-sm font-bold" onClick={() => void action(assignment, assignment.date < getSingaporeDate() ? 'late-close' : 'close')}>Close</button><button className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700" onClick={() => void action(assignment, 'cancel')}>Cancel</button></div>}
        </>}
      </article>)}
      {!visible.length && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">No V1.3 assignments.</p>}
    </div>
  </section>;
}

function AssignmentEditor({ employees, assignment, close, saved }: { employees: UserProfile[]; assignment: WorkAssignment | null; close: () => void; saved: () => Promise<void> }) {
  const [mode, setMode] = useState(assignment?.assignmentMode || 'ot-task');
  const [selected, setSelected] = useState<string[]>(assignment?.assignedEmployeeIds || []);
  const [form, setForm] = useState({ date: assignment?.date || getSingaporeDate(), department: assignment?.department || 'Production', workstation: assignment?.workstation || workstations[7], product: assignment?.product || '', batchNo: assignment?.batchNo || '', plannedStart: assignment?.plannedStart || '18:00', plannedEnd: assignment?.plannedEnd || '21:00', targetRequirement: assignment?.targetRequirement || '' });
  const [error, setError] = useState('');
  const eligible = employees.filter((employee) => getEmploymentType(employee) === (mode === 'work-shift' ? 'part-time' : 'full-time'));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await workflowService.saveAssignment({ ...form, assignmentMode: mode, taskType: 'output', assignedEmployeeIds: selected }, assignment || undefined); await saved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Save failed'); }
  };
  return <form onSubmit={submit} className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
    <label className="text-sm font-bold">Assignment Type<select className="mt-1 w-full rounded-xl border p-3" value={mode} disabled={Boolean(assignment)} onChange={(event) => { setMode(event.target.value as 'ot-task' | 'work-shift'); setSelected([]); }}><option value="ot-task">OT Task</option><option value="work-shift">Work Shift</option></select></label>
    <Field label="Date"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })}/></Field>
    <Field label="Department"><input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}/></Field>
    <label className="text-sm font-bold">Workstation<select className="mt-1 w-full rounded-xl border p-3" value={form.workstation} onChange={(event) => setForm({ ...form, workstation: event.target.value })}>{workstations.map((station) => <option key={station}>{station}</option>)}</select></label>
    <Field label="Planned Start"><input type="time" value={form.plannedStart} onChange={(event) => setForm({ ...form, plannedStart: event.target.value })}/></Field>
    <Field label="Planned End"><input type="time" value={form.plannedEnd} onChange={(event) => setForm({ ...form, plannedEnd: event.target.value })}/></Field>
    <div className="sm:col-span-2"><Field label="Requirement"><textarea required value={form.targetRequirement} onChange={(event) => setForm({ ...form, targetRequirement: event.target.value })}/></Field><p className="mt-3 text-sm font-black">ASSIGNED EMPLOYEES</p>{eligible.map((employee) => <label key={employee.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])}/>{employee.name}</label>)}</div>
    {error && <p className="text-sm font-bold text-red-700 sm:col-span-2">{error}</p>}
    <div className="flex gap-2 sm:col-span-2"><button type="button" className="flex-1 rounded-xl border p-3 font-bold" onClick={close}>Cancel</button><button disabled={!selected.length} className="flex-1 rounded-xl bg-indigo-600 p-3 font-black text-white disabled:opacity-40">Save</button></div>
  </form>;
}

function EmployeeSubmission({ assignment, employee, existing, saved, setError }: { assignment: WorkAssignment; employee?: UserProfile; existing?: WorkSubmission; saved: () => Promise<void>; setError: (value: string) => void }) {
  const [hours, setHours] = useState('');
  const [start, setStart] = useState(assignment.plannedStart);
  const [end, setEnd] = useState(assignment.plannedEnd);
  if (!employee) return null;
  if (existing) return <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">Submitted: {existing.employmentTypeSnapshot === 'part-time' ? `${existing.effectiveWorkedHours} worked hours` : `${existing.effectiveOtHours} OT hours`}</p>;
  const employmentType = getEmploymentType(employee);
  const isTodayOpen = assignment.date === getSingaporeDate() && !['CLOSED', 'CANCELLED'].includes(assignment.status);
  const beforeOtOpen = employmentType === 'full-time' && getSingaporeTime() < '20:00';
  const allowed = isTodayOpen && !beforeOtOpen;
  const submit = async () => {
    try { await workflowService.submit({ assignmentId: assignment.id, ...(employmentType === 'part-time' ? { actualStart: start, actualEnd: end } : { otHours: Number(hours) }) }); await saved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Submission failed'); }
  };
  return (
    <div className="mt-3 space-y-2">
      {beforeOtOpen && <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">OT submission opens at 20:00 Singapore time / 加班填写于新加坡时间20:00开放</p>}
      <div className="flex flex-wrap items-end gap-2">
        {employmentType === 'part-time' ? (
          <>
            <Field label="Actual Start"><input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
            <Field label="Actual End"><input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
          </>
        ) : (
          <Field label="OT Hours"><input type="number" min="0.5" max="12" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} /></Field>
        )}
        <button disabled={!allowed} className="min-h-12 rounded-xl bg-indigo-600 px-4 font-black text-white disabled:opacity-40" onClick={() => void submit()}>Submit</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-sm font-bold">{label}<span className="mt-1 block [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:p-3">{children}</span></label>;
}

export function WorkHistory({ employeeId, month }: { employeeId: string; month: string }) {
  const [submissions, setSubmissions] = useState<WorkSubmission[]>([]);
  const [aggregate, setAggregate] = useState<EmployeeMonthAggregate | null>(null);
  useEffect(() => {
    void Promise.all([workflowService.submissions(month), workflowService.month(month)]).then(([items, summary]) => {
      setSubmissions(items.filter((item) => item.employeeId === employeeId));
      setAggregate(summary.aggregates.find((item) => item.employeeId === employeeId) || null);
    });
  }, [employeeId, month]);
  return <section className="rounded-3xl border bg-white p-5"><h2 className="font-black">V1.3 Work History</h2>{aggregate && <p className="mt-2 text-sm font-bold text-slate-600">Month total: {aggregate.fullTimeOtHours.toFixed(1)}h FT OT · {aggregate.partTimeWorkedHours.toFixed(1)}h PT worked</p>}{submissions.map((submission) => <div key={submission.id} className="mt-2 flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{submission.taskDate} · {submission.actualWorkstation}</span><strong>{submission.employmentTypeSnapshot === 'part-time' ? `${submission.effectiveWorkedHours || 0}h worked` : `${submission.effectiveOtHours || 0}h OT`}</strong></div>)}</section>;
}

export function MixedMonthAnalytics({ month }: { month: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof workflowService.month>> | null>(null);
  useEffect(() => { void workflowService.month(month).then(setData); }, [month]);
  return <section className="rounded-3xl border bg-white p-5"><h2 className="font-black">Mixed-source Monthly Labour</h2>{data?.aggregates.map((item) => <div key={item.employeeId} className="mt-2 grid grid-cols-3 rounded-xl bg-slate-50 p-3 text-sm"><strong>{item.employeeName}</strong><span>FT OT {item.fullTimeOtHours.toFixed(1)}h</span><span>PT Worked {item.partTimeWorkedHours.toFixed(1)}h</span></div>)}{data?.forecasts.map((item) => <div key={item.employeeId} className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><strong>{item.employeeName}</strong> · completed {item.actualWorkedHours.toFixed(1)}h · future planned {item.plannedRemainingHours.toFixed(1)}h · forecast {item.projectedMonthTotal.toFixed(1)}h</div>)}</section>;
}

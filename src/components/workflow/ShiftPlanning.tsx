import { useCallback, useEffect, useState } from 'react';
import type { UserProfile } from '../../types';
import { getSingaporeDate, type ShiftNotice } from '../../lib/workflows';
import { workflowService, type PublicAssignment } from '../../lib/workflowService';

export function PublicShiftNotices() {
  const [notices, setNotices] = useState<ShiftNotice[]>([]);
  const [assignments, setAssignments] = useState<PublicAssignment[]>([]);
  const [publicDate, setPublicDate] = useState(getSingaporeDate());

  useEffect(() => {
    void Promise.all([
      workflowService.notices().catch(() => [] as ShiftNotice[]),
      workflowService.publicOverview().catch(() => ({ date: getSingaporeDate(), assignments: [] as PublicAssignment[] }))
    ]).then(([nextNotices, overview]) => {
      setNotices(nextNotices);
      setPublicDate(overview.date);
      setAssignments(overview.assignments);
    });
  }, []);

  const secondShifts = assignments.filter((assignment) => assignment.shiftType === 'SECOND_SHIFT' && assignment.status !== 'CLOSED');
  const hourAssignments = assignments.filter((assignment) => assignment.shiftType !== 'SECOND_SHIFT' && assignment.date === publicDate);

  return <div className="space-y-4">
    <section className="mx-auto w-full max-w-6xl px-6">
      <div className="rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-indigo-600">Tonight&apos;s OT Assignment / 今晚加班安排</p>
            <p className="mt-1 text-sm font-bold text-slate-500">{publicDate}</p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">TODAY ONLY / 仅今日</span>
        </div>

        {!hourAssignments.length ? (
          <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-center text-sm font-black text-slate-500">NO OT ASSIGNMENT FOR TONIGHT / 今晚没有加班安排</p>
        ) : (
          <div className="mt-4 space-y-3">
            {hourAssignments.map((assignment) => (
              <article key={assignment.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-indigo-600">{assignment.assignmentMode === 'work-shift' ? 'WORK SHIFT / 工作班次' : 'OT TASK / 加班任务'}</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900">{assignment.workstation}</h3>
                    {assignment.product && <p className="text-sm font-bold text-slate-700">{assignment.product}{assignment.batchNo ? ` · ${assignment.batchNo}` : ''}</p>}
                    {assignment.targetRequirement && <p className="mt-1 text-sm text-slate-600">{assignment.targetRequirement}</p>}
                    <p className="mt-1 text-xs font-bold text-slate-500">{assignment.plannedStart}–{assignment.plannedEnd}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{assignment.status}</span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {assignment.participants.map((participant) => {
                    const submitted = participant.status === 'SUBMITTED';
                    const mismatch = participant.status === 'MISMATCH';
                    const pendingLabel = participant.employmentType === 'part-time' ? 'PENDING WORK HOURS / 待填写工时' : 'PENDING OT / 待填写';
                    const submittedLabel = participant.employmentType === 'part-time' ? 'SUBMITTED WORK HOURS ✓ / 已填写工时' : 'SUBMITTED ✓ / 已填写';
                    const statusLabel = mismatch ? 'EMPLOYMENT TYPE MISMATCH / 雇佣类型不匹配' : submitted ? submittedLabel : pendingLabel;
                    const stateClass = mismatch ? 'border-slate-300 bg-slate-50' : submitted ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50';
                    const textClass = mismatch ? 'text-slate-600' : submitted ? 'text-emerald-700' : 'text-red-700';
                    return <div key={participant.employeeId} className={`rounded-xl border p-3 ${stateClass}`}>
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-slate-900">{participant.employeeName}</strong>
                        <span className={`text-[10px] font-black ${textClass}`}>{statusLabel}</span>
                      </div>
                      {submitted && participant.effectiveHours !== undefined && <p className="mt-1 text-xs font-bold text-slate-600">Actual: {participant.effectiveHours.toFixed(1)}h</p>}
                    </div>;
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>

    {secondShifts.length > 0 && <section className="mx-auto w-full max-w-6xl px-6"><div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-widest text-cyan-800">2ND SHIFT / 中班安排</p>{secondShifts.map((assignment) => { const upcoming = assignment.date > publicDate; return <article key={assignment.id} className="mt-3 rounded-2xl border border-cyan-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-widest text-cyan-700">{upcoming ? 'UPCOMING 2ND SHIFT / 即将中班' : "TODAY'S 2ND SHIFT / 今日中班"}</p><h3 className="mt-1 font-black text-slate-900">{assignment.department} · {assignment.workstation}</h3><p className="text-sm font-bold text-slate-600">{assignment.date} · {assignment.plannedStart}–{assignment.plannedEnd}</p>{assignment.targetRequirement && <p className="mt-1 text-sm text-slate-600">{assignment.targetRequirement}</p>}</div><span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">{upcoming ? 'UPCOMING / 即将' : 'TODAY / 今日'} · NO HOURS REQUIRED</span></div><p className="mt-3 text-sm"><strong>Assigned / 安排：</strong>{assignment.participants.map((participant) => participant.employeeName).join(', ')}</p></article>; })}</div></section>}

    {notices.length > 0 && <section className="mx-auto w-full max-w-6xl px-6"><div className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><p className="text-xs font-black uppercase tracking-widest text-amber-700">Operational Shift Notice</p>{notices.map((notice) => <div key={notice.id} className="mt-2"><strong>{notice.shiftName}</strong><p className="text-sm">{notice.effectiveStartDate}–{notice.effectiveEndDate} · {notice.startTime}–{notice.endTime}</p>{notice.assignedEmployeeNamesSnapshot?.length > 0 && <p className="mt-1 text-sm"><strong>Assigned / 安排：</strong>{notice.assignedEmployeeNamesSnapshot.join(', ')}</p>}{notice.note && <p className="text-sm text-slate-600">{notice.note}</p>}</div>)}</div></section>}
  </div>;
}

export function ShiftNoticeControl({ employees }: { employees: UserProfile[] }) {
  const [notices, setNotices] = useState<ShiftNotice[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => { try { setNotices(await workflowService.notices()); } catch { setError('Unable to load shift notices'); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="space-y-3 rounded-3xl border bg-white p-5"><div className="flex justify-between"><h2 className="font-black">Shift Notices</h2><button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white" onClick={() => setShowForm((value) => !value)}>New Notice</button></div>{error && <p className="text-sm font-bold text-red-700">{error}</p>}{showForm && <NoticeForm employees={employees} saved={async () => { setShowForm(false); await load(); }} setError={setError}/>} {notices.map((notice) => <div key={notice.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm"><strong>{notice.shiftName}</strong><span>{notice.status} · {notice.visibility}</span><span className="ml-auto">{notice.startTime}–{notice.endTime}</span><button className="rounded-lg border px-3 py-2 font-bold" onClick={async () => { try { await workflowService.noticeAction(notice.id, notice.status === 'ACTIVE' ? 'end' : 'visibility', notice.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Action failed'); } }}>{notice.status === 'ACTIVE' ? 'End' : notice.visibility === 'VISIBLE' ? 'Hide' : 'Show'}</button></div>)}</section>;
}

function NoticeForm({ employees, saved, setError }: { employees: UserProfile[]; saved: () => Promise<void>; setError: (value: string) => void }) {
  const today = getSingaporeDate();
  const [form, setForm] = useState({ shiftName: 'Middle Shift', effectiveStartDate: today, effectiveEndDate: today, startTime: '12:00', endTime: '20:00', note: '' });
  const [selected, setSelected] = useState<string[]>([]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); try { await workflowService.createNotice({ ...form, visibility: 'VISIBLE', assignedEmployeeIds: selected } as unknown as ShiftNotice); await saved(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Save failed'); } };
  return <form onSubmit={submit} className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2"><Field label="Shift Name"><input value={form.shiftName} onChange={(event) => setForm({ ...form, shiftName: event.target.value })}/></Field><Field label="Start Date"><input type="date" value={form.effectiveStartDate} onChange={(event) => setForm({ ...form, effectiveStartDate: event.target.value })}/></Field><Field label="End Date"><input type="date" value={form.effectiveEndDate} onChange={(event) => setForm({ ...form, effectiveEndDate: event.target.value })}/></Field><Field label="Start Time"><input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })}/></Field><Field label="End Time"><input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })}/></Field><Field label="Note"><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })}/></Field><div className="sm:col-span-2">{employees.map((employee) => <label key={employee.id} className="mr-4 inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected((values) => values.includes(employee.id) ? values.filter((id) => id !== employee.id) : [...values, employee.id])}/>{employee.name}</label>)}</div><button disabled={!selected.length} className="rounded-xl bg-indigo-600 p-3 font-black text-white disabled:opacity-40 sm:col-span-2">Save Notice</button></form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-bold">{label}<span className="mt-1 block [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:p-3">{children}</span></label>; }

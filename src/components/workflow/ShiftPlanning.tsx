import { useCallback, useEffect, useState } from 'react';
import type { UserProfile } from '../../types';
import { getSingaporeDate, type ShiftNotice } from '../../lib/workflows';
import { workflowService } from '../../lib/workflowService';

export function PublicShiftNotices() {
  const [notices, setNotices] = useState<ShiftNotice[]>([]);
  useEffect(() => { void workflowService.notices().then(setNotices).catch(() => setNotices([])); }, []);
  if (!notices.length) return null;
  return <section className="mx-auto w-full max-w-6xl px-6"><div className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><p className="text-xs font-black uppercase tracking-widest text-amber-700">Operational Shift Notice</p>{notices.map((notice) => <div key={notice.id} className="mt-2"><strong>{notice.shiftName}</strong><p className="text-sm">{notice.effectiveStartDate}–{notice.effectiveEndDate} · {notice.startTime}–{notice.endTime}</p>{notice.note && <p className="text-sm text-slate-600">{notice.note}</p>}</div>)}</div></section>;
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

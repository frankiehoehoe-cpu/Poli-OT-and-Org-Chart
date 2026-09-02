import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Clock3, Gauge, TrendingUp, UserRound, UsersRound, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { OvertimeEntry, UserProfile } from '../types';
import { calculateMonthlyOvertimeRisks, type EmployeeOvertimeRisk, type OvertimeRiskLevel } from '../lib/overtimeRisk';
import { formatDateFriendly, formatMonth } from '../lib/dateUtils';

interface Props {
  month: string;
  onMonthChange: (month: string) => void;
  employees: UserProfile[];
  entries: OvertimeEntry[];
}

const RISK_ORDER: Record<OvertimeRiskLevel, number> = { HIGH: 0, WATCH: 1, NORMAL: 2 };
const DEPARTMENT_LABELS: Record<string, string> = {
  deptProduction: 'Production', deptWarehouse: 'Warehouse', deptQaQc: 'QA/QC', deptOffice: 'Office',
  deptDriver: 'Driver', deptMaintenance: 'Maintenance', deptOther: 'Others',
};
const departmentName = (value?: string) => DEPARTMENT_LABELS[value || 'deptOther'] || value || 'Others';

const RiskBadge = ({ level }: { level: OvertimeRiskLevel }) => {
  const styles = level === 'HIGH' ? 'bg-red-100 text-red-700 border-red-200' : level === 'WATCH' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black tracking-wider ${styles}`}>{level}</span>;
};

function KpiCard({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">{icon}</span></div>
    <p className="text-2xl font-black text-slate-900">{value}</p>{detail && <p className="mt-1 truncate text-xs font-medium text-slate-500">{detail}</p>}
  </div>;
}

export default function ManagerControlDashboard({ month, onMonthChange, employees, entries }: Props) {
  const [filter, setFilter] = useState<'ALL' | 'WATCH' | 'HIGH'>('ALL');
  const [selectedRisk, setSelectedRisk] = useState<EmployeeOvertimeRisk | null>(null);
  const analytics = useMemo(() => {
    const monthEntries = entries.filter((entry) => entry.date.slice(0, 7) === month && entry.status !== 'rejected');
    const risks = calculateMonthlyOvertimeRisks(employees, monthEntries, month);
    const active = risks.filter((risk) => risk.sessionCount > 0);
    const sorted = [...active].sort((a, b) => RISK_ORDER[a.level] - RISK_ORDER[b.level] || b.monthlyHours - a.monthlyHours);
    const totalHours = monthEntries.reduce((sum, entry) => sum + entry.totalHours, 0);
    const weekly = Array.from({ length: 5 }, (_, index) => ({ name: `Week ${index + 1}`, hours: 0 }));
    monthEntries.forEach((entry) => { const day = Number(entry.date.slice(8, 10)); weekly[Math.min(4, Math.floor((day - 1) / 7))].hours += entry.totalHours; });
    const departments = new Map<string, { name: string; employeeIds: Set<string>; sessions: number; hours: number }>();
    monthEntries.forEach((entry) => {
      const employee = employees.find((item) => item.id === entry.employeeId);
      const name = departmentName(employee?.department);
      const current = departments.get(name) ?? { name, employeeIds: new Set<string>(), sessions: 0, hours: 0 };
      current.employeeIds.add(entry.employeeId); current.sessions += 1; current.hours += entry.totalHours; departments.set(name, current);
    });
    const departmentRows = [...departments.values()].sort((a, b) => b.hours - a.hours);
    return { monthEntries, risks, sorted, totalHours, weekly, departmentRows, highest: [...active].sort((a, b) => b.monthlyHours - a.monthlyHours)[0], alerts: active.filter((risk) => risk.level !== 'NORMAL').length };
  }, [employees, entries, month]);

  const visibleRisks = analytics.sorted.filter((risk) => filter === 'ALL' || risk.level === filter);
  const highCount = analytics.risks.filter((risk) => risk.level === 'HIGH' && risk.sessionCount > 0).length;
  const consecutiveCount = analytics.risks.filter((risk) => risk.consecutiveDays >= 4).length;
  const dominantDepartment = analytics.departmentRows[0];
  const dominantShare = analytics.totalHours ? (dominantDepartment?.hours ?? 0) / analytics.totalHours * 100 : 0;

  return <div className="space-y-7">
    <div className="flex flex-col gap-4 rounded-2xl bg-slate-900 px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Management Control Dashboard</p><h3 className="mt-1 text-2xl font-black">{formatMonth(month)}</h3><p className="mt-1 text-sm text-slate-400">Internal OT Monitoring · 内部加班监控</p></div>
      <label className="flex items-center gap-3 text-sm font-bold"><CalendarDays className="h-5 w-5 text-indigo-300"/><input aria-label="Dashboard month" type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-white [color-scheme:dark]"/></label>
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <KpiCard label="Total OT Hours" value={`${analytics.totalHours.toFixed(1)} hrs`} icon={<Clock3 className="h-5 w-5"/>}/>
      <KpiCard label="Employees with OT" value={`${analytics.sorted.length}`} detail="employees" icon={<UsersRound className="h-5 w-5"/>}/>
      <KpiCard label="Total OT Occurrences" value={`${analytics.monthEntries.length}`} detail="OT sessions" icon={<CalendarDays className="h-5 w-5"/>}/>
      <KpiCard label="Average OT / Employee" value={`${(analytics.totalHours / (analytics.sorted.length || 1)).toFixed(1)} hrs`} icon={<TrendingUp className="h-5 w-5"/>}/>
      <KpiCard label="Highest OT Employee" value={analytics.highest ? `${analytics.highest.monthlyHours.toFixed(1)} hrs` : '—'} detail={analytics.highest?.employeeName ?? 'No OT recorded'} icon={<UserRound className="h-5 w-5"/>}/>
      <KpiCard label="Fatigue / Compliance Alerts" value={`${analytics.alerts}`} detail="WATCH or HIGH" icon={<Gauge className="h-5 w-5"/>}/>
    </div>

    {!analytics.monthEntries.length && <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-6 py-5"><p className="font-bold text-indigo-900">No OT records for {formatMonth(month)} yet.</p><p className="mt-1 text-sm text-indigo-700">{month.slice(0, 4)}年{Number(month.slice(5, 7))}月暂无加班记录。</p></div>}

    <section><div className="mb-4"><h3 className="text-lg font-black text-slate-900">MANAGEMENT SUMMARY</h3><p className="text-sm text-slate-500">管理概览</p></div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h4 className="mb-5 text-sm font-black tracking-wide text-slate-800">MONTHLY OT TREND</h4><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.weekly}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="name" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip formatter={(value) => [`${Number(value).toFixed(1)} hrs`, 'OT Hours']}/><Bar dataKey="hours" fill="#4f46e5" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div></div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="p-6 pb-3"><h4 className="text-sm font-black tracking-wide text-slate-800">TOP 5 OT EMPLOYEES</h4></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Department</th><th className="px-5 py-3">Sessions</th><th className="px-5 py-3">Total Hours</th><th className="px-5 py-3">Risk</th></tr></thead><tbody>{[...analytics.sorted].sort((a,b)=>b.monthlyHours-a.monthlyHours).slice(0,5).map((risk)=><tr key={risk.employeeId} className="border-t border-slate-100"><td className="px-5 py-3 font-bold text-slate-900">{risk.employeeName}</td><td className="px-5 py-3 text-slate-600">{departmentName(risk.department)}</td><td className="px-5 py-3">{risk.sessionCount}</td><td className="px-5 py-3 font-bold">{risk.monthlyHours.toFixed(1)} hrs</td><td className="px-5 py-3"><RiskBadge level={risk.level}/></td></tr>)}</tbody></table></div></div>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="p-6"><h3 className="text-lg font-black text-slate-900">OT BY DEPARTMENT</h3><p className="text-sm text-slate-500">部门加班分布</p></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-6 py-3">Department</th><th className="px-6 py-3">Employees with OT</th><th className="px-6 py-3">OT Sessions</th><th className="px-6 py-3">Total Hours</th><th className="px-6 py-3">% of Total OT</th></tr></thead><tbody>{analytics.departmentRows.map((row)=><tr key={row.name} className="border-t border-slate-100"><td className="px-6 py-4 font-bold">{row.name}</td><td className="px-6 py-4">{row.employeeIds.size}</td><td className="px-6 py-4">{row.sessions}</td><td className="px-6 py-4 font-bold">{row.hours.toFixed(1)} hrs</td><td className="px-6 py-4">{analytics.totalHours ? (row.hours/analytics.totalHours*100).toFixed(1) : '0.0'}%</td></tr>)}</tbody></table></div></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-black text-slate-900">MANAGEMENT ATTENTION</h3><p className="mb-5 text-sm text-slate-500">需要管理层关注</p>{!highCount && dominantShare < 50 && !consecutiveCount && !analytics.highest ? <div className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">No significant OT management alerts for this month.<br/>本月暂无重大加班异常。</div> : <div className="grid gap-3 md:grid-cols-2">{highCount > 0 && <div className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">🔴 {highCount} employee{highCount === 1 ? ' is' : 's are'} currently High OT Risk</div>}{dominantDepartment && dominantShare >= 50 && <div className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">🟡 {dominantDepartment.name} accounts for {dominantShare.toFixed(0)}% of total OT this month</div>}{consecutiveCount > 0 && <div className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">🟡 {consecutiveCount} employee{consecutiveCount === 1 ? '' : 's'} worked OT on 4+ consecutive days</div>}{analytics.highest && <div className="rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">🔵 Highest individual OT: {analytics.highest.employeeName} — {analytics.highest.monthlyHours.toFixed(1)} hrs</div>}</div>}</section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-lg font-black text-slate-900">FATIGUE & OT MONITOR</h3><p className="text-sm text-slate-500">疲劳与加班监控 · Internal thresholds only</p></div><div className="flex gap-2">{(['ALL','WATCH','HIGH'] as const).map((item)=><button key={item} onClick={()=>setFilter(item)} className={`rounded-lg px-3 py-2 text-xs font-black ${filter===item?'bg-slate-900 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item}</button>)}</div></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Department</th><th className="px-5 py-3">Month OT</th><th className="px-5 py-3">Week OT</th><th className="px-5 py-3">Consecutive OT Days</th><th className="px-5 py-3">Long OT</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Reason</th></tr></thead><tbody>{visibleRisks.map((risk)=><tr key={risk.employeeId} onClick={()=>setSelectedRisk(risk)} className="cursor-pointer border-t border-slate-100 hover:bg-indigo-50/50"><td className="px-5 py-4 font-bold text-slate-900">{risk.employeeName}</td><td className="px-5 py-4">{departmentName(risk.department)}</td><td className="px-5 py-4 font-bold">{risk.monthlyHours.toFixed(1)}h</td><td className="px-5 py-4">{risk.weeklyHours.toFixed(1)}h</td><td className="px-5 py-4">{risk.consecutiveDays} days</td><td className="px-5 py-4">{risk.longSessionCount}</td><td className="px-5 py-4"><RiskBadge level={risk.level}/></td><td className="max-w-xs px-5 py-4 text-slate-600">{risk.reasons.join('; ')}</td></tr>)}</tbody></table></div></section>

    {selectedRisk && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label={`${selectedRisk.employeeName} overtime risk detail`} onMouseDown={(event)=>{if(event.target===event.currentTarget)setSelectedRisk(null)}}><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 flex items-start justify-between border-b border-slate-200 bg-white p-6"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Employee Risk Detail · Read Only</p><h3 className="mt-1 text-2xl font-black">{selectedRisk.employeeName}</h3><p className="text-sm text-slate-500">{departmentName(selectedRisk.department)} · {formatMonth(month)}</p></div><button aria-label="Close detail" onClick={()=>setSelectedRisk(null)} className="rounded-xl bg-slate-100 p-2 hover:bg-slate-200"><X className="h-5 w-5"/></button></div><div className="space-y-6 p-6"><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><KpiCard label="Total OT" value={`${selectedRisk.monthlyHours.toFixed(1)}h`} icon={<Clock3 className="h-5 w-5"/>}/><KpiCard label="Sessions" value={`${selectedRisk.sessionCount}`} icon={<CalendarDays className="h-5 w-5"/>}/><KpiCard label="Consecutive" value={`${selectedRisk.consecutiveDays} days`} icon={<TrendingUp className="h-5 w-5"/>}/><KpiCard label="Long Sessions" value={`${selectedRisk.longSessionCount}`} icon={<AlertTriangle className="h-5 w-5"/>}/></div><div className="rounded-xl bg-slate-50 p-5"><div className="flex items-center gap-3"><RiskBadge level={selectedRisk.level}/><p className="font-bold">Internal OT Monitoring</p></div><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">{selectedRisk.reasons.map((reason)=><li key={reason}>{reason}</li>)}</ul></div><div><h4 className="mb-3 font-black">Weekly OT Breakdown</h4><div className="grid gap-2 sm:grid-cols-2">{selectedRisk.weeklyBreakdown.map((week)=><div key={week.weekStart} className="flex justify-between rounded-xl border border-slate-200 p-3 text-sm"><span>{week.weekStart} — {week.weekEnd}</span><strong>{week.hours.toFixed(1)}h</strong></div>)}</div></div><div><h4 className="mb-3 font-black">Recent OT Entries</h4><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Time</th><th className="p-3">Hours</th><th className="p-3">Remarks</th></tr></thead><tbody>{selectedRisk.entries.slice(0,10).map((entry)=><tr key={entry.id} className="border-t border-slate-100"><td className="p-3">{formatDateFriendly(entry.date)}</td><td className="p-3">{entry.startTime}–{entry.endTime}</td><td className="p-3 font-bold">{entry.totalHours.toFixed(1)}h</td><td className="p-3 text-slate-500">{entry.remarks || '—'}</td></tr>)}</tbody></table></div></div></div></div></div>}
  </div>;
}


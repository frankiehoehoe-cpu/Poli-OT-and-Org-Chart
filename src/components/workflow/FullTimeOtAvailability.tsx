import { useEffect, useMemo, useState } from 'react';
import { workflowService } from '../../lib/workflowService';
import { getSingaporeDate, type FullTimeOtAvailability } from '../../lib/workflows';

interface Props {
  employeeId: string;
}

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const dayLabel = (date: string) => new Intl.DateTimeFormat('en-SG', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Singapore'
}).format(new Date(`${date}T12:00:00+08:00`));

export function FullTimeOtAvailability({ employeeId }: Props) {
  const today = getSingaporeDate();
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index)), [today]);
  const [items, setItems] = useState<FullTimeOtAvailability[]>([]);
  const [busyDate, setBusyDate] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const next = await workflowService.fullTimeOtAvailability();
      setItems(next.filter((item) => item.employeeId === employeeId));
      setMessage('');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to load OT availability');
    }
  };

  useEffect(() => {
    void load();
    const refresh = () => void load();
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('otpro-workflow-changed', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('otpro-workflow-changed', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [employeeId]);

  const availableDates = new Set(items.map((item) => item.date));

  const toggle = async (date: string) => {
    setBusyDate(date);
    setMessage('');
    try {
      if (availableDates.has(date)) await workflowService.removeFullTimeOtAvailability(date);
      else await workflowService.addFullTimeOtAvailability(date);
      await load();
      window.dispatchEvent(new Event('otpro-workflow-changed'));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to update OT availability');
    } finally {
      setBusyDate('');
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 no-print">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-indigo-600">FULL-TIME OT AVAILABILITY / 全职加班计划</p>
        <h3 className="text-lg font-black text-slate-900">Next 7 Days / 接下来7天可加班日期</h3>
        <p className="mt-1 text-sm text-slate-600">点击你可以加班的日期。已选择的日期会优先显示给主管安排 OT Task。</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {dates.map((date, index) => {
          const available = availableDates.has(date);
          return (
            <button
              key={date}
              type="button"
              disabled={Boolean(busyDate)}
              onClick={() => void toggle(date)}
              className={`rounded-2xl border p-3 text-left transition-all disabled:opacity-50 ${available
                ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300'}`}
            >
              <p className="text-[10px] font-black uppercase">{index === 0 ? 'TODAY / 今天' : dayLabel(date)}</p>
              <p className="mt-1 text-sm font-black">{date.slice(5)}</p>
              <p className="mt-2 text-[10px] font-black">{available ? 'AVAILABLE / 可加班' : 'NOT PLANNED / 未计划'}</p>
            </button>
          );
        })}
      </div>

      {message && <p className="mt-3 text-sm font-bold text-red-600">{message}</p>}
    </section>
  );
}

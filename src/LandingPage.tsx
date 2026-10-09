import { useState, useEffect } from 'react';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from './lib/LanguageContext';
import { useAuth } from './lib/AuthContext';
import { employeeService, orgChartService } from './lib/services';
import { UserProfile } from './types';
import { formatDateWithDay } from './lib/dateUtils';
import { 
  Users, 
  LogIn, 
  Clock, 
  ArrowRight, 
  Globe,
  TrendingUp,
  Briefcase,
  Calendar as CalendarIcon,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Minimize2,
  Maximize2,
  AlertTriangle,
  ShieldAlert,
  Ban,
  X
} from 'lucide-react';
import LoginPage from './LoginPage';
import EmployeePortal from './EmployeePortal';
import OrgChart from './components/OrgChart';
import { PublicShiftNotices } from './components/workflow/ShiftPlanning';
import { OT_V13_ENABLED } from './lib/v13Flags';
import { db } from './lib/firebase';
import { workflowService, type PublicOverviewResponse } from './lib/workflowService';
import { getMonthlyFtOtRisk, getSingaporeDate, type FullTimeOtAvailability } from './lib/workflows';

export default function LandingPage() {
  const { t, language, setLanguage } = useTranslation();
  const { role } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [fullTimeOtAvailability, setFullTimeOtAvailability] = useState<FullTimeOtAvailability[]>([]);
  const [monthlyFullTimeOtHours, setMonthlyFullTimeOtHours] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<UserProfile | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [showOrgChartPublic, setShowOrgChartPublic] = useState(false);
  const [calendarCompact, setCalendarCompact] = useState(true);
  const [staffCompact, setStaffCompact] = useState(true);

  useEffect(() => {
    let unsubscribeOverview: Unsubscribe | undefined;
    let stopped = false;

    async function fetchData() {
      const [emps, overview] = await Promise.all([
        employeeService.getAllEmployees(),
        workflowService.publicOverview()
      ]);

      if (stopped) return;

      setEmployees(emps);
      setFullTimeOtAvailability(overview.fullTimeOtAvailability || []);
      setMonthlyFullTimeOtHours(overview.monthlyFullTimeOtHours || {});

      try {
        const settings = await orgChartService.getSettings();
        if (!stopped) setShowOrgChartPublic(settings.showInPublicView);
      } catch (e) {
        console.error('Failed to get public org chart setting', e);
      }

      const overviewRef = doc(db, overview.realtime.collection, overview.realtime.documentId);
      unsubscribeOverview = onSnapshot(
        overviewRef,
        (snapshot) => {
          if (!snapshot.exists()) return;
          const data = snapshot.data() as Pick<PublicOverviewResponse, 'fullTimeOtAvailability' | 'monthlyFullTimeOtHours'>;
          setFullTimeOtAvailability(data.fullTimeOtAvailability || []);
          setMonthlyFullTimeOtHours(data.monthlyFullTimeOtHours || {});
        },
        (error) => console.error('Public availability realtime listener failed', error)
      );

      setIsLoading(false);
    }

    void fetchData().catch((error) => {
      console.error('Failed to load public overview', error);
      setIsLoading(false);
    });

    return () => {
      stopped = true;
      unsubscribeOverview?.();
    };
  }, []);

  const getCumulativeHours = (empId: string) => monthlyFullTimeOtHours[empId] || 0;

  // Calendar Helpers — V1.3 Full-Time employee OT availability
  const singaporeToday = getSingaporeDate();
  const [calendarYear, calendarMonthNumber] = singaporeToday.split('-').map(Number);
  const year = calendarYear;
  const month = calendarMonthNumber - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayPlans = fullTimeOtAvailability.filter((item) => item.date === dateStr);
    return { day, dateStr, dayPlans };
  });

  const monthName = new Date(year, month, 1).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long' });

  const selectedDatePlans = fullTimeOtAvailability.filter((item) => item.date === selectedCalendarDate);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // If already logged in, the App Content will handle it, but for smooth transitions:
  if (selectedEmployee) {
    return <EmployeePortal initialEmployee={selectedEmployee} onBack={() => setSelectedEmployee(null)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {role ? (
              <button 
                onClick={() => navigate('/portal')}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
              >
                <Briefcase className="w-4 h-4" />
                {t('dashboard')}
              </button>
            ) : (
              <button 
                onClick={() => setShowAdminLogin(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                {t('adminLogin')}
              </button>
            )}
            <div className="hidden sm:flex items-center gap-2 text-vibrant font-black text-xl ml-4">
              <div className="w-8 h-8 bg-vibrant rounded-lg flex items-center justify-center text-white text-base">T</div>
              <span>OT Pro</span>
            </div>
          </div>
          
          <button 
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-200 text-sm font-bold hover:bg-slate-50 transition-colors"
          >
            <Globe className="w-4 h-4" />
            {t('language')}
          </button>
        </div>
      </nav>

      {/* Hero Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-6 pt-28 pb-20 space-y-12">
        {OT_V13_ENABLED && <PublicShiftNotices />}
        <header className="text-center space-y-4">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black text-slate-900 leading-tight"
          >
            {t('publicOverview')} <br/>
            <span className="text-vibrant">{t('start')}</span>
          </motion.h1>
          <p className="text-slate-700 font-medium max-w-2xl mx-auto">
            {t('selectEmployee')}
          </p>
        </header>

        {/* Current Month Calendar */}
        <section className="mx-auto w-full max-w-5xl">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-lg">
            <div className={`flex items-center justify-between bg-slate-900 transition-all ${calendarCompact ? 'px-5 py-4' : 'p-7'}`}>
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center rounded-xl bg-vibrant text-white shadow-lg shadow-indigo-500/20 ${calendarCompact ? 'h-9 w-9' : 'h-12 w-12'}`}>
                  <CalendarIcon className={calendarCompact ? 'h-4 w-4' : 'h-6 w-6'} />
                </div>
                <div>
                  <h2 className={`font-black uppercase tracking-tight text-white ${calendarCompact ? 'text-base' : 'text-xl'}`}>{t('plannedOvertime')}</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{monthName} {year}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCalendarCompact((value) => !value)}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-white/20"
                title={calendarCompact ? 'Expand calendar / 放大日历' : 'Compact calendar / 缩小日历'}
              >
                {calendarCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                <span className="hidden sm:inline">{calendarCompact ? 'Expand / 展开' : 'Compact / 缩小'}</span>
              </button>
            </div>

            <div className={calendarCompact ? 'p-4 sm:p-5' : 'p-6 sm:p-8'}>
              <div className={`mb-2 grid grid-cols-7 ${calendarCompact ? 'gap-1.5' : 'gap-3'}`}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName) => (
                  <div key={dayName} className="text-center text-[9px] font-black uppercase tracking-widest text-slate-500">
                    {dayName}
                  </div>
                ))}
              </div>
              <div className={`grid grid-cols-7 ${calendarCompact ? 'gap-1.5' : 'gap-3'}`}>
                {Array.from({ length: firstDayOfMonth }).map((_, index) => (
                  <div key={`empty-${index}`} className={calendarCompact ? 'h-11 sm:h-12' : 'aspect-square'} />
                ))}
                {calendarDays.map(({ day, dateStr, dayPlans }) => {
                  const isToday = dateStr === singaporeToday;
                  return (
                    <button
                      key={dateStr}
                      onClick={() => dayPlans.length > 0 && setSelectedCalendarDate(dateStr)}
                      className={`
                        group relative flex flex-col items-center justify-center border transition-all
                        ${calendarCompact ? 'h-11 rounded-xl sm:h-12' : 'aspect-square rounded-2xl'}
                        ${dayPlans.length > 0
                          ? 'cursor-pointer border-amber-200 bg-amber-50 hover:bg-amber-100'
                          : 'cursor-default border-transparent bg-slate-50 text-slate-600 opacity-65'
                        }
                        ${isToday ? 'ring-2 ring-vibrant ring-offset-1' : ''}
                      `}
                    >
                      <span className={`font-black ${calendarCompact ? 'text-[11px]' : 'text-sm'} ${dayPlans.length > 0 ? 'text-amber-900' : 'text-slate-600'}`}>
                        {day}
                      </span>
                      {dayPlans.length > 0 && (
                        calendarCompact ? (
                          <span className="mt-0.5 text-[8px] font-black uppercase leading-none text-amber-600">
                            {dayPlans.length} {t('pers')}
                          </span>
                        ) : (
                          <div className="mt-1 flex flex-col items-center">
                            <div className="mb-1 flex -space-x-1">
                              {dayPlans.slice(0, 3).map((plan) => (
                                <div key={plan.id} className="h-1.5 w-1.5 rounded-full border border-white bg-amber-500" />
                              ))}
                            </div>
                            <span className="text-[10px] font-black uppercase leading-none text-amber-600">
                              {dayPlans.length} {t('pers')}
                            </span>
                          </div>
                        )
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Employee access */}
        <section className={staffCompact ? 'space-y-4' : 'space-y-8'}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-7 w-1.5 rounded-full bg-vibrant" />
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-slate-800">Employees / 员工</h2>
                <p className="text-[10px] font-bold text-slate-500">{employees.length} {t('pers')} · {t('selectEmployee')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStaffCompact((value) => !value)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700"
              title={staffCompact ? 'Expand employee cards / 放大员工卡片' : 'Compact employee cards / 缩小员工卡片'}
            >
              {staffCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              <span>{staffCompact ? 'Expand / 展开' : 'Compact / 缩小'}</span>
            </button>
          </div>

          <div className={staffCompact ? 'space-y-5' : 'space-y-10'}>
            {['deptProduction', 'deptWarehouse', 'deptDriver', 'deptOffice', 'deptMaintenance', 'deptOther'].map((deptKey) => {
              const deptEmployees = employees.filter((employee) => (employee.department || 'deptOther') === deptKey);
              if (deptEmployees.length === 0) return null;

              return (
                <div key={deptKey} className={staffCompact ? 'space-y-2.5' : 'space-y-5'}>
                  <div className="flex items-center gap-2.5">
                    <div className={`rounded-full bg-vibrant ${staffCompact ? 'h-4 w-1' : 'h-7 w-1.5'}`} />
                    <h3 className={`font-black uppercase tracking-tight text-slate-800 ${staffCompact ? 'text-xs' : 'text-lg'}`}>{t(deptKey)}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-600">
                      {deptEmployees.length}
                    </span>
                  </div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={staffCompact
                      ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                      : 'grid gap-5 md:grid-cols-2 lg:grid-cols-3'
                    }
                  >
                    {deptEmployees.map((employee, index) => {
                      const hours = getCumulativeHours(employee.id);
                      const risk = getMonthlyFtOtRisk(hours);
                      const riskActive = risk.level !== 'NORMAL';
                      const riskCardClass = risk.level === 'LIMIT_REACHED'
                        ? 'border-rose-400 bg-rose-50 shadow-rose-100/70'
                        : risk.level === 'CRITICAL'
                          ? 'border-red-300 bg-red-50/70 shadow-red-100/60'
                          : risk.level === 'WATCH'
                            ? 'border-amber-300 bg-amber-50/70 shadow-amber-100/60'
                            : 'border-slate-200 bg-white';
                      const riskTextClass = risk.level === 'LIMIT_REACHED'
                        ? 'text-rose-800'
                        : risk.level === 'CRITICAL'
                          ? 'text-red-700'
                          : 'text-amber-700';
                      const riskLabel = risk.level === 'LIMIT_REACHED'
                        ? `LIMIT REACHED · ${hours.toFixed(1)} / 72h`
                        : risk.level === 'CRITICAL'
                          ? `CRITICAL · ${hours.toFixed(1)} / 72h`
                          : risk.level === 'WATCH'
                            ? `WATCH · ${hours.toFixed(1)} / 72h`
                            : '';
                      return (
                        <motion.button
                          key={employee.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(index * 0.02, 0.2) }}
                          onClick={() => setSelectedEmployee(employee)}
                          className={`group relative overflow-hidden border text-left shadow-sm transition-all hover:shadow-md ${riskCardClass} ${
                            risk.level === 'LIMIT_REACHED' ? 'hover:border-rose-500' : risk.level === 'CRITICAL' ? 'hover:border-red-400' : risk.level === 'WATCH' ? 'hover:border-amber-400' : 'hover:border-vibrant'
                          } ${staffCompact ? 'rounded-xl p-3' : 'rounded-3xl p-6'}`}
                        >
                          {staffCompact ? (
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                risk.level === 'LIMIT_REACHED'
                                  ? 'bg-rose-100 text-rose-700'
                                  : risk.level === 'CRITICAL'
                                    ? 'bg-red-100 text-red-700'
                                    : risk.level === 'WATCH'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-indigo-50 text-indigo-600 group-hover:bg-vibrant group-hover:text-white'
                              }`}>
                                {risk.level === 'LIMIT_REACHED' ? <Ban className="h-4 w-4" /> : risk.level === 'CRITICAL' ? <ShieldAlert className="h-4 w-4" /> : risk.level === 'WATCH' ? <AlertTriangle className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <h3 className="truncate text-[11px] font-black text-slate-900" translate="no">{employee.name}</h3>
                                  {riskActive && (
                                    <span
                                      className={`h-2 w-2 shrink-0 rounded-full ${
                                        risk.level === 'LIMIT_REACHED' ? 'bg-rose-600' : risk.level === 'CRITICAL' ? 'bg-red-500 animate-pulse' : 'bg-amber-400 animate-pulse'
                                      }`}
                                      style={risk.level === 'CRITICAL' ? { animationDuration: '1.8s' } : risk.level === 'WATCH' ? { animationDuration: '2.5s' } : undefined}
                                    />
                                  )}
                                </div>
                                <p className={`mt-0.5 truncate text-[8px] font-black uppercase tracking-wide ${riskActive ? riskTextClass : 'text-slate-400'}`}>
                                  {riskActive ? riskLabel : t('employeeAccess')}
                                </p>
                              </div>
                              <ArrowRight className={`h-3.5 w-3.5 shrink-0 transition ${riskActive ? riskTextClass : 'text-slate-300 group-hover:text-vibrant'}`} />
                            </div>
                          ) : (
                            <>
                              <div className="absolute right-0 top-0 p-4 opacity-0 transition-opacity group-hover:opacity-100">
                                <ArrowRight className="h-6 w-6 text-vibrant" />
                              </div>
                              <div className="mb-5 flex items-center gap-4">
                                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                                  risk.level === 'LIMIT_REACHED'
                                    ? 'bg-rose-100 text-rose-700'
                                    : risk.level === 'CRITICAL'
                                      ? 'bg-red-100 text-red-700'
                                      : risk.level === 'WATCH'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-vibrant group-hover:text-white'
                                }`}>
                                  {risk.level === 'LIMIT_REACHED' ? <Ban className="h-7 w-7" /> : risk.level === 'CRITICAL' ? <ShieldAlert className="h-7 w-7" /> : risk.level === 'WATCH' ? <AlertTriangle className="h-7 w-7" /> : <Users className="h-7 w-7" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="truncate text-xl font-black text-slate-900" translate="no">{employee.name}</h3>
                                    {riskActive && <span className={`h-2.5 w-2.5 rounded-full ${risk.level === 'LIMIT_REACHED' ? 'bg-rose-600' : risk.level === 'CRITICAL' ? 'bg-red-500 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />}
                                  </div>
                                  <p className={`text-[10px] font-black uppercase tracking-widest ${riskActive ? riskTextClass : 'text-slate-400'}`}>
                                    {riskActive ? riskLabel : t('employeeAccess')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('totalHours')}</p>
                                  <div className="blur-text flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-slate-900">{hours.toFixed(1)}</span>
                                    <span className="text-xs font-bold text-slate-400">h</span>
                                  </div>
                                </div>
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-inner">
                                  <Clock className="h-5 w-5 text-slate-300" />
                                </div>
                              </div>
                              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full transition-all ${risk.level === 'LIMIT_REACHED' ? 'bg-rose-600' : risk.level === 'CRITICAL' ? 'bg-red-500' : risk.level === 'WATCH' ? 'bg-amber-400' : 'bg-vibrant/20 group-hover:bg-vibrant/40'}`}
                                  style={{ width: `${Math.min((hours / 72) * 100, 100)}%` }}
                                />
                              </div>
                            </>
                          )}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>
              );
            })}
          </div>
        </section>

        {showOrgChartPublic && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
              <div className="h-px bg-slate-200 flex-1"></div>
            </div>
            <OrgChart editable={false} />
          </section>
        )}
    </main>

    {/* Planned Overtime Detail Modal */}
      <AnimatePresence>
        {selectedCalendarDate && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-md overflow-hidden shadow-2xl relative"
            >
              <button 
                onClick={() => setSelectedCalendarDate(null)}
                className="absolute top-6 right-6 p-2 rounded-xl bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-900 transition-all z-10"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="bg-amber-500 p-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-3xl bg-white flex items-center justify-center text-amber-600 mb-6 shadow-xl shadow-amber-600/20">
                  <CalendarClock className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">{t('whoIsWorking')}</h3>
                <div className="px-4 py-1.5 bg-amber-600/30 rounded-full text-amber-50 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {formatDateWithDay(selectedCalendarDate || '')}
                </div>
              </div>

              <div className="p-10 space-y-4 max-h-[400px] overflow-y-auto">
                {selectedDatePlans.length > 0 ? (
                  <div className="grid gap-3">
                    {selectedDatePlans.map((plan, idx) => (
                      <motion.div 
                        key={plan.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center gap-4 rounded-2xl border border-amber-100 bg-amber-50 p-4"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-500">
                          <Users className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-lg font-black uppercase tracking-tight text-slate-900" translate="no">
                            {plan.employeeNameSnapshot}
                          </span>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">AVAILABLE FOR OT / 已计划可加班</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <Clock className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">{t('noPlans')}</p>
                  </div>
                )}
              </div>
              
              <div className="p-8 border-t border-slate-100 bg-slate-50/50">
                <button 
                  onClick={() => setSelectedCalendarDate(null)}
                  className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all uppercase tracking-widest text-sm"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showAdminLogin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm relative"
            >
              <button 
                onClick={() => setShowAdminLogin(false)}
                className="absolute -top-12 right-0 text-white font-bold text-sm tracking-widest uppercase hover:opacity-70 transition-opacity"
              >
                Close / 关闭
              </button>
              <LoginPage forceRoleSelection={true} onBack={() => setShowAdminLogin(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="mt-auto py-12 px-6 border-t border-slate-200">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
           <div className="flex items-center gap-3 text-slate-400 font-bold">
              <TrendingUp className="w-5 h-5" />
              <span>OT Pro &copy; 2026</span>
           </div>
           <div className="flex gap-8 text-xs font-bold text-slate-400 uppercase tracking-widest">
              <a href="#" className="hover:text-vibrant transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-vibrant transition-colors">Usage Terms</a>
              <a href="#" className="hover:text-vibrant transition-colors">Support</a>
           </div>
        </div>
      </footer>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from './lib/LanguageContext';
import { useAuth } from './lib/AuthContext';
import { employeeService, overtimeService, planService, orgChartService } from './lib/services';
import { UserProfile, OvertimeEntry, OvertimePlan } from './types';
import { formatDate, formatDateWithDay } from './lib/dateUtils';
import { 
  Users, 
  LogIn, 
  Clock, 
  ArrowRight, 
  Globe,
  TrendingUp,
  Briefcase,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  CalendarClock,
  X
} from 'lucide-react';
import LoginPage from './LoginPage';
import EmployeePortal from './EmployeePortal';
import OrgChart from './components/OrgChart';

export default function LandingPage() {
  const { t, language, setLanguage } = useTranslation();
  const { role, login } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [plans, setPlans] = useState<OvertimePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<UserProfile | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [showOrgChartPublic, setShowOrgChartPublic] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const emps = await employeeService.getAllEmployees();
      const docs = await overtimeService.getAllEntries(currentMonth);
      const mPlans = await planService.getAllPlansForMonth(currentMonth);
      try {
        const settings = await orgChartService.getSettings();
        setShowOrgChartPublic(settings.showInPublicView);
      } catch (e) {
        console.error('Failed to get public org chart setting', e);
      }
      
      setEmployees(emps);
      setEntries(docs);
      setPlans(mPlans);
      setIsLoading(false);
    }
    fetchData();
  }, []);

  const getCumulativeHours = (empId: string) => {
    return entries
      .filter(e => e.employeeId === empId && e.multiplier !== 2.0)
      .reduce((acc, curr) => acc + curr.totalHours, 0);
  };

  // Calendar Helpers
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayPlans = plans.filter(p => p.date === dateStr);
    return { day, dateStr, dayPlans };
  });

  const monthName = today.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long' });

  const getPlanStatus = (plan: OvertimePlan) => {
    // 1. Get current local date and time
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentHour = now.getHours();

    // 2. Check if a valid log exists for this plan's date
    // ONLY turn green if it's already VERIFIED (approved by supervisor)
    const hasLog = entries.some(e => e.date === plan.date && e.employeeId === plan.employeeId && e.status === 'verified');
    
    // 3. Parse planning creation date
    const createdDate = plan.createdAt?.toDate ? plan.createdAt.toDate() : (plan.createdAt ? new Date(plan.createdAt) : null);
    if (!createdDate) return 'pending';

    const createdDayStr = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${String(createdDate.getDate()).padStart(2, '0')}`;
    const createdHour = createdDate.getHours();

    // 4. Calculate if on-time: Planned BEFORE the day OR on the day before 18:00
    let isOnTime = false;
    if (createdDayStr < plan.date) {
      isOnTime = true;
    } else if (createdDayStr === plan.date) {
      isOnTime = createdHour < 18;
    }

    // Success (Green): Must have BOTH a valid log AND an on-time plan
    if (hasLog && isOnTime) return 'success';
    
    // Error (Red) - Only trigger for late/missed past deadlines:
    // - Overtime date is in the past (before today)
    // - Overtime date is today and it's already past 18:00 (deadline passed)
    const isPastDate = plan.date < todayStr;
    const isTodayPastDeadline = plan.date === todayStr && currentHour >= 18;

    if (isPastDate || isTodayPastDeadline) {
      // If deadline passed and we either have no log or plan was late
      if (!hasLog || !isOnTime) return 'error';
    }

    // Otherwise (Today before 18:00 or Future): Status is still pending/waiting
    return 'pending';
  };

  const selectedDatePlans = plans.filter(p => p.date === selectedCalendarDate);

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
        <section className="max-w-4xl mx-auto w-full">
          <div className="bg-white rounded-[40px] border border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-slate-900 p-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-vibrant flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">{t('plannedOvertime')}</h2>
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">{monthName} {year}</p>
                </div>
              </div>
            </div>

            <div className="p-8">
              <div className="grid grid-cols-7 gap-4 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-center text-[10px] font-black text-slate-700 uppercase tracking-widest">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-4">
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square"></div>
                ))}
                {calendarDays.map(({ day, dateStr, dayPlans }) => {
                  const isToday = dateStr === new Date().toISOString().split('T')[0];
                  return (
                    <button
                      key={dateStr}
                      onClick={() => dayPlans.length > 0 && setSelectedCalendarDate(dateStr)}
                      className={`
                        group aspect-square rounded-2xl border transition-all flex flex-col items-center justify-center relative
                        ${dayPlans.length > 0 
                          ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 cursor-pointer' 
                          : 'bg-slate-50 border-transparent text-slate-700 opacity-60 hover:bg-slate-100 cursor-default'
                        }
                        ${isToday ? 'ring-2 ring-vibrant ring-offset-2' : ''}
                      `}
                    >
                      <span className={`text-sm font-black ${dayPlans.length > 0 ? 'text-amber-900' : 'text-slate-700'}`}>
                        {day}
                      </span>
                      {dayPlans.length > 0 && (
                        <div className="mt-1 flex flex-col items-center">
                          <div className="flex -space-x-1 mb-1">
                            {dayPlans.slice(0, 3).map((p, i) => (
                              <div key={p.id} className="w-1.5 h-1.5 rounded-full bg-amber-500 border border-white"></div>
                            ))}
                          </div>
                          <span className="text-[10px] font-black text-amber-600 uppercase leading-none">
                            {dayPlans.length} {t('pers')}
                          </span>
                        </div>
                      )}
                      
                      {dayPlans.length > 0 && (
                        <div className="absolute inset-0 bg-amber-500 opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Public Overview Cards / Table */}
        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>
          
          <div className="space-y-12">
            {['deptProduction', 'deptWarehouse', 'deptDriver', 'deptOffice', 'deptMaintenance', 'deptOther'].map(deptKey => {
              const deptEmployees = employees.filter(emp => (emp.department || 'deptOther') === deptKey);
              if (deptEmployees.length === 0) return null;

              return (
                <div key={deptKey} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-8 bg-vibrant rounded-full"></div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t(deptKey)}</h3>
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-black uppercase tracking-widest leading-none">
                      {deptEmployees.length} {t('pers')}
                    </span>
                  </div>
                  
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                  >
                    {deptEmployees.map((emp, idx) => {
                      const hours = getCumulativeHours(emp.id);
                      return (
                        <motion.button
                          key={emp.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          onClick={() => setSelectedEmployee(emp)}
                          className="group relative bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-vibrant transition-all text-left overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRight className="w-6 h-6 text-vibrant" />
                          </div>
                          
                          <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-vibrant group-hover:text-white transition-colors">
                              <Users className="w-7 h-7" />
                            </div>
                            <div>
                              <h3 className="text-xl font-black text-slate-900" translate="no">{emp.name}</h3>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('employeeAccess')}</p>
                            </div>
                          </div>

                          <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between">
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('totalHours')}</p>
                              <div className="flex items-baseline gap-1 blur-text">
                                <span className="text-2xl font-black text-slate-900">{hours.toFixed(1)}</span>
                                <span className="text-xs font-bold text-slate-400">h</span>
                              </div>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-inner">
                              <Clock className="w-5 h-5 text-slate-300" />
                            </div>
                          </div>
                          
                          {/* Visual Accent */}
                          <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                             <div 
                              className="h-full bg-vibrant/20 transition-all group-hover:bg-vibrant/40" 
                              style={{ width: `${Math.min((hours/40)*100, 100)}%` }}
                             ></div>
                          </div>
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
                    {selectedDatePlans.map((plan, idx) => {
                      const status = getPlanStatus(plan);
                      return (
                        <motion.div 
                          key={plan.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`flex items-center gap-4 p-4 rounded-2xl border group transition-colors ${
                            status === 'success' ? 'bg-emerald-50 border-emerald-100' :
                            status === 'error' ? 'bg-red-50 border-red-100' :
                            'bg-slate-50 border-slate-100 hover:bg-amber-50 hover:border-amber-100'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl bg-white border flex items-center justify-center transition-all ${
                            status === 'success' ? 'text-emerald-500 border-emerald-200' :
                            status === 'error' ? 'text-red-500 border-red-200' :
                            'text-slate-400 group-hover:text-amber-500 group-hover:border-amber-200 border-slate-200'
                          }`}>
                            <Users className="w-5 h-5" />
                          </div>
                          <span className={`font-black text-lg uppercase tracking-tight ${
                            status === 'success' ? 'text-emerald-900' :
                            status === 'error' ? 'text-red-900' :
                            'text-slate-900 group-hover:text-amber-900'
                          }`} translate="no">
                            {plan.employeeName}
                          </span>
                        </motion.div>
                      );
                    })}
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

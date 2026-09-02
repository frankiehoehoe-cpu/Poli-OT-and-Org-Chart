import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { useTranslation } from './lib/LanguageContext';
import { employeeService, overtimeService, planService } from './lib/services';
import { UserProfile, OvertimeEntry, OvertimePlan } from './types';
import { ReviewEmployeeAssignments } from './components/review/TaskWorkflow';
import { motion, AnimatePresence } from 'motion/react';
import { formatDate, formatTime, parseDate, formatDateFriendly, formatDateWithDay } from './lib/dateUtils';
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Pencil,
  X,
  LogOut, 
  Home,
  ChevronRight, 
  Lock,
  Search,
  Printer,
  Calendar,
  AlertCircle,
  CalendarClock,
  TrendingUp
} from 'lucide-react';

export default function EmployeePortal({ initialEmployee, onBack }: { initialEmployee?: UserProfile | null, onBack?: () => void }) {
  const { logout, role } = useAuth();
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<UserProfile | null>(initialEmployee || null);
  const [passwordInput, setPasswordInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [plans, setPlans] = useState<OvertimePlan[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [feedback, setFeedback] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [planFeedback, setPlanFeedback] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualDate, setManualDate] = useState(formatDate(new Date().toISOString().split('T')[0]));
  const [isDateInputFocused, setIsDateInputFocused] = useState(false);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('20:00');
  const [multiplier, setMultiplier] = useState(1.5);
  const [remarks, setRemarks] = useState('');

  // Plan State
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);
  const [planDateInput, setPlanDateInput] = useState(formatDate(new Date().toISOString().split('T')[0]));
  const [editDateInput, setEditDateInput] = useState('');

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Update manual date when raw date changes (e.g. from picker)
  useEffect(() => {
    if (!isDateInputFocused) {
      setManualDate(formatDate(date));
    }
  }, [date, isDateInputFocused]);

  const handleManualDateChange = (val: string) => {
    setManualDate(val);
    const parsed = parseDate(val);
    if (parsed) {
      setDate(parsed);
    }
  };

  const handleManualPlanDateChange = (val: string) => {
    setPlanDateInput(val);
    const parsed = parseDate(val);
    if (parsed) {
      setPlanDate(parsed);
    }
  };

  useEffect(() => {
    setPlanDateInput(formatDate(planDate));
  }, [planDate]);

  useEffect(() => {
    if (editingEntry) {
      setEditDateInput(formatDate(editingEntry.date));
    }
  }, [editingEntry?.id]);

  const handleManualEditDateChange = (val: string) => {
    setEditDateInput(val);
    const parsed = parseDate(val);
    if (parsed && editingEntry) {
      setEditingEntry({ ...editingEntry, date: parsed });
    }
  };

  const fetchEmployees = async () => {
    const data = await employeeService.getAllEmployees();
    setEmployees(data);
    setIsLoading(false);
  };

  const handleSelectEmployee = (employee: UserProfile) => {
    setSelectedEmployee(employee);
    setPasswordInput('');
    setIsUnlocked(false);
    setError('');
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmployee?.password === passwordInput) {
      setIsUnlocked(true);
      fetchEntries(selectedEmployee.id);
      fetchPlans(selectedEmployee.id);
      setError('');
    } else {
      setError(t('wrongPassword'));
    }
  };

  const handleExit = () => {
    if (onBack) {
      onBack();
    } else {
      setSelectedEmployee(null);
      setIsUnlocked(false);
      setPasswordInput('');
    }
  };

  const fetchEntries = async (employeeId: string) => {
    const data = await overtimeService.getEmployeeEntries(employeeId);
    setEntries(data);
  };

  const fetchPlans = async (employeeId: string) => {
    // We'll need to add getEmployeePlans to planService or just filter getAllPlans
    const allPlans = await planService.getAllPlansForMonth(new Date().toISOString().slice(0, 7));
    setPlans(allPlans.filter(p => p.employeeId === employeeId));
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || isSubmitting) return;

    // Check for overlapping time slots on the same date
    const overlappingEntry = entries.find(entry => {
      if (entry.date !== date) return false;
      const eStart = entry.startTime;
      const eEnd = entry.endTime;
      const nStart = startTime;
      const nEnd = endTime;
      // Overlap condition: (new_start < existing_end) && (existing_start < new_end)
      return nStart < eEnd && eStart < nEnd;
    });

    if (overlappingEntry) {
      setFeedback({ 
        message: language === 'zh' 
          ? `该时段已存在重叠记录 (${overlappingEntry.startTime}-${overlappingEntry.endTime})，请检查时间` 
          : `Overlapping entry exists for this time slot (${overlappingEntry.startTime}-${overlappingEntry.endTime})`, 
        type: 'error' 
      });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    let diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    // Lunch break deduction: 8:30 AM to after 12:00 PM
    if (startTime === '08:30' && (end.getHours() > 12 || (end.getHours() === 12 && end.getMinutes() > 0))) {
      diff = Math.max(0, diff - 1);
    }

    if (diff <= 0) {
      alert('End time must be after start time');
      return;
    }

    setIsSubmitting(true);
    try {
      await overtimeService.addEntry(
        selectedEmployee.id,
        selectedEmployee.name,
        date,
        startTime,
        endTime,
        diff,
        multiplier,
        remarks
      );

      setFeedback({ 
        message: language === 'zh' ? '添加成功！' : 'Successfully added!', 
        type: 'success' 
      });
      
      // Reset and Refresh
      await fetchEntries(selectedEmployee.id);
      setDate(new Date().toISOString().split('T')[0]);
      setStartTime('18:00');
      setEndTime('20:00');
      setMultiplier(1.5);
      setRemarks('');
      
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({ 
        message: language === 'zh' ? '提交失败，请重试' : 'Submission failed, please try again', 
        type: 'error' 
      });
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || isPlanning) return;

    // Check for duplicate date
    const isDuplicate = plans.some(plan => plan.date === planDate);
    if (isDuplicate) {
      setPlanFeedback({ 
        message: language === 'zh' ? '该日期已存在计划' : 'Plan already exists for this date', 
        type: 'error' 
      });
      setTimeout(() => setPlanFeedback(null), 3000);
      return;
    }

    // Validate 0-3 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(planDate);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0 || diffDays > 3) {
      alert(t('planTooltip'));
      return;
    }

    setIsPlanning(true);
    try {
      await planService.addPlan(selectedEmployee.id, selectedEmployee.name, planDate);
      setPlanFeedback({ 
        message: language === 'zh' ? '计划添加成功！' : 'Plan added successfully!', 
        type: 'success' 
      });
      await fetchPlans(selectedEmployee.id);
      setTimeout(() => setPlanFeedback(null), 3000);
    } catch (err) {
      setPlanFeedback({ 
        message: language === 'zh' ? '操作失败' : 'Operation failed', 
        type: 'error' 
      });
      setTimeout(() => setPlanFeedback(null), 3000);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleDeletePlan = async (id: string, planDate: string) => {
    if (!selectedEmployee) return;
    const today = new Date().toISOString().split('T')[0];
    if (planDate < today) {
      alert(language === 'zh' ? '不能删除历史计划。' : 'Cannot delete past plans.');
      return;
    }
    if (!window.confirm(language === 'zh' ? '确定要删除此计划吗？' : 'Are you sure you want to delete this plan?')) return;
    await planService.deletePlan(id);
    fetchPlans(selectedEmployee.id);
  };

  const getPlanStatus = (plan: OvertimePlan) => {
    // 1. Get current local date and time
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentHour = now.getHours();

    // 2. Check if a valid log exists for this plan's date
    // Entries in EmployeePortal are already filtered by employee
    // ONLY turn green if it's already VERIFIED (approved by supervisor)
    const hasLog = entries.some(e => e.date === plan.date && e.status === 'verified');
    
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
    const isPastDate = plan.date < todayStr;
    const isTodayPastDeadline = plan.date === todayStr && currentHour >= 18;

    if (isPastDate || isTodayPastDeadline) {
      if (!hasLog || !isOnTime) return 'error';
    }

    // Otherwise (Today before 18:00 or Future): Still pending
    return 'pending';
  };

  const handleUpdateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !editingEntry) return;

    // Check for overlapping time slots on the same date (excluding the current entry being edited)
    const overlappingEntry = entries.find(entry => {
      if (entry.id === editingEntry.id) return false;
      if (entry.date !== editingEntry.date) return false;
      
      const eStart = entry.startTime;
      const eEnd = entry.endTime;
      const nStart = editingEntry.startTime;
      const nEnd = editingEntry.endTime;
      
      return nStart < eEnd && eStart < nEnd;
    });

    if (overlappingEntry) {
      alert(language === 'zh' 
        ? `修改失败：该时段与已有记录重叠 (${overlappingEntry.startTime}-${overlappingEntry.endTime})，请检查时间` 
        : `Update failed: Overlapping entry exists for this time slot (${overlappingEntry.startTime}-${overlappingEntry.endTime})`
      );
      return;
    }

    const start = new Date(`${editingEntry.date}T${editingEntry.startTime}`);
    const end = new Date(`${editingEntry.date}T${editingEntry.endTime}`);
    let diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    // Lunch break deduction: 8:30 AM to after 12:00 PM
    if (editingEntry.startTime === '08:30' && (end.getHours() > 12 || (end.getHours() === 12 && end.getMinutes() > 0))) {
      diff = Math.max(0, diff - 1);
    }

    if (diff <= 0) {
      alert('End time must be after start time');
      return;
    }

    await overtimeService.updateEntry(
      editingEntry.id,
      editingEntry.date,
      editingEntry.startTime,
      editingEntry.endTime,
      diff,
      editingEntry.multiplier,
      editingEntry.remarks || ''
    );

    setEditingEntry(null);
    fetchEntries(selectedEmployee.id);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteEntry = async (entryId: string) => {
    if (!selectedEmployee) return;
    await overtimeService.deleteEntry(entryId);
    setDeletingId(null);
    fetchEntries(selectedEmployee.id);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4 no-print">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{t('employee')}</h1>
              <p className="text-xs text-slate-800 font-medium">{t('dailyEntries')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (selectedEmployee) {
                  handleExit();
                } else {
                  navigate('/overview');
                }
              }}
              className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
              title={selectedEmployee ? t('back') : "Public Overview"}
            >
              <Home className="w-5 h-5" />
            </button>
            <button 
              onClick={logout}
              className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {selectedEmployee && <ReviewEmployeeAssignments employee={selectedEmployee} />}
        <AnimatePresence mode="wait">
          {!selectedEmployee ? (
            <motion.div 
              key="employee-list"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2 mb-2">
                <h2 className="text-lg font-bold text-slate-800 mb-1">{t('selectEmployee')}</h2>
                <div className="h-1 w-12 bg-indigo-600 rounded-full"></div>
              </div>
              {employees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => handleSelectEmployee(emp)}
                  className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:shadow-md hover:border-indigo-200 transition-all group"
                >
                  <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                      <Users className="w-6 h-6" />
                    </div>
                    <span className="text-lg font-semibold text-slate-700" translate="no">{emp.name}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                </button>
              ))}
            </motion.div>
          ) : !isUnlocked ? (
            <motion.div 
              key="password-guard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{selectedEmployee.name}</h2>
                <p className="text-slate-800 mt-2">{t('enterPassword')}</p>
              </div>

              <form onSubmit={handleUnlock} className="space-y-6">
                <div>
                  <input 
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    autoFocus
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 text-center text-xl tracking-widest bg-slate-50"
                    placeholder="••••"
                  />
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-4 flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-sm"
                    >
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </motion.div>
                  )}
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                  {t('login')}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div 
              key="portal-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between no-print">
                <div className="flex items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900" translate="no">{selectedEmployee.name}</h2>
                    <p className="text-sm text-slate-800">{t('employee')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <button 
                    onClick={() => { window.focus(); window.print(); }}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-black uppercase tracking-widest text-[10px] hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                  >
                    <Printer className="w-4 h-4 text-slate-700" />
                    Print / 打印
                  </button>
                </div>
              </div>

              {/* Add Entry Card */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm no-print">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <div className="w-2 h-6 bg-indigo-600 rounded-full"></div>
                  {t('addEntry')}
                </h3>
                <form onSubmit={handleAddEntry} className="grid gap-6 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-700" />
                      {t('date')}
                    </label>
                    <div className="relative group">
                      {/* Manual text input - visible and primary */}
                      <input 
                        type="text"
                        value={manualDate}
                        onChange={e => handleManualDateChange(e.target.value)}
                        onFocus={() => setIsDateInputFocused(true)}
                        onBlur={() => setIsDateInputFocused(false)}
                        placeholder="DD/MM/YYYY"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all pr-10"
                      />
                      
                      {/* Hidden date input - triggered by the icon */}
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer z-30">
                        <Calendar className="w-4 h-4 text-slate-700 group-focus-within:text-indigo-500 pointer-events-none" />
                        <input 
                          type="date" 
                          value={date} 
                          onChange={e => setDate(e.target.value)}
                          className="absolute inset-0 w-8 h-8 opacity-0 cursor-pointer text-transparent bg-transparent border-none appearance-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0"
                          style={{ colorScheme: 'light' }}
                        />
                      </div>

                      {/* Friendly Preview */}
                      {date && (
                        <div className="absolute -bottom-6 left-0 text-[10px] font-black text-indigo-500 px-1 uppercase tracking-widest animate-in fade-in slide-in-from-top-1">
                          {formatDateFriendly(date)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-700" />
                      {t('startTime')}
                    </label>
                    <input 
                      type="time" 
                      value={startTime} 
                      onChange={e => setStartTime(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 bg-slate-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-700" />
                      {t('endTime')}
                    </label>
                    <input 
                      type="time" 
                      value={endTime} 
                      onChange={e => setEndTime(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-slate-700" />
                      {t('multiplier')}
                    </label>
                    <select
                      value={multiplier}
                      onChange={e => setMultiplier(parseFloat(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 font-black"
                    >
                      <option value={1.5}>{t('overtime15')}</option>
                      <option value={2.0}>{t('overtime20')}</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3 space-y-2">
                    <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-slate-700" />
                      {t('remarks')}
                    </label>
                    <input 
                      type="text" 
                      value={remarks} 
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Add any notes here..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 bg-slate-50"
                    />
                  </div>
                  <div className="sm:col-span-3 pt-2">
                    <AnimatePresence>
                      {feedback && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className={`mb-4 p-3 rounded-xl text-xs font-bold uppercase tracking-widest text-center ${
                            feedback.type === 'success' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'
                          }`}
                        >
                          {feedback.message}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <button 
                      type="submit" 
                      disabled={isSubmitting}
                      className={`btn-vibrant w-full ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                      )}
                      {t('submit')}
                    </button>
                  </div>
                </form>
              </div>

              {/* Planned Overtime Card */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm no-print">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <div className="w-2 h-6 bg-amber-500 rounded-full"></div>
                    {t('plannedOvertime')}
                  </h3>
                  <div className="flex items-center gap-1.5 text-slate-700 text-[10px] font-black uppercase tracking-widest">
                    <AlertCircle className="w-3.5 h-3.5 text-slate-700" />
                    {t('planTooltip')}
                  </div>
                </div>
                
                <form onSubmit={handleAddPlan} className="flex flex-col sm:flex-row gap-4 mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="flex-1 space-y-2">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">{t('date')}</label>
                    <div className="relative group">
                      {/* Manual text input for Planning */}
                      <input 
                        type="text"
                        value={planDateInput}
                        onChange={e => handleManualPlanDateChange(e.target.value)}
                        placeholder="DD/MM/YYYY"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all pr-10"
                      />
                      
                      {/* Hidden date input - triggered by the icon */}
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer z-30">
                        <Calendar className="w-4 h-4 text-amber-500 group-focus-within:text-amber-600 pointer-events-none" />
                        <input 
                          type="date" 
                          value={planDate}
                          onChange={e => setPlanDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          max={new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                          className="absolute inset-0 w-8 h-8 opacity-0 cursor-pointer text-transparent bg-transparent border-none appearance-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0"
                          style={{ colorScheme: 'light' }}
                        />
                      </div>

                      {/* Friendly Preview */}
                      {planDate && (
                        <div className="absolute -bottom-5 left-0 text-[10px] font-black text-amber-600 px-1 uppercase tracking-widest animate-in fade-in slide-in-from-top-1">
                          {formatDateFriendly(planDate)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <div className="w-full sm:w-auto space-y-3">
                      <AnimatePresence>
                        {planFeedback && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className={`p-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-center ${
                              planFeedback.type === 'success' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'
                            }`}
                          >
                            {planFeedback.message}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <button 
                        type="submit" 
                        disabled={isPlanning}
                        className={`w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white font-black py-3.5 px-8 rounded-xl transition-all shadow-lg shadow-amber-100 flex items-center justify-center gap-3 uppercase tracking-widest text-xs ${isPlanning ? 'opacity-50' : ''}`}
                      >
                        {isPlanning ? (
                           <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <CalendarClock className="w-4 h-4" />
                        )}
                        {t('planOvertime')}
                      </button>
                    </div>
                  </div>
                </form>

                <div className="space-y-4">
                  {plans.sort((a, b) => a.date.localeCompare(b.date)).map(plan => {
                    const status = getPlanStatus(plan);
                    return (
                      <div 
                        key={plan.id} 
                        className={`flex items-center justify-between p-5 border rounded-2xl shadow-lg transition-all group relative ${
                          status === 'success' 
                            ? 'bg-emerald-50 border-emerald-200 shadow-emerald-500/5 hover:border-emerald-400' 
                            : status === 'error'
                            ? 'bg-red-50 border-red-200 shadow-red-500/5 hover:border-red-400'
                            : 'bg-white border-indigo-100 shadow-indigo-500/5 hover:border-amber-400'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                            status === 'success' ? 'bg-emerald-100 text-emerald-600' :
                            status === 'error' ? 'bg-red-100 text-red-600' :
                            'bg-amber-50 text-amber-600'
                          }`}>
                            <CalendarClock className="w-6 h-6" />
                          </div>
                          <div>
                            <p className={`text-base font-black ${
                              status === 'success' ? 'text-emerald-900' :
                              status === 'error' ? 'text-red-900' :
                              'text-slate-900'
                            }`}>
                              {formatDateWithDay(plan.date)}
                            </p>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${
                              status === 'success' ? 'text-emerald-500' :
                              status === 'error' ? 'text-red-500' :
                              'text-slate-700'
                            }`}>
                              {status === 'success' ? (language === 'zh' ? '已完成计划 / COMPLETED' : 'Mission Completed') : 
                               status === 'error' ? (language === 'zh' ? '未例行或逾期 / LATE OR MISSED' : 'Late or Missed') :
                               (language === 'zh' ? '已计划 / PLANNED' : 'Planned')}
                            </p>
                          </div>
                        </div>
                        {plan.date >= new Date().toISOString().split('T')[0] && (
                          <button 
                            onClick={() => handleDeletePlan(plan.id, plan.date)}
                            className="flex items-center gap-2 px-4 py-2 bg-white/50 text-slate-700 rounded-xl hover:bg-red-600 hover:text-white transition-all font-bold text-xs uppercase tracking-widest border border-transparent shadow-sm"
                            title="Delete / 删除"
                          >
                            <Trash2 className="w-4 h-4" />
                            {language === 'zh' ? '删除' : 'Delete'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {plans.length === 0 && (
                    <div className="sm:col-span-2 text-center py-8 text-slate-600 italic text-sm">
                      {t('noEntries')}
                    </div>
                  )}
                </div>
              </div>

              {/* History Table */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print-area">
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">{t('dailyEntries')}</h3>
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full">
                    {entries.length} {entries.length === 1 ? 'Record' : 'Records'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50/50 text-left">
                        <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('date')} <span className="text-[10px] font-normal">日期</span></th>
                        <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('totalHours')} <span className="text-[10px] font-normal">总小时</span></th>
                        <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('multiplier')} <span className="text-[10px] font-normal">倍率</span></th>
                        <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('remarks')} <span className="text-[10px] font-normal">备注</span></th>
                        <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('verified')} <span className="text-[10px] font-normal">状态</span></th>
                        <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest text-right">{t('actions')} <span className="text-[10px] font-normal">操作</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.sort((a, b) => a.date.localeCompare(b.date)).map(entry => {
                        return (
                          <tr 
                            key={entry.id} 
                            className="hover:bg-slate-50/50 transition-all"
                          >
                            <td className="px-8 py-4 font-bold text-slate-700">
                              {formatDateWithDay(entry.date)}
                            </td>
                            <td className="px-8 py-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-baseline gap-1">
                                  <span className="font-black text-lg text-slate-900">{entry.totalHours.toFixed(1)}</span>
                                  <span className="text-[10px] font-bold text-slate-700 uppercase">h</span>
                                </div>
                                <div className="text-[10px] font-bold px-2 py-0.5 rounded-lg w-fit whitespace-nowrap bg-indigo-50 text-indigo-500">
                                  {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-4">
                              <span className={`px-2 py-1 rounded-lg font-normal text-xs ${entry.multiplier === 2.0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                {entry.multiplier === 2.0 ? t('overtime20') : t('overtime15')}
                              </span>
                            </td>
                            <td className="px-8 py-4">
                              <p className="text-sm text-slate-500 truncate max-w-[150px]" title={entry.remarks}>
                                {entry.remarks || '-'}
                              </p>
                            </td>
                            <td className="px-8 py-4">
                              {entry.verified ? (
                                <span className="status-badge badge-verified">
                                  <CheckCircle2 className="w-4 h-4" />
                                  {t('verified')}
                                </span>
                              ) : entry.status === 'rejected' ? (
                                <span className="status-badge bg-red-100 text-red-700 border border-red-200">
                                  <AlertCircle className="w-4 h-4" />
                                  {t('reject') || 'Rejected'}
                                </span>
                              ) : (
                                <span className="status-badge badge-pending">
                                  {t('unverified')}
                                </span>
                              )}
                            </td>
                            <td className="px-8 py-4 text-right">
                              {!entry.verified && (
                                <div className="flex items-center justify-end gap-2 text-slate-500">
                                  {deletingId === entry.id ? (
                                    <div className="flex items-center gap-2 bg-red-50 p-1 rounded-lg border border-red-100">
                                      <button
                                        onClick={() => handleDeleteEntry(entry.id)}
                                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-md hover:bg-red-700 transition-colors"
                                      >
                                        {t('confirm')}
                                      </button>
                                      <button
                                        onClick={() => setDeletingId(null)}
                                        className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-md hover:bg-slate-300 transition-colors"
                                      >
                                        {t('cancel')}
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => setEditingEntry(entry)}
                                        className="p-3 rounded-xl border border-indigo-200 transition-all font-bold text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white shadow-sm"
                                        title={t('edit')}
                                      >
                                        <Pencil className="w-6 h-6" />
                                      </button>
                                      <button
                                        onClick={() => setDeletingId(entry.id)}
                                        className="p-3 rounded-xl border border-slate-200 transition-all font-bold text-xs bg-slate-50 text-slate-700 hover:bg-red-600 hover:text-white shadow-sm"
                                        title={t('delete')}
                                      >
                                        <Trash2 className="w-6 h-6" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {entries.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-8 py-12 text-center text-slate-600 italic">
                            {t('noEntries')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {entries.length > 0 && (
                      <tfoot className="bg-slate-50/50 border-t-2 border-slate-100">
                        <tr>
                          <td className="px-8 py-6 text-sm font-bold text-slate-500 uppercase tracking-widest bg-slate-100/50">
                            {t('totalHours')} <span className="text-[10px] font-normal block opacity-60">加班总时长</span>
                          </td>
                          <td className="px-8 py-6" colSpan={4}>
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-black text-vibrant">
                                {entries.reduce((acc, curr) => acc + (curr.multiplier === 2.0 ? 0 : curr.totalHours), 0).toFixed(1)}
                              </span>
                              <span className="text-sm font-bold text-indigo-400 uppercase tracking-widest">Total Hours / 总小时</span>
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingEntry && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-900">{t('edit')}</h3>
                <button 
                  onClick={() => setEditingEntry(null)}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-700 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleUpdateEntry} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-800 uppercase tracking-widest">{t('date')}</label>
                  <div className="relative group">
                    <input 
                      type="text"
                      value={editDateInput}
                      onChange={e => handleManualEditDateChange(e.target.value)}
                      placeholder="DD/MM/YYYY"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all pr-10"
                    />
                    
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer z-30">
                      <Calendar className="w-4 h-4 text-slate-700 pointer-events-none" />
                      <input 
                        type="date"
                        value={editingEntry.date}
                        onChange={e => setEditingEntry({...editingEntry, date: e.target.value})}
                        className="absolute inset-0 w-8 h-8 opacity-0 cursor-pointer text-transparent bg-transparent border-none appearance-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0"
                        style={{ colorScheme: 'light' }}
                      />
                    </div>

                    {/* Friendly Preview */}
                    {editingEntry.date && (
                      <div className="absolute -bottom-6 left-0 text-[10px] font-black text-indigo-500 px-1 uppercase tracking-widest animate-in fade-in slide-in-from-top-1">
                        {formatDateFriendly(editingEntry.date)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-800 uppercase tracking-widest">{t('startTime')}</label>
                    <input 
                      type="time"
                      value={editingEntry.startTime}
                      onChange={e => setEditingEntry({...editingEntry, startTime: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-vibrant/20 bg-slate-50 font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-800 uppercase tracking-widest">{t('endTime')}</label>
                    <input 
                      type="time"
                      value={editingEntry.endTime}
                      onChange={e => setEditingEntry({...editingEntry, endTime: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-vibrant/20 bg-slate-50 font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-800 uppercase tracking-widest">{t('multiplier')}</label>
                  <select
                    value={editingEntry.multiplier}
                    onChange={e => setEditingEntry({...editingEntry, multiplier: parseFloat(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-vibrant/20 bg-slate-50 font-black"
                  >
                    <option value={1.5}>{t('overtime15')}</option>
                    <option value={2.0}>{t('overtime20')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-800 uppercase tracking-widest">{t('remarks')}</label>
                  <input 
                    type="text"
                    value={editingEntry.remarks || ''}
                    onChange={e => setEditingEntry({...editingEntry, remarks: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-vibrant/20 bg-slate-50 font-bold"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setEditingEntry(null)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    type="submit" 
                    className="flex-[2] py-4 bg-vibrant text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-vibrant-hover transition-all"
                  >
                    {t('confirm')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


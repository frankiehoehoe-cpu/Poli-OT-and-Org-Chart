
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { useTranslation } from './lib/LanguageContext';
import { employeeService, overtimeService, planService } from './lib/services';
import { UserProfile, OvertimeEntry, OvertimePlan } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { formatDate, formatTime, parseDate, formatDateFriendly, formatDateWithDay } from './lib/dateUtils';
import { ReviewEmployeeTaskHistory } from './components/review/TaskWorkflow';
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
                          {f…5871 tokens truncated…={handleUpdateEntry} className="space-y-6">
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

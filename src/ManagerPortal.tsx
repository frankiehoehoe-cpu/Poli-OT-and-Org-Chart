import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { useTranslation } from './lib/LanguageContext';
import { employeeService, overtimeService, reportService, adminService, planService } from './lib/services';
import { UserProfile, OvertimeEntry, OvertimeSummary, OvertimePlan } from './types';
import { motion, AnimatePresence } from 'motion/react';
import SignatureCanvas from 'react-signature-canvas';
import { formatDate, formatTime, parseDate, formatDateFriendly, formatDateWithDay, formatMonth } from './lib/dateUtils';
import { 
  Briefcase, 
  Plus, 
  LogOut, 
  BarChart3, 
  Settings, 
  Calendar,
  Search,
  User,
  Users,
  Lock,
  Clock,
  CheckCircle2,
  FileText,
  PenTool,
  Upload,
  Printer,
  X,
  Trash2,
  Trash,
  Home,
  AlertCircle,
  Info,
  Calculator,
  Map as MapIcon,
  Image as ImageIcon,
  Network
} from 'lucide-react';
import RosterBoard from './RosterBoard';
import OrgChart from './components/OrgChart';
import ManagerControlDashboard from './components/ManagerControlDashboard';
import { getSingaporeMonth } from './lib/overtimeRisk';

export default function ManagerPortal() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [plans, setPlans] = useState<OvertimePlan[]>([]);
  const [summaries, setSummaries] = useState<OvertimeSummary[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'profiles' | 'report' | 'settings' | 'planning' | 'roster' | 'orgchart'>('dashboard');
  
  // Create/Edit Profile State
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDepartment, setNewDepartment] = useState('deptProduction');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');

  // Editing Entry State
  const [editingEntry, setEditingEntry] = useState<OvertimeEntry | null>(null);
  const [editDateInput, setEditDateInput] = useState('');
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  // Reporting State
  const [selectedMonth, setSelectedMonth] = useState(getSingaporeMonth());
  const [selectedEmployeeSummary, setSelectedEmployeeSummary] = useState<OvertimeSummary | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<'upload' | 'text' | 'draw' | null>(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [confirmedEmployees, setConfirmedEmployees] = useState<Set<string>>(new Set());
  const [employeeSignatures, setEmployeeSignatures] = useState<Record<string, { data: string, type: 'upload' | 'text' | 'draw', createdAt?: any }>>({});
  
  // Multi-selection state for reporting
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  
  // Global Signature State
  const [globalReport, setGlobalReport] = useState<any>(null);
  const [signatureMethod, setSignatureMethod] = useState<'draw' | 'upload' | 'text'>('draw');
  const [isGlobalSigning, setIsGlobalSigning] = useState(false);
  const [supervisorReport, setSupervisorReport] = useState<any>(null);
  const sigCanvasRef = React.useRef<SignatureCanvas>(null);

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  useEffect(() => {
    calculateSummaries();
  }, [entries, employees]);

  useEffect(() => {
    fetchGlobalReport();
    fetchManagerConfirmations();
    setSelectedEmployeeSummary(null);
    setSelectedEntryIds(new Set());
  }, [selectedMonth]);

  useEffect(() => {
    const fetchSupervisorReport = async () => {
      if (selectedEmployeeSummary) {
        const report = await reportService.getMonthlyReport(selectedMonth, selectedEmployeeSummary.employeeId, 'supervisor');
        setSupervisorReport(report);
      } else {
        setSupervisorReport(null);
      }
    };
    fetchSupervisorReport();
  }, [selectedEmployeeSummary, selectedMonth]);

  const handleEntryClick = (entryId: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      const newSelection = new Set(selectedEntryIds);
      if (newSelection.has(entryId)) {
        newSelection.delete(entryId);
      } else {
        newSelection.add(entryId);
      }
      setSelectedEntryIds(newSelection);
    } else {
      if (selectedEntryIds.size === 1 && selectedEntryIds.has(entryId)) {
        setSelectedEntryIds(new Set());
      } else {
        setSelectedEntryIds(new Set([entryId]));
      }
    }
  };

  const totalSelectedHours = React.useMemo(() => {
    return Array.from(selectedEntryIds).reduce((acc, id) => {
      const entry = entries.find(e => e.id === id);
      return acc + (entry ? entry.totalHours : 0);
    }, 0);
  }, [selectedEntryIds, entries]);

  const isMonthEnd = () => {
    const today = new Date();
    const currentMonthStr = today.toISOString().slice(0, 7);
    
    // If viewing a previous month, it's always allowed
    if (selectedMonth < currentMonthStr) return true;
    // If viewing future month, not allowed
    if (selectedMonth > currentMonthStr) return false;
    
    // If viewing current month, check if it's 30th or last day
    const day = today.getDate();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return day >= 30 || day >= lastDay;
  };

  const fetchGlobalReport = async () => {
    // For manager global report, we can use a shared key or the first employee
    // But since the user wants per-employee, we'll fetch it when an employee is selected
    const report = await reportService.getMonthlyReport(selectedMonth, 'MANAGER_GLOBAL', 'manager');
    setGlobalReport(report);
  };

  const fetchManagerConfirmations = async () => {
    const reports = await reportService.getAllMonthlyReportsForMonth(selectedMonth, 'manager');
    const confirmed = new Set<string>();
    const sigs: Record<string, { data: string, type: 'upload' | 'text' | 'draw', createdAt?: any }> = {};
    
    reports.forEach((r: any) => {
      if (r.employeeId !== 'MANAGER_GLOBAL') {
        confirmed.add(r.employeeId);
        sigs[r.employeeId] = { data: r.signature, type: r.type, createdAt: r.createdAt };
      }
    });
    
    setConfirmedEmployees(confirmed);
    setEmployeeSignatures(sigs);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const data = reader.result as string;
        if (isGlobalSigning) {
          handleSaveGlobalSignature(data, 'upload');
        } else {
          setSignature(data);
          setSignatureType('upload');
          setIsSignModalOpen(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTextSignature = (e: React.FormEvent) => {
    e.preventDefault();
    if (typedName.trim()) {
      if (isGlobalSigning) {
        handleSaveGlobalSignature(typedName.trim(), 'text');
      } else {
        setSignature(typedName.trim());
        setSignatureType('text');
        setIsSignModalOpen(false);
      }
    }
  };

  const handleDrawSignature = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
       const data = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png');
       if (isGlobalSigning) {
         handleSaveGlobalSignature(data, 'draw');
       } else {
         setSignature(data);
         setSignatureType('draw');
         setIsSignModalOpen(false);
       }
    }
  };

  const handleSaveGlobalSignature = async (data: string, type: 'draw' | 'upload' | 'text') => {
    setIsSubmitting(true);
    await reportService.saveMonthlyReport(selectedMonth, 'MANAGER_GLOBAL', data, type, user?.name || 'Manager', 'manager');
    await fetchGlobalReport();
    setIsSubmitting(false);
    setIsSignModalOpen(false);
    setIsGlobalSigning(false);
  };

  const handleConfirmEmployeeReport = async (employeeId: string) => {
    if (!signature || !signatureType) return;
    
    setIsSubmitting(true);
    await reportService.saveMonthlyReport(selectedMonth, employeeId, signature, signatureType, user?.name || 'Manager', 'manager');
    
    setConfirmedEmployees(prev => new Set(prev).add(employeeId));
    setEmployeeSignatures(prev => ({
      ...prev,
      [employeeId]: { data: signature, type: signatureType }
    }));
    setIsSubmitting(false);
  };

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

  const fetchData = async () => {
    const [empData, entryData, planData] = await Promise.all([
      employeeService.getAllEmployees(),
      overtimeService.getAllEntries(selectedMonth),
      planService.getAllPlansForMonth(selectedMonth)
    ]);
    setEmployees(empData);
    setEntries(entryData);
    setPlans(planData);
  };

  const handleEditEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    const start = new Date(`${editingEntry.date}T${editingEntry.startTime}`);
    const end = new Date(`${editingEntry.date}T${editingEntry.endTime}`);
    let diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    // Lunch break deduction: 8:30 AM to after 12:00 PM
    if (editingEntry.startTime === '08:30' && (end.getHours() > 12 || (end.getHours() === 12 && end.getMinutes() > 0))) {
      diff = Math.max(0, diff - 1);
    }

    if (diff <= 0) {
      alert('End time must be after start time / 结束时间必须在开始时间之后');
      return;
    }

    // Check for overlapping time slots on the same date for the same employee
    const overlappingEntry = entries.find(entry => {
      if (entry.id === editingEntry.id) return false;
      if (entry.employeeId !== editingEntry.employeeId) return false;
      if (entry.date !== editingEntry.date) return false;
      
      const eStart = entry.startTime;
      const eEnd = entry.endTime;
      const nStart = editingEntry.startTime;
      const nEnd = editingEntry.endTime;
      
      return nStart < eEnd && eStart < nEnd;
    });

    if (overlappingEntry) {
      alert(
        `该时段已存在重叠记录 (${overlappingEntry.startTime}-${overlappingEntry.endTime})，请检查时间\n` +
        `An overlapping entry exists for this time slot (${overlappingEntry.startTime}-${overlappingEntry.endTime})`
      );
      return;
    }

    setIsSubmitting(true);
    await overtimeService.updateEntry(
      editingEntry.id,
      editingEntry.date,
      editingEntry.startTime,
      editingEntry.endTime,
      diff,
      editingEntry.multiplier,
      editingEntry.remarks || ''
    );
    await fetchData();
    setEditingEntry(null);
    setIsSubmitting(false);
  };

  const handleDeleteEntry = async () => {
    if (!deletingEntryId) return;
    setIsSubmitting(true);
    await overtimeService.deleteEntry(deletingEntryId);
    await fetchData();
    setDeletingEntryId(null);
    setIsSubmitting(false);
  };

  const handleDeletePlan = async () => {
    if (!deletingPlanId) return;
    setIsSubmitting(true);
    await planService.deletePlan(deletingPlanId);
    await fetchData();
    setDeletingPlanId(null);
    setIsSubmitting(false);
  };

  const handleVerifyEntry = async (id: string) => {
    await overtimeService.verifyEntry(id);
    await fetchData();
  };

  const handleRejectEntry = async (id: string) => {
    await overtimeService.rejectEntry(id);
    await fetchData();
  };

  const calculateSummaries = () => {
    const monthlyEntries = entries.filter(e => e.date.startsWith(selectedMonth));
    
    const summaryMap = new Map<string, OvertimeSummary>();
    
    employees.forEach(emp => {
      summaryMap.set(emp.id, {
        employeeId: emp.id,
        employeeName: emp.name,
        totalHours: 0,
        entryCount: 0,
        averageHours: 0,
        unverifiedCount: 0,
        unverifiedHours: 0
      });
    });

    monthlyEntries.forEach(entry => {
      const summary = summaryMap.get(entry.employeeId);
      if (summary) {
        // Only add to total hours if multiplier is not 2.0
        if (entry.multiplier !== 2.0) {
          summary.totalHours += entry.totalHours;
        }
        summary.entryCount += 1;
        if (!entry.verified) {
          summary.unverifiedCount += 1;
          if (entry.multiplier !== 2.0) {
            summary.unverifiedHours += entry.totalHours;
          }
        }
      }
    });

    summaryMap.forEach(summary => {
      if (summary.entryCount > 0) {
        summary.averageHours = summary.totalHours / summary.entryCount;
      }
    });

    setSummaries(Array.from(summaryMap.values()));
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPassword) return;
    
    setIsSubmitting(true);
    if (editingEmployeeId) {
      await employeeService.updateEmployee(editingEmployeeId, newName, newPassword, newDepartment);
    } else {
      await employeeService.createEmployee(newName, newPassword, newDepartment);
    }
    setNewName('');
    setNewPassword('');
    setNewDepartment('deptProduction');
    setEditingEmployeeId(null);
    await fetchData();
    setIsSubmitting(false);
    setActiveTab('profiles');
  };

  const handleEditClick = (emp: UserProfile) => {
    setNewName(emp.name);
    setNewPassword(emp.password || '');
    setNewDepartment(emp.department || 'deptOther');
    setEditingEmployeeId(emp.id);
  };

  const handleDeleteEmployee = async () => {
    if (!deletingEmployeeId) return;
    try {
      setIsSubmitting(true);
      await employeeService.deleteEmployee(deletingEmployeeId);
      await fetchData();
      setDeletingEmployeeId(null);
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Delete failed / 删除失败: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetDatabase = async () => {
    if (resetConfirmation !== 'RESET') return;
    
    try {
      setIsSubmitting(true);
      await adminService.clearAllOvertimeData();
      await fetchData();
      setIsResetModalOpen(false);
      setResetConfirmation('');
      alert('Database reset successful / 数据库重置成功');
    } catch (error) {
      console.error('Reset failed:', error);
      alert('Reset failed / 重置失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col shrink-0 no-print">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Briefcase className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t('manager')}</h1>
        </div>

        <nav className="space-y-1.5 flex-1">
          <SidebarLink 
            icon={<BarChart3 className="w-5 h-5" />} 
            label={t('dashboard')} 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarLink 
            icon={<Users className="w-5 h-5" />} 
            label={t('profiles')} 
            active={activeTab === 'profiles'} 
            onClick={() => setActiveTab('profiles')} 
          />
          <SidebarLink 
            icon={<FileText className="w-5 h-5" />} 
            label={t('monthlyReport')} 
            active={activeTab === 'report'} 
            onClick={() => setActiveTab('report')} 
          />
          <SidebarLink 
            icon={<Calendar className="w-5 h-5" />} 
            label={t('plannedOvertime')} 
            active={activeTab === 'planning'} 
            onClick={() => setActiveTab('planning')} 
          />
          <SidebarLink 
            icon={<MapIcon className="w-5 h-5" />} 
            label="Roster / 调度" 
            active={activeTab === 'roster'} 
            onClick={() => setActiveTab('roster')} 
          />
          <SidebarLink 
            icon={<Network className="w-5 h-5" />} 
            label="Org Chart / 架构图" 
            active={activeTab === 'orgchart'} 
            onClick={() => setActiveTab('orgchart')} 
          />
          <SidebarLink
            icon={<Briefcase className="w-5 h-5" />}
            label="REVIEW LAB / 实验功能"
            active={false}
            onClick={() => navigate('/review-lab')}
          />
          <SidebarLink 
            icon={<Settings className="w-5 h-5" />} 
            label="Settings / 设置" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <button 
          onClick={logout}
          className="flex items-center gap-3 p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all font-medium"
        >
          <LogOut className="w-5 h-5" />
          {t('logout')}
        </button>

        <button 
          onClick={() => navigate('/overview')}
          className="mt-2 flex items-center gap-3 p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all font-medium"
        >
          <Home className="w-5 h-5" />
          Public View / 公共概览
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto max-h-screen">
        <header className="mb-10 flex items-center justify-between no-print">
          <div>
            <h2 className="text-3xl font-black text-slate-900">
              {activeTab === 'dashboard' ? (
                <>Monthly Review <span className="text-lg font-normal text-slate-700">/ 月度审核</span></>
              ) : activeTab === 'profiles' ? (
                <>Employee Profiles <span className="text-lg font-normal text-slate-700">/ 员工档案</span></>
              ) : activeTab === 'report' ? (
                <>Monthly OT <span className="text-lg font-normal text-slate-700">/ 月度报告</span></>
              ) : activeTab === 'planning' ? (
                <>Planned Overtime <span className="text-lg font-normal text-slate-700">/ 计划加班</span></>
              ) : activeTab === 'roster' ? (
                <>Dynamic Roster <span className="text-lg font-normal text-slate-700">/ 动态调度</span></>
              ) : activeTab === 'orgchart' ? (
                <>Organization Chart <span className="text-lg font-normal text-slate-700">/ 组织架构</span></>
              ) : (
                <>System Settings <span className="text-lg font-normal text-slate-700">/ 系统设置</span></>
              )}
            </h2>
            <p className="text-slate-800 mt-1 font-medium">
              Overview for {formatMonth(selectedMonth)}
              <span className="ml-2 text-slate-600">| {selectedMonth} 概览</span>
            </p>
          </div>
          {activeTab === 'profiles' && (
            <button 
              onClick={() => setActiveTab('profiles')}
              className="btn-vibrant"
            >
              <Plus className="w-5 h-5" />
              {t('createEmployee')}
            </button>
          )}
        </header>

        {activeTab === 'dashboard' && (
          <ManagerControlDashboard month={selectedMonth} onMonthChange={setSelectedMonth} employees={employees} entries={entries} />
        )}

        {activeTab === 'profiles' && (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm sticky top-10">
                <h3 className="text-lg font-bold text-slate-900 mb-6">
                  {editingEmployeeId ? t('edit') : t('createEmployee')}
                </h3>
                <form onSubmit={handleCreateEmployee} className="space-y-5">
                  <div>
                    <p className="block text-sm font-bold text-slate-800 mb-2">{t('name')}</p>
                    <input 
                      type="text" 
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/10 bg-slate-50 font-medium"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div>
                    <p className="block text-sm font-bold text-slate-800 mb-2">{t('individualPassword')}</p>
                    <input 
                      type="text" 
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/10 bg-slate-50 font-medium"
                      placeholder="Enter a simple password"
                    />
                  </div>
                  <div>
                    <p className="block text-sm font-bold text-slate-800 mb-2">{t('department')}</p>
                    <select 
                      value={newDepartment}
                      onChange={e => setNewDepartment(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/10 bg-slate-50 font-bold"
                    >
                      <option value="deptProduction">{t('deptProduction')}</option>
                      <option value="deptWarehouse">{t('deptWarehouse')}</option>
                      <option value="deptDriver">{t('deptDriver')}</option>
                      <option value="deptOffice">{t('deptOffice')}</option>
                      <option value="deptMaintenance">{t('deptMaintenance')}</option>
                      <option value="deptOther">{t('deptOther')}</option>
                    </select>
                  </div>
                  <div className="flex gap-3">
                    {editingEmployeeId && (
                      <button 
                        type="button"
                        onClick={() => {
                          setEditingEmployeeId(null);
                          setNewName('');
                          setNewPassword('');
                          setNewDepartment('deptProduction');
                        }}
                        className="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-xl hover:bg-slate-200 transition-all text-sm"
                      >
                        {t('cancel')}
                      </button>
                    )}
                    <button 
                      disabled={isSubmitting}
                      type="submit" 
                      className={`${editingEmployeeId ? 'flex-[2]' : 'w-full'} bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50`}
                    >
                      {isSubmitting ? '...' : editingEmployeeId ? t('submit') : t('submit')}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              {employees.map(emp => (
                <div key={emp.id} className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center justify-between hover:shadow-md transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800" translate="no">{emp.name}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-700 font-medium mt-1">
                        <Lock className="w-3 h-3" />
                        <span>{emp.password}</span>
                        <span className="mx-2">|</span>
                        <span>{t(emp.department || 'deptOther')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => handleEditClick(emp)}
                      className="p-2.5 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm border border-slate-100 bg-slate-50/50"
                      title={t('edit')}
                    >
                      <PenTool className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setDeletingEmployeeId(emp.id)}
                      className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm border border-slate-100 bg-slate-50/50"
                      title={t('delete')}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="px-3 py-1 bg-slate-50 text-slate-500 text-xs font-bold rounded-lg border border-slate-100">
                      ID: {emp.id.slice(0, 8)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-6 no-print">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-slate-400" />
                <span className="font-bold text-slate-700">{t('date')}</span>
              </div>
              <input 
                type="month" 
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/10 font-bold text-slate-900"
              />
            </div>

            {!selectedEmployeeSummary ? (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-8 py-5 text-sm font-black text-slate-900 uppercase tracking-wider">{t('name')}</th>
                        <th className="px-8 py-5 text-sm font-black text-slate-900 uppercase tracking-wider">{t('frequency')}</th>
                        <th className="px-8 py-5 text-sm font-black text-slate-900 uppercase tracking-wider">Status / 状态</th>
                        <th className="px-8 py-5 text-sm font-black text-slate-900 uppercase tracking-wider">{t('avgHours')}</th>
                        <th className="px-8 py-5 text-sm font-black text-slate-900 uppercase tracking-wider text-right">{t('totalHours')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summaries.map(s => (
                        <tr 
                          key={s.employeeId} 
                          onClick={() => setSelectedEmployeeSummary(s)}
                          className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                        >
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-slate-800" translate="no">{s.employeeName}</span>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                                Click to view
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-slate-600 font-medium">{s.entryCount} times</td>
                          <td className="px-8 py-5">
                            {s.unverifiedCount > 0 ? (
                              <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-100 w-fit">
                                <AlertCircle className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase">{s.unverifiedCount} {t('pending') || 'Pending'}</span>
                              </div>
                            ) : s.entryCount > 0 ? (
                              <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-100 w-fit">
                                <CheckCircle2 className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase">ALL OK</span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">-</span>
                            )}
                          </td>
                          <td className="px-8 py-5 text-slate-600 font-medium">{s.averageHours.toFixed(1)}h</td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex items-center justify-end gap-3">
                              {confirmedEmployees.has(s.employeeId) && (
                                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                              )}
                              <span className="inline-block px-4 py-1.5 bg-indigo-50 text-indigo-700 font-extrabold rounded-full text-sm">
                                {s.totalHours.toFixed(1)}h
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Global Signature at bottom of Report List */}
                {(() => {
                  const allApproved = summaries.length > 0 && summaries.every(s => s.unverifiedCount === 0);
                  const showGlobalSignatureStatus = allApproved || globalReport;

                  if (!showGlobalSignatureStatus) {
                    return (
                      <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col items-center justify-center text-center gap-2">
                        <AlertCircle className="w-6 h-6 text-slate-600" />
                        <p className="text-slate-800 text-sm font-medium">
                          {t('allVerifiedMessage')}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="p-10 bg-slate-50/50 border-t-4 border-indigo-100">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-10">
                        <div className="space-y-2">
                          <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">{t('managerSignatureTitle')}</h4>
                          <p className="text-sm font-bold text-slate-700">{selectedMonth} Final Review Result</p>
                        </div>

                        <div className="flex flex-col items-center gap-4">
                          {!isMonthEnd() && !globalReport && (
                            <div className="px-4 py-2 bg-amber-50 text-amber-600 border border-amber-100 rounded-xl text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                              <AlertCircle className="w-3 h-3" />
                              Locked until month end / 仅在月底开放
                            </div>
                          )}
                          
                          <div className={`min-w-[280px] min-h-[100px] border-b-2 border-slate-300 flex items-center justify-center relative group ${!isMonthEnd() && !globalReport ? 'opacity-40 grayscale' : ''}`}>
                            {globalReport ? (
                              <div className="animate-in fade-in zoom-in duration-500 text-center">
                                {globalReport.type === 'text' ? (
                                  <span className="text-4xl font-['Playfair_Display',serif] italic text-slate-800" translate="no">{globalReport.signature}</span>
                                ) : (
                                  <img src={globalReport.signature} alt="Global Signature" className="max-h-20 object-contain mx-auto" />
                                )}
                                <div className="mt-2 space-y-1">
                                    <p className="text-[10px] font-black text-slate-700 tracking-widest uppercase">
                                      {globalReport.signedBy ? `Signed by: ${globalReport.signedBy}` : 'Approved by Manager'}
                                    </p>
                                    <div className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black uppercase rounded tracking-widest whitespace-nowrap inline-block">
                                      {globalReport.createdAt?.toDate ? globalReport.createdAt.toDate().toLocaleDateString() : new Date().toLocaleDateString()}
                                    </div>
                                </div>
                              </div>
                            ) : (
                              <button 
                                disabled={!isMonthEnd()}
                                onClick={() => { 
                                  if (!isMonthEnd()) return;
                                  setIsGlobalSigning(true); 
                                  setIsSignModalOpen(true); 
                                }}
                                className={`flex items-center gap-3 py-4 px-8 bg-white border-2 border-indigo-100 rounded-2xl text-indigo-600 font-black uppercase tracking-widest text-xs hover:border-indigo-600 hover:bg-indigo-50 transition-all shadow-xl shadow-indigo-100/20 ${!isMonthEnd() ? 'cursor-not-allowed border-slate-200 text-slate-400 bg-slate-50 shadow-none' : ''}`}
                              >
                                <PenTool className="w-5 h-5" />
                                {t('addSignature')}
                              </button>
                            )}
                          </div>
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">经理签名 / Manager Signature</p>
                        </div>

                        <div className="flex items-center gap-6">
                           <div className="text-right">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                              <div className={`px-3 py-1 rounded-full text-[10px] font-black border ${allApproved ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                 {allApproved ? 'APPROVED' : 'PENDING'}
                              </div>
                           </div>
                           <div className="w-12 h-12 bg-white rounded-2xl border border-slate-100 flex items-center justify-center shadow-sm">
                              {allApproved ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <Clock className="w-6 h-6 text-slate-300" />}
                           </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center justify-between no-print">
                  <button 
                    onClick={() => { setSelectedEmployeeSummary(null); setSignature(null); setSignatureType(null); }}
                    className="flex items-center gap-2 text-slate-700 hover:text-slate-900 font-bold transition-all group"
                  >
                    <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                    Back to Overview / 返回概览
                  </button>

                  <div className="flex items-center gap-3">
                    {selectedMonth < new Date().toISOString().slice(0, 7) && (
                      <button 
                        onClick={() => { window.focus(); window.print(); }}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-rose-700 transition-all shadow-sm border border-rose-600 cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-white" />
                        一键保存PDF / One-click Save PDF
                      </button>
                    )}
                    <button 
                      onClick={() => { window.focus(); window.print(); }}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-black uppercase tracking-widest text-[10px] hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                    >
                      <Printer className="w-4 h-4" />
                      Print / 打印
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print-area">
                  <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                      <h4 className="text-2xl font-black text-slate-900" translate="no">{selectedEmployeeSummary.employeeName}</h4>
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-1">
                        Detailed Report for {selectedMonth} <span className="text-slate-300 mx-2">|</span> {selectedEmployeeSummary.totalHours.toFixed(1)}h Total (x1.5 only)
                      </p>
                    </div>
                    {confirmedEmployees.has(selectedEmployeeSummary.employeeId) && (
                      <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl border border-emerald-100">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-black text-xs uppercase tracking-widest">Confimed / 已确认</span>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50/30 text-left">
                          <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('date')}</th>
                          <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('time')}</th>
                          <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('multiplier')}</th>
                          <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('totalHours')}</th>
                          <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">Status / 状态</th>
                          <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest">{t('remarks')}</th>
                          <th className="px-8 py-4 text-sm font-black text-slate-900 uppercase tracking-widest text-right no-print">{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {entries
                          .filter(e => e.employeeId === selectedEmployeeSummary.employeeId && e.date.startsWith(selectedMonth))
                          .sort((a, b) => a.date.localeCompare(b.date))
                          .map(entry => {
                            const isSelected = selectedEntryIds.has(entry.id);
                            return (
                              <tr 
                                key={entry.id} 
                                onClick={(e) => handleEntryClick(entry.id, e)}
                                className={`transition-all cursor-pointer select-none ${
                                  isSelected 
                                    ? 'bg-indigo-50 hover:bg-indigo-100' 
                                    : 'hover:bg-slate-50/30'
                                }`}
                              >
                                <td className="px-8 py-5 font-bold text-slate-800">
                                  <div className="flex items-center gap-3">
                                    {isSelected && (
                                      <motion.div 
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"
                                      />
                                    )}
                                    {formatDateWithDay(entry.date)}
                                  </div>
                                </td>
                                <td className="px-8 py-5 text-slate-500 font-medium">
                                  {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                                </td>
                                <td className="px-8 py-5">
                                  <span className={`px-2 py-0.5 rounded-lg font-normal text-xs ${entry.multiplier === 2.0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {entry.multiplier === 2.0 ? t('overtime20') : t('overtime15')}
                                  </span>
                                </td>
                                <td className="px-8 py-5">
                                  <span className={`font-black ${isSelected ? 'text-indigo-700' : 'text-indigo-600'}`}>{entry.totalHours}h</span>
                                </td>
                                <td className="px-8 py-5">
                                  {entry.verified ? (
                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                                      <CheckCircle2 className="w-4 h-4" />
                                      OK
                                    </span>
                                  ) : entry.status === 'rejected' ? (
                                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1">
                                      <X className="w-4 h-4" />
                                      {t('rejected') || 'Rejected'}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1">
                                      <AlertCircle className="w-4 h-4" />
                                      {t('pending') || 'Pending'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-8 py-5 text-slate-400 italic text-sm">{entry.remarks || '-'}</td>
                                <td className="px-8 py-5 text-right no-print">
                                  <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                    {!entry.verified && entry.status !== 'rejected' && (
                                      <>
                                        <button 
                                          onClick={() => handleVerifyEntry(entry.id)}
                                          className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all shadow-sm border border-emerald-100 bg-emerald-50/20"
                                          title="Verify"
                                        >
                                          <CheckCircle2 className="w-6 h-6" />
                                        </button>
                                        <button 
                                          onClick={() => handleRejectEntry(entry.id)}
                                          className="p-3 text-amber-600 hover:bg-amber-50 rounded-xl transition-all shadow-sm border border-amber-100 bg-amber-50/20"
                                          title="Reject"
                                        >
                                          <X className="w-6 h-6" />
                                        </button>
                                      </>
                                    )}
                                    <button 
                                      onClick={() => setEditingEntry(entry)}
                                      className="p-3 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-md border border-indigo-200 bg-white"
                                      title="Edit"
                                    >
                                      <PenTool className="w-6 h-6" />
                                    </button>
                                    <button 
                                      onClick={() => setDeletingEntryId(entry.id)}
                                      className="p-3 text-slate-600 hover:text-white hover:bg-red-600 rounded-xl transition-all shadow-md border border-slate-200 bg-white"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-6 h-6" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50/50">
                          <td colSpan={2} className="px-8 py-6 text-sm font-black text-slate-400 uppercase tracking-widest text-right">
                             Monthly Total / 月总数
                          </td>
                          <td colSpan={2} className="px-8 py-6 font-black text-2xl text-indigo-600">
                             {selectedEmployeeSummary.totalHours.toFixed(1)}h
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Floating Selection Summary */}
                  <AnimatePresence>
                    {selectedEntryIds.size > 0 && (
                      <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] no-print"
                      >
                        <div className="bg-slate-900/90 backdrop-blur-xl text-white px-8 py-5 rounded-[32px] shadow-2xl flex items-center gap-10 border border-slate-800">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                              <Calculator className="w-6 h-6 text-white" />
                            </div>
                            <div>
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Cumulative Sum / 累积总时长</p>
                               <div className="flex items-baseline gap-2">
                                  <span className="text-3xl font-black text-white">{totalSelectedHours.toFixed(1)}</span>
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Hours</span>
                               </div>
                            </div>
                          </div>
                          
                          <div className="h-10 w-px bg-slate-800"></div>

                          <div className="flex flex-col">
                             <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest leading-none mb-1">Selected / 已选</p>
                             <p className="text-sm font-bold text-indigo-400">{selectedEntryIds.size} records</p>
                          </div>

                          <button 
                            onClick={() => setSelectedEntryIds(new Set())}
                            className="bg-slate-800 hover:bg-red-500/20 hover:text-red-400 p-2.5 rounded-xl transition-all"
                            title="Clear / 清除"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Supervisor Signature Result */}
                  <div className="p-8 border-t border-slate-100 bg-slate-50/20">
                     <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="space-y-1">
                           <h5 className="text-sm font-black text-slate-900 uppercase tracking-tight">主管审核结果 / Supervisor Approval</h5>
                           <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                             {supervisorReport ? (
                               <>
                                 <span className="text-emerald-600 font-black">{t('signedBySupervisor')}</span>
                                 <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-900 shadow-sm" translate="no">【 {supervisorReport.signedBy || 'Supervisor'} 】</span>
                               </>
                             ) : (
                               <span className="text-amber-600">{t('awaitingSupervisor')}</span>
                             )}
                           </p>
                        </div>
                        
                        <div className="flex items-center gap-6">
                           <div className="text-right">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                              <div className={`px-3 py-1 rounded-full text-[10px] font-black border ${supervisorReport ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                 {supervisorReport ? 'SIGNED / 已签署' : 'WAITING / 待签署'}
                              </div>
                           </div>
                           
                           {supervisorReport && (
                             <>
                               <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                                 {supervisorReport.type === 'text' ? (
                                   <span className="text-xl font-['Playfair_Display',serif] italic text-slate-900" translate="no">{supervisorReport.signature}</span>
                                 ) : (
                                   <img src={supervisorReport.signature} alt="Supervisor Signature" className="max-h-full object-contain" />
                                 )}
                               </div>
                               <div className="space-y-0.5">
                                 <p className="text-[10px] font-black text-slate-900 uppercase">
                                   {supervisorReport.signedBy || 'Supervisor'}
                                 </p>
                                 <p className="text-[9px] font-bold text-slate-700">
                                   {supervisorReport.createdAt?.toDate ? supervisorReport.createdAt.toDate().toLocaleDateString() : new Date().toLocaleDateString()}
                                 </p>
                               </div>
                             </>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Signature block for this specific employee */}
                  <div className="p-12 border-t-2 border-slate-100 bg-slate-50/30">
                    <div className="flex flex-col sm:flex-row items-end justify-between gap-12">
                      <div className="w-full sm:w-64 space-y-4">
                        <div className="min-h-[60px] flex items-center justify-center border-b border-slate-300 mb-2 relative group">
                          {confirmedEmployees.has(selectedEmployeeSummary.employeeId) ? (
                            <div className="animate-in fade-in zoom-in duration-300">
                               {employeeSignatures[selectedEmployeeSummary.employeeId].type === 'text' ? (
                                  <span className="text-3xl font-['Playfair_Display',serif] italic text-slate-800" translate="no">
                                    {employeeSignatures[selectedEmployeeSummary.employeeId].data}
                                  </span>
                               ) : (
                                  <img src={employeeSignatures[selectedEmployeeSummary.employeeId].data} alt="Signature" className="max-h-16 object-contain" />
                               )}
                            </div>
                          ) : signature ? (
                             <div className="animate-in fade-in zoom-in duration-300">
                                {signatureType === 'text' ? (
                                   <span className="text-3xl font-['Playfair_Display',serif] italic text-slate-800" translate="no">{signature}</span>
                                ) : (
                                   <img src={signature} alt="Signature" className="max-h-16 object-contain" />
                                )}
                                <button 
                                   onClick={() => { setSignature(null); setSignatureType(null); }}
                                   className="absolute -top-8 right-0 p-1 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                                 >
                                   <X className="w-3 h-3" />
                                 </button>
                             </div>
                          ) : (
                             <button 
                                onClick={() => {
                                  if (!isMonthEnd()) {
                                    alert(t('monthEndRequirement') || 'Signature is only available at the end of the month.');
                                    return;
                                  }
                                  setIsSignModalOpen(true);
                                }}
                                className={`flex items-center gap-2 font-bold transition-all py-2 px-4 rounded-xl border ${!isMonthEnd() ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-transparent hover:border-indigo-100'}`}
                             >
                                <PenTool className="w-4 h-4" />
                                {t('addSignature')}
                             </button>
                          )}
                        </div>
                        <p className="text-center text-xs font-bold text-slate-600 uppercase tracking-widest">
                           {confirmedEmployees.has(selectedEmployeeSummary.employeeId) || signature ? t('signaturePlace') : t('signature')}
                        </p>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        {!confirmedEmployees.has(selectedEmployeeSummary.employeeId) ? (
                          <button 
                             disabled={!signature}
                             onClick={() => handleConfirmEmployeeReport(selectedEmployeeSummary.employeeId)}
                             className={`min-w-[180px] flex items-center justify-center gap-3 py-4 px-6 rounded-2xl border-2 transition-all font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-100 ${
                               signature 
                               ? 'bg-vibrant text-white border-transparent hover:bg-vibrant-hover hover:scale-[1.02] active:scale-95' 
                               : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                             }`}
                          >
                             <CheckCircle2 className="w-5 h-5" />
                             {t('confirmReport')}
                          </button>
                        ) : (
                          <div className="flex items-center gap-4 py-4 px-8 bg-emerald-50 rounded-2xl border-2 border-emerald-100 animate-in slide-in-from-right duration-500">
                             <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                             <div>
                               <p className="text-sm font-black text-emerald-900 uppercase tracking-tight">{t('confirm')}</p>
                               <p className="text-xs text-emerald-600/60 font-bold">
                                 {employeeSignatures[selectedEmployeeSummary.employeeId]?.createdAt?.toDate 
                                   ? employeeSignatures[selectedEmployeeSummary.employeeId].createdAt.toDate().toLocaleDateString() 
                                   : new Date().toLocaleDateString()}
                               </p>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'planning' && (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-6 no-print">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-slate-400" />
                <span className="font-bold text-slate-700">{t('date')}</span>
              </div>
              <input 
                type="month" 
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/10 font-bold text-slate-900"
              />
            </div>

            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h4 className="text-xl font-black text-slate-900 uppercase">Management of Plans / 计划管理</h4>
                  <p className="text-sm font-bold text-slate-700">Total {plans.length} planned shifts for {selectedMonth}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/30 text-left">
                      <th className="px-8 py-4 text-xs font-bold text-slate-700 uppercase tracking-widest">{t('name')}</th>
                      <th className="px-8 py-4 text-xs font-bold text-slate-700 uppercase tracking-widest">{t('date')}</th>
                      <th className="px-8 py-4 text-xs font-bold text-slate-700 uppercase tracking-widest text-right">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plans.length > 0 ? plans.sort((a, b) => a.date.localeCompare(b.date)).map(plan => (
                      <tr key={plan.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-8 py-5 font-bold text-slate-800" translate="no">{plan.employeeName}</td>
                        <td className="px-8 py-5 text-slate-500 font-medium">{formatDateWithDay(plan.date)}</td>
                        <td className="px-8 py-5 text-right">
                          <button 
                            onClick={() => setDeletingPlanId(plan.id)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            title={t('delete')}
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="px-8 py-20 text-center text-slate-600 font-medium italic">
                          No plans found for this month / 本月无计划
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'roster' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <RosterBoard />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-10 rounded-[32px] border border-slate-200 shadow-sm overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Settings className="w-40 h-40" />
              </div>
              
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-6">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Dangerous Actions / 危险操作</h3>
                <p className="text-slate-800 font-medium mb-10">
                  This section contains tools to manage your application data. Use with extreme caution as these actions cannot be undone.
                  <br />
                  <span className="text-slate-600">此部分包含管理应用程序数据的工具。请谨慎使用，因为这些操作无法撤销。</span>
                </p>

                <div className="p-8 rounded-3xl bg-red-50/50 border border-red-100 flex items-center justify-between gap-10">
                  <div>
                    <h4 className="text-lg font-black text-red-900 mb-1">Reset All Records / 重置所有记录</h4>
                    <p className="text-sm font-bold text-red-600/60">
                      Permanently delete all overtime entries, plans, and signatures. Employee accounts will remain.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsResetModalOpen(true)}
                    className="px-8 py-4 bg-red-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-red-600 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-red-200 shrink-0"
                  >
                    Reset Now
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white p-10 rounded-[32px] border border-slate-200 shadow-sm">
               <div className="flex items-center gap-4 mb-6">
                 <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <Info className="w-6 h-6" />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">By FH System Info</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">By FH Ver 1.1.14 PRO</p>
                 </div>
               </div>
               <div className="space-y-4">
                  <div className="flex items-center justify-between py-4 border-b border-slate-100 ring-offset-2">
                    <span className="text-sm font-bold text-slate-600 uppercase tracking-widest">Database Type</span>
                    <span className="text-sm font-black text-indigo-600">Enterprise Firestore</span>
                  </div>
                  <div className="flex items-center justify-between py-4 border-b border-slate-100">
                    <span className="text-sm font-bold text-slate-600 uppercase tracking-widest">Region</span>
                    <span className="text-sm font-black text-indigo-600">Asia Pacific</span>
                  </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'orgchart' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <OrgChart editable={true} />
          </div>
        )}
      </main>

      {/* Edit Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] w-full max-w-xl p-10 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Edit Record / 修改记录</h3>
              <button 
                onClick={() => setEditingEntry(null)}
                className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleEditEntry} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{t('date')}</p>
                  <div className="relative group">
                    <input 
                      type="text"
                      value={editDateInput}
                      onChange={e => handleManualEditDateChange(e.target.value)}
                      placeholder="DD/MM/YYYY"
                      className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-0 font-bold bg-slate-50 outline-none pr-12"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer z-30">
                      <Calendar className="w-5 h-5 text-slate-400 pointer-events-none" />
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
                      <div className="absolute -bottom-6 left-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest animate-in fade-in slide-in-from-top-1">
                        {formatDateFriendly(editingEntry.date)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{t('multiplier')}</p>
                  <select 
                    value={editingEntry.multiplier}
                    onChange={e => setEditingEntry({...editingEntry, multiplier: parseFloat(e.target.value)})}
                    className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-0 font-bold bg-slate-50 outline-none"
                  >
                    <option value={1.5}>1.5 (Normal)</option>
                    <option value={2.0}>Sunday/Holiday</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{t('startTime')}</p>
                  <input 
                    type="time"
                    value={editingEntry.startTime}
                    onChange={e => setEditingEntry({...editingEntry, startTime: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-0 font-bold bg-slate-50 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{t('endTime')}</p>
                  <input 
                    type="time"
                    value={editingEntry.endTime}
                    onChange={e => setEditingEntry({...editingEntry, endTime: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-0 font-bold bg-slate-50 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{t('remarks')}</p>
                <input 
                  type="text"
                  value={editingEntry.remarks || ''}
                  onChange={e => setEditingEntry({...editingEntry, remarks: e.target.value})}
                  className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-0 font-bold bg-slate-50 outline-none"
                  placeholder="Optional remarks..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="flex-1 py-5 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 disabled:opacity-50"
                >
                  {isSubmitting ? '...' : t('submit')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete Entry Modal */}
      {deletingEntryId && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] w-full max-w-md p-8 shadow-2xl"
          >
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 text-red-500 mb-6 mx-auto">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 text-center mb-2">Delete This Entry?</h3>
            <p className="text-slate-800 text-center mb-8 font-medium">
              Are you sure you want to delete this overtime record? This action cannot be undone.
              <br />
              <span className="text-slate-600">您确定要删除这条加班记录吗？此操作无法撤销。</span>
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setDeletingEntryId(null)}
                className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={handleDeleteEntry}
                disabled={isSubmitting}
                className="flex-1 py-4 px-6 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-red-100 disabled:opacity-50"
              >
                {isSubmitting ? '...' : t('delete')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Plan Modal */}
      {deletingPlanId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] w-full max-w-md p-8 shadow-2xl"
          >
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 text-red-500 mb-6 mx-auto">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 text-center mb-2">Delete This Plan?</h3>
            <p className="text-slate-800 text-center mb-8 font-medium">
              Are you sure you want to delete this planned overtime?
              <br />
              <span className="text-slate-600">您确定要删除这个加班计划吗？</span>
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setDeletingPlanId(null)}
                className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={handleDeletePlan}
                disabled={isSubmitting}
                className="flex-1 py-4 px-6 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-red-100 disabled:opacity-50"
              >
                {isSubmitting ? '...' : t('delete')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Signature Modal */}
      {isSignModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] w-full max-w-lg p-10 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">{t('addSignature')}</h3>
              <button 
                onClick={() => setIsSignModalOpen(false)}
                className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
               <div className="space-y-4">
                  <button 
                    onClick={() => setSignatureMethod('draw')}
                    className={`w-full p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${signatureMethod === 'draw' ? 'bg-indigo-50 border-indigo-500 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'}`}
                  >
                    <PenTool className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{t('drawSignature')}</span>
                  </button>
               </div>
               <div className="space-y-4">
                  <div className={`relative w-full p-6 h-full rounded-3xl border-2 transition-all flex flex-col items-center justify-center gap-3 overflow-hidden ${signatureMethod === 'upload' ? 'bg-indigo-50 border-indigo-500 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'}`}>
                    <Upload className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{t('uploadSignature')}</span>
                    <input 
                       type="file" 
                       accept="image/*" 
                       onChange={(e) => { setSignatureMethod('upload'); handleFileUpload(e); }}
                       className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
               </div>
               <div className="col-span-2">
                  <button 
                    onClick={() => setSignatureMethod('text')}
                    className={`w-full p-6 rounded-3xl border-2 transition-all flex items-center justify-center gap-4 ${signatureMethod === 'text' ? 'bg-indigo-50 border-indigo-500 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">Aa</div>
                    <span className="text-[10px] font-black uppercase tracking-widest">{t('typeSignature')}</span>
                  </button>
               </div>
            </div>

            {signatureMethod === 'draw' && (
              <div className="space-y-6">
                 <div className="bg-slate-50 rounded-3xl border-2 border-slate-100 p-2 overflow-hidden">
                    <SignatureCanvas 
                      ref={sigCanvasRef}
                      canvasProps={{
                        className: "w-full h-48 cursor-crosshair"
                      }}
                      backgroundColor="rgba(0,0,0,0)"
                    />
                 </div>
                 <div className="flex gap-4">
                    <button 
                      onClick={() => sigCanvasRef.current?.clear()}
                      className="flex-1 py-5 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                    >
                      {t('clear')}
                    </button>
                    <button 
                      onClick={handleDrawSignature}
                      className="flex-[2] py-5 bg-vibrant text-white font-black rounded-2xl hover:bg-vibrant-hover transition-all uppercase tracking-widest text-xs shadow-xl shadow-indigo-100"
                    >
                      {t('confirm')}
                    </button>
                 </div>
              </div>
            )}

            {signatureMethod === 'text' && (
              <form onSubmit={handleTextSignature} className="space-y-6">
                 <div className="space-y-2">
                    <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{t('name')}</p>
                    <input 
                       type="text" 
                       value={typedName}
                       onChange={e => setTypedName(e.target.value)}
                       placeholder="Type your name..."
                       className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-0 text-xl font-bold bg-slate-50"
                       autoFocus
                    />
                 </div>
                 <div className="flex gap-4">
                    <button 
                       type="button"
                       onClick={() => setIsSignModalOpen(false)}
                       className="flex-1 py-5 px-6 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                    >
                       {t('cancel')}
                    </button>
                    <button 
                       type="submit"
                       disabled={!typedName.trim()}
                       className="flex-[2] py-5 px-6 bg-vibrant text-white font-black rounded-2xl hover:bg-vibrant-hover transition-all uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 disabled:opacity-50"
                    >
                       {t('confirm')}
                    </button>
                 </div>
              </form>
            )}

            {signatureMethod === 'upload' && (
              <div className="p-10 text-center space-y-4">
                <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mx-auto animate-pulse">
                  <ImageIcon className="w-10 h-10" />
                </div>
                <p className="text-slate-700 font-bold uppercase tracking-widest text-xs">Waiting for upload...</p>
                <button 
                  onClick={() => setIsSignModalOpen(false)}
                  className="w-full py-5 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                >
                  {t('cancel')}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Database Reset Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] w-full max-w-lg p-12 shadow-2xl relative overflow-hidden"
          >
            {/* Warning Stripe */}
            <div className="absolute top-0 left-0 right-0 h-4 bg-red-500"></div>

            <div className="text-center">
              <div className="w-20 h-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-8 animate-bounce">
                <AlertCircle className="w-10 h-10" />
              </div>
              
              <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tighter uppercase">Extreme Warning / 极端警告</h3>
              <p className="text-slate-500 font-bold mb-10 leading-relaxed">
                You are about to <span className="text-red-500 underline font-black">DELETE ALL RECORDS</span>. 
                This will clear every overtime entry and plan from the system. 
                Employee profiles will be saved, but their history will be gone.
                <br />
                <span className="text-slate-300">您将删除所有加班记录和计划。员工档案将被保留，但历史记录将消失。</span>
              </p>

              <div className="bg-slate-50 p-6 rounded-3xl mb-10 border-2 border-slate-100">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                  Type <span className="text-red-500">RESET</span> to confirm
                </label>
                <input 
                  type="text" 
                  value={resetConfirmation}
                  onChange={e => setResetConfirmation(e.target.value)}
                  placeholder="RESET"
                  className="w-full bg-white px-6 py-4 rounded-2xl border-2 border-slate-200 focus:border-red-500 focus:ring-0 text-center text-4xl font-black text-red-500 placeholder:text-slate-100 tracking-[0.2em]"
                />
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => { setIsResetModalOpen(false); setResetConfirmation(''); }}
                  className="flex-1 py-5 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleResetDatabase}
                  disabled={resetConfirmation !== 'RESET' || isSubmitting}
                  className="flex-[2] py-5 bg-red-500 text-white font-black rounded-2xl hover:bg-red-600 transition-all uppercase tracking-widest text-xs shadow-xl shadow-red-200 disabled:opacity-30 flex items-center justify-center gap-3"
                >
                  {isSubmitting ? 'RESETTING...' : 'ERASE DATABASE'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEmployeeId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] w-full max-w-md p-8 shadow-2xl"
          >
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 text-red-500 mb-6 mx-auto">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 text-center mb-2">Delete Employee?</h3>
            <p className="text-slate-500 text-center mb-8 font-medium">
              Are you sure you want to delete this employee? This action cannot be undone.
              <br />
              <span className="text-slate-300">您确定要删除这位员工吗？此操作无法撤销。</span>
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setDeletingEmployeeId(null)}
                className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={handleDeleteEmployee}
                disabled={isSubmitting}
                className="flex-1 py-4 px-6 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-red-100 disabled:opacity-50"
              >
                {isSubmitting ? '...' : t('delete')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function SidebarLink({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3.5 rounded-xl font-bold transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatCard({ label, value, icon, color }: { label: string, value: string, icon: React.ReactNode, color: string }) {
  const colors = {
    indigo: 'bg-indigo-50',
    amber: 'bg-amber-50',
    emerald: 'bg-emerald-50'
  };

  return (
    <div className="p-6 card-vibrant border-b-4 bg-white" style={{ borderBottomColor: `var(--color-${color}-500)` }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{label}</p>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color as keyof typeof colors]}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-black text-slate-900">{value}</span>
        <span className="text-slate-400 font-bold text-sm tracking-wide">
          {label.toLowerCase().includes('hour') ? 'h' : label.toLowerCase().includes('avg') ? 'avg/h' : 'active'}
        </span>
      </div>
    </div>
  );
}


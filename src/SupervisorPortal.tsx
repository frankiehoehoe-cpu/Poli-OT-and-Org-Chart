import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { useTranslation } from './lib/LanguageContext';
import { employeeService, overtimeService, reportService } from './lib/services';
import { OvertimeEntry, UserProfile } from './types';
import { ReviewSupervisorTasks } from './components/review/TaskWorkflow';
import { motion, AnimatePresence } from 'motion/react';
import SignatureCanvas from 'react-signature-canvas';
import { formatDate, formatTime, formatDateWithDay } from './lib/dateUtils';
import { 
  ShieldCheck, 
  CheckCircle2, 
  LogOut, 
  Home,
  Search, 
  User,
  ChevronRight,
  ArrowLeft,
  Clock,
  Calendar,
  MessageSquare,
  AlertCircle,
  XCircle,
  PenTool,
  Upload,
  Printer,
  FileText,
  Image as ImageIcon
} from 'lucide-react';

interface EmployeeSummary {
  employeeId: string;
  employeeName: string;
  unverifiedCount: number;
  totalHours: number;
  totalUnverifiedHours: number;
}

export default function SupervisorPortal() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [reviewEmployees, setReviewEmployees] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Signature States
  const [employeeReport, setEmployeeReport] = useState<any>(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [signatureMethod, setSignatureMethod] = useState<'draw' | 'upload' | 'text'>('draw');
  const [typedName, setTypedName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sigCanvasRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    fetchEntries();
  }, [selectedMonth]);

  useEffect(() => {
    fetchEmployeeReport();
  }, [selectedMonth, selectedEmployeeId]);

  const fetchEntries = async () => {
    const [data, employees] = await Promise.all([
      overtimeService.getAllEntries(selectedMonth),
      employeeService.getAllEmployees()
    ]);
    setEntries(data);
    setReviewEmployees(employees);
    setIsLoading(false);
  };

  const fetchEmployeeReport = async () => {
    if (!selectedEmployeeId) {
      setEmployeeReport(null);
      return;
    }
    const report = await reportService.getMonthlyReport(selectedMonth, selectedEmployeeId, 'supervisor');
    setEmployeeReport(report);
  };

  const handleVerify = async (id: string) => {
    await overtimeService.verifyEntry(id);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, verified: true, status: 'verified' } : e));
  };

  const handleReject = async (id: string) => {
    await overtimeService.rejectEntry(id);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, verified: false, status: 'rejected' } : e));
  };

  const isMonthEnd = () => {
    const today = new Date();
    const currentMonthStr = today.toISOString().slice(0, 7);
    
    if (selectedMonth < currentMonthStr) return true;
    if (selectedMonth > currentMonthStr) return false;
    
    const day = today.getDate();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return day >= 30 || day >= lastDay;
  };

  const handleSaveSignature = async (data: string, type: 'draw' | 'upload' | 'text') => {
    if (!isMonthEnd()) {
      alert(t('monthEndRequirement'));
      return;
    }
    if (!selectedEmployeeId) return;
    
    setIsSubmitting(true);
    await reportService.saveMonthlyReport(selectedMonth, selectedEmployeeId, data, type, user?.name || 'Supervisor', 'supervisor');
    await fetchEmployeeReport();
    setIsSubmitting(false);
    setIsSignModalOpen(false);
  };

  const summaries = useMemo(() => {
    const map = new Map<string, EmployeeSummary>();
    
    entries.forEach(e => {
      if (!e.date.startsWith(selectedMonth)) return;

      const existing = map.get(e.employeeId) || {
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        unverifiedCount: 0,
        totalHours: 0,
        totalUnverifiedHours: 0
      };
      
      if (e.multiplier !== 2.0) {
        existing.totalHours += e.totalHours;
      }
      
      if (!e.verified && e.status !== 'rejected') {
        existing.unverifiedCount += 1;
        if (e.multiplier !== 2.0) {
          existing.totalUnverifiedHours += e.totalHours;
        }
      }
      map.set(e.employeeId, existing);
    });

    return Array.from(map.values())
      .filter(s => s.employeeName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.unverifiedCount - a.unverifiedCount || b.totalHours - a.totalHours);
  }, [entries, search, selectedMonth]);

  const selectedEmployeeName = entries.find(e => e.employeeId === selectedEmployeeId)?.employeeName;
  const filteredDetailEntries = entries
    .filter(e => e.employeeId === selectedEmployeeId && e.date.startsWith(selectedMonth))
    .sort((a, b) => a.date.localeCompare(b.date));

  const allApprovedForEmployee = useMemo(() => {
    if (!selectedEmployeeId) return false;
    const employeeEntries = entries.filter(e => e.employeeId === selectedEmployeeId && e.date.startsWith(selectedMonth));
    if (employeeEntries.length === 0) return false;
    return employeeEntries.every(e => e.status === 'verified');
  }, [entries, selectedEmployeeId, selectedMonth]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4 no-print">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{t('supervisor')}</h1>
              <p className="text-xs text-slate-800 font-medium">{t('verifyAll')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/overview')}
              className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
              title="Public Overview"
            >
              <Home className="w-5 h-5" />
            </button>
            <button 
              onClick={logout}
              className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-700 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <ReviewSupervisorTasks employees={reviewEmployees} />
        <AnimatePresence mode="wait">
          {!selectedEmployeeId ? (
            <motion.div 
              key="summary"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6 no-print"
            >
              {/* Controls */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 flex-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700" />
                    <input 
                      type="text" 
                      placeholder={t('search')}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 bg-slate-50 text-sm font-bold"
                    />
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-slate-700" />
                  <input 
                    type="month" 
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="border-none focus:ring-0 font-bold text-slate-700 bg-transparent"
                  />
                </div>
              </div>

              {/* Summary List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {summaries.map((s, idx) => (
                  <motion.div 
                    key={s.employeeId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedEmployeeId(s.employeeId)}
                    className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-500/30 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="w-5 h-5 text-amber-500" />
                    </div>
                    
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                        <User className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg font-black text-slate-900 group-hover:text-amber-600 transition-colors uppercase tracking-tight" translate="no">{s.employeeName}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${s.unverifiedCount > 0 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                            {s.unverifiedCount > 0 ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            <span className="text-[10px] font-black uppercase">{s.unverifiedCount} {t('pending') || 'Pending'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px] font-black uppercase">{s.totalHours.toFixed(1)}h Total</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {summaries.length === 0 && !isLoading && (
                  <div className="col-span-full py-20 text-center bg-white rounded-[32px] border-2 border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ShieldCheck className="w-8 h-8 text-slate-600" />
                    </div>
                    <p className="text-slate-700 font-bold uppercase tracking-widest text-xs">No entries for this month / 本月没有任何记录</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between no-print">
                <button 
                  onClick={() => setSelectedEmployeeId(null)}
                  className="flex items-center gap-2 text-slate-700 hover:text-slate-900 font-bold uppercase tracking-widest text-xs transition-all group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  Back to List / 返回列表
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

              <div className="bg-white rounded-[32px] border border-slate-200 shadow-xl overflow-hidden print-area">
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight" translate="no">{selectedEmployeeName}</h2>
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mt-1">Review for {selectedMonth}</p>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="text-right">
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Total Hours</p>
                        <p className="text-2xl font-black text-indigo-600">{filteredDetailEntries.reduce((acc, curr) => acc + (curr.multiplier === 2.0 ? 0 : curr.totalHours), 0).toFixed(1)}h</p>
                     </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 min-h-[200px]">
                  {filteredDetailEntries.map((entry, idx) => {
                    return (
                      <motion.div 
                        key={entry.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="p-6 sm:p-8 hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                          <div className="flex flex-wrap items-center gap-8">
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 text-slate-600" />
                                {t('date')}
                              </p>
                              <p className="text-base font-bold text-slate-900 tracking-tight">{formatDateWithDay(entry.date)}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-slate-600" />
                                {t('time')}
                              </p>
                              <p className="text-base font-bold text-slate-700 tracking-tight">{formatTime(entry.startTime)} - {formatTime(entry.endTime)}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                                <ShieldCheck className="w-3 h-3 text-slate-600" />
                                {t('multiplier')}
                              </p>
                              <p className={`text-base font-normal tracking-tight px-2 py-0.5 rounded-lg border w-fit ${entry.multiplier === 2.0 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                                {entry.multiplier === 2.0 ? t('overtime20') : t('overtime15')}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                                {t('totalHours')}
                              </p>
                              <p className="text-lg font-black text-indigo-600 tracking-tight">{entry.totalHours.toFixed(1)}<span className="text-xs ml-0.5">h</span></p>
                            </div>
                            {entry.remarks && (
                              <div className="space-y-1 max-w-xs">
                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                                  <MessageSquare className="w-3 h-3 text-slate-600" />
                                  {t('remarks')}
                                </p>
                                <p className="text-sm font-medium text-slate-600 italic">"{entry.remarks}"</p>
                              </div>
                            )}
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Status</p>
                              <div className={`px-3 py-1 rounded-full text-[10px] font-black border ${
                                entry.status === 'verified' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                entry.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' : 
                                'bg-amber-50 text-amber-600 border-amber-100'
                              }`}>
                                {entry.status?.toUpperCase() || 'PENDING'}
                              </div>
                            </div>
                          </div>

                          <div className="flex-shrink-0 flex items-center gap-3">
                            {entry.status === 'pending' && (
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => handleReject(entry.id)}
                                  className="px-6 py-3 rounded-xl border border-red-100 text-red-500 font-black uppercase tracking-widest text-xs hover:bg-red-50 transition-all flex items-center gap-2"
                                >
                                  <XCircle className="w-4 h-4" />
                                  {t('reject')}
                                </button>
                                <button 
                                  onClick={() => handleVerify(entry.id)}
                                  className="bg-amber-500 text-white font-bold py-3 px-8 rounded-xl hover:bg-amber-600 transition-all shadow-lg shadow-amber-100 flex items-center gap-2"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  {t('confirm')}
                                </button>
                              </div>
                            )}
                            {entry.status === 'rejected' && (
                              <button 
                                onClick={() => handleVerify(entry.id)}
                                className="text-[10px] font-black text-indigo-600 hover:underline uppercase"
                              >
                                Revise to Verify
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                  {filteredDetailEntries.length === 0 && (
                    <div className="p-20 text-center text-slate-600 font-bold uppercase tracking-widest text-xs">
                      No records for this month
                    </div>
                  )}
                </div>

                {/* Final Signature Section at bottom of detail view */}
                <div className="p-10 bg-slate-50/50 border-t-4 border-amber-100">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-10">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">{t('globalSignatureTitle')}</h4>
                        {!isMonthEnd() && !employeeReport && (
                          <div className="bg-amber-50 text-amber-600 px-2 py-1 rounded text-[10px] font-black border border-amber-100 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            LOCKED UNTIL MONTH END
                          </div>
                        )}
                        {!allApprovedForEmployee && !employeeReport && isMonthEnd() && (
                          <div className="bg-red-50 text-red-600 px-2 py-1 rounded text-[10px] font-black border border-red-100 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            WAITING FOR ALL APPROVALS
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-800 uppercase tracking-widest">Monthly Final Review Result</p>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                      <div className={`min-w-[280px] min-h-[100px] border-b-2 border-slate-300 flex items-center justify-center relative group ${(!isMonthEnd() || !allApprovedForEmployee) && !employeeReport ? 'opacity-40 grayscale' : ''}`}>
                        {employeeReport ? (
                          <div className="animate-in fade-in zoom-in duration-500 text-center">
                            {employeeReport.type === 'text' ? (
                              <span className="text-4xl font-['Playfair_Display',serif] italic text-slate-800">{employeeReport.signature}</span>
                            ) : (
                              <img src={employeeReport.signature} alt="Employee Report Signature" className="max-h-20 object-contain mx-auto" />
                            )}
                            <div className="mt-2 space-y-1">
                               <p className="text-[10px] font-black text-slate-700 tracking-widest uppercase">
                                 {employeeReport.signedBy ? `Signed by: ${employeeReport.signedBy}` : 'Approved'}
                               </p>
                               <div className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black uppercase rounded tracking-widest whitespace-nowrap inline-block">
                                 {employeeReport.createdAt?.toDate ? employeeReport.createdAt.toDate().toLocaleDateString() : new Date().toLocaleDateString()}
                               </div>
                            </div>
                          </div>
                        ) : (
                          <button 
                            disabled={!isMonthEnd() || !allApprovedForEmployee}
                            onClick={() => setIsSignModalOpen(true)}
                            className={`flex items-center gap-3 py-4 px-8 bg-white border-2 border-amber-100 rounded-2xl text-amber-600 font-black uppercase tracking-widest text-xs shadow-xl shadow-amber-100/20 transition-all ${isMonthEnd() && allApprovedForEmployee ? 'hover:border-amber-500 hover:bg-amber-50' : 'cursor-not-allowed grayscale'}`}
                          >
                            <PenTool className="w-5 h-5" />
                            {t('addSignature')}
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">主管签名 / Supervisor Signature</p>
                    </div>

                    <div className="flex items-center gap-6">
                       <div className="text-right">
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">Status</p>
                          <div className={`px-3 py-1 rounded-full text-[10px] font-black border ${allApprovedForEmployee ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-700 border-slate-100'}`}>
                             {allApprovedForEmployee ? 'READY' : 'PENDING'}
                          </div>
                       </div>
                       <div className="w-12 h-12 bg-white rounded-2xl border border-slate-100 flex items-center justify-center shadow-sm">
                          {allApprovedForEmployee ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <Clock className="w-6 h-6 text-slate-600" />}
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Signature Modal */}
      {isSignModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] w-full max-w-2xl p-10 shadow-2xl relative"
          >
            <div className="mb-10 text-center">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">{t('addSignature')}</h3>
              <p className="text-slate-700 font-bold uppercase tracking-widest text-xs">{selectedMonth} {t('globalSignatureTitle')}</p>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
               <button 
                 onClick={() => setSignatureMethod('draw')}
                 className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${signatureMethod === 'draw' ? 'bg-amber-50 border-amber-500 text-amber-600' : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200'}`}
               >
                 <PenTool className="w-6 h-6" />
                 <span className="text-[10px] font-black uppercase tracking-widest">{t('drawSignature')}</span>
               </button>
               <div className={`relative p-6 h-full rounded-3xl border-2 transition-all flex flex-col items-center justify-center gap-3 overflow-hidden ${signatureMethod === 'upload' ? 'bg-amber-50 border-amber-500 text-amber-600' : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200'}`}>
                 <Upload className="w-6 h-6" />
                 <span className="text-[10px] font-black uppercase tracking-widest">{t('uploadSignature')}</span>
                 <input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => handleSaveSignature(reader.result as string, 'upload');
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                 />
              </div>
              <button 
                onClick={() => setSignatureMethod('text')}
                className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${signatureMethod === 'text' ? 'bg-amber-50 border-amber-500 text-amber-600' : 'bg-slate-50 border-slate-100 text-slate-700 hover:border-slate-200'}`}
              >
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm text-sm font-bold">Aa</div>
                <span className="text-[10px] font-black uppercase tracking-widest">{t('typeSignature')}</span>
              </button>
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
                      onClick={() => {
                        if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
                          handleSaveSignature(sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png'), 'draw');
                        }
                      }}
                      className="flex-[2] py-5 bg-amber-500 text-white font-black rounded-2xl hover:bg-amber-600 transition-all uppercase tracking-widest text-xs shadow-xl shadow-amber-100"
                    >
                      {t('confirm')}
                    </button>
                 </div>
              </div>
            )}

            {signatureMethod === 'text' && (
              <form onSubmit={(e) => { e.preventDefault(); handleSaveSignature(typedName, 'text'); }} className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">{t('name')}</label>
                    <input 
                       type="text" 
                       value={typedName}
                       onChange={e => setTypedName(e.target.value)}
                       placeholder="Type your name..."
                       className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-amber-500 focus:ring-0 text-xl font-bold bg-slate-50"
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
                       className="flex-[2] py-5 px-6 bg-amber-500 text-white font-black rounded-2xl hover:bg-amber-600 transition-all uppercase tracking-widest text-xs shadow-xl shadow-amber-100 disabled:opacity-50"
                    >
                       {t('confirm')}
                    </button>
                 </div>
              </form>
            )}

            <button 
              onClick={() => setIsSignModalOpen(false)}
              className="absolute top-8 right-8 text-slate-700 hover:text-slate-900 transition-colors"
            >
              <XCircle className="w-8 h-8" />
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

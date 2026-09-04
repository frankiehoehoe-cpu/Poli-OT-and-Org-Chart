export type ReviewTaskType = 'output' | 'non-output';
export type ReviewTaskStatus = 'PLANNED' | 'IN PROGRESS' | 'CLOSED' | 'CANCELLED';
export type ParticipantStatus = 'NOT STARTED' | 'CONFIRMED' | 'OT IN PROGRESS' | 'COMPLETED';
export type ReviewCompletionStatus = 'COMPLETED' | 'PARTIALLY COMPLETED' | 'NOT COMPLETED';

export interface ReviewEmployee { id: string; name: string; department?: string }
export interface ReviewCorrection { originalHours: number; correctedHours: number; note?: string; correctedAt: string }
export interface ReviewParticipant { employeeId: string; employeeName: string; status: ParticipantStatus; assignedWorkstation: string; actualWorkstation: string; startTime?: string; endTime?: string; actualHours: number; submittedAt?: string; reviewPinVerified?: boolean; correction?: ReviewCorrection }
export interface ReviewTask {
  id: string; date: string; department: string; workstation: string; product: string; batchNo: string;
  plannedStart: string; plannedEnd: string; taskType: ReviewTaskType; targetRequirement: string;
  actualResult?: string; completionStatus?: ReviewCompletionStatus; supervisorNote?: string;
  status: ReviewTaskStatus; participants: ReviewParticipant[]; createdAt: string; closedAt?: string; closedByReviewRole?: 'SUPERVISOR';
}

export const REVIEW_STORAGE_KEY = 'otpro_review_tasks_v4';
export const REVIEW_TIME_KEY = 'otpro_review_time_v1';
export const REVIEW_DATE_OFFSET_KEY = 'otpro_review_date_offset_v1';
export const REVIEW_PIN = '1234';
export const REVIEW_TASKS_CHANGED = 'otpro-review-tasks-changed';
export const WORKSTATIONS = ['Mixing / 搅拌', 'Oven Drying / 烘干', 'Grinding / 研磨', 'Encapsulation / 进胶囊', 'Polishing / 抛光', 'Blistering / 压板', 'Print Code / 打码', 'Sacheting / 茶袋包装', 'Packing / 包装', 'Cleaning / 清洁', 'Changeover / 转线', 'Other Production Work / 其他生产工作'];

export const loadReviewTasks = (): ReviewTask[] => { try { return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || '[]') as ReviewTask[]; } catch { return []; } };
export const saveReviewTasks = (tasks: ReviewTask[]) => { localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(tasks)); window.dispatchEvent(new Event(REVIEW_TASKS_CHANGED)); };

export const getSingaporeDate = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const dateValue = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

export const addCalendarDays = (date: string, days: number): string => {
  const next = new Date(dateValue(date) + days * 86_400_000);
  return next.toISOString().slice(0, 10);
};

export const getReviewDate = (offsetDays = 0, date = new Date()) => addCalendarDays(getSingaporeDate(date), offsetDays);
export const getTaskCalendarAge = (taskDate: string, reviewDate: string) => Math.round((dateValue(reviewDate) - dateValue(taskDate)) / 86_400_000);

export const getTaskAgeStatus = (task: ReviewTask, reviewDate: string) => {
  if (task.status === 'CLOSED' || task.status === 'CANCELLED') return { daysOverdue: 0, label: task.status, chinese: '', tone: 'closed' as const };
  const daysOverdue = Math.max(0, getTaskCalendarAge(task.date, reviewDate));
  if (!daysOverdue) return { daysOverdue, label: task.date > reviewDate ? 'SCHEDULED' : 'IN PROGRESS', chinese: '', tone: 'current' as const };
  return { daysOverdue, label: `OPEN — ${daysOverdue} ${daysOverdue === 1 ? 'DAY' : 'DAYS'} OVERDUE`, chinese: `待关闭 — 已逾期 ${daysOverdue} 天`, tone: daysOverdue === 1 ? 'overdue' as const : 'older' as const };
};

export const sortSupervisorTasks = (tasks: ReviewTask[], reviewDate: string) => [...tasks].sort((a, b) => {
  const rank = (task: ReviewTask) => {
    if (task.status === 'CLOSED' || task.status === 'CANCELLED') return 3;
    if (task.date < reviewDate) return 0;
    if (task.date === reviewDate) return 1;
    return 2;
  };
  const rankDifference = rank(a) - rank(b);
  if (rankDifference) return rankDifference;
  if (rank(a) === 0) return a.date.localeCompare(b.date);
  if (rank(a) === 3) return (b.closedAt || b.createdAt).localeCompare(a.closedAt || a.createdAt);
  return a.date.localeCompare(b.date) || a.plannedStart.localeCompare(b.plannedStart);
});

export const getSingaporeMinutes = (date = new Date(), simulatedTime?: string | null): number => {
  if (simulatedTime) { const [hours, minutes] = simulatedTime.split(':').map(Number); return hours * 60 + minutes; }
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
  return part('hour') * 60 + part('minute');
};

export const canSubmitReviewOt = (taskDate: string, simulatedTime?: string | null, date = new Date()) => taskDate === getSingaporeDate(date) && getSingaporeMinutes(date, simulatedTime) >= 20 * 60;
export const isReviewPinValid = (candidate: string) => candidate === REVIEW_PIN;
export const applyReviewSubmission = (participant: ReviewParticipant, actualHours: number, submittedAt: string): { accepted: boolean; participant: ReviewParticipant } => {
  if (participant.status === 'COMPLETED' || !Number.isFinite(actualHours) || actualHours < 0.5 || actualHours > 12) return { accepted: false, participant };
  return { accepted: true, participant: { ...participant, status: 'COMPLETED', actualHours, submittedAt, reviewPinVerified: true } };
};

export const parseProductionQuantity = (text?: string): number | null => {
  if (!text) return null;
  const match = text.match(/\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
};

export const getTaskMetrics = (task: ReviewTask) => {
  const totalManHours = task.participants.reduce((sum, participant) => participant.status === 'COMPLETED' ? sum + (participant.correction?.correctedHours ?? participant.actualHours) : sum, 0);
  const targetQuantity = task.taskType === 'output' ? parseProductionQuantity(task.targetRequirement) : null;
  const actualQuantity = task.taskType === 'output' ? parseProductionQuantity(task.actualResult) : null;
  const outputVariance = targetQuantity !== null && actualQuantity !== null ? actualQuantity - targetQuantity : null;
  const productivity = actualQuantity !== null && totalManHours > 0 ? actualQuantity / totalManHours : null;
  return { totalManHours, targetQuantity, actualQuantity, outputVariance, productivity };
};

export const getTaskStatus = (task: ReviewTask): ReviewTaskStatus => {
  if (task.status === 'CLOSED' || task.status === 'CANCELLED') return task.status;
  return task.participants.some((p) => p.status === 'OT IN PROGRESS' || p.status === 'COMPLETED') ? 'IN PROGRESS' : 'PLANNED';
};

const makeParticipants = (employees: ReviewEmployee[], workstation: string): ReviewParticipant[] => employees.map((employee) => ({ employeeId: employee.id, employeeName: employee.name, status: 'NOT STARTED', assignedWorkstation: workstation, actualWorkstation: workstation, actualHours: 0 }));

export const createOutputScenario = (employees: ReviewEmployee[]): ReviewTask => ({
  id: `review-output-${Date.now()}`, date: getSingaporeDate(), department: 'Production', workstation: 'Sacheting / 茶袋包装', product: 'Product ABC', batchNo: '26090301', plannedStart: '18:00', plannedEnd: '21:00', taskType: 'output', targetRequirement: 'Complete 10,000 sachets for Batch 26090301', actualResult: '10,500 sachets completed', completionStatus: 'COMPLETED', status: 'CLOSED', createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
  participants: makeParticipants(employees.slice(0, 4), 'Sacheting / 茶袋包装').map((p, i) => ({ ...p, status: 'COMPLETED', startTime: '18:00', endTime: i < 2 ? '20:38' : '20:37', actualHours: i < 2 ? 2.63 : 2.62 })),
});
export const createNonOutputScenario = (employees: ReviewEmployee[]): ReviewTask => ({
  id: `review-non-output-${Date.now()}`, date: getSingaporeDate(), department: 'Production', workstation: 'Cleaning / 清洁', product: '', batchNo: '', plannedStart: '18:00', plannedEnd: '20:00', taskType: 'non-output', targetRequirement: 'Complete full cleaning and sanitation of Sacheting Line 1', actualResult: 'Cleaning and sanitation completed', completionStatus: 'COMPLETED', status: 'CLOSED', createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
  participants: makeParticipants(employees.slice(0, 3), 'Cleaning / 清洁').map((p) => ({ ...p, status: 'COMPLETED', startTime: '18:00', endTime: '20:00', actualHours: 2 })),
});

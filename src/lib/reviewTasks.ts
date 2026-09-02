export type ReviewTaskType = 'output' | 'non-output';
export type ReviewTaskStatus = 'PLANNED' | 'IN PROGRESS' | 'CLOSED' | 'CANCELLED';
export type ParticipantStatus = 'NOT STARTED' | 'CONFIRMED' | 'OT IN PROGRESS' | 'COMPLETED';
export type ReviewCompletionStatus = 'COMPLETED' | 'PARTIALLY COMPLETED' | 'NOT COMPLETED';

export interface ReviewEmployee { id: string; name: string; department?: string }
export interface ReviewParticipant { employeeId: string; employeeName: string; status: ParticipantStatus; assignedWorkstation: string; actualWorkstation: string; startTime?: string; endTime?: string; actualHours: number }
export interface ReviewTask {
  id: string; date: string; department: string; workstation: string; product: string; batchNo: string;
  plannedStart: string; plannedEnd: string; taskType: ReviewTaskType; targetRequirement: string;
  actualResult?: string; completionStatus?: ReviewCompletionStatus; supervisorNote?: string;
  status: ReviewTaskStatus; participants: ReviewParticipant[]; createdAt: string; closedAt?: string;
}

export const REVIEW_STORAGE_KEY = 'otpro_review_tasks_v2';
export const REVIEW_TASKS_CHANGED = 'otpro-review-tasks-changed';
export const WORKSTATIONS = ['Mixing / 搅拌', 'Oven Drying / 烘干', 'Grinding / 研磨', 'Encapsulation / 进胶囊', 'Polishing / 抛光', 'Blistering / 压板', 'Print Code / 打码', 'Sacheting / 茶袋包装', 'Packing / 包装', 'Cleaning / 清洁', 'Changeover / 转线', 'Other Production Work / 其他生产工作'];

export const loadReviewTasks = (): ReviewTask[] => { try { return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || '[]') as ReviewTask[]; } catch { return []; } };
export const saveReviewTasks = (tasks: ReviewTask[]) => { localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(tasks)); window.dispatchEvent(new Event(REVIEW_TASKS_CHANGED)); };

export const parseProductionQuantity = (text?: string): number | null => {
  if (!text) return null;
  const match = text.match(/\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
};

export const getTaskMetrics = (task: ReviewTask) => {
  const totalManHours = task.participants.reduce((sum, participant) => sum + participant.actualHours, 0);
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
  id: `review-output-${Date.now()}`, date: '2026-09-02', department: 'Production', workstation: 'Sacheting / 茶袋包装', product: 'Review Product A', batchNo: 'RV26090201', plannedStart: '18:00', plannedEnd: '20:37', taskType: 'output', targetRequirement: 'Complete 10,000 sachets for Batch 26090201', actualResult: '10,500 sachets completed', completionStatus: 'COMPLETED', status: 'CLOSED', createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
  participants: makeParticipants(employees.slice(0, 4), 'Sacheting / 茶袋包装').map((p, i) => ({ ...p, status: 'COMPLETED', startTime: '18:00', endTime: i < 2 ? '20:38' : '20:37', actualHours: i < 2 ? 2.63 : 2.62 })),
});
export const createNonOutputScenario = (employees: ReviewEmployee[]): ReviewTask => ({
  id: `review-non-output-${Date.now()}`, date: '2026-09-02', department: 'Production', workstation: 'Cleaning / 清洁', product: '', batchNo: '', plannedStart: '18:00', plannedEnd: '20:00', taskType: 'non-output', targetRequirement: 'Complete line clearance and deep cleaning for the sacheting area', actualResult: 'Cleaning and line clearance completed', completionStatus: 'COMPLETED', status: 'CLOSED', createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
  participants: makeParticipants(employees.slice(0, 3), 'Cleaning / 清洁').map((p) => ({ ...p, status: 'COMPLETED', startTime: '18:00', endTime: '20:00', actualHours: 2 })),
});


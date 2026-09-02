export type ReviewTaskType = 'output' | 'non-output';
export type ReviewTaskStatus = 'PLANNED' | 'IN PROGRESS' | 'CLOSED' | 'CANCELLED';
export type ParticipantStatus = 'NOT STARTED' | 'CONFIRMED' | 'OT IN PROGRESS' | 'COMPLETED';

export interface ReviewParticipant {
  employeeId: string;
  employeeName: string;
  status: ParticipantStatus;
  assignedWorkstation: string;
  actualWorkstation: string;
  startTime?: string;
  endTime?: string;
  actualHours: number;
}

export interface ReviewTask {
  id: string;
  date: string;
  department: string;
  workstation: string;
  product: string;
  batchNo: string;
  plannedStart: string;
  plannedEnd: string;
  taskType: ReviewTaskType;
  targetOutput: number;
  outputUnit: string;
  actualOutput?: number;
  supervisorNote?: string;
  status: ReviewTaskStatus;
  participants: ReviewParticipant[];
  createdAt: string;
  closedAt?: string;
}

export const REVIEW_STORAGE_KEY = 'otpro_review_tasks_v1';
export const REVIEW_EMPLOYEES = [
  { id: 'review-a', name: 'Review Employee A' },
  { id: 'review-b', name: 'Review Employee B' },
  { id: 'review-c', name: 'Review Employee C' },
  { id: 'review-d', name: 'Review Employee D' },
  { id: 'review-e', name: 'Review Employee E' },
  { id: 'review-f', name: 'Review Employee F' },
];

export const WORKSTATIONS = ['Mixing / 搅拌', 'Oven Drying / 烘干', 'Grinding / 研磨', 'Encapsulation / 进胶囊', 'Polishing / 抛光', 'Blistering / 压板', 'Print Code / 打码', 'Sacheting / 茶袋包装', 'Packing / 包装', 'Cleaning / 清洁', 'Changeover / 转线', 'Other Production Work / 其他生产工作'];

export const loadReviewTasks = (): ReviewTask[] => {
  try { return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || '[]') as ReviewTask[]; }
  catch { return []; }
};

export const saveReviewTasks = (tasks: ReviewTask[]) => localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(tasks));

export const getTaskMetrics = (task: ReviewTask) => {
  const totalManHours = task.participants.reduce((sum, participant) => sum + participant.actualHours, 0);
  const outputVariance = task.taskType === 'output' && task.actualOutput !== undefined ? task.actualOutput - task.targetOutput : null;
  const productivity = task.taskType === 'output' && task.actualOutput !== undefined && totalManHours > 0 ? task.actualOutput / totalManHours : null;
  return { totalManHours, outputVariance, productivity };
};

export const getTaskStatus = (task: ReviewTask): ReviewTaskStatus => {
  if (task.status === 'CLOSED' || task.status === 'CANCELLED') return task.status;
  return task.participants.some((participant) => participant.status === 'OT IN PROGRESS' || participant.status === 'COMPLETED') ? 'IN PROGRESS' : 'PLANNED';
};

export const createScenarioTask = (): ReviewTask => ({
  id: `review-${Date.now()}`,
  date: '2026-09-02', department: 'Production', workstation: 'Sacheting / 茶袋包装', product: 'Review Product A', batchNo: 'RV26090201',
  plannedStart: '18:00', plannedEnd: '21:00', taskType: 'output', targetOutput: 10000, outputUnit: 'sachets', status: 'PLANNED', createdAt: new Date().toISOString(),
  participants: REVIEW_EMPLOYEES.slice(0, 4).map((employee) => ({ employeeId: employee.id, employeeName: employee.name, status: 'NOT STARTED', assignedWorkstation: 'Sacheting / 茶袋包装', actualWorkstation: 'Sacheting / 茶袋包装', actualHours: 0 })),
});


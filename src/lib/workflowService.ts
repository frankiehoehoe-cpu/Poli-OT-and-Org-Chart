import type { EmployeeMonthAggregate, PartTimeMonthlyForecast, ShiftNotice, WorkAssignment, WorkSubmission } from './workflows';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string; message?: string };
  if (!response.ok) throw new Error(result.message || result.error || `Request failed (${response.status})`);
  return result;
}

export const workflowService = {
  async assignments(): Promise<WorkAssignment[]> {
    return (await api<{ assignments: WorkAssignment[] }>('/api/v13/assignments')).assignments;
  },
  async saveAssignment(assignment: Partial<WorkAssignment>, existing?: WorkAssignment): Promise<WorkAssignment> {
    if (existing) {
      return (await api<{ assignment: WorkAssignment }>('/api/v13/assignments', {
        method: 'PATCH', body: JSON.stringify({ id: existing.id, action: 'edit', expectedRevision: existing.revision, assignment })
      })).assignment;
    }
    return (await api<{ assignment: WorkAssignment }>('/api/v13/assignments', { method: 'POST', body: JSON.stringify(assignment) })).assignment;
  },
  async assignmentAction(assignment: WorkAssignment, action: 'cancel' | 'close' | 'late-close', details: Record<string, unknown> = {}): Promise<WorkAssignment> {
    return (await api<{ assignment: WorkAssignment }>('/api/v13/assignments', {
      method: 'PATCH', body: JSON.stringify({ id: assignment.id, action, expectedRevision: assignment.revision, ...details })
    })).assignment;
  },
  async submissions(month?: string): Promise<WorkSubmission[]> {
    return (await api<{ submissions: WorkSubmission[] }>(`/api/v13/submissions${month ? `?month=${encodeURIComponent(month)}` : ''}`)).submissions;
  },
  async submit(input: Record<string, unknown>): Promise<WorkSubmission> {
    return (await api<{ submission: WorkSubmission }>('/api/v13/submissions', { method: 'POST', body: JSON.stringify(input) })).submission;
  },
  async correct(id: string, correction: { hours?: number; start?: string; end?: string; note: string }): Promise<WorkSubmission> {
    return (await api<{ submission: WorkSubmission }>('/api/v13/submissions', { method: 'PATCH', body: JSON.stringify({ id, ...correction }) })).submission;
  },
  async notices(): Promise<ShiftNotice[]> {
    return (await api<{ notices: ShiftNotice[] }>('/api/v13/shift-notices')).notices;
  },
  async createNotice(notice: Partial<ShiftNotice>): Promise<ShiftNotice> {
    return (await api<{ notice: ShiftNotice }>('/api/v13/shift-notices', { method: 'POST', body: JSON.stringify(notice) })).notice;
  },
  async noticeAction(id: string, action: 'end' | 'visibility', visibility?: ShiftNotice['visibility']): Promise<ShiftNotice> {
    return (await api<{ notice: ShiftNotice }>('/api/v13/shift-notices', { method: 'PATCH', body: JSON.stringify({ id, action, visibility }) })).notice;
  },
  async month(month: string): Promise<{ aggregates: EmployeeMonthAggregate[]; forecasts: Array<PartTimeMonthlyForecast & { employeeId: string; employeeName: string }> }> {
    return api(`/api/v13/month?month=${encodeURIComponent(month)}`);
  }
};

/**
 * Main state and types for the Overtime Tracker
 */

export type Role = 'employee' | 'supervisor' | 'manager';

export interface UserProfile {
  id: string;
  name: string;
  role: Role;
  department?: string;
}

export interface RosterAssignment {
  id: string;
  date: string;
  employeeId: string;
  location: string;    // 'Yi Xin' | 'Kallang' | 'Bedok' | 'Unassigned'
  subLocation?: string; 
  createdAt?: any;
}

export interface OvertimeEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  multiplier: number;
  remarks?: string;
  verified: boolean;
  status?: EntryStatus;
  verifiedAt?: any;
  createdAt: any;
}

export interface OvertimePlan {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  createdAt: any;
}

export interface OvertimeSummary {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  entryCount: number;
  averageHours: number;
  unverifiedCount: number;
  unverifiedHours: number;
}

export type EntryStatus = 'pending' | 'verified' | 'rejected';

export interface MonthlyReport {
  id: string;
  month: string;
  signature: string;
  type: 'draw' | 'upload' | 'text';
  createdAt: any;
  updatedAt?: any;
}

export interface OrgNode {
  id: string;
  name: string;
  roleName: string;
  email: string;
  ext: string;
  parentId: string | null;
  x?: number;
  y?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface OrgChartSettings {
  showInPublicView: boolean;
}


import { createServerDocument, getEmployee, getServerDocument, listEmployees, listServerDocuments, updateServerDocument, type ServerEmployee } from './_firebaseAdmin.js';
import { getV13Collections, isV13IsolatedTestMode } from './_v13Collections.js';
import type { EmploymentType } from '../src/lib/workflows.js';

export interface EmployeeOverride {
  employeeId: string;
  employmentType: EmploymentType;
  updatedAt: string;
  updatedBy: string;
}

export const resolveEmploymentType = (
  realEmploymentType?: EmploymentType,
  isolatedOverride?: EmploymentType
): EmploymentType => isolatedOverride ?? realEmploymentType ?? 'full-time';

export async function listEffectiveEmployees(): Promise<ServerEmployee[]> {
  const employees = await listEmployees();
  if (!isV13IsolatedTestMode()) return employees;
  const overrides = await listServerDocuments<EmployeeOverride>(getV13Collections().employeeOverrides);
  const byId = new Map(overrides.map((item) => [item.id, item.data.employmentType]));
  return employees.map((employee) => ({ ...employee, employmentType: resolveEmploymentType(employee.employmentType, byId.get(employee.id)) }));
}

export async function getEffectiveEmployee(employeeId: string): Promise<ServerEmployee | null> {
  const employee = await getEmployee(employeeId);
  if (!employee || !isV13IsolatedTestMode()) return employee;
  const override = await getServerDocument<EmployeeOverride>(getV13Collections().employeeOverrides, employeeId);
  return { ...employee, employmentType: resolveEmploymentType(employee.employmentType, override?.data.employmentType) };
}

export async function setIsolatedEmploymentType(employeeId: string, employmentType: EmploymentType, updatedBy: string): Promise<void> {
  const collection = getV13Collections().employeeOverrides;
  const existing = await getServerDocument<EmployeeOverride>(collection, employeeId);
  const data: EmployeeOverride = { employeeId, employmentType, updatedAt: new Date().toISOString(), updatedBy };
  if (existing) await updateServerDocument(collection, employeeId, data as unknown as Record<string, unknown>, existing.updateTime);
  else await createServerDocument(collection, employeeId, data as unknown as Record<string, unknown>);
}

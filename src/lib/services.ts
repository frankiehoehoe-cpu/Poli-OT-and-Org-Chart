import { 
  collection, 
  addDoc, 
  query, 
  Query,
  DocumentData,
  where, 
  getDocs, 
  serverTimestamp, 
  orderBy, 
  updateDoc, 
  doc, 
  getDoc,
  deleteDoc,
  limit,
  setDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile, OvertimeEntry, OvertimePlan, OrgNode, OrgChartSettings } from '../types';

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getAllowedStartDate(requestedStartDate: string): string {
  const role = sessionStorage.getItem('userRole');
  if (role === 'manager') {
    // Managers can see all data (经理可以浏览所有数据)
    return requestedStartDate;
  }
  
  if (role === 'supervisor') {
    // Supervisors can see the last 1 month (approx 30 days) of data (主管登录只可以浏览近1个月数据)
    const thirtyDaysAgo = getDateDaysAgo(30);
    return requestedStartDate > thirtyDaysAgo ? requestedStartDate : thirtyDaysAgo;
  }
  
  // Others / Employees can only see the last 10 days of data (其它人员登录，只可以浏览近10日数据)
  const tenDaysAgo = getDateDaysAgo(10);
  return requestedStartDate > tenDaysAgo ? requestedStartDate : tenDaysAgo;
}

let employeeCache: UserProfile[] | null = null;
let employeeCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const employeeService = {
  async createEmployee(name: string, password: string, department: string = 'deptOther'): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'employees'), {
        name,
        password,
        department,
        role: 'employee',
        createdAt: serverTimestamp()
      });
      // Invalidate cache
      employeeCache = null;
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'employees');
      return '';
    }
  },

  async getAllEmployees(): Promise<UserProfile[]> {
    try {
      if (employeeCache && Date.now() - employeeCacheTime < CACHE_DURATION) {
        return [...employeeCache];
      }

      const response = await fetch('/api/employees', { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`Employee service unavailable (${response.status})`);
      const result = await response.json() as { employees: UserProfile[] };
      employeeCache = result.employees;
      employeeCacheTime = Date.now();
      
      return [...employeeCache];
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'employees');
      return [];
    }
  },

  async getEmployeeById(id: string): Promise<UserProfile | null> {
    try {
      return (await this.getAllEmployees()).find(employee => employee.id === id) || null;
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `employees/${id}`);
      return null;
    }
  },

  async updateEmployee(id: string, name: string, password: string | undefined, department: string): Promise<void> {
    try {
      const docRef = doc(db, 'employees', id);
      await updateDoc(docRef, { name, ...(password ? { password } : {}), department, updatedAt: serverTimestamp() });
      employeeCache = null;
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `employees/${id}`);
    }
  },

  async updateEmployeeDepartment(id: string, department: string): Promise<void> {
    try {
      const docRef = doc(db, 'employees', id);
      await updateDoc(docRef, {
        department,
        updatedAt: serverTimestamp()
      });
      employeeCache = null;
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `employees/${id}`);
    }
  },

  async deleteEmployee(id: string): Promise<void> {
    try {
      const docRef = doc(db, 'employees', id);
      await deleteDoc(docRef);
      employeeCache = null;
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `employees/${id}`);
    }
  }
  ,

  async verifyEmployee(employeeId: string, password: string): Promise<{ verified: boolean; employee?: UserProfile }> {
    try {
      const response = await fetch('/api/employee/verify', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ employeeId, password }) });
      if (!response.ok) return { verified: false };
      return await response.json() as { verified: boolean; employee?: UserProfile };
    } catch {
      return { verified: false };
    }
  }
};

let getEmployeeEntriesCache: Record<string, { data: OvertimeEntry[], time: number }> = {};
let getAllEntriesCache: Record<string, { data: OvertimeEntry[], time: number }> = {};
const ENTRIES_CACHE_DURATION = 30 * 1000;

export const overtimeService = {
  async addEntry(employeeId: string, employeeName: string, date: string, startTime: string, endTime: string, totalHours: number, multiplier: number, remarks: string = ''): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'overtime'), {
        employeeId,
        employeeName,
        date,
        startTime,
        endTime,
        totalHours,
        multiplier,
        remarks,
        verified: false,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      getEmployeeEntriesCache = {}; getAllEntriesCache = {};
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'overtime');
      return '';
    }
  },

  async getEmployeeEntries(employeeId: string, month?: string): Promise<OvertimeEntry[]> {
    try {
      const cacheKey = `${employeeId}-${month || 'default'}-${sessionStorage.getItem('userRole') || 'default'}`;
      if (getEmployeeEntriesCache[cacheKey] && Date.now() - getEmployeeEntriesCache[cacheKey].time < ENTRIES_CACHE_DURATION) {
        return [...getEmployeeEntriesCache[cacheKey].data];
      }

      // Enforce Time Boundaries (时间范围限制)
      const targetMonth = month || new Date().toISOString().slice(0, 7);
      const startDate = `${targetMonth}-01`;
      const endDate = `${targetMonth}-31`;

      const allowedStart = getAllowedStartDate(startDate);

      // Implement Strict Limit (严格限制)
      const q = query(
        collection(db, 'overtime'), 
        where('employeeId', '==', employeeId),
        where('date', '>=', allowedStart),
        where('date', '<=', endDate),
        limit(50)
      );
      
      const snapshot = await getDocs(q);
      let entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OvertimeEntry[];

      // Sort in memory to avoid composite index requirements
      const sorted = entries.sort((a, b) => a.date.localeCompare(b.date));
      getEmployeeEntriesCache[cacheKey] = { data: sorted, time: Date.now() };
      return [...sorted];
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'overtime');
      return [];
    }
  },

  async getAllEntries(month?: string): Promise<OvertimeEntry[]> {
    try {
      const cacheKey = `${month || 'default'}-${sessionStorage.getItem('userRole') || 'default'}`;
      if (getAllEntriesCache[cacheKey] && Date.now() - getAllEntriesCache[cacheKey].time < ENTRIES_CACHE_DURATION) {
        return [...getAllEntriesCache[cacheKey].data];
      }

      // Enforce Time Boundaries: Always fetch max 1 month to prevent runaway reads
      const targetMonth = month || new Date().toISOString().slice(0, 7);
      const start = `${targetMonth}-01`;
      const end = `${targetMonth}-31`;

      const allowedStart = getAllowedStartDate(start);

      const q = query(
        collection(db, 'overtime'), 
        where('date', '>=', allowedStart),
        where('date', '<=', end),
        limit(2000)
      );
      
      const snapshot = await getDocs(q);
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OvertimeEntry[];
      
      // Sort in memory to avoid composite index requirements
      const sorted = entries.sort((a, b) => a.date.localeCompare(b.date));
      getAllEntriesCache[cacheKey] = { data: sorted, time: Date.now() };
      return [...sorted];
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'overtime');
      return [];
    }
  },

  async verifyEntry(entryId: string): Promise<void> {
    try {
      const docRef = doc(db, 'overtime', entryId);
      await updateDoc(docRef, {
        verified: true,
        status: 'verified',
        verifiedAt: serverTimestamp()
      });
      getEmployeeEntriesCache = {}; getAllEntriesCache = {};
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `overtime/${entryId}`);
    }
  },

  async rejectEntry(entryId: string): Promise<void> {
    try {
      const docRef = doc(db, 'overtime', entryId);
      await updateDoc(docRef, {
        verified: false,
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });
      getEmployeeEntriesCache = {}; getAllEntriesCache = {};
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `overtime/${entryId}`);
    }
  },

  async updateEntry(entryId: string, date: string, startTime: string, endTime: string, totalHours: number, multiplier: number, remarks: string = ''): Promise<void> {
    try {
      const docRef = doc(db, 'overtime', entryId);
      await updateDoc(docRef, {
        date,
        startTime,
        endTime,
        totalHours,
        multiplier,
        remarks,
        verified: false,
        status: 'pending',
        updatedAt: serverTimestamp()
      });
      getEmployeeEntriesCache = {}; getAllEntriesCache = {};
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `overtime/${entryId}`);
    }
  },

  async deleteEntry(entryId: string): Promise<void> {
    try {
      const docRef = doc(db, 'overtime', entryId);
      await deleteDoc(docRef);
      getEmployeeEntriesCache = {}; getAllEntriesCache = {};
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `overtime/${entryId}`);
    }
  }
};

let planCache: Record<string, { data: OvertimePlan[], time: number }> = {};
const PLAN_CACHE_DURATION = 60 * 1000;

export const planService = {
  async addPlan(employeeId: string, employeeName: string, date: string): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'plans'), {
        employeeId,
        employeeName,
        date,
        createdAt: serverTimestamp()
      });
      planCache = {};
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'plans');
      return '';
    }
  },

  async getPlansByDate(date: string): Promise<OvertimePlan[]> {
    try {
      const allowedStart = getAllowedStartDate(date);
      if (date < allowedStart) {
        return [];
      }
      const q = query(collection(db, 'plans'), where('date', '==', date), limit(200));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OvertimePlan[];
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'plans');
      return [];
    }
  },

  async getAllPlansForMonth(month: string): Promise<OvertimePlan[]> {
    try {
      const cacheKey = `${month}-${sessionStorage.getItem('userRole') || 'default'}`;
      if (planCache[cacheKey] && Date.now() - planCache[cacheKey].time < PLAN_CACHE_DURATION) {
        return [...planCache[cacheKey].data];
      }
      const start = `${month}-01`;
      const end = `${month}-31`;
      const allowedStart = getAllowedStartDate(start);
      const q = query(
        collection(db, 'plans'), 
        where('date', '>=', allowedStart),
        where('date', '<=', end),
        limit(2000)
      );
      const snapshot = await getDocs(q);
      const plans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OvertimePlan[];
      planCache[cacheKey] = { data: plans, time: Date.now() };
      return [...plans];
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'plans');
      return [];
    }
  },

  async deletePlan(planId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'plans', planId));
      planCache = {};
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `plans/${planId}`);
    }
  },

  async clearAllPlans(): Promise<void> {
    try {
      const q = query(collection(db, 'plans'), limit(500));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'plans', d.id)));
      await Promise.all(deletePromises);
      planCache = {};
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'plans');
    }
  }
};

export const adminService = {
  async clearAllOvertimeData(): Promise<void> {
    try {
      // Clear overtime entries
      const otQuery = query(collection(db, 'overtime'), limit(500));
      const otSnapshot = await getDocs(otQuery);
      const otDeletes = otSnapshot.docs.map(d => deleteDoc(doc(db, 'overtime', d.id)));
      
      // Clear plans
      const planQuery = query(collection(db, 'plans'), limit(500));
      const planSnapshot = await getDocs(planQuery);
      const planDeletes = planSnapshot.docs.map(d => deleteDoc(doc(db, 'plans', d.id)));
      
      // Clear reports
      const reportQuery = query(collection(db, 'monthlyReports'), limit(500));
      const reportSnapshot = await getDocs(reportQuery);
      const reportDeletes = reportSnapshot.docs.map(d => deleteDoc(doc(db, 'monthlyReports', d.id)));

      await Promise.all([...otDeletes, ...planDeletes, ...reportDeletes]);
    } catch (e) {
      console.error('Error clearing data:', e);
      throw e;
    }
  }
};

export const reportService = {
  async saveMonthlyReport(month: string, employeeId: string, signature: string, type: 'draw' | 'upload' | 'text', signedBy?: string, role: string = 'supervisor'): Promise<string> {
    try {
      const q = query(
        collection(db, 'monthlyReports'), 
        where('month', '==', month),
        where('employeeId', '==', employeeId),
        where('role', '==', role),
        limit(1)
      );
      const existing = await getDocs(q);
      
      if (!existing.empty) {
        const reportDoc = existing.docs[0];
        await updateDoc(doc(db, 'monthlyReports', reportDoc.id), {
          signature,
          type,
          role,
          signedBy: signedBy || '',
          updatedAt: serverTimestamp()
        });
        return reportDoc.id;
      } else {
        const docRef = await addDoc(collection(db, 'monthlyReports'), {
          month,
          employeeId,
          signature,
          type,
          role,
          signedBy: signedBy || '',
          createdAt: serverTimestamp()
        });
        return docRef.id;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'monthlyReports');
      return '';
    }
  },

  async getMonthlyReport(month: string, employeeId: string, role: string = 'supervisor') {
    try {
      const q = query(
        collection(db, 'monthlyReports'), 
        where('month', '==', month),
        where('employeeId', '==', employeeId),
        where('role', '==', role),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'monthlyReports');
      return null;
    }
  },

  async getAllMonthlyReportsForMonth(month: string, role: string = 'supervisor') {
    try {
      const q = query(
        collection(db, 'monthlyReports'), 
        where('month', '==', month),
        where('role', '==', role),
        limit(500)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'monthlyReports');
      return [];
    }
  }
};

export const rosterService = {
  async getAssignmentsByDate(date: string) {
    try {
      const q = query(
        collection(db, 'rosters'),
        where('date', '==', date),
        limit(300)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.error('Failed to get assignments', e);
      return [];
    }
  },

  async updateAssignment(employeeId: string, date: string, location: string, subLocation: string = '') {
    try {
      // Find existing
      const q = query(
        collection(db, 'rosters'),
        where('date', '==', date),
        where('employeeId', '==', employeeId),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        if (location === 'Unassigned') {
           await deleteDoc(doc(db, 'rosters', snapshot.docs[0].id));
        } else {
           await updateDoc(doc(db, 'rosters', snapshot.docs[0].id), {
             location,
             subLocation,
             updatedAt: serverTimestamp()
           });
        }
      } else if (location !== 'Unassigned') {
        await addDoc(collection(db, 'rosters'), {
          date,
          employeeId,
          location,
          subLocation,
          createdAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error('Failed to update assignment', e);
    }
  }
};

export const locationService = {
  async getAllLocations() {
    try {
      const q = query(collection(db, 'locations'), limit(50));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        // Seed default locations if none exist
        const DEFAULT_LOCATIONS = [
          { name: 'Yi Xiu', sub: ['Mixing', 'OO', 'AAA', 'General Team'] },
          { name: 'Kallang', sub: ['Packing', 'QA', 'General Team'] },
          { name: 'Bedok', sub: ['Storage', 'Assembly', 'General Team'] }
        ];
        
        for (const loc of DEFAULT_LOCATIONS) {
          await addDoc(collection(db, 'locations'), {
            name: loc.name,
            sub: loc.sub,
            createdAt: serverTimestamp()
          });
        }
        
        const newQ = query(collection(db, 'locations'), limit(50));
        const newSnapshot = await getDocs(newQ);
        return newSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
      
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      // ensure Yi Xin is renamed to Yi Xiu in data returned if not updated
      const yixin = docs.find(d => d.name === 'Yi Xin');
      if (yixin) {
        yixin.name = 'Yi Xiu';
        await updateDoc(doc(db, 'locations', yixin.id), { name: 'Yi Xiu' });
      }
      return docs;
    } catch (e) {
      console.error('Failed to get locations', e);
      return [];
    }
  },

  async updateLocationSubs(locationId: string, sub: string[]) {
    try {
      await updateDoc(doc(db, 'locations', locationId), {
        sub,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to update location subs', e);
    }
  }
};

export const orgChartService = {
  async getNodes(): Promise<OrgNode[]> {
    try {
      const q = query(collection(db, 'orgChartNodes'), limit(100));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return [];
      }
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OrgNode[];
    } catch (e) {
      console.error('Failed to get org chart nodes:', e);
      return [];
    }
  },

  async saveNode(node: OrgNode): Promise<void> {
    try {
      const docRef = doc(db, 'orgChartNodes', node.id);
      const dataToSave: any = {
        name: node.name,
        roleName: node.roleName,
        email: node.email,
        ext: node.ext,
        parentId: node.parentId,
        updatedAt: serverTimestamp()
      };
      if (node.x !== undefined) dataToSave.x = node.x;
      if (node.y !== undefined) dataToSave.y = node.y;
      await setDoc(docRef, dataToSave, { merge: true });
    } catch (e) {
      console.error('Failed to save org chart node:', e);
    }
  },

  async deleteNode(nodeId: string): Promise<void> {
    try {
      const docRef = doc(db, 'orgChartNodes', nodeId);
      await deleteDoc(docRef);
    } catch (e) {
      console.error('Failed to delete org chart node:', e);
    }
  },

  async updateNodeParent(nodeId: string, parentId: string | null): Promise<void> {
    try {
      const docRef = doc(db, 'orgChartNodes', nodeId);
      await updateDoc(docRef, {
        parentId,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to update node parent:', e);
    }
  },

  async updateNodePosition(nodeId: string, x: number, y: number): Promise<void> {
    try {
      const docRef = doc(db, 'orgChartNodes', nodeId);
      await updateDoc(docRef, {
        x,
        y,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to update node position:', e);
    }
  },

  async getSettings(): Promise<OrgChartSettings> {
    try {
      const docRef = doc(db, 'orgChartSettings', 'config');
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return snapshot.data() as OrgChartSettings;
      }
      return { showInPublicView: false };
    } catch (e) {
      console.error('Failed to get org chart settings:', e);
      return { showInPublicView: false };
    }
  },

  async updateSettings(showInPublicView: boolean): Promise<void> {
    try {
      const docRef = doc(db, 'orgChartSettings', 'config');
      await setDoc(docRef, { showInPublicView }, { merge: true });
    } catch (e) {
      console.error('Failed to update org chart settings:', e);
    }
  }
};



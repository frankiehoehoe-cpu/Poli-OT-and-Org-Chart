import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  useDraggable
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { UserProfile, RosterAssignment } from './types';
import { rosterService, employeeService, locationService } from './lib/services';
import {
  Calendar,
  User,
  Truck,
  Wrench,
  Box,
  Building2,
  LayoutGrid,
  Plus,
  Pencil,
  Check,
  Trash2,
  ChevronUp,
  ChevronDown,
  Search,
  X,
  RotateCcw,
  Users,
  MousePointer2
} from 'lucide-react';

interface LocationSite {
  id?: string;
  name: string;
  sub: string[];
}

const DEPARTMENTS = [
  { id: 'deptProduction', name: 'Production / 生产', short: 'Production', icon: Box },
  { id: 'deptWarehouse', name: 'Warehouse / 仓库', short: 'Warehouse', icon: LayoutGrid },
  { id: 'deptDriver', name: 'Driver / 司机', short: 'Driver', icon: Truck },
  { id: 'deptMaintenance', name: 'Maintenance / 维修', short: 'Maintenance', icon: Wrench },
  { id: 'deptOther', name: 'Others / 其他', short: 'Others', icon: User }
] as const;

const departmentLabel = (department?: string) =>
  DEPARTMENTS.find((item) => item.id === department)?.short || 'Others';

const employeeInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

const EmployeePill = ({
  employee,
  selected,
  onSelect,
  compact = false
}: {
  employee: UserProfile;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: employee.id,
    data: { employee }
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={`group flex cursor-grab items-center gap-2 rounded-xl border px-2.5 py-2 shadow-sm transition-all active:cursor-grabbing ${
        selected
          ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100'
          : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
      } ${isDragging ? 'opacity-40' : 'opacity-100'}`}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${
          selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {selected ? <Check className="h-3.5 w-3.5" /> : employeeInitials(employee.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black text-slate-800" translate="no">{employee.name}</p>
        {!compact && <p className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">{departmentLabel(employee.department)}</p>}
      </div>
    </div>
  );
};

const UnassignedDropArea = ({
  children,
  selectedCount,
  onReturnSelected
}: {
  children: React.ReactNode;
  selectedCount: number;
  onReturnSelected: () => void;
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: 'Unassigned' });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[180px] rounded-2xl border-2 border-dashed p-2 transition-colors ${
        isOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50/70'
      }`}
      onClick={() => {
        if (selectedCount > 0) onReturnSelected();
      }}
    >
      {selectedCount > 0 && (
        <div className="mb-2 flex items-center justify-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-700">
          <RotateCcw className="h-3.5 w-3.5" />
          CLICK HERE TO RETURN {selectedCount} / 点击移回待分配
        </div>
      )}
      {children}
    </div>
  );
};

const WorkstationZone = ({
  id,
  title,
  assignedEmployees,
  selectedIds,
  toggleSelected,
  selectedCount,
  onAssignSelected,
  customHeader
}: {
  id: string;
  title: string;
  assignedEmployees: UserProfile[];
  selectedIds: Set<string>;
  toggleSelected: (employeeId: string) => void;
  selectedCount: number;
  onAssignSelected: () => void;
  customHeader?: React.ReactNode;
}) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`overflow-hidden rounded-2xl border transition-all ${
        isOver
          ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100'
          : selectedCount > 0
            ? 'border-indigo-200 bg-white hover:border-indigo-400'
            : 'border-slate-200 bg-white'
      }`}
    >
      {customHeader || (
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
          <span className="truncate text-[11px] font-black uppercase tracking-wide text-slate-700">{title}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">{assignedEmployees.length}</span>
        </div>
      )}

      <div
        className={`min-h-[88px] p-2 ${
          selectedCount > 0 ? 'cursor-pointer' : ''
        }`}
        onClick={() => {
          if (selectedCount > 0) onAssignSelected();
        }}
      >
        {selectedCount > 0 && (
          <div className="mb-2 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-50 px-2 py-2 text-[10px] font-black text-indigo-700">
            <MousePointer2 className="h-3.5 w-3.5" />
            ASSIGN {selectedCount} HERE / 分配到这里
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {assignedEmployees.map((employee) => (
            <EmployeePill
              key={employee.id}
              employee={employee}
              selected={selectedIds.has(employee.id)}
              onSelect={() => toggleSelected(employee.id)}
              compact
            />
          ))}
        </div>
        {assignedEmployees.length === 0 && selectedCount === 0 && (
          <div className="flex min-h-[64px] items-center justify-center text-center text-[10px] font-bold text-slate-300">
            Drop staff here / 拖入员工
          </div>
        )}
      </div>
    </div>
  );
};

export default function RosterBoard() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);
  const [activeEmployee, setActiveEmployee] = useState<UserProfile | null>(null);
  const [locations, setLocations] = useState<LocationSite[]>([]);

  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [addingZoneLoc, setAddingZoneLoc] = useState<string | null>(null);
  const [zoneInput, setZoneInput] = useState('');

  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchData();
    setSelectedIds(new Set());
  }, [date]);

  const fetchData = async () => {
    try {
      const [emps, asgs, locs] = await Promise.all([
        employeeService.getAllEmployees(),
        rosterService.getAssignmentsByDate(date),
        locationService.getAllLocations()
      ]);

      setEmployees(emps);
      const sortedLocs = locs
        .map((location: any) => ({ ...location, docId: location.id, id: location.name }))
        .sort((a: any, b: any) => {
          const order = ['Yi Xiu', 'Kallang', 'Bedok'];
          const aIndex = order.indexOf(a.name);
          const bIndex = order.indexOf(b.name);
          if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });

      const filteredLocs = sortedLocs.filter((location: any) => ['Yi Xiu', 'Kallang', 'Bedok'].includes(location.name));
      const uniqueLocs: any[] = [];
      const seenNames = new Set<string>();

      for (const location of filteredLocs) {
        if (seenNames.has(location.name)) continue;
        seenNames.add(location.name);

        const originalSubs = location.sub || [];
        const uniqueSubs: string[] = [];
        const seenSubs = new Set<string>();

        for (const sub of originalSubs) {
          const trimmed = String(sub).trim();
          if (trimmed && !seenSubs.has(trimmed.toLowerCase())) {
            seenSubs.add(trimmed.toLowerCase());
            uniqueSubs.push(trimmed);
          }
        }

        if (originalSubs.length !== uniqueSubs.length && location.docId) {
          try {
            await locationService.updateLocationSubs(location.docId, uniqueSubs);
          } catch (error) {
            console.error('Failed to self-heal duplicate sub-locations in DB:', error);
          }
        }

        uniqueLocs.push({ ...location, sub: uniqueSubs });
      }

      setLocations(uniqueLocs as (LocationSite & { docId: string })[]);

      const healedAssignments = (asgs as RosterAssignment[]).map((assignment) => {
        const matchingLocation = uniqueLocs.find((location) => location.name === assignment.location);
        if (matchingLocation?.sub?.length) {
          if (!assignment.subLocation || !matchingLocation.sub.includes(assignment.subLocation)) {
            return { ...assignment, subLocation: matchingLocation.sub[0] };
          }
        }
        return assignment;
      });

      setAssignments(healedAssignments);
      setMessage(null);
    } catch (error) {
      console.error('Error fetching roster data:', error);
      setMessage({ type: 'error', text: 'Unable to load roster / 无法读取调度资料' });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const assignedEmployeeIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.employeeId)),
    [assignments]
  );

  const unassignedEmployees = useMemo(
    () => employees.filter((employee) => !assignedEmployeeIds.has(employee.id)),
    [employees, assignedEmployeeIds]
  );

  const filteredUnassigned = useMemo(() => {
    const query = search.trim().toLowerCase();
    return unassignedEmployees
      .filter((employee) => {
        if (departmentFilter !== 'ALL') {
          const effectiveDepartment = employee.department || 'deptOther';
          if (departmentFilter === 'deptOther') {
            if (['deptProduction', 'deptWarehouse', 'deptDriver', 'deptMaintenance'].includes(effectiveDepartment)) return false;
          } else if (effectiveDepartment !== departmentFilter) return false;
        }
        if (!query) return true;
        return employee.name.toLowerCase().includes(query) || departmentLabel(employee.department).toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [unassignedEmployees, search, departmentFilter]);

  const locationCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const location of locations) {
      result[location.name] = assignments.filter((assignment) => assignment.location === location.name).length;
    }
    return result;
  }, [locations, assignments]);

  const toggleSelected = (employeeId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const selectVisibleUnassigned = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredUnassigned.forEach((employee) => next.add(employee.id));
      return next;
    });
  };

  const optimisticMove = (employeeIds: string[], location: string, subLocation = '') => {
    setAssignments((current) => {
      const idSet = new Set(employeeIds);
      const filtered = current.filter((assignment) => !idSet.has(assignment.employeeId));
      if (location === 'Unassigned') return filtered;
      return [
        ...filtered,
        ...employeeIds.map((employeeId, index) => ({
          id: `temp-${employeeId}-${Date.now()}-${index}`,
          date,
          employeeId,
          location,
          subLocation
        }))
      ];
    });
  };

  const persistMoves = async (employeeIds: string[], location: string, subLocation = '') => {
    if (!employeeIds.length || saving) return;
    setSaving(true);
    setMessage(null);
    optimisticMove(employeeIds, location, subLocation);

    try {
      await Promise.all(
        employeeIds.map((employeeId) => rosterService.updateAssignment(employeeId, date, location, subLocation))
      );
      setSelectedIds(new Set());
      setMessage({
        type: 'success',
        text: location === 'Unassigned'
          ? `${employeeIds.length} staff returned to Unassigned / 已移回待分配`
          : `${employeeIds.length} staff → ${location} · ${subLocation}`
      });
    } catch (error) {
      console.error('Roster move failed:', error);
      await fetchData();
      setMessage({ type: 'error', text: 'Assignment failed. Roster reloaded / 分配失败，已重新读取资料' });
    } finally {
      setSaving(false);
    }
  };

  const changeSelectedDepartment = async (department: string) => {
    const ids = [...selectedIds];
    if (!ids.length || !department) return;
    setSaving(true);
    setMessage(null);
    try {
      setEmployees((current) =>
        current.map((employee) => ids.includes(employee.id) ? { ...employee, department } : employee)
      );
      await Promise.all(ids.map((employeeId) => employeeService.updateEmployeeDepartment(employeeId, department)));
      setMessage({ type: 'success', text: `${ids.length} staff department updated / 部门已更新` });
    } catch (error) {
      console.error('Department update failed:', error);
      await fetchData();
      setMessage({ type: 'error', text: 'Department update failed / 部门更新失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const employee = employees.find((item) => item.id === event.active.id);
    if (employee) setActiveEmployee(employee);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveEmployee(null);
    const { active, over } = event;
    if (!over) return;

    const employeeId = String(active.id);
    const target = String(over.id);

    if (target === 'Unassigned') {
      await persistMoves([employeeId], 'Unassigned');
      return;
    }

    const [location, subLocation = ''] = target.split('|');
    if (!location || !subLocation) return;
    await persistMoves([employeeId], location, subLocation);
  };

  const handleEditZone = (locationId: string, index: number, currentName: string) => {
    setEditingZone(`${locationId}|${index}`);
    setZoneInput(currentName);
  };

  const saveZoneName = async (locationId: string, index: number) => {
    if (!zoneInput.trim()) return;
    const location = (locations as (LocationSite & { docId: string })[]).find((item) => item.id === locationId);
    if (!location) return;

    const newSubs = [...location.sub];
    if (index === -1) newSubs.push(zoneInput.trim());
    else newSubs[index] = zoneInput.trim();

    setLocations((current) => current.map((item) => item.id === locationId ? { ...item, sub: newSubs } : item));
    setEditingZone(null);
    setAddingZoneLoc(null);
    setZoneInput('');

    if (location.docId) await locationService.updateLocationSubs(location.docId, newSubs);
  };

  const deleteZone = async (locationId: string, index: number) => {
    const location = (locations as (LocationSite & { docId: string })[]).find((item) => item.id === locationId);
    if (!location) return;

    const zoneName = location.sub[index];
    if (!window.confirm(`Delete "${zoneName}"? / 确定删除该区域？`)) return;

    const newSubs = location.sub.filter((_, currentIndex) => currentIndex !== index);
    setLocations((current) => current.map((item) => item.id === locationId ? { ...item, sub: newSubs } : item));

    const affectedIds = assignments
      .filter((assignment) => assignment.location === locationId && assignment.subLocation === zoneName)
      .map((assignment) => assignment.employeeId);

    if (affectedIds.length) await persistMoves(affectedIds, 'Unassigned');
    if (location.docId) await locationService.updateLocationSubs(location.docId, newSubs);
  };

  const moveZone = async (locationId: string, index: number, direction: 'up' | 'down') => {
    const location = (locations as (LocationSite & { docId: string })[]).find((item) => item.id === locationId);
    if (!location) return;

    const newSubs = [...location.sub];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSubs.length) return;

    [newSubs[index], newSubs[targetIndex]] = [newSubs[targetIndex], newSubs[index]];
    setLocations((current) => current.map((item) => item.id === locationId ? { ...item, sub: newSubs } : item));
    if (location.docId) await locationService.updateLocationSubs(location.docId, newSubs);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">DAILY MANPOWER DISPATCH / 每日人手调度</p>
            <h2 className="mt-1 text-2xl font-black text-slate-900">Roster / 调度</h2>
          </div>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-700">
            <Calendar className="h-5 w-5 text-indigo-500" />
            <span className="text-xs uppercase tracking-widest">Roster Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="bg-transparent font-black outline-none"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className={`rounded-2xl border p-3 ${unassignedEmployees.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">UNASSIGNED / 待分配</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{unassignedEmployees.length}</p>
          </div>
          {['Yi Xiu', 'Kallang', 'Bedok'].map((location) => (
            <div key={location} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{location}</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{locationCounts[location] || 0}</p>
            </div>
          ))}
        </div>
      </div>

      {message && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${
          message.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="self-start lg:sticky lg:top-4">
            <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">AVAILABLE STAFF</p>
                    <p className="text-lg font-black text-slate-900">待分配员工</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{unassignedEmployees.length}</span>
                </div>

                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search staff / 搜索员工"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm font-bold outline-none focus:border-indigo-300"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDepartmentFilter('ALL')}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                      departmentFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    ALL
                  </button>
                  {DEPARTMENTS.map((department) => (
                    <button
                      key={department.id}
                      type="button"
                      onClick={() => setDepartmentFilter(department.id)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                        departmentFilter === department.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {department.short}
                    </button>
                  ))}
                </div>
              </div>

              {selectedIds.size > 0 && (
                <div className="border-b border-indigo-100 bg-indigo-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-indigo-800">{selectedIds.size} SELECTED / 已选择</p>
                    <button type="button" onClick={() => setSelectedIds(new Set())} className="text-[10px] font-black text-indigo-600">
                      CLEAR
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] font-bold text-indigo-600">Click a workstation to assign / 点击右侧工位即可分配</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void persistMoves([...selectedIds], 'Unassigned')}
                      className="rounded-xl border border-indigo-200 bg-white px-2 py-2 text-[10px] font-black text-indigo-700 disabled:opacity-40"
                    >
                      RETURN UNASSIGNED
                    </button>
                    <select
                      disabled={saving}
                      defaultValue=""
                      onChange={(event) => {
                        if (event.target.value) void changeSelectedDepartment(event.target.value);
                        event.currentTarget.value = '';
                      }}
                      className="rounded-xl border border-indigo-200 bg-white px-2 py-2 text-[10px] font-black text-indigo-700 outline-none disabled:opacity-40"
                    >
                      <option value="" disabled>CHANGE DEPT</option>
                      {DEPARTMENTS.map((department) => (
                        <option key={department.id} value={department.id}>{department.short}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <span className="text-[10px] font-black text-slate-400">{filteredUnassigned.length} shown / 显示</span>
                {filteredUnassigned.length > 0 && (
                  <button type="button" onClick={selectVisibleUnassigned} className="text-[10px] font-black text-indigo-600">
                    SELECT SHOWN
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <UnassignedDropArea
                  selectedCount={selectedIds.size}
                  onReturnSelected={() => void persistMoves([...selectedIds], 'Unassigned')}
                >
                  <div className="grid gap-2">
                    {filteredUnassigned.map((employee) => (
                      <EmployeePill
                        key={employee.id}
                        employee={employee}
                        selected={selectedIds.has(employee.id)}
                        onSelect={() => toggleSelected(employee.id)}
                      />
                    ))}
                    {filteredUnassigned.length === 0 && (
                      <div className="py-10 text-center">
                        <Users className="mx-auto h-7 w-7 text-slate-200" />
                        <p className="mt-2 text-xs font-black text-slate-300">No staff / 没有员工</p>
                      </div>
                    )}
                  </div>
                </UnassignedDropArea>
              </div>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="mb-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs font-bold text-indigo-700">
              <strong>Quick Assign:</strong> Click staff on the left, then click a workstation. Drag & drop still works. / 点击左边员工，再点击工位即可；仍可直接拖放。
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {locations.map((location) => (
                <div key={location.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/50 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-white p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-indigo-500" />
                        <h3 className="text-xl font-black text-slate-900">{location.name}</h3>
                      </div>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Location Site</p>
                    </div>
                    <div className="rounded-2xl bg-indigo-50 px-3 py-2 text-center">
                      <p className="text-xl font-black text-indigo-700">{locationCounts[location.name] || 0}</p>
                      <p className="text-[9px] font-black uppercase text-indigo-400">Staff</p>
                    </div>
                  </div>

                  <div className="space-y-3 p-3">
                    {location.sub.map((subLocation, index) => {
                      const zoneId = `${location.id}|${subLocation}`;
                      const isEditing = editingZone === `${location.id}|${index}`;
                      const assignedEmployees = assignments
                        .filter((assignment) => assignment.location === location.id && assignment.subLocation === subLocation)
                        .map((assignment) => employees.find((employee) => employee.id === assignment.employeeId))
                        .filter(Boolean) as UserProfile[];

                      const customHeader = (
                        <div className="group flex min-h-[42px] items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                          {isEditing ? (
                            <div className="flex w-full items-center gap-2">
                              <input
                                autoFocus
                                value={zoneInput}
                                onChange={(event) => setZoneInput(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') void saveZoneName(location.id as string, index);
                                }}
                                className="min-w-0 flex-1 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-sm font-bold outline-none"
                              />
                              <button type="button" onClick={() => void saveZoneName(location.id as string, index)} className="rounded-lg p-1 text-indigo-600">
                                <Check className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-[11px] font-black uppercase tracking-wide text-slate-700">{subLocation}</span>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">{assignedEmployees.length}</span>
                              </div>
                              <div className="ml-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => void moveZone(location.id as string, index, 'up')}
                                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-20"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={index === location.sub.length - 1}
                                  onClick={() => void moveZone(location.id as string, index, 'down')}
                                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-20"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEditZone(location.id as string, index, subLocation)}
                                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-indigo-600"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteZone(location.id as string, index)}
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );

                      return (
                        <WorkstationZone
                          key={zoneId}
                          id={zoneId}
                          title={subLocation}
                          assignedEmployees={assignedEmployees}
                          selectedIds={selectedIds}
                          toggleSelected={toggleSelected}
                          selectedCount={selectedIds.size}
                          onAssignSelected={() => void persistMoves([...selectedIds], location.id as string, subLocation)}
                          customHeader={customHeader}
                        />
                      );
                    })}

                    <div>
                      {addingZoneLoc === location.id ? (
                        <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-white p-2">
                          <input
                            autoFocus
                            value={zoneInput}
                            onChange={(event) => setZoneInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void saveZoneName(location.id as string, -1);
                            }}
                            placeholder="New zone name..."
                            className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                          />
                          <button type="button" onClick={() => void saveZoneName(location.id as string, -1)} className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600">
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingZoneLoc(location.id as string);
                            setZoneInput('');
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-xs font-black text-slate-400 hover:border-indigo-200 hover:bg-white hover:text-indigo-500"
                        >
                          <Plus className="h-4 w-4" />
                          Add Zone / 添加工位
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <DragOverlay>
          {activeEmployee ? (
            <div className="rotate-2 rounded-xl border-2 border-indigo-300 bg-white px-3 py-2 shadow-2xl">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-black text-white">
                  {employeeInitials(activeEmployee.name)}
                </div>
                <span className="text-sm font-black text-slate-800">{activeEmployee.name}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

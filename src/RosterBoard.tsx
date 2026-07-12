import React, { useState, useEffect, useMemo } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { UserProfile, RosterAssignment } from './types';
import { rosterService, employeeService, locationService } from './lib/services';
import { Calendar, User, Truck, Wrench, Box, Building2, LayoutGrid, Plus, Pencil, Check, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';

interface RosterBoardProps {
}

interface LocationSite {
  id?: string;
  name: string;
  sub: string[];
}

const DEPARTMENTS = [
  { id: 'deptProduction', name: 'Production / 生产', icon: Box },
  { id: 'deptWarehouse', name: 'Warehouse / 仓库', icon: LayoutGrid },
  { id: 'deptDriver', name: 'Driver / 司机', icon: Truck },
  { id: 'deptMaintenance', name: 'Maintenance / 维修', icon: Wrench },
  { id: 'deptOther', name: 'Others / 其他', icon: User }
];

// Helper components for DnD
const EmployeePill = ({ employee }: { employee: UserProfile }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: employee.id,
    data: { employee }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`relative flex items-center justify-between px-3 py-2 bg-white rounded-lg border-2 border-slate-100 shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-200 transition-colors ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase">
          {employee.name.slice(0, 2)}
        </div>
        <span className="text-sm font-bold text-slate-700">{employee.name}</span>
      </div>
    </div>
  );
};

const DroppableZone = ({ id, title, children, isMainPool = false, customHeader }: { id: string, title?: string, children: React.ReactNode, isMainPool?: boolean, customHeader?: React.ReactNode }) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[100px] rounded-xl transition-colors ${
        isMainPool 
          ? 'bg-transparent' 
          : isOver 
            ? 'bg-indigo-50 border-2 border-indigo-200 border-dashed' 
            : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
      }`}
    >
      {customHeader ? customHeader : title && (
        <div className="px-4 py-2 border-b border-slate-100/50 flex items-center justify-center bg-white/50 rounded-t-xl text-xs font-bold text-slate-500 uppercase tracking-wider">
          {title}
        </div>
      )}
      <div className={`p-2 flex flex-wrap gap-2 ${isMainPool ? '' : 'min-h-[80px]'}`}>
        {children}
      </div>
    </div>
  );
};

export default function RosterBoard({}: RosterBoardProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);
  const [activeEmployee, setActiveEmployee] = useState<UserProfile | null>(null);
  const [locations, setLocations] = useState<LocationSite[]>([]);
  
  const [editingZone, setEditingZone] = useState<string | null>(null); // "locId|index"
  const [addingZoneLoc, setAddingZoneLoc] = useState<string | null>(null); // locId
  const [zoneInput, setZoneInput] = useState('');

  useEffect(() => {
    fetchData();
  }, [date]);

  const fetchData = async () => {
    try {
      const [emps, asgs, locs] = await Promise.all([
        employeeService.getAllEmployees(),
        rosterService.getAssignmentsByDate(date),
        locationService.getAllLocations()
      ]);
      setEmployees(emps);
      const sortedLocs = locs.map(l => ({ ...l, docId: l.id, id: l.name })).sort((a, b) => {
        const order = ['Yi Xiu', 'Kallang', 'Bedok'];
        const aIndex = order.indexOf(a.name);
        const bIndex = order.indexOf(b.name);
        if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
      // only keep the 3 locations
      const filteredLocs = sortedLocs.filter(l => ['Yi Xiu', 'Kallang', 'Bedok'].includes(l.name));
      
      const uniqueLocs = [];
      const seenNames = new Set();
      for (const loc of filteredLocs) {
        if (!seenNames.has(loc.name)) {
          seenNames.add(loc.name);
          
          // De-duplicate the sub-location list to prevent duplicate react keys and zones
          const originalSubs = loc.sub || [];
          const uniqueSubs: string[] = [];
          const seenSubs = new Set<string>();
          for (const s of originalSubs) {
            const trimmed = s.trim();
            if (trimmed && !seenSubs.has(trimmed.toLowerCase())) {
              seenSubs.add(trimmed.toLowerCase());
              uniqueSubs.push(trimmed);
            }
          }
          
          // Automatically heal the Firestore database if duplicates were found
          if (originalSubs.length !== uniqueSubs.length && loc.docId) {
            try {
              await locationService.updateLocationSubs(loc.docId, uniqueSubs);
            } catch (err) {
              console.error('Failed to self-heal duplicate sub-locations in DB:', err);
            }
          }

          uniqueLocs.push({
            ...loc,
            sub: uniqueSubs
          });
        }
      }
      
      setLocations(uniqueLocs as (LocationSite & { docId: string })[]);

      // Dynamically heal assignments that have missing or obsolete subLocation
      const healedAsgs = (asgs as RosterAssignment[]).map(asg => {
        const matchingLoc = uniqueLocs.find(l => l.name === asg.location);
        if (matchingLoc && matchingLoc.sub && matchingLoc.sub.length > 0) {
          if (!asg.subLocation || !matchingLoc.sub.includes(asg.subLocation)) {
            return { ...asg, subLocation: matchingLoc.sub[0] };
          }
        }
        return asg;
      });
      setAssignments(healedAsgs);
    } catch (e) {
      console.error('Error fetching roster data:', e);
    }
  };

  const handleEditZone = (locId: string, index: number, currentName: string) => {
    setEditingZone(`${locId}|${index}`);
    setZoneInput(currentName);
  };

  const saveZoneName = async (locId: string, index: number) => {
    if (!zoneInput.trim()) return;
    
    const loc = (locations as (LocationSite & { docId: string })[]).find(l => l.id === locId);
    if (!loc) return;
    
    const newSubs = [...loc.sub];
    if (index === -1) {
      // Add new zone
      newSubs.push(zoneInput.trim());
    } else {
      // Edit existing zone
      newSubs[index] = zoneInput.trim();
    }
    
    // Optimistic update
    setLocations(locations.map(l => l.id === locId ? { ...l, sub: newSubs } : l));
    setEditingZone(null);
    setAddingZoneLoc(null);
    setZoneInput('');
    
    if (loc.docId) {
      await locationService.updateLocationSubs(loc.docId, newSubs);
    }
  };

  const deleteZone = async (locId: string, index: number) => {
    const loc = (locations as (LocationSite & { docId: string })[]).find(l => l.id === locId);
    if (!loc) return;
    
    const zoneName = loc.sub[index];
    if (!confirm(`Are you sure you want to delete the zone "${zoneName}"? / 确定要删除该区域吗？`)) return;
    
    const newSubs = loc.sub.filter((_, i) => i !== index);
    
    // Optimistic update
    setLocations(locations.map(l => l.id === locId ? { ...l, sub: newSubs } : l));
    
    // Also remove assignments to this deleted sub-location so those employees return to unassigned pool
    setAssignments(prev => prev.filter(a => !(a.location === locId && a.subLocation === zoneName)));
    
    if (loc.docId) {
      await locationService.updateLocationSubs(loc.docId, newSubs);
    }
  };

  const moveZone = async (locId: string, index: number, direction: 'up' | 'down') => {
    const loc = (locations as (LocationSite & { docId: string })[]).find(l => l.id === locId);
    if (!loc) return;
    
    const newSubs = [...loc.sub];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSubs.length) return;
    
    // Swap
    const temp = newSubs[index];
    newSubs[index] = newSubs[targetIndex];
    newSubs[targetIndex] = temp;
    
    // Optimistic update
    setLocations(locations.map(l => l.id === locId ? { ...l, sub: newSubs } : l));
    
    if (loc.docId) {
      await locationService.updateLocationSubs(loc.docId, newSubs);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const emp = employees.find(e => e.id === active.id);
    if (emp) setActiveEmployee(emp);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveEmployee(null);
    const { active, over } = event;

    if (!over) return;

    const employeeId = active.id as string;
    const dropTargetId = over.id as string; // location_sublocation or 'Unassigned' or 'Unassigned|deptKey'

    let location = 'Unassigned';
    let subLocation = '';

    if (dropTargetId.startsWith('Unassigned')) {
      location = 'Unassigned';
      if (dropTargetId.includes('|')) {
        const targetDept = dropTargetId.split('|')[1];
        // Optimistic local state update for department
        setEmployees(prev => prev.map(emp => 
          emp.id === employeeId ? { ...emp, department: targetDept } : emp
        ));
        // Save to DB
        await employeeService.updateEmployeeDepartment(employeeId, targetDept);
      }
    } else {
      const parts = dropTargetId.split('|');
      location = parts[0];
      if (parts.length > 1) {
        subLocation = parts[1];
      }
    }

    // Optimistic update of assignments
    setAssignments(prev => {
      const filtered = prev.filter(a => a.employeeId !== employeeId);
      if (location === 'Unassigned') {
        return filtered;
      } else {
        return [...filtered, {
          id: Math.random().toString(), // temp
          date,
          employeeId,
          location,
          subLocation
        }];
      }
    });

    // Save roster assignment to DB
    await rosterService.updateAssignment(employeeId, date, location, subLocation);
  };

  // Group employees
  const assignedEmployeeIds = new Set(assignments.map(a => a.employeeId));
  const unassignedEmployees = employees.filter(e => !assignedEmployeeIds.has(e.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200">
        <label className="flex items-center gap-2 font-bold text-slate-700">
          <Calendar className="w-5 h-5 text-indigo-500" />
          Roster Date
        </label>
        <input 
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
        />
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        
        {/* Top: Available Employees by Department */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center justify-between">
            <span>Available Pool / 待分配</span>
            <span className="text-xs font-bold bg-slate-100 text-slate-500 px-3 py-1 rounded-full">{unassignedEmployees.length} Total</span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 w-full">
            {DEPARTMENTS.map(dept => {
              const deptEmps = unassignedEmployees.filter(e => {
                const empDept = e.department || 'deptOther';
                if (dept.id === 'deptOther') {
                  return empDept === 'deptOther' || !['deptProduction', 'deptWarehouse', 'deptDriver', 'deptMaintenance'].includes(empDept);
                }
                return empDept === dept.id;
              });
              const Icon = dept.icon;

              return (
                <div key={dept.id} className="space-y-3 flex flex-col h-full">
                  <div className="flex items-center gap-2 text-slate-500 border-b border-slate-100 pb-2">
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">{dept.name}</span>
                    <span className="ml-auto text-xs font-black bg-slate-100 px-2 py-0.5 rounded-full">{deptEmps.length}</span>
                  </div>
                  <DroppableZone id={`Unassigned|${dept.id}`}>
                    <div className="flex flex-col gap-2 min-h-[120px] w-full">
                      {deptEmps.map(emp => (
                        <EmployeePill key={emp.id} employee={emp} />
                      ))}
                      {deptEmps.length === 0 && (
                        <div className="text-center py-8 text-xs font-medium text-slate-400 border-2 border-dashed border-slate-100/50 rounded-xl w-full">
                          Empty / 空
                        </div>
                      )}
                    </div>
                  </DroppableZone>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom: Locations Kanban */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {locations.map(loc => (
            <div key={loc.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm flex flex-col">
              <div className="p-6 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white flex items-center justify-between">
                <div>
                  <h4 className="text-xl font-black text-slate-900">{loc.name}</h4>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Location Site</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                  <Building2 className="w-6 h-6" />
                </div>
              </div>
              
              <div className="p-4 flex-1 space-y-4 bg-slate-50/30">
                {/* Zones inside the location */}
                {loc.sub.map((subLoc, index) => {
                  const zoneId = `${loc.id}|${subLoc}`;
                  const isEditing = editingZone === `${loc.id}|${index}`;
                  const assignedEmps = assignments
                    .filter(a => a.location === loc.id && a.subLocation === subLoc)
                    .map(a => employees.find(e => e.id === a.employeeId))
                    .filter(Boolean) as UserProfile[];

                  return (
                    <DroppableZone 
                      key={zoneId} 
                      id={zoneId} 
                      customHeader={
                        <div className="px-4 py-2 border-b border-slate-100/50 flex items-center justify-between bg-white/50 rounded-t-xl text-xs font-bold text-slate-500 tracking-wider group relative min-h-[40px]">
                          {isEditing ? (
                            <div className="flex items-center gap-2 w-full">
                              <input 
                                autoFocus
                                value={zoneInput}
                                onChange={(e) => setZoneInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveZoneName(loc.id as string, index); }}
                                className="border border-indigo-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-100 flex-1 text-sm font-normal text-slate-700 bg-white"
                              />
                              <button onClick={() => saveZoneName(loc.id as string, index)} className="p-1 hover:bg-slate-100 rounded text-indigo-500"><Check className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <>
                              <span className="uppercase text-slate-700 font-extrabold pr-2 truncate">{subLoc}</span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                                <button 
                                  onClick={() => moveZone(loc.id as string, index, 'up')} 
                                  disabled={index === 0}
                                  className="p-1 hover:bg-slate-100 hover:text-slate-700 rounded text-slate-400 disabled:opacity-20 disabled:pointer-events-none"
                                  title="Move Up / 上移"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => moveZone(loc.id as string, index, 'down')} 
                                  disabled={index === loc.sub.length - 1}
                                  className="p-1 hover:bg-slate-100 hover:text-slate-700 rounded text-slate-400 disabled:opacity-20 disabled:pointer-events-none"
                                  title="Move Down / 下移"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleEditZone(loc.id as string, index, subLoc)} 
                                  className="p-1 hover:bg-slate-100 hover:text-indigo-600 rounded text-slate-400"
                                  title="Rename / 重命名"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => deleteZone(loc.id as string, index)} 
                                  className="p-1 hover:bg-rose-50 hover:text-rose-600 rounded text-slate-400"
                                  title="Delete / 删除"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      }
                    >
                      {assignedEmps.map(emp => (
                        <EmployeePill key={emp.id} employee={emp} />
                      ))}
                    </DroppableZone>
                  );
                })}

                {/* Add new zone button */}
                <div className="pt-2">
                  {addingZoneLoc === loc.id ? (
                    <div className="flex items-center gap-2 bg-white rounded-xl p-2 border border-indigo-200">
                      <input 
                        autoFocus
                        value={zoneInput}
                        onChange={(e) => setZoneInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveZoneName(loc.id as string, -1); }}
                        placeholder="New zone name..."
                        className="flex-1 text-sm border-none outline-none bg-transparent"
                      />
                      <button onClick={() => saveZoneName(loc.id as string, -1)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-600">
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => { setAddingZoneLoc(loc.id as string); setZoneInput(''); }}
                      className="w-full py-3 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-slate-400 hover:text-indigo-500 hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Add Zone
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeEmployee ? (
             <div className="opacity-80 scale-105 rotate-3 shadow-2xl">
               <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border-2 border-indigo-200">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase">
                  {activeEmployee.name.slice(0, 2)}
                </div>
                <span className="text-sm font-bold text-slate-700">{activeEmployee.name}</span>
              </div>
             </div>
          ) : null}
        </DragOverlay>

      </DndContext>
    </div>
  );
}

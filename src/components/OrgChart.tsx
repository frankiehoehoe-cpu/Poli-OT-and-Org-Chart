import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, 
  Phone, 
  MoreVertical, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Plus, 
  Trash2, 
  UserPlus, 
  Eye, 
  EyeOff, 
  Save, 
  Edit2, 
  Check, 
  X,
  Move,
  Users,
  Factory,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { OrgNode, UserProfile } from '../types';
import { orgChartService, employeeService } from '../lib/services';

interface OrgChartProps {
  editable: boolean;
}

export default function OrgChart({ editable }: OrgChartProps) {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [allEmployees, setAllEmployees] = useState<UserProfile[]>([]);
  const [showInPublicView, setShowInPublicView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  
  // Sidebar collapsed state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Dragging state for absolute positioning
  const [activeDrag, setActiveDrag] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    startNodeX: number;
    startNodeY: number;
  } | null>(null);

  // Pool drag state (for HTML5 drag-and-drop from the unassigned list)
  const [isDraggingFromPool, setIsDraggingFromPool] = useState(false);
  const [draggedEmployee, setDraggedEmployee] = useState<UserProfile | null>(null);

  // UI Modals & Options
  const [editingNode, setEditingNode] = useState<OrgNode | null>(null);
  const [showOptionsId, setShowOptionsId] = useState<string | null>(null);
  const [nodeIdToRemove, setNodeIdToRemove] = useState<string | null>(null);
  const [isAddingCustomNode, setIsAddingCustomNode] = useState(false);
  const [newNodeDetails, setNewNodeDetails] = useState({
    name: '',
    roleName: '',
    email: '',
    ext: '',
    parentId: null as string | null
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const dbNodes = await orgChartService.getNodes();
      const emps = await employeeService.getAllEmployees();
      const settings = await orgChartService.getSettings();
      
      setNodes(dbNodes);
      setAllEmployees(emps);
      setShowInPublicView(settings.showInPublicView);
    } catch (e) {
      console.error('Error fetching org chart data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Helper: Get positions or compute fallback positions
  const getCoordinates = (node: OrgNode): { x: number; y: number } => {
    if (node.x !== undefined && node.y !== undefined) {
      return { x: node.x, y: node.y };
    }
    
    // Default fallback coordinates if none exist
    if (node.roleName === 'FACTORY' || node.id.startsWith('factory_')) {
      if (node.name.toLowerCase().includes('yixiu') || node.id.includes('yixiu')) return { x: 50, y: 50 };
      if (node.name.toLowerCase().includes('kallang') || node.id.includes('kallang')) return { x: 400, y: 50 };
      return { x: 750, y: 50 };
    }
    
    // If has parent, place under parent with some offset
    if (node.parentId) {
      const parent = nodes.find(p => p.id === node.parentId);
      if (parent) {
        const parentCoords = getCoordinates(parent);
        const children = nodes.filter(c => c.parentId === node.parentId);
        const index = children.findIndex(c => c.id === node.id);
        const offsetIndex = index >= 0 ? index : 0;
        return {
          x: parentCoords.x + (offsetIndex - (children.length - 1) / 2) * 320,
          y: parentCoords.y + 200
        };
      }
    }
    
    // Otherwise place at default spot
    return { x: 400, y: 350 };
  };

  // Auto-populate / Sync default nodes
  const handleAutoPopulate = async () => {
    if (allEmployees.length === 0) return;
    setLoading(true);
    try {
      // Find Frankie or someone to be the manager, otherwise the first in the list is root
      const frankie = allEmployees.find(e => e.name.toLowerCase().includes('frankie')) || allEmployees[0];
      
      // Root Node
      const rootNode: OrgNode = {
        id: frankie.id,
        name: frankie.name,
        roleName: 'OPERATION MANAGER',
        email: 'frankie@company.com',
        ext: '101',
        parentId: null,
        x: 400,
        y: 50
      };
      await orgChartService.saveNode(rootNode);

      // Add remaining as child nodes initially
      const otherEmps = allEmployees.filter(e => e.id !== frankie.id);
      
      for (let i = 0; i < Math.min(otherEmps.length, 5); i++) {
        const emp = otherEmps[i];
        let role = 'PRODUCTION SUPERVISOR';
        if (emp.name.toLowerCase().includes('keong')) role = 'PRODUCTION MANAGER';
        if (emp.name.toLowerCase().includes('wan ling') || emp.name.toLowerCase().includes('jerry')) role = 'PRODUCTION SUPERVISOR';

        const childNode: OrgNode = {
          id: emp.id,
          name: emp.name,
          roleName: role,
          email: `${emp.name.toLowerCase().replace(/\s+/g, '')}@company.com`,
          ext: `10${i + 2}`,
          parentId: frankie.id,
          x: 100 + i * 180,
          y: 280
        };
        await orgChartService.saveNode(childNode);
      }

      const dbNodes = await orgChartService.getNodes();
      setNodes(dbNodes);
    } catch (e) {
      console.error('Failed to auto-populate nodes:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePublicView = async () => {
    const nextVal = !showInPublicView;
    setShowInPublicView(nextVal);
    await orgChartService.updateSettings(nextVal);
  };

  const handleInitializeFactories = async () => {
    setLoading(true);
    try {
      const factories = [
        { id: 'factory_yixiu', name: 'Yi Xiu', roleName: 'FACTORY', x: 50, y: 50 },
        { id: 'factory_kallang', name: 'Kallang', roleName: 'FACTORY', x: 400, y: 50 },
        { id: 'factory_bedok', name: 'Bedok', roleName: 'FACTORY', x: 750, y: 50 }
      ];

      const currentNodes = [...nodes];
      for (const fact of factories) {
        const exists = currentNodes.some(n => 
          n.name.toLowerCase() === fact.name.toLowerCase() || 
          n.id === fact.id
        );

        if (!exists) {
          const newFactNode: OrgNode = {
            id: fact.id,
            name: fact.name,
            roleName: fact.roleName,
            email: '—',
            ext: '—',
            parentId: null,
            x: fact.x,
            y: fact.y
          };
          await orgChartService.saveNode(newFactNode);
        } else {
          // Update position and parent for existing factory node to match horizontal layout
          const existingNode = currentNodes.find(n => 
            n.name.toLowerCase() === fact.name.toLowerCase() || 
            n.id === fact.id
          );
          if (existingNode) {
            existingNode.parentId = null;
            existingNode.x = fact.x;
            existingNode.y = fact.y;
            await orgChartService.saveNode(existingNode);
          }
        }
      }

      // Re-fetch to guarantee perfect sync
      const dbNodes = await orgChartService.getNodes();
      setNodes(dbNodes);
    } catch (e) {
      console.error('Failed to initialize factories:', e);
    } finally {
      setLoading(false);
    }
  };

  // Helper: check if descendant
  const isDescendant = (nodeId: string, potentialAncestorId: string): boolean => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.parentId) return false;
    if (node.parentId === potentialAncestorId) return true;
    return isDescendant(node.parentId, potentialAncestorId);
  };

  // Drag & Drop Handlers from Sidebar Pool
  const handlePoolDragStart = (e: React.DragEvent, emp: UserProfile) => {
    if (!editable) return;
    setIsDraggingFromPool(true);
    setDraggedEmployee(emp);
    e.dataTransfer.setData('text/plain', emp.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!editable) return;
    e.preventDefault();
  };

  const handleCanvasDrop = async (e: React.DragEvent) => {
    if (!editable) return;
    e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = Math.round((e.clientX - rect.left) / zoom - 144);
    const dropY = Math.round((e.clientY - rect.top) / zoom - 60);
    
    if (isDraggingFromPool && draggedEmployee) {
      const exists = nodes.some(n => n.id === draggedEmployee.id);
      if (exists) {
        alert('This employee is already in the Org Chart! / 该员工已在架构图中！');
        return;
      }
      
      // Auto-reparent based on nearest parent above
      let nearestParentId: string | null = null;
      let minDistance = 400;
      for (const node of nodes) {
        const coords = getCoordinates(node);
        if (coords.y < dropY - 40) {
          const dist = Math.hypot(coords.x - dropX, coords.y - dropY);
          if (dist < minDistance) {
            minDistance = dist;
            nearestParentId = node.id;
          }
        }
      }
      
      const newNode: OrgNode = {
        id: draggedEmployee.id,
        name: draggedEmployee.name,
        roleName: 'STAFF',
        email: `${draggedEmployee.name.toLowerCase().replace(/\s+/g, '')}@company.com`,
        ext: '—',
        parentId: nearestParentId,
        x: Math.max(0, dropX),
        y: Math.max(0, dropY)
      };
      
      setNodes(prev => [...prev, newNode]);
      await orgChartService.saveNode(newNode);
    }
    
    setIsDraggingFromPool(false);
    setDraggedEmployee(null);
  };

  // Pointer Drag Handlers for 2D Absolute positioning
  const handlePointerDown = (e: React.PointerEvent, node: OrgNode) => {
    if (!editable) return;
    if (e.button !== 0) return; // left click only
    
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('.no-drag')) {
      return;
    }
    
    e.preventDefault();
    const coords = getCoordinates(node);
    
    setActiveDrag({
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      startNodeX: coords.x,
      startNodeY: coords.y
    });
    
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag) return;
    
    const dx = (e.clientX - activeDrag.startX) / zoom;
    const dy = (e.clientY - activeDrag.startY) / zoom;
    
    const newX = Math.round(activeDrag.startNodeX + dx);
    const newY = Math.round(activeDrag.startNodeY + dy);
    
    setNodes(prev => prev.map(n => {
      if (n.id === activeDrag.nodeId) {
        return { ...n, x: Math.max(0, newX), y: Math.max(0, newY) };
      }
      return n;
    }));
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (!activeDrag) return;
    
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    const targetNode = nodes.find(n => n.id === activeDrag.nodeId);
    if (targetNode) {
      const coords = getCoordinates(targetNode);
      await orgChartService.updateNodePosition(targetNode.id, coords.x, coords.y);
      
      // Auto-reparent to nearest node above if dropped under it
      let nearestParentId: string | null = null;
      let minDistance = 400;
      for (const other of nodes) {
        if (other.id === targetNode.id) continue;
        const otherCoords = getCoordinates(other);
        if (otherCoords.y < coords.y - 80) {
          const dist = Math.hypot(otherCoords.x - coords.x, otherCoords.y - coords.y);
          if (dist < minDistance) {
            minDistance = dist;
            nearestParentId = other.id;
          }
        }
      }
      
      if (nearestParentId && nearestParentId !== targetNode.parentId) {
        if (!isDescendant(nearestParentId, targetNode.id)) {
          setNodes(prev => prev.map(n => n.id === targetNode.id ? { ...n, parentId: nearestParentId } : n));
          await orgChartService.updateNodeParent(targetNode.id, nearestParentId);
        }
      } else if (!nearestParentId && coords.y < 160) {
        // Dragged to top level
        if (targetNode.parentId !== null) {
          setNodes(prev => prev.map(n => n.id === targetNode.id ? { ...n, parentId: null } : n));
          await orgChartService.updateNodeParent(targetNode.id, null);
        }
      }
    }
    
    setActiveDrag(null);
  };

  // Add custom node
  const handleAddCustomNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeDetails.name || !newNodeDetails.roleName) return;
    
    const customId = `custom_${Date.now()}`;
    const newNode: OrgNode = {
      id: customId,
      name: newNodeDetails.name,
      roleName: newNodeDetails.roleName,
      email: newNodeDetails.email || '—',
      ext: newNodeDetails.ext || '—',
      parentId: newNodeDetails.parentId,
      x: 350,
      y: 250
    };

    setNodes(prev => [...prev, newNode]);
    await orgChartService.saveNode(newNode);
    
    setIsAddingCustomNode(false);
    setNewNodeDetails({
      name: '',
      roleName: '',
      email: '',
      ext: '',
      parentId: null
    });
  };

  // Save Node Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNode) return;
    
    setNodes(prev => prev.map(n => n.id === editingNode.id ? editingNode : n));
    await orgChartService.saveNode(editingNode);
    setEditingNode(null);
  };

  // Delete Node confirmation
  const confirmDeleteNode = async () => {
    if (!nodeIdToRemove) return;
    const nodeId = nodeIdToRemove;
    
    const updatedNodes = nodes
      .filter(n => n.id !== nodeId)
      .map(n => n.parentId === nodeId ? { ...n, parentId: null } : n);
    
    setNodes(updatedNodes);
    await orgChartService.deleteNode(nodeId);
    
    // Update orphans parents in DB
    const orphans = nodes.filter(n => n.parentId === nodeId);
    for (const orphan of orphans) {
      await orgChartService.updateNodeParent(orphan.id, null);
    }
    
    setNodeIdToRemove(null);
    setShowOptionsId(null);
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodeIdToRemove(nodeId);
    setShowOptionsId(null);
  };

  const unassignedEmployees = allEmployees.filter(emp => !nodes.some(n => n.id === emp.id));

  return (
    <div className="bg-[#0a0f1d] text-white rounded-[40px] border border-slate-800 shadow-2xl p-8 space-y-8 relative overflow-hidden min-h-[700px] flex flex-col">
      {/* Background Dots */}
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      ></div>

      {/* Header controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 z-10 no-print">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight">
              Organization Chart <span className="text-sm font-normal text-slate-400">/ 组织架构图</span>
            </h3>
            <p className="text-xs text-slate-400">
              {editable ? 'Drag any card freely to position it anywhere' : 'Company reporting hierarchy'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-1 shadow-inner">
            <button 
              onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}
              className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold font-mono text-slate-400 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button 
              onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}
              className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px bg-slate-800 h-6 mx-1"></div>
            <button 
              onClick={() => setZoom(1)}
              className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
              title="Reset Zoom"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>

          {/* Toggle Sidebar (Editable only) */}
          {editable && unassignedEmployees.length > 0 && (
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="flex items-center gap-2.5 px-5 py-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-2xl font-bold text-sm shadow-xl transition-all active:scale-95 cursor-pointer no-print"
            >
              {isSidebarCollapsed ? (
                <>
                  <ChevronLeft className="w-4.5 h-4.5 text-indigo-400" />
                  <span>Show Pool / 显示员工池</span>
                </>
              ) : (
                <>
                  <ChevronRight className="w-4.5 h-4.5 text-slate-400" />
                  <span>Hide Pool / 隐藏员工池</span>
                </>
              )}
            </button>
          )}

          {/* Toggle Public View (Editable only) */}
          {editable ? (
            <button
              onClick={handleTogglePublicView}
              className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl font-bold text-sm shadow-xl transition-all active:scale-95 border
                ${showInPublicView 
                  ? 'bg-emerald-600/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/20' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }
              `}
            >
              {showInPublicView ? <Eye className="w-4.5 h-4.5" /> : <EyeOff className="w-4.5 h-4.5" />}
              <span>
                {showInPublicView ? 'Public: ON / 显示中' : 'Public: OFF / 已隐藏'}
              </span>
            </button>
          ) : (
            showInPublicView && (
              <span className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-black uppercase tracking-wider">
                <Check className="w-3.5 h-3.5" />
                Live / 线上显示
              </span>
            )
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          <p className="mt-4 text-slate-400 text-sm font-bold">Loading Org Chart...</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-8">
          {/* Main Tree Canvas Area */}
          <div className="flex-1 flex flex-col bg-[#070c18] border border-slate-800/80 rounded-[32px] overflow-hidden shadow-inner min-h-[600px] relative">
            {/* Scrollable Container */}
            <div className="flex-1 overflow-auto p-4 relative" style={{ minHeight: '650px' }}>
              <div 
                onDragOver={handleDragOver}
                onDrop={handleCanvasDrop}
                className="relative min-w-[1300px] min-h-[900px] transition-transform duration-100 origin-top-left rounded-2xl p-6"
                style={{ transform: `scale(${zoom})` }}
              >
                {/* Dotted Background Grid */}
                <div 
                  className="absolute inset-0 opacity-15 pointer-events-none rounded-2xl"
                  style={{
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                  }}
                ></div>

                {/* SVG Connecting lines in background of canvas */}
                <svg className="absolute inset-0 pointer-events-none w-full h-full z-0">
                  <defs>
                    <linearGradient id="line-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>
                  {nodes.map(node => {
                    if (!node.parentId) return null;
                    const parent = nodes.find(p => p.id === node.parentId);
                    if (!parent) return null;
                    
                    const pCoords = getCoordinates(parent);
                    const cCoords = getCoordinates(node);
                    
                    const pHeight = parent.roleName === 'FACTORY' ? 144 : 132;
                    const startX = pCoords.x + 144;
                    const startY = pCoords.y + pHeight;
                    
                    const endX = cCoords.x + 144;
                    const endY = cCoords.y;
                    
                    const midY = (startY + endY) / 2;
                    const pathD = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
                    
                    return (
                      <g key={`link-${node.id}`}>
                        <path
                          d={pathD}
                          fill="none"
                          stroke="url(#line-grad)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          className="transition-all duration-300"
                        />
                        <circle
                          cx={(startX + endX) / 2}
                          cy={midY}
                          r="4"
                          fill="#6366f1"
                          className="animate-pulse"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Render Cards absolutely positioned */}
                {nodes.map(node => {
                  const coords = getCoordinates(node);
                  const initials = node.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
                  const isDragged = activeDrag?.nodeId === node.id;
                  
                  return (
                    <div
                      key={node.id}
                      onPointerDown={(e) => handlePointerDown(e, node)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      style={{ 
                        left: coords.x, 
                        top: coords.y,
                        position: 'absolute',
                        touchAction: 'none' // Essential for pointerevents on touch screens
                      }}
                      className={`w-72 rounded-[28px] p-6 shadow-xl border-2 transition-shadow duration-200 select-none z-10
                        ${isDragged 
                          ? 'ring-4 ring-indigo-500/80 border-indigo-400 bg-indigo-950/40 scale-105 shadow-indigo-500/30' 
                          : node.roleName === 'FACTORY'
                            ? 'border-emerald-500/20 bg-slate-900/95'
                            : 'border-[#1e293b] bg-slate-900/90'
                        }
                        ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                        group 
                        ${node.roleName === 'FACTORY'
                          ? 'hover:border-emerald-500/50 hover:shadow-emerald-500/10'
                          : 'hover:border-indigo-500/50 hover:shadow-indigo-500/10'
                        }
                      `}
                    >
                      {/* Options button */}
                      {editable && (
                        <div className="absolute top-5 right-5 z-20 no-drag">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowOptionsId(showOptionsId === node.id ? null : node.id);
                            }}
                            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                          
                          <AnimatePresence>
                            {showOptionsId === node.id && (
                              <>
                                <div className="fixed inset-0 z-20" onClick={() => setShowOptionsId(null)}></div>
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                  className="absolute right-0 mt-2 w-48 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-2 z-30 space-y-1"
                                >
                                  <button 
                                    onClick={() => {
                                      setEditingNode(node);
                                      setShowOptionsId(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-left cursor-pointer"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                    Edit Details / 编辑
                                  </button>
                                  <button 
                                    onClick={async () => {
                                      await orgChartService.updateNodeParent(node.id, null);
                                      setNodes(prev => prev.map(n => n.id === node.id ? { ...n, parentId: null } : n));
                                      setShowOptionsId(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-left cursor-pointer"
                                    disabled={node.parentId === null}
                                  >
                                    <Maximize className="w-4 h-4" />
                                    Set as Top / 设为顶级
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setIsAddingCustomNode(true);
                                      setNewNodeDetails(prev => ({ ...prev, parentId: node.id }));
                                      setShowOptionsId(null);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-left cursor-pointer"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Add Child / 添加下属
                                  </button>
                                  <div className="h-px bg-slate-800 my-1"></div>
                                  <button 
                                    onClick={() => handleDeleteNode(node.id)}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl transition-colors text-left cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Remove / 移除
                                  </button>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Profile details */}
                      <div className="flex items-start gap-4 pointer-events-none">
                        <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-inner shrink-0
                          ${node.roleName === 'FACTORY' 
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                            : 'bg-slate-800 border border-slate-700'
                          }
                        `}>
                          {node.roleName === 'FACTORY' ? (
                            <Factory className="w-7 h-7" />
                          ) : (
                            initials
                          )}
                          {node.roleName !== 'FACTORY' && (
                            <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-emerald-500 border-[3px] border-[#0a0f1d] rounded-full"></div>
                          )}
                        </div>
                        
                        <div className="space-y-1 min-w-0">
                          <h4 className="text-xl font-black text-white leading-tight uppercase tracking-tight truncate" translate="no">
                            {node.name}
                          </h4>
                          <p className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md inline-block
                            ${node.roleName === 'FACTORY'
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : 'text-amber-500 bg-amber-500/10'
                            }
                          `}>
                            {node.roleName === 'FACTORY' ? 'FACTORY / 工厂' : node.roleName}
                          </p>
                        </div>
                      </div>

                      {node.roleName === 'FACTORY' ? (
                        <div className="mt-6 pt-5 border-t border-slate-800/80 text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2 pointer-events-none">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          Factory Location / 工厂生产基地
                        </div>
                      ) : (
                        <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-2 text-xs pointer-events-none">
                          <div className="flex items-center gap-3 text-slate-400">
                            <Mail className="w-4 h-4 text-slate-500 shrink-0" />
                            <span className="truncate font-medium">{node.email}</span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-400">
                            <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                            <span className="font-mono">Ext: {node.ext}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Floating button to expand pool if collapsed */}
            {editable && unassignedEmployees.length > 0 && isSidebarCollapsed && (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="absolute right-6 bottom-6 z-30 flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer no-print border border-indigo-500"
                title="Show Employees Pool / 显示员工池"
              >
                <ChevronLeft className="w-4 h-4 text-white" />
                <span>Show Pool / 显示员工池</span>
              </button>
            )}
          </div>

          {/* Right Pool Sidebar */}
          {editable && unassignedEmployees.length > 0 && !isSidebarCollapsed && (
            <div className="w-full lg:w-80 shrink-0 bg-slate-950/60 border border-slate-800/80 rounded-[32px] p-6 flex flex-col space-y-6 z-10 no-print max-h-[610px]">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-1">
                    <span>Employees Pool</span>
                    <button 
                      onClick={() => setIsSidebarCollapsed(true)}
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-all cursor-pointer"
                      title="Collapse Sidebar / 收起员工池"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    Drag employees into the workspace
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-full text-[10px] font-bold text-slate-400">
                  {unassignedEmployees.length} Available
                </span>
              </div>

              {/* Scrollable list of unassigned employees */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                {unassignedEmployees.map(emp => {
                  const initials = emp.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <div 
                      key={emp.id}
                      draggable
                      onDragStart={(e) => handlePoolDragStart(e, emp)}
                      className="group bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 p-4 rounded-2xl flex items-center justify-between gap-4 cursor-grab active:cursor-grabbing transition-all hover:shadow-lg shadow-black/20"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                          {initials}
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors truncate w-36" translate="no">
                            {emp.name}
                          </p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                            {emp.department ? emp.department.replace('dept', '') : 'Staff'}
                          </p>
                        </div>
                      </div>

                      <button 
                        onClick={async () => {
                          const newNode: OrgNode = {
                            id: emp.id,
                            name: emp.name,
                            roleName: 'STAFF',
                            email: `${emp.name.toLowerCase().replace(/\s+/g, '')}@company.com`,
                            ext: '—',
                            parentId: nodes.length > 0 ? nodes[0].id : null,
                            x: 350,
                            y: 250
                          };
                          setNodes(prev => [...prev, newNode]);
                          await orgChartService.saveNode(newNode);
                        }}
                        className="p-2 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-indigo-600 hover:border-indigo-500 rounded-xl transition-all"
                        title="Add to Workspace"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={handleInitializeFactories}
                className="w-full py-4 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 hover:text-white hover:bg-emerald-600 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer mb-3"
              >
                <Factory className="w-4 h-4" />
                Initialize 3 Factories / 初始化三大工厂
              </button>

              <button 
                onClick={() => setIsAddingCustomNode(true)}
                className="w-full py-4 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Custom Member
              </button>
            </div>
          )}
        </div>
      )}

      {/* Edit Details Modal */}
      <AnimatePresence>
        {editingNode && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-[36px] w-full max-w-md overflow-hidden shadow-2xl relative"
            >
              <button 
                onClick={() => setEditingNode(null)}
                className="absolute top-6 right-6 p-2 rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-all z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="bg-indigo-600 p-8 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white mb-4">
                  <Edit2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight">Edit Member Details</h3>
                <p className="text-xs text-indigo-200 mt-1 uppercase tracking-widest font-bold">
                  {editingNode.name}
                </p>
              </div>

              <form onSubmit={handleSaveEdit} className="p-8 space-y-5">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Display Name</label>
                  <input 
                    type="text" 
                    value={editingNode.name}
                    onChange={e => setEditingNode({ ...editingNode, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Role Name / Title</label>
                  <input 
                    type="text" 
                    value={editingNode.roleName}
                    onChange={e => setEditingNode({ ...editingNode, roleName: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="e.g. PRODUCTION MANAGER"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 font-black">Reporting To / 直属上级</label>
                  <select
                    value={editingNode.parentId || ''}
                    onChange={e => setEditingNode({ ...editingNode, parentId: e.target.value || null })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">None (Top Level) / 无 (顶级)</option>
                    {nodes
                      .filter(n => n.id !== editingNode.id && !isDescendant(n.id, editingNode.id))
                      .map(n => (
                        <option key={n.id} value={n.id}>
                          {n.name} ({n.roleName})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
                  <input 
                    type="email" 
                    value={editingNode.email}
                    onChange={e => setEditingNode({ ...editingNode, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="e.g. email@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Extension Phone</label>
                  <input 
                    type="text" 
                    value={editingNode.ext}
                    onChange={e => setEditingNode({ ...editingNode, ext: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="e.g. 102"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingNode(null)}
                    className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Member
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Custom/New Node Modal */}
      <AnimatePresence>
        {isAddingCustomNode && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-[36px] w-full max-w-md overflow-hidden shadow-2xl relative"
            >
              <button 
                onClick={() => setIsAddingCustomNode(false)}
                className="absolute top-6 right-6 p-2 rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-all z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="bg-indigo-600 p-8 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white mb-4">
                  <UserPlus className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight">Add Custom Member</h3>
                <p className="text-xs text-indigo-200 mt-1 uppercase tracking-widest font-bold">
                  Create a custom node outside of employee list
                </p>
              </div>

              <form onSubmit={handleAddCustomNode} className="p-8 space-y-5">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Member Name</label>
                  <input 
                    type="text" 
                    value={newNodeDetails.name}
                    onChange={e => setNewNodeDetails({ ...newNodeDetails, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="e.g. Frankie"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Role Name / Title</label>
                  <input 
                    type="text" 
                    value={newNodeDetails.roleName}
                    onChange={e => setNewNodeDetails({ ...newNodeDetails, roleName: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="e.g. OPERATION MANAGER"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Reporting To / 直属上级</label>
                  <select
                    value={newNodeDetails.parentId || ''}
                    onChange={e => setNewNodeDetails({ ...newNodeDetails, parentId: e.target.value || null })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">None (Top Level) / 无 (顶级)</option>
                    {nodes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.roleName})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
                  <input 
                    type="email" 
                    value={newNodeDetails.email}
                    onChange={e => setNewNodeDetails({ ...newNodeDetails, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="e.g. frankie@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Extension Phone</label>
                  <input 
                    type="text" 
                    value={newNodeDetails.ext}
                    onChange={e => setNewNodeDetails({ ...newNodeDetails, ext: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950/50 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="e.g. Ext: 101"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingCustomNode(false)}
                    className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Member
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {nodeIdToRemove && (() => {
          const node = nodes.find(n => n.id === nodeIdToRemove);
          if (!node) return null;
          return (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-slate-900 border border-slate-800 rounded-[36px] w-full max-w-md overflow-hidden shadow-2xl relative"
              >
                <button 
                  onClick={() => setNodeIdToRemove(null)}
                  className="absolute top-6 right-6 p-2 rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-all z-10 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="bg-rose-600 p-8 flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white mb-4">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-white">Remove Member / 确认移除</h3>
                  <p className="text-xs text-rose-100 mt-1 uppercase tracking-widest font-bold">
                    {node.name}
                  </p>
                </div>

                <div className="p-8 space-y-6 text-center">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Are you sure you want to remove <strong className="text-white">{node.name}</strong> from the Organization Chart? 
                    Any sub-nodes/subsequent positions will be promoted to the top level.
                  </p>
                  <p className="text-xs text-slate-400 border-t border-slate-800/80 pt-4 leading-relaxed">
                    确定要将 <strong className="text-slate-200">{node.name}</strong> 从组织架构图中移除吗？其下属职位将被提升为顶级节点。
                  </p>

                  <div className="flex gap-4 pt-2">
                    <button 
                      type="button"
                      onClick={() => setNodeIdToRemove(null)}
                      className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all cursor-pointer"
                    >
                      Cancel / 取消
                    </button>
                    <button 
                      onClick={confirmDeleteNode}
                      className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-600/10 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove / 确认移除
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

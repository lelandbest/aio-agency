import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, X, Trash2, Globe, Database, FileText, Zap, Brain, ZoomIn, ZoomOut, Maximize, Bot } from 'lucide-react';

const clampPosition = (value, min, max) => Math.max(min, Math.min(max, value));

const buildNodeLayout = (profile, sources, items) => {
  const centerX = 50;
  const centerY = 50;
  
  const profileNode = { id: 'profile', label: 'AIO', type: 'profile', x: centerX, y: centerY, size: 'md' };

  const sourceCount = (sources || []).length;
  const sourceNodes = (sources || []).map((source, index) => {
    const angle = (index / sourceCount) * 2 * Math.PI;
    const radius = 22 + (index % 2) * 4;
    return {
      id: source.id,
      label: source.label,
      type: 'source',
      sourceType: source.source_type,
      x: source.graph_x ?? (centerX + Math.cos(angle) * radius),
      y: source.graph_y ?? (centerY + Math.sin(angle) * radius),
      size: 'sm',
    };
  });

  const sourceNodesById = Object.fromEntries(sourceNodes.map((node) => [node.id, node]));

  const itemNodes = (items || []).map((item, index) => {
    const sourceAnchor = item.source_id ? sourceNodesById[item.source_id] : null;
    const anchorX = sourceAnchor ? sourceAnchor.x : centerX;
    const anchorY = sourceAnchor ? sourceAnchor.y : centerY;
    
    const angle = ((index * 137.5) % 360) * (Math.PI / 180);
    const radius = sourceAnchor ? 10 : 35;
    
    return {
      id: item.id,
      label: item.title,
      type: 'item',
      category: item.category,
      sourceId: item.source_id,
      x: item.graph_x ?? clampPosition(anchorX + Math.cos(angle) * radius, 10, 90),
      y: item.graph_y ?? clampPosition(anchorY + Math.sin(angle) * radius, 10, 90),
      size: 'xs',
    };
  });

  return [profileNode, ...sourceNodes, ...itemNodes].filter(Boolean);
};

const toneClassByType = {
  profile: 'border-white/60 bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_30px_rgba(255,255,255,0.15)] backdrop-blur-none',
  source: 'border-sky-400/40 bg-sky-400/20 shadow-[0_0_15px_rgba(56,189,248,0.2)]',
  item: 'border-slate-500/30 bg-slate-800/40 shadow-none',
};

const nodeSizeClass = {
  md: 'h-16 w-16 rounded-full flex items-center justify-center',
  sm: 'h-4 w-4 rounded-full',
  xs: 'h-2.5 w-2.5 rounded-full',
};

const BrainAnimations = () => (
  <style>{`
    @keyframes workspace-floating {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-12px); }
    }
    @keyframes neural-pulse {
      0%, 100% { scale: 1; opacity: 0.8; }
      50% { scale: 1.1; opacity: 1; }
    }
    @keyframes neural-glow {
      0%, 100% { box-shadow: 0 0 20px rgba(56, 189, 248, 0.4), inset 0 0 10px rgba(56, 189, 248, 0.2); }
      50% { box-shadow: 0 0 40px rgba(56, 189, 248, 0.7), inset 0 0 20px rgba(56, 189, 248, 0.4); }
    }
    @keyframes flow {
      from { stroke-dashoffset: 40; }
      to { stroke-dashoffset: 0; }
    }
    @keyframes breathing-grid {
      0%, 100% { opacity: 0.03; background-size: 40px 40px; }
      50% { opacity: 0.06; background-size: 42px 42px; }
    }
    .workspace-floating {
      animation: workspace-floating 4s ease-in-out infinite;
    }
    @keyframes brain-pulse-fluctuate {
      0%, 100% { transform: scale(0.9); opacity: 0.7; }
      50% { transform: scale(1.15); opacity: 1; filter: drop-shadow(0 0 25px rgba(56, 189, 248, 0.8)); }
    }
    .neural-node-active {
      animation: neural-pulse 3s ease-in-out infinite;
    }
    .brain-pulse-fluctuate {
      animation: brain-pulse-fluctuate 4s ease-in-out infinite;
    }
    .neural-glow-aio {
      animation: neural-glow 2s ease-in-out infinite;
      border-color: rgba(56, 189, 248, 0.8) !important;
    }
    .edge-flow {
      stroke-dasharray: 4 6;
      animation: flow 1.5s linear infinite;
      filter: drop-shadow(0 0 2px rgba(56, 189, 248, 0.4));
    }
    .breathing-surface {
      animation: breathing-grid 10s ease-in-out infinite;
    }
    .font-ethnocentric {
      font-family: "Ethnocentric", "Inter", sans-serif;
    }
  `}</style>
);

export default function BrainGraphPanel({
  profile,
  sources,
  items,
  links,
  onMoveNode,
  onCreateLink,
  onDeleteLink,
  interactionArmed,
  setInteractionArmed
}) {
  const [nodeFilter, setNodeFilter] = useState('all');
  const [selectedNodeId, setSelectedNodeId] = useState('profile');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draggingPan, setDraggingPan] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState('');
  const [nodePositions, setNodePositions] = useState({});
  const [time, setTime] = useState(0);
  const [contextNodeId, setContextNodeId] = useState('');
  const [contextAnchor, setContextAnchor] = useState({ x: 0, y: 0 });
  
  const dragStateRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, nodeId: '' });
  const canvasRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(t => t + 0.03), 40);
    return () => clearInterval(timer);
  }, []);

  const nodes = useMemo(() => buildNodeLayout(profile, sources, items), [profile, sources, items]);
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((node) => [node.id, node])), [nodes]);
  const sourceLookup = useMemo(() => Object.fromEntries(sources.map((source) => [source.id, source])), [sources]);
  const itemLookup = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items]);

  useEffect(() => {
    setNodePositions((current) => {
      const next = {};
      nodes.forEach((node) => {
        next[node.id] = current[node.id] || { x: node.x, y: node.y };
      });
      return next;
    });
  }, [nodes]);

  const positionedNodes = useMemo(() => {
    return nodes.map((node) => {
      const baseX = nodePositions[node.id]?.x ?? node.x;
      const baseY = nodePositions[node.id]?.y ?? node.y;
      
      // Radial Pulse (Fractal/Kaleidoscope effect)
      // Only for non-profile nodes
      if (node.id === 'profile') return { ...node, x: baseX, y: baseY };
      
      const dx = baseX - 50;
      const dy = baseY - 50;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return { ...node, x: baseX, y: baseY };
      
      // Calculate a staggered pulse + organic drift
      const pulseAmount = Math.sin(time + dist * 0.1 + (node.id.length * 0.5)) * 1.5;
      
      // Organic Drift (Slow Brownian-like motion)
      const driftX = Math.sin(time * 0.5 + node.id.length) * 1.2;
      const driftY = Math.cos(time * 0.4 + node.id.length) * 1.2;
      
      const offX = (dx / dist) * pulseAmount + driftX;
      const offY = (dy / dist) * pulseAmount + driftY;
      
      return {
        ...node,
        x: baseX + offX,
        y: baseY + offY,
      };
    });
  }, [nodePositions, nodes, time]);

  const edges = useMemo(() => {
    const nodesMap = Object.fromEntries(positionedNodes.map(n => [n.id, n]));
    const profileNode = nodesMap.profile;
    const itemNodes = positionedNodes.filter((node) => node.type === 'item');
    const sourceNodes = positionedNodes.filter((node) => node.type === 'source');

    const trimEdge = (from, to, toRadius = 5.5) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < toRadius) return { x: to.x, y: to.y };
      const ratio = (dist - toRadius) / dist;
      return {
        x: from.x + dx * ratio,
        y: from.y + dy * ratio
      };
    };

    return [
      ...sourceNodes.map((node) => {
        const trimmed = trimEdge(node, profileNode, 5.2);
        return {
          id: `s-${node.id}`,
          from: node,
          to: trimmed,
          opacity: 0.5,
        };
      }),
      ...itemNodes.map((node) => {
        const target = node.sourceId ? nodesMap[node.sourceId] || profileNode : profileNode;
        const radius = target.id === 'profile' ? 5.2 : (target.type === 'source' ? 2.2 : 1.2);
        const trimmed = trimEdge(node, target, radius);
        return {
          id: `i-${node.id}`,
          from: node,
          to: trimmed,
          opacity: 0.35,
        };
      }),
    ].filter(e => e.from && e.to);
  }, [positionedNodes]);

  const beginPan = (event) => {
    if (!interactionArmed || contextNodeId) return;
    if (event.target.closest('[data-graph-node]')) return;
    setDraggingPan(true);
    dragStateRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };

  const beginNodeDrag = (event, node) => {
    if (!interactionArmed || contextNodeId || node.type === 'profile') return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedNodeId(node.id);
    setSelectedNodeId(node.id);
    dragStateRef.current = { x: event.clientX, y: event.clientY, nodeId: node.id };
  };

  const updateInteraction = (event) => {
    if (draggedNodeId) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nextX = clampPosition(((event.clientX - rect.left - pan.x) / rect.width / zoom) * 100, 5, 95);
      const nextY = clampPosition(((event.clientY - rect.top - pan.y) / rect.height / zoom) * 100, 5, 95);
      setNodePositions(prev => ({ ...prev, [draggedNodeId]: { x: nextX, y: nextY } }));
      return;
    }
    if (!draggingPan) return;
    setPan({
      x: dragStateRef.current.panX + (event.clientX - dragStateRef.current.x),
      y: dragStateRef.current.panY + (event.clientY - dragStateRef.current.y),
    });
  };

  const endInteraction = async () => {
    if (draggedNodeId) {
      const pos = nodePositions[draggedNodeId];
      const node = nodes.find(n => n.id === draggedNodeId);
      setDraggedNodeId('');
      if (node && pos) await onMoveNode?.(node, pos);
      return;
    }
    setDraggingPan(false);
  };

  const openNodeContext = (event, node) => {
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setSelectedNodeId(node.id);
    setContextNodeId(node.id);
    setContextAnchor({
      x: clampPosition(event.clientX - rect.left, 20, rect.width - 240),
      y: clampPosition(event.clientY - rect.top, 20, rect.height - 300),
    });
  };

  const contextNode = positionedNodes.find(n => n.id === contextNodeId);
  const contextData = contextNode ? (contextNode.type === 'source' ? sourceLookup[contextNode.id] : itemLookup[contextNode.id]) : null;

  return (
    <div 
      className={`h-full w-full bg-black relative overflow-hidden flex flex-col group/map rounded-[1.5rem] transition-all duration-500 ${!interactionArmed ? 'cursor-pointer' : ''}`}
      onClick={() => { if(!interactionArmed) setInteractionArmed(true); }}
    >
      <BrainAnimations />
      {/* Cinematic Grid Base */}
      <div className="absolute inset-0 pointer-events-none breathing-surface" 
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      
      {!interactionArmed && (
        <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm transition-all duration-700 pointer-events-none">
              <div className="text-[40px] font-black tracking-[0.5em] text-slate-100/90 font-ethnocentric selection:bg-sky-500/20 mb-8">AIO CORTEX</div>
              <div className="text-[14px] font-black tracking-[0.4em] text-sky-400 animate-pulse" style={{ textShadow: '0 0 10px rgba(56, 189, 248, 0.8)' }}>CLICK TO ENTER NEURAL NETWORK</div>
        </div>
      )}

      {/* Header Overlay */}
      <div className="absolute top-8 left-8 z-40 space-y-1 pointer-events-none">
        <div className="text-[13px] font-black uppercase tracking-[0.5em] text-cyan-500/60">Cortex v4</div>
        <div className="text-[22px] font-black uppercase tracking-[0.2em] text-slate-500 font-ethnocentric">AIO CORTEX</div>
      </div>

      {/* Interactive Legend */}
      <div className="absolute top-8 right-8 z-40 flex items-center gap-3">
        <div className="flex bg-slate-900/80 border border-slate-800/60 rounded-full p-1 backdrop-blur-xl">
          {['all', 'source', 'item'].map(f => (
            <button 
              key={f}
              onClick={() => setNodeFilter(f)}
              className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${nodeFilter === f ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-500'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Workspace */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden"
        onMouseDown={beginPan}
        onMouseMove={updateInteraction}
        onMouseUp={endInteraction}
        onMouseLeave={endInteraction}
        onWheel={(e) => setZoom(z => Math.max(0.5, Math.min(2, z + (e.deltaY < 0 ? 0.05 : -0.05))))}
      >
        <div
          className="absolute inset-0 origin-center transition-transform duration-100 workspace-floating"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <svg className="absolute inset-0 h-full w-full pointer-events-none" style={{ shapeRendering: 'geometricPrecision' }}>
            {edges.map(edge => (
              <line
                key={edge.id}
                x1={`${edge.from.x}%`} y1={`${edge.from.y}%`}
                x2={`${edge.to.x}%`} y2={`${edge.to.y}%`}
                stroke="rgba(56, 189, 248, 0.9)"
                className="edge-flow"
                strokeWidth="1.5"
                strokeOpacity={edge.opacity * 1.5}
              />
            ))}
          </svg>

          {positionedNodes.filter(n => nodeFilter === 'all' || n.type === nodeFilter).map(node => (
            <div
              key={node.id}
              data-graph-node
              onMouseDown={(e) => beginNodeDrag(e, node)}
              onContextMenu={(e) => openNodeContext(e, node)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all cursor-crosshair group/node z-10`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <div 
                  className={`
                    border rounded-full transition-all 
                    ${toneClassByType[node.type]} 
                    ${nodeSizeClass[node.size]} 
                    ${node.type === 'profile' ? 'brain-pulse-fluctuate !border-transparent' : 'neural-node-active'}
                    ${node.type === 'source' ? 'neural-glow-aio' : ''}
                    ${node.type === 'profile' ? 'bg-transparent' : ''}
                    ${selectedNodeId === node.id ? 'scale-150 !border-sky-400 ring-4 ring-sky-400/20' : 'hover:scale-125'}
                    flex items-center justify-center relative
                  `}
                  style={{ animationDelay: `${(node.id.length % 5) * 0.5}s` }}
                >
                    {node.type === 'profile' && (
                  <div className="relative flex items-center justify-center w-full h-full">
                    <Brain 
                      size={80} 
                      className="text-sky-400 absolute animate-pulse" 
                      style={{ 
                        filter: 'drop-shadow(0 0 20px rgba(56, 189, 248, 0.9)) drop-shadow(0 0 40px rgba(56, 189, 248, 0.4))',
                        opacity: 0.9
                      }} 
                    />
                    <span className="text-[14px] font-black tracking-[0.2em] text-white opacity-100 font-ethnocentric z-10" style={{ textShadow: '0 0 10px rgba(56, 189, 248, 0.8)' }}>AIO</span>
                  </div>
                )}
                {/* Check icon for items? No, user didn't ask. */}
              </div>
              {/* Label on Hover */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-black/80 border border-slate-800/80 rounded text-[10px] font-bold text-slate-300 uppercase tracking-widest opacity-0 group-hover/node:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {node.label}
              </div>
            </div>
          ))}
        </div>

        {/* Small Details Context Popup */}
        {contextNode && (
          <div 
            className="absolute z-[100] w-[220px] bg-slate-900/95 border border-slate-800/80 rounded-2xl shadow-2xl backdrop-blur-2xl p-4 animate-in fade-in zoom-in duration-200"
            style={{ left: contextAnchor.x, top: contextAnchor.y }}
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/60">
               <div className="flex items-center gap-2">
                 <div className={`h-2 w-2 rounded-full ${toneClassByType[contextNode.type]}`} />
                 <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{contextNode.type}</div>
               </div>
               <button onClick={() => setContextNodeId('')} className="text-slate-600 hover:text-white transition-colors">
                 <X size={14} />
               </button>
            </div>
            
            <div className="space-y-4">
               <div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Entity Reference</div>
                  <div className="text-xs font-black text-slate-300 leading-relaxed">{contextNode.label}</div>
               </div>

               {contextNode.type === 'source' && (
                 <div className="space-y-3">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-slate-800/60">
                       <Globe size={12} className="text-sky-400" />
                       <span className="text-[10px] text-slate-400 font-bold uppercase truncate">{contextData?.location || 'Operational Node'}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-slate-800/60">
                       <Database size={12} className="text-magenta-400" />
                       <span className="text-[10px] text-slate-400 font-bold uppercase">{contextData?.source_type || 'Nexus'}</span>
                    </div>
                 </div>
               )}

               {contextNode.type === 'item' && (
                 <div className="space-y-3">
                    <div className="text-[10px] text-slate-400 leading-relaxed max-h-32 overflow-y-auto no-scrollbar font-medium">
                       {contextData?.content || 'No detailed DNA metadata synthesized.'}
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/40 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                       <FileText size={10} /> {contextData?.category || 'General'}
                    </div>
                 </div>
               )}
               
               <button className="w-full py-2 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2">
                 <Zap size={10} /> Synthesize Context
               </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Stats Overlay */}
      <div className="absolute bottom-8 left-8 z-40 pointer-events-none flex gap-4">
         <div className="px-4 py-2 bg-black/40 border border-slate-800/60 rounded-full backdrop-blur-md">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nodes: <span className="text-white">{nodes.length}</span></span>
         </div>
         <div className="px-4 py-2 bg-black/40 border border-slate-800/60 rounded-full backdrop-blur-md">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Connectivity: <span className="text-sky-400">98%</span></span>
         </div>
      </div>
 
      {/* Zoom / Pan Controls */}
      <div className="absolute bottom-8 right-8 z-40 flex flex-col gap-2">
         <div className="flex flex-col bg-black/40 border border-slate-800/60 rounded-xl backdrop-blur-md overflow-hidden shadow-xl pointer-events-auto">
            <button 
              onClick={() => setZoom(z => Math.min(2.5, z + 0.2))}
              className="p-3 text-slate-400 hover:text-sky-400 hover:bg-white/5 transition-all border-b border-white/5"
              title="Zoom In"
            >
              <ZoomIn size={18} />
            </button>
            <button 
              onClick={() => setZoom(z => Math.max(0.4, z - 0.2))}
              className="p-3 text-slate-400 hover:text-sky-400 hover:bg-white/5 transition-all border-b border-white/5"
              title="Zoom Out"
            >
              <ZoomOut size={18} />
            </button>
            <button 
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="p-3 text-slate-400 hover:text-sky-400 hover:bg-white/5 transition-all"
              title="Reset View"
            >
              <Maximize size={18} />
            </button>
         </div>
      </div>
    </div>
  );
}

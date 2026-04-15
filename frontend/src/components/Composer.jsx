import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Play, Loader2, Image, Video, Music, FileText, 
  GripVertical, Layers, Layout, Grid3X3, Square, MonitorPlay,
  Download, Send, Zap, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Eye, EyeOff, Sparkles, ArrowRight, Clock, CheckCircle, VideoIcon, Mic, Camera, Monitor, Square as SquareIcon, RotateCcw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getVaultApi, uploadMediaFileApi, createMediaTranscriptJobApi } from '../services/backendApi';

const ASSET_TYPES = {
  image: { icon: Image, label: 'IMAGE', color: 'cyan', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
  video: { icon: Video, label: 'VIDEO', color: 'violet', bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400' },
  audio: { icon: Music, label: 'AUDIO', color: 'emerald', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  text: { icon: FileText, label: 'TEXT', color: 'amber', bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
};

const ASPECT_RATIOS = [
  { id: '16:9', label: '16:9', desc: 'Video' },
  { id: '9:16', label: '9:16', desc: 'Stories' },
  { id: '1:1', label: '1:1', desc: 'Square' },
  { id: '4:5', label: '4:5', desc: 'Post' },
];

const TEMPLATES = [
  { id: 'social-post', name: 'Social Post', aspect: '1:1', desc: 'Quick social post' },
  { id: 'story', name: 'Story', aspect: '9:16', desc: 'Vertical story' },
  { id: 'video-intro', name: 'Video Intro', aspect: '16:9', desc: 'Video intro' },
];

function resolveAssetType(mimeType) {
  if (!mimeType) return 'text';
  const t = mimeType.toLowerCase();
  if (t.includes('image')) return 'image';
  if (t.includes('video')) return 'video';
  if (t.includes('audio')) return 'audio';
  return 'text';
}

function AssetTray({ assets, onDragStart }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filter, setFilter] = useState('all');

  const filteredAssets = useMemo(() => {
    if (filter === 'all') return assets;
    return assets.filter(a => a.type === filter);
  }, [assets, filter]);

  const handleMultiSelect = (id, e) => {
    if (e.shiftKey || e.ctrlKey) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else {
      setSelectedIds([id]);
    }
  };

  return (
    <div className="w-56 flex-shrink-0 bg-[#0a0c10] border-r border-[#1e2024] flex flex-col">
      <div className="px-3 py-2.5 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0a0c10]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]">ASSETS</span>
          <span className="text-[7px] text-slate-600 font-mono">{assets.length}</span>
        </div>
        <div className="flex gap-1">
          {['all', 'image', 'video', 'audio', 'text'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 text-[7px] font-black uppercase rounded transition-all ${
                filter === f 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' 
                  : 'text-slate-500 border border-transparent hover:text-slate-300'
              }`}
            >
              {f === 'all' ? 'ALL' : f.charAt(0).toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 p-2 overflow-y-auto space-y-1.5">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('aio:open-boom'))}
          className="w-full mb-2 p-2 rounded border border-[#1e2024] bg-[#0f1218] hover:border-cyan-500/50 hover:bg-[#141820] transition-all flex items-center justify-center"
        >
          <Camera size={14} className="text-cyan-400" />
        </button>
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Sparkles size={20} className="text-slate-700 mb-2" />
            <span className="text-[8px] text-slate-500 font-mono">NO ASSETS</span>
            <span className="text-[7px] text-slate-600 mt-1">Generate in Studio first</span>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const typeInfo = ASSET_TYPES[asset.type] || ASSET_TYPES.text;
            const Icon = typeInfo.icon;
            const isHovered = hoveredId === asset.id;
            const isSelected = selectedIds.includes(asset.id);
            
            return (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => onDragStart(e, asset)}
                onMouseEnter={() => setHoveredId(asset.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(e) => handleMultiSelect(asset.id, e)}
                className={`group relative p-2 rounded cursor-grab active:cursor-grabbing transition-all border ${
                  isSelected 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : isHovered 
                      ? 'border-cyan-500/50 bg-[#141820]' 
                      : 'border-[#1e2024] bg-[#0f1218] hover:border-cyan-500/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  {asset.thumbnail ? (
                    <div className="w-10 h-10 rounded bg-[#1a1d24] overflow-hidden flex items-center justify-center">
                      <img src={asset.thumbnail} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded flex items-center justify-center ${typeInfo.bg} border ${typeInfo.border}`}>
                      <Icon size={16} className={typeInfo.text} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-[8px] text-slate-300 truncate block font-medium">{asset.title}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[6px] font-black uppercase tracking-wider ${typeInfo.text}`}>{typeInfo.label}</span>
                      {asset.duration && (
                        <span className="text-[6px] text-slate-500 font-mono">{asset.duration}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                {isHovered && (
                  <div className="absolute -top-8 left-0 right-0 bg-[#1a1d24] border border-[#1e2024] rounded px-2 py-1.5 shadow-lg z-10">
                    <span className="text-[7px] text-slate-400 font-mono truncate block">{asset.title}</span>
                    <span className="text-[6px] text-slate-500">{asset.type} • {asset.size || '--'}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      
      <div className="p-2 border-t border-[#1e2024] space-y-1.5">
        <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">QUICK START</span>
        {TEMPLATES.map(t => (
          <button key={t.id} className="w-full flex items-center justify-between px-2 py-1.5 text-[8px] text-slate-400 hover:text-cyan-400 hover:bg-[#141820] rounded transition-all border border-transparent hover:border-cyan-500/30">
            <span>{t.name}</span>
            <span className="text-[6px] text-slate-600 font-mono">{t.aspect}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CompositionCanvas({ assets, onSelectAsset, selectedAsset, onMoveAsset, onDeleteAsset, onDropAsset, snapToGrid = true }) {
  const canvasRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverPos, setDragOverPos] = useState(null);
  const [guides, setGuides] = useState({ x: null, y: null });

  const GRID_SIZE = snapToGrid ? 20 : 1;

  const snapValue = useCallback((val) => {
    if (!snapToGrid) return val;
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
  }, [snapToGrid, GRID_SIZE]);

  const handleDragOver = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragOverPos({ x: snapValue(x), y: snapValue(y) });
    setIsDragOver(true);

    if (snapToGrid) {
      const centerX = canvasRef.current.offsetWidth / 2;
      const centerY = canvasRef.current.offsetHeight / 2;
      const snapThreshold = 10;
      
      let newGuides = { x: null, y: null };
      
      if (Math.abs(x - centerX) < snapThreshold) newGuides.x = centerX;
      if (Math.abs(y - centerY) < snapThreshold) newGuides.y = centerY;
      
      assets.forEach(asset => {
        if (Math.abs(asset.x + (asset.width || 120)/2 - x) < snapThreshold) newGuides.x = asset.x + (asset.width || 120)/2;
        if (Math.abs(asset.y + (asset.height || 80)/2 - y) < snapThreshold) newGuides.y = asset.y + (asset.height || 80)/2;
      });
      
      setGuides(newGuides);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
    setDragOverPos(null);
    setGuides({ x: null, y: null });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const assetData = e.dataTransfer.getData('application/json');
      if (assetData) {
        const asset = JSON.parse(assetData);
        const rect = canvasRef.current.getBoundingClientRect();
        const x = snapValue(e.clientX - rect.left - 60);
        const y = snapValue(e.clientY - rect.top - 40);
        if (onDropAsset) {
          onDropAsset(asset, Math.max(0, x), Math.max(0, y));
        } else {
          onMoveAsset(asset.id, Math.max(0, x), Math.max(0, y));
        }
      }
    } catch {}
    setGuides({ x: null, y: null });
  };

  const handleCanvasClick = (e) => {
    if (e.target === canvasRef.current) {
      onSelectAsset(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0f1218]">
        <Layout size={12} className="text-cyan-400" />
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">CANVAS</span>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[7px] text-slate-600 font-mono">{assets.length} LAYERS</span>
        </div>
      </div>
      
      <div 
        ref={canvasRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleCanvasClick}
        className={`flex-1 relative overflow-hidden transition-all ${
          isDragOver ? 'bg-cyan-950/5' : 'bg-[#080a0f]'
        }`}
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #1a1d24 1px, transparent 0)',
          backgroundSize: '20px 20px',
        }}
      >
        {guides.x !== null && (
          <div className="absolute top-0 bottom-0 w-px bg-cyan-500/50 pointer-events-none" style={{ left: guides.x }} />
        )}
        {guides.y !== null && (
          <div className="absolute left-0 right-0 h-px bg-cyan-500/50 pointer-events-none" style={{ top: guides.y }} />
        )}

        {assets.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center p-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl border-2 border-dashed border-[#1e2024] flex items-center justify-center bg-[#0a0c10]">
                <GripVertical size={32} className="text-slate-700" />
              </div>
              <span className="text-[11px] text-slate-500 font-black uppercase tracking-wider block mb-1">DRAG ASSETS HERE</span>
              <span className="text-[9px] text-slate-600 font-mono">or select a quick start template</span>
            </div>
          </div>
        )}
        
        {assets.map((item, idx) => {
          const typeInfo = ASSET_TYPES[item.type] || ASSET_TYPES.text;
          const isSelected = selectedAsset?.id === item.id;
          
          return (
            <div
              key={item.id}
              onClick={(e) => { e.stopPropagation(); onSelectAsset(item); }}
              className={`absolute cursor-move transition-all duration-75 ${
                isSelected 
                  ? 'z-50' : `z-${10 - idx}`
              }`}
              style={{ 
                left: item.x, 
                top: item.y, 
                width: item.width || 120, 
                height: item.height || 80,
              }}
            >
              <div 
                className={`w-full h-full rounded-lg border-2 overflow-hidden flex items-center justify-center shadow-lg transition-shadow ${
                  isSelected 
                    ? 'border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.4)]' 
                    : 'border-[#1e2024] hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                }`}
                style={{ 
                  backgroundColor: item.bgColor || '#0f1218',
                  opacity: item.opacity ?? 1 
                }}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    {React.createElement(typeInfo.icon, { size: 24, className: typeInfo.text })}
                    {item.content && (
                      <span className="text-[8px] text-slate-400 px-2 text-center max-w-[100px] truncate">{item.content}</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="absolute -bottom-6 left-0 right-0 flex items-center justify-center">
                <span className="text-[6px] text-slate-600 font-mono bg-[#0a0c10] px-1.5 py-0.5 rounded">
                  {item.title?.slice(0, 12)}...
                </span>
              </div>
            </div>
          );
        })}

        {isDragOver && dragOverPos && (
          <div 
            className="absolute border-2 border-dashed border-cyan-500/50 bg-cyan-500/5 rounded-lg pointer-events-none transition-all"
            style={{ 
              left: dragOverPos.x - 60, 
              top: dragOverPos.y - 40, 
              width: 120, 
              height: 80 
            }}
          />
        )}
      </div>
    </div>
  );
}

function PropertiesPanel({ selectedAsset, onUpdateAsset, aspectRatio, onAspectChange, onDeleteAsset }) {
  const [showTips, setShowTips] = useState(true);

  if (!selectedAsset) {
    return (
      <div className="w-56 flex-shrink-0 bg-[#0a0c10] border-l border-[#1e2024] flex flex-col">
        <div className="px-3 py-2 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0a0c10]">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">PROPERTIES</span>
        </div>
        
        <div className="flex-1 p-4 flex flex-col items-center justify-center text-center">
          {showTips ? (
            <>
              <div className="w-12 h-12 rounded-full bg-[#12151c] border border-[#1e2024] flex items-center justify-center mb-3">
                <Eye size={20} className="text-slate-600" />
              </div>
              <span className="text-[10px] text-slate-400 font-medium mb-1">SELECT AN ASSET</span>
              <span className="text-[8px] text-slate-600 font-mono mb-4">to edit properties</span>
              
              <div className="w-full space-y-2">
                <div className="p-2 rounded bg-[#0f1218] border border-[#1e2024] text-left">
                  <span className="text-[7px] text-cyan-500 font-bold uppercase block mb-1">TIP</span>
                  <span className="text-[8px] text-slate-500">Drag assets from the left panel onto the canvas</span>
                </div>
                <div className="p-2 rounded bg-[#0f1218] border border-[#1e2024] text-left">
                  <span className="text-[7px] text-cyan-500 font-bold uppercase block mb-1">TIP</span>
                  <span className="text-[8px] text-slate-500">Click an asset to select it for editing</span>
                </div>
              </div>
              
              <button 
                onClick={() => setShowTips(false)} 
                className="mt-3 text-[7px] text-slate-600 hover:text-slate-400"
              >
                Hide tips
              </button>
            </>
          ) : (
            <button 
              onClick={() => setShowTips(true)} 
              className="text-[8px] text-slate-500 hover:text-cyan-400"
            >
              Show tips
            </button>
          )}
        </div>
        
        <div className="p-3 border-t border-[#1e2024] space-y-2">
          <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">ASPECT RATIO</span>
          <div className="grid grid-cols-4 gap-1">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio.id}
                onClick={() => onAspectChange(ratio.id)}
                className={`px-1.5 py-1.5 text-[8px] font-black rounded border transition-all ${
                  aspectRatio === ratio.id
                    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                    : 'border-[#1e2024] bg-[#0f1218] text-slate-500 hover:text-slate-300'
                }`}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const typeInfo = ASSET_TYPES[selectedAsset.type] || ASSET_TYPES.text;

  return (
    <div className="w-56 flex-shrink-0 bg-[#0a0c10] border-l border-[#1e2024] flex flex-col">
      <div className="px-3 py-2 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0a0c10]">
        <span className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]">PROPERTIES</span>
      </div>
      
      <div className="flex-1 p-3 space-y-4 overflow-y-auto">
        <div className="space-y-1.5">
          <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">ASSET</span>
          <div className="flex items-center gap-2 p-2 rounded border border-[#1e2024] bg-[#0f1218]">
            <div className={`w-8 h-8 rounded flex items-center justify-center ${typeInfo.bg} border ${typeInfo.border}`}>
              {React.createElement(typeInfo.icon, { size: 16, className: typeInfo.text })}
            </div>
            <span className="text-[9px] text-slate-300 font-mono truncate">{selectedAsset.title}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">OPACITY</span>
            <span className="text-[8px] text-slate-400 font-mono">{Math.round((selectedAsset.opacity ?? 1) * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={(selectedAsset.opacity ?? 1) * 100}
            onChange={(e) => onUpdateAsset(selectedAsset.id, { opacity: parseInt(e.target.value) / 100 })}
            className="w-full h-1.5 bg-[#1e2024] rounded appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">POSITION</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[6px] text-slate-600 w-3">X</span>
              <input 
                type="number" 
                value={Math.round(selectedAsset.x || 0)}
                onChange={(e) => onUpdateAsset(selectedAsset.id, { x: parseInt(e.target.value) || 0 })}
                className="w-full p-1 text-[8px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[6px] text-slate-600 w-3">Y</span>
              <input 
                type="number" 
                value={Math.round(selectedAsset.y || 0)}
                onChange={(e) => onUpdateAsset(selectedAsset.id, { y: parseInt(e.target.value) || 0 })}
                className="w-full p-1 text-[8px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
        
        {selectedAsset.type === 'text' && (
          <div className="space-y-1.5">
            <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">CONTENT</span>
            <textarea 
              value={selectedAsset.content || ''}
              onChange={(e) => onUpdateAsset(selectedAsset.id, { content: e.target.value })}
              className="w-full h-20 p-2 text-[9px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded resize-none focus:border-cyan-500 focus:outline-none"
              placeholder="Enter text..."
            />
            <div className="flex gap-1">
              {['BOLD', 'italic', 'UPPER'].map((style) => (
                <button 
                  key={style}
                  className="flex-1 px-2 py-1 text-[7px] font-black uppercase rounded border border-[#1e2024] bg-[#0f1218] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
        )}

        {(selectedAsset.type === 'image' || selectedAsset.type === 'video') && (
          <>
            <div className="space-y-1.5">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">SIZE</span>
              <div className="flex gap-2">
                <div className="flex-1">
                  <span className="text-[6px] text-slate-600 block mb-1">W</span>
                  <input 
                    type="number" 
                    value={selectedAsset.width || 120}
                    onChange={(e) => onUpdateAsset(selectedAsset.id, { width: parseInt(e.target.value) || 100 })}
                    className="w-full p-1.5 text-[9px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <span className="text-[6px] text-slate-600 block mb-1">H</span>
                  <input 
                    type="number" 
                    value={selectedAsset.height || 80}
                    onChange={(e) => onUpdateAsset(selectedAsset.id, { height: parseInt(e.target.value) || 60 })}
                    className="w-full p-1.5 text-[9px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">FIT MODE</span>
              <div className="flex gap-1">
                {['COVER', 'FIT', 'FILL'].map((fit) => (
                  <button 
                    key={fit}
                    className="flex-1 px-2 py-1.5 text-[7px] font-black uppercase rounded border border-[#1e2024] bg-[#0f1218] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {fit}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {selectedAsset.type === 'audio' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">VOLUME</span>
              <span className="text-[8px] text-slate-400 font-mono">80%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              defaultValue="80"
              className="w-full h-1.5 bg-[#1e2024] rounded appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        )}

        <button 
          onClick={() => onDeleteAsset(selectedAsset.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[9px] font-black uppercase tracking-wider rounded border border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10 transition-all"
        >
          <Trash2 size={12} />
          DELETE
        </button>
      </div>
      
      <div className="p-3 border-t border-[#1e2024] space-y-2">
        <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">ASPECT RATIO</span>
        <div className="grid grid-cols-4 gap-1">
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio.id}
              onClick={() => onAspectChange(ratio.id)}
              className={`px-1.5 py-1.5 text-[8px] font-black rounded border transition-all ${
                aspectRatio === ratio.id
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                  : 'border-[#1e2024] bg-[#0f1218] text-slate-500 hover:text-slate-300'
              }`}
            >
              {ratio.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineStrip({ assets, onSelectAsset, selectedAsset }) {
  if (assets.length === 0) return null;
  
  return (
    <div className="h-16 border-t border-[#1e2024] bg-[#0a0c10] flex flex-col shrink-0">
      <div className="px-3 py-1 border-b border-[#1e2024] flex items-center gap-2">
        <Clock size={10} className="text-slate-600" />
        <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.15em]">TIMELINE</span>
        <span className="text-[6px] text-slate-600 ml-auto">{assets.length} LAYERS</span>
      </div>
      <div className="flex-1 flex items-center gap-1 px-2 overflow-x-auto">
        {assets.map((item, idx) => {
          const typeInfo = ASSET_TYPES[item.type] || ASSET_TYPES.text;
          const isSelected = selectedAsset?.id === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onSelectAsset(item)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-left shrink-0 transition-all ${
                isSelected 
                  ? 'border-cyan-500 bg-cyan-500/10' 
                  : 'border-[#1e2024] bg-[#0f1218] hover:border-cyan-500/30'
              }`}
            >
              {React.createElement(typeInfo.icon, { size: 10, className: typeInfo.text })}
              <span className="text-[7px] text-slate-400 font-mono truncate max-w-[60px]">{item.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PublishBar({ onRender, onExport, onSendToFlow, onQueueSocial, isProcessing, assetCount }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[#1e2024] bg-gradient-to-b from-[#0f1218] to-[#080a0f] shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-500" />
          <span className="text-[9px] text-slate-400 font-mono">
            {assetCount} LAYERS READY
          </span>
        </div>
        <div className="h-4 w-px bg-[#1e2024]" />
        <span className="text-[8px] text-slate-600 font-mono">EXPORT {ASPECT_RATIOS[0].label} MP4</span>
      </div>
      
      <div className="flex items-center gap-2">
        <button 
          onClick={onQueueSocial}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-2 text-[9px] font-black uppercase tracking-wider rounded border border-[#1e2024] bg-[#0f1218] text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-all disabled:opacity-50"
        >
          <Zap size={12} />
          <span>QUEUE</span>
        </button>
        <button 
          onClick={onSendToFlow}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-2 text-[9px] font-black uppercase tracking-wider rounded border border-[#1e2024] bg-[#0f1218] text-slate-400 hover:text-violet-400 hover:border-violet-500/50 transition-all disabled:opacity-50"
        >
          <Send size={12} />
          <span>FLOW</span>
        </button>
        <button 
          onClick={onExport}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-2 text-[9px] font-black uppercase tracking-wider rounded border border-[#1e2024] bg-[#0f1218] text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-all disabled:opacity-50"
        >
          <Download size={12} />
          <span>EXPORT</span>
        </button>
        <button 
          onClick={onRender}
          disabled={isProcessing}
          className="flex items-center gap-2 px-6 py-2 bg-gradient-to-b from-[#1b2533] to-[#121927] hover:from-[#212d3d] hover:to-[#171f2d] active:from-[#050810] active:to-[#050810] disabled:from-[#0B1120] disabled:to-[#0B1120] text-cyan-500 active:text-cyan-600 disabled:text-slate-700 border border-black rounded shadow-[0_4px_6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] disabled:shadow-none focus:outline-none transition-all"
        >
          {isProcessing ? (
            <Loader2 size={12} className="animate-spin text-cyan-500/60" />
          ) : (
            <MonitorPlay size={12} className="fill-cyan-500/40" />
          )}
          <span className="text-[10px] font-black tracking-[0.2em]">RENDER</span>
        </button>
      </div>
    </div>
  );
}

function Trash2(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>;
}

export default function Composer({ activeModule, isOpen, onClose }) {
  const { hasCapability } = useAuth();
  const canEdit = hasCapability('run');
  
  const [canvasAssets, setCanvasAssets] = useState([]);
  const [vaultAssets, setVaultAssets] = useState([]);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [vaultError, setVaultError] = useState(null);

  // Boom state
  const [boomMode, setBoomMode] = useState(null); // null | 'screen' | 'camera'
  const [boomDevices, setBoomDevices] = useState({ mics: [], cameras: [] });
  const [boomSelectedMic, setBoomSelectedMic] = useState('');
  const [boomSelectedCamera, setBoomSelectedCamera] = useState('');
  const [boomAutoTranscribe, setBoomAutoTranscribe] = useState(false);
  const [boomRecording, setBoomRecording] = useState(false);
  const [boomSegments, setBoomSegments] = useState([]); // { blob, duration }
  const [boomCurrentSegment, setBoomCurrentSegment] = useState(null);
  const [boomPreviewBlob, setBoomPreviewBlob] = useState(null);
  const [boomSaving, setBoomSaving] = useState(false);

  // Load Boom devices
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        setBoomDevices({
          mics: devs.filter(d => d.kind === 'audioinput'),
          cameras: devs.filter(d => d.kind === 'videoinput'),
        });
        if (devs.filter(d => d.kind === 'audioinput')[0]) {
          setBoomSelectedMic(devs.filter(d => d.kind === 'audioinput')[0].deviceId);
        }
        if (devs.filter(d => d.kind === 'videoinput')[0]) {
          setBoomSelectedCamera(devs.filter(d => d.kind === 'videoinput')[0].deviceId);
        }
      } catch (e) {
        console.warn('Boom devices error:', e);
      }
    };
    loadDevices();
  }, []);

  // Boom capture refs for segment handling
  const boomRecorderRef = useRef(null);
  const boomStreamRef = useRef(null);
  const boomCurrentChunksRef = useRef([]);
  const boomSegmentStartTimeRef = useRef(null);
  const boomFinalizedSegmentsRef = useRef([]); // kept segments
  const boomRevertedSegmentRef = useRef(null); // reverted/deleted segment

  // Boom capture functions
  const boomStartRecording = useCallback(async () => {
    try {
      let stream;
      if (boomMode === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { cursor: 'always' }, 
          audio: boomSelectedMic ? { deviceId: { ideal: boomSelectedMic } } : true 
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: boomSelectedCamera ? { deviceId: { ideal: boomSelectedCamera } } : true,
          audio: boomSelectedMic ? { deviceId: { ideal: boomSelectedMic } } : true,
        });
      }

      boomStreamRef.current = stream;
      boomCurrentChunksRef.current = [];
      boomSegmentStartTimeRef.current = Date.now();
      boomFinalizedSegmentsRef.current = [];
      boomRevertedSegmentRef.current = null;

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      boomRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) boomCurrentChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (boomCurrentChunksRef.current.length > 0) {
          const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
          const duration = Date.now() - boomSegmentStartTimeRef.current;
          setBoomCurrentSegment({ blob, duration, timestamp: Date.now() });
        }
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(1000);
      setBoomRecording(true);
      setBoomSegments([]);
      setBoomPreviewBlob(null);
    } catch (e) {
      console.error('Boom start error:', e);
    }
  }, [boomMode, boomSelectedMic, boomSelectedCamera]);

  const boomMark = useCallback(() => {
    if (!boomRecording || !boomRecorderRef.current) return;
    
    // Stop current recording to finalize segment
    boomRecorderRef.current.stop();
    
    // After short delay, start new recording segment
    setTimeout(() => {
      if (!boomStreamRef.current) return;
      
      // Add finalized segment to kept list
      if (boomCurrentChunksRef.current.length > 0) {
        const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
        const duration = Date.now() - boomSegmentStartTimeRef.current;
        boomFinalizedSegmentsRef.current.push({ blob, duration, timestamp: Date.now() });
        setBoomSegments([...boomFinalizedSegmentsRef.current]);
      }
      
      // Start fresh recording
      boomCurrentChunksRef.current = [];
      boomSegmentStartTimeRef.current = Date.now();
      
      const newRecorder = new MediaRecorder(boomStreamRef.current, { mimeType: 'video/webm;codecs=vp9,opus' });
      boomRecorderRef.current = newRecorder;
      
      newRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) boomCurrentChunksRef.current.push(e.data);
      };
      
      newRecorder.onstop = () => {
        if (boomCurrentChunksRef.current.length > 0) {
          const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
          const duration = Date.now() - boomSegmentStartTimeRef.current;
          setBoomCurrentSegment({ blob, duration, timestamp: Date.now() });
        }
        boomStreamRef.current?.getTracks().forEach(t => t.stop());
      };
      
      newRecorder.start(1000);
    }, 100);
  }, [boomRecording]);

  const boomRevert = useCallback(() => {
    if (boomFinalizedSegmentsRef.current.length === 0) return;
    
    // Move last finalized segment to reverted storage
    const removed = boomFinalizedSegmentsRef.current.pop();
    boomRevertedSegmentRef.current = removed;
    setBoomSegments([...boomFinalizedSegmentsRef.current]);
  }, []);

  const boomStop = useCallback(() => {
    if (!boomRecorderRef.current) return;
    
    // Stop current recording
    boomRecorderRef.current.stop();
    setBoomRecording(false);
    
    // Finalize current in-progress segment
    setTimeout(() => {
      if (boomCurrentChunksRef.current.length > 0) {
        const blob = new Blob(boomCurrentChunksRef.current, { type: 'video/webm' });
        const duration = Date.now() - boomSegmentStartTimeRef.current;
        const currentSeg = { blob, duration, timestamp: Date.now(), isCurrent: true };
        
        // Combine all kept segments + current into one final blob
        const allSegments = [...boomFinalizedSegmentsRef.current, currentSeg];
        
        if (allSegments.length === 1) {
          // Single segment - use directly
          setBoomCurrentSegment(allSegments[0].blob);
        } else {
          // Multiple segments - create combined blob (simplified: use last segment)
          // In production, would use MediaRecorder to concatenate or FFmpeg server-side
          setBoomCurrentSegment(allSegments[allSegments.length - 1].blob);
        }
      }
    }, 200);
  }, []);

  const boomSaveToVault = useCallback(async () => {
    if (!boomCurrentSegment) return;
    setBoomSaving(true);
    try {
      const file = new File([boomCurrentSegment], `boom-${Date.now()}.webm`, { type: 'video/webm' });
      
      // Prepare form data with BOOM source metadata
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tags', 'BOOM');
      
      // Use backendApi's request directly to pass form data
      const { request } = await import('../services/backendApi');
      const response = await request('/api/media/upload', {
        method: 'POST',
        body: formData,
      });
      const result = response?.data ? 
        Object.keys(response.data).reduce((acc, key) => {
          const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          acc[camelKey] = response.data[key];
          return acc;
        }, {}) : null;
      
      console.log('Boom saved to vault:', result);
      
      // Store result for transcription/forge handoff
      const vaultResult = result;
      
      // Auto-transcribe: trigger Studio transcription path
      if (boomAutoTranscribe && vaultResult?.assetId) {
        try {
          const transcriptResult = await createMediaTranscriptJobApi({
            assetId: vaultResult.assetId,
            source: 'BOOM',
          });
          console.log('Boom transcript job created:', transcriptResult);
          
          // Open Forge with the asset context after transcript trigger
          window.dispatchEvent(new CustomEvent('aio:navigate', { detail: { module: 'forge' } }));
          
          // Optionally: store transcript job info for follow-up
          if (transcriptResult?.jobId) {
            sessionStorage.setItem('boom_transcript_job_id', transcriptResult.jobId);
            sessionStorage.setItem('boom_asset_id', vaultResult.assetId);
          }
        } catch (e) {
          console.error('Boom transcript error:', e);
        }
      }
    } catch (e) {
      console.error('Boom save error:', e);
    } finally {
      setBoomSaving(false);
    }
  }, [boomCurrentSegment, boomAutoTranscribe]);

  const boomOpen = useCallback(() => setBoomMode('screen'), []);
  const boomClose = useCallback(() => { setBoomMode(null); setBoomRecording(false); setBoomPreviewBlob(null); }, []);

  // Load Vault assets on mount
  useEffect(() => {
    const loadVault = async () => {
      try {
        setVaultLoading(true);
        const data = await getVaultApi();
        setVaultAssets(Array.isArray(data) ? data : []);
        setVaultError(null);
      } catch (err) {
        setVaultError(err.message || 'Failed to load vault');
        setVaultAssets([]);
      } finally {
        setVaultLoading(false);
      }
    };
    if (isOpen) loadVault();
  }, [isOpen]);

  // Map Vault asset to Composer format
  const vaultMappedAssets = useMemo(() => {
    return vaultAssets.map(item => ({
      id: item.assetId || item.id,
      vaultAssetId: item.assetId || item.id,
      type: resolveAssetType(item.mediaType || item.mimeType),
      title: item.title || item.filename || 'Untitled',
      thumbnail: item.thumbnailUrl || item.thumbnail || null,
      url: item.sourceUrl || item.url || null,
      size: item.fileSize ? formatFileSize(item.fileSize) : null,
      duration: item.duration || null,
      mimeType: item.mimeType || null,
      createdAt: item.createdAt || null,
    }));
  }, [vaultAssets]);

  function formatFileSize(bytes) {
    if (!bytes) return null;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('compose');
  const [timelineOpen, setTimelineOpen] = useState(true);

  // Auto-populate with sample asset on first load if empty
  useEffect(() => {
    if (isOpen && canvasAssets.length === 0) {
      setCanvasAssets([
        { id: 'init-1', type: 'text', title: 'YOUR TITLE', content: 'Hello World', x: 100, y: 80, width: 200, height: 60, opacity: 1, bgColor: '#0f1218' },
        { id: 'init-2', type: 'image', title: 'Background.png', x: 80, y: 60, width: 240, height: 140, opacity: 0.3, bgColor: '#1a1d24' },
      ]);
      setSelectedAsset(null);
    }
  }, [isOpen]);

  const handleDragStart = useCallback((e, asset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
  }, []);

  const handleDropAsset = useCallback((asset, x, y) => {
    const newAsset = {
      ...asset,
      id: asset.id || `canvas-${Date.now()}`,
      vaultAssetId: asset.vaultAssetId || asset.id,
      x,
      y,
      width: 120,
      height: 80,
      opacity: 1,
      source: 'VAULT',
    };
    setCanvasAssets(prev => [...prev, newAsset]);
  }, []);

  const handleMoveAsset = useCallback((id, x, y, sourceAsset = null) => {
    setCanvasAssets(prev => {
      const exists = prev.find(a => a.id === id);
      if (exists) {
        return prev.map(a => a.id === id ? { ...a, x, y } : a);
      }
      return [...prev, { 
        ...sourceAsset, 
        id, 
        x, 
        y, 
        width: 120, 
        height: 80, 
        opacity: 1 
      }];
    });
  }, []);

  const handleSelectAsset = useCallback((asset) => {
    setSelectedAsset(asset);
  }, []);

  const handleUpdateAsset = useCallback((id, updates) => {
    setCanvasAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    setSelectedAsset(prev => prev?.id === id ? { ...prev, ...updates } : prev);
  }, []);

  const handleDeleteAsset = useCallback((id) => {
    setCanvasAssets(prev => prev.filter(a => a.id !== id));
    setSelectedAsset(prev => prev?.id === id ? null : prev);
  }, []);

  const handleRender = () => {
    setIsProcessing(true);
    setTimeout(() => setIsProcessing(false), 2000);
  };

  const handleExport = () => {
    alert('Export triggered - connects to publish pipeline');
  };

  const handleSendToFlow = () => {
    alert('Send to Flow - connects to flow pipeline');
  };

  const handleQueueSocial = () => {
    alert('Queue to Social - connects to social pipeline');
  };

  // Boom event listener - must be before any early return
  useEffect(() => {
    const handler = () => setBoomMode('screen');
    window.addEventListener('aio:open-boom', handler);
    return () => window.removeEventListener('aio:open-boom', handler);
  }, []);

  if (!isOpen) return null;

  // Boom Modal
  if (boomMode) {
    return createPortal(
      <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={boomClose}>
        <div 
          className="w-[600px] max-h-[80vh] bg-[#0f1218] border border-[#1e2024] rounded-xl shadow-[0_24px_60px_-15px_rgba(0,0,0,1)] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0f1218]">
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-cyan-400" />
              <span className="text-[11px] font-black text-slate-200 tracking-[0.15em] uppercase">BOOM</span>
              {boomRecording && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/50">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-[7px] font-black text-rose-400 uppercase tracking-wider">REC</span>
                </div>
              )}
            </div>
            <button onClick={boomClose} className="p-1.5 text-slate-500 hover:text-slate-300 rounded hover:bg-[#1e2024]">
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {/* Mode Selection */}
            {!boomRecording && !boomCurrentSegment && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">CAPTURE MODE</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBoomMode('screen')}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                        boomMode === 'screen' 
                          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' 
                          : 'border-[#1e2024] bg-[#0f1218] text-slate-400 hover:border-cyan-500/30'
                      }`}
                    >
                      <Monitor size={18} />
                      <span className="text-[10px] font-black uppercase">SCREEN + MIC</span>
                    </button>
                    <button
                      onClick={() => setBoomMode('camera')}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                        boomMode === 'camera' 
                          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' 
                          : 'border-[#1e2024] bg-[#0f1218] text-slate-400 hover:border-cyan-500/30'
                      }`}
                    >
                      <Camera size={18} />
                      <span className="text-[10px] font-black uppercase">CAMERA + MIC</span>
                    </button>
                  </div>
                </div>

                {/* Device Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">MICROPHONE</span>
                    <select 
                      value={boomSelectedMic} 
                      onChange={(e) => setBoomSelectedMic(e.target.value)}
                      className="w-full p-2 text-[9px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
                    >
                      {boomDevices.mics.map(m => (
                        <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>
                      ))}
                    </select>
                  </div>
                  {boomMode === 'camera' && (
                    <div className="space-y-1">
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">CAMERA</span>
                      <select 
                        value={boomSelectedCamera} 
                        onChange={(e) => setBoomSelectedCamera(e.target.value)}
                        className="w-full p-2 text-[9px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
                      >
                        {boomDevices.cameras.map(c => (
                          <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Auto Transcribe Toggle */}
                <div className="flex items-center justify-between p-2 rounded border border-[#1e2024] bg-[#0f1218]">
                  <div>
                    <span className="text-[8px] font-black text-slate-400 uppercase block">AUTO-TRANSCRIBE</span>
                    <span className="text-[7px] text-slate-600 font-mono">Send to Studio after save</span>
                  </div>
                  <button 
                    onClick={() => setBoomAutoTranscribe(!boomAutoTranscribe)}
                    className={`w-10 h-5 rounded-full transition-all ${boomAutoTranscribe ? 'bg-cyan-500' : 'bg-[#1e2024]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${boomAutoTranscribe ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* Start Recording */}
                <button
                  onClick={boomStartRecording}
                  disabled={!boomMode}
                  className="w-full py-3 rounded-lg bg-gradient-to-b from-rose-900/40 to-[#0a0c10] border border-rose-500/30 text-rose-400 text-[11px] font-black uppercase tracking-wider hover:from-rose-800/40 hover:to-[#0f1218] hover:border-rose-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {boomMode === 'screen' ? 'START SCREEN RECORD' : 'START CAMERA RECORD'}
                </button>
              </div>
            )}

            {/* Recording UI */}
            {boomRecording && (
              <div className="space-y-4">
                <div className="aspect-video bg-black rounded-lg border border-[#1e2024] flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-rose-500/20 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-rose-500 animate-pulse" />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase">RECORDING IN PROGRESS</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={boomMark}
                    className="flex-1 py-2 rounded-lg border border-[#1e2024] bg-[#0f1218] text-slate-400 text-[9px] font-black uppercase hover:border-cyan-500/30 hover:text-cyan-400 transition-all"
                  >
                    MARK
                  </button>
                  <button
                    onClick={boomRevert}
                    className="flex-1 py-2 rounded-lg border border-[#1e2024] bg-[#0f1218] text-slate-400 text-[9px] font-black uppercase hover:border-amber-500/30 hover:text-amber-400 transition-all"
                  >
                    REVERT
                  </button>
                  <button
                    onClick={boomStop}
                    className="flex-1 py-2 rounded-lg bg-gradient-to-b from-rose-900/40 to-[#0a0c10] border border-rose-500/30 text-rose-400 text-[9px] font-black uppercase hover:from-rose-800/40 hover:to-[#0f1218] transition-all"
                  >
                    STOP
                  </button>
                </div>
              </div>
            )}

            {/* Preview UI */}
            {boomCurrentSegment && !boomRecording && (
              <div className="space-y-4">
                <video 
                  src={URL.createObjectURL(boomCurrentSegment)} 
                  controls 
                  className="w-full aspect-video bg-black rounded-lg border border-[#1e2024]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setBoomCurrentSegment(null); setBoomMode('screen'); }}
                    className="flex-1 py-2 rounded-lg border border-[#1e2024] bg-[#0f1218] text-slate-400 text-[9px] font-black uppercase hover:border-rose-500/30 hover:text-rose-400 transition-all"
                  >
                    RE-RECORD
                  </button>
                  <button
                    onClick={boomSaveToVault}
                    disabled={boomSaving}
                    className="flex-1 py-2 rounded-lg bg-gradient-to-b from-cyan-900/40 to-[#0a0c10] border border-cyan-500/30 text-cyan-400 text-[9px] font-black uppercase hover:from-cyan-800/40 hover:to-[#0f1218] transition-all disabled:opacity-50"
                  >
                    {boomSaving ? 'SAVING...' : 'SAVE TO VAULT'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-[95vw] max-w-7xl h-[85vh] bg-[#0f1218] border border-[#1e2024] rounded-xl shadow-[0_24px_60px_-15px_rgba(0,0,0,1),0_0_0_1px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0f1218] shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-cyan-400" />
              <span className="text-[12px] font-black text-slate-200 tracking-[0.15em] uppercase">Composer</span>
            </div>
            <div className="flex items-center bg-[#0a0c10] p-[2px] rounded border border-[#1e2024] gap-[2px]">
              {[
                { id: 'compose', icon: Layout, label: 'Compose' },
                { id: 'timeline', icon: Clock, label: 'Timeline' },
                { id: 'export', icon: Download, label: 'Export' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); if (tab.id === 'timeline') setTimelineOpen(true); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.1em] transition-all focus:outline-none rounded ${
                    activeTab === tab.id 
                      ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-500/30' 
                      : 'text-slate-500 hover:text-slate-300 bg-transparent'
                  }`}
                >
                  <tab.icon size={12} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none rounded hover:bg-[#1e2024]">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <AssetTray 
            assets={vaultMappedAssets} 
            onDragStart={handleDragStart} 
          />
          <CompositionCanvas 
            assets={canvasAssets}
            onSelectAsset={handleSelectAsset}
            selectedAsset={selectedAsset}
            onMoveAsset={handleMoveAsset}
            onDropAsset={handleDropAsset}
            onDeleteAsset={handleDeleteAsset}
            snapToGrid={true}
          />
          <PropertiesPanel 
            selectedAsset={selectedAsset}
            onUpdateAsset={handleUpdateAsset}
            onDeleteAsset={handleDeleteAsset}
            aspectRatio={aspectRatio}
            onAspectChange={setAspectRatio}
          />
        </div>

        {timelineOpen && (
          <TimelineStrip 
            assets={canvasAssets}
            onSelectAsset={handleSelectAsset}
            selectedAsset={selectedAsset}
          />
        )}

        <PublishBar 
          onRender={handleRender}
          onExport={handleExport}
          onSendToFlow={handleSendToFlow}
          onQueueSocial={handleQueueSocial}
          isProcessing={isProcessing}
          assetCount={canvasAssets.length}
        />
      </div>
    </div>,
    document.body
  );
}
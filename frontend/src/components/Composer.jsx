import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Play, Loader2, Image, Video, Music, FileText, 
  GripVertical, Layers, Layout, Grid3X3, Square, MonitorPlay,
  Download, Send, Zap, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Eye, EyeOff, Sparkles, ArrowRight, Clock, CheckCircle, VideoIcon, Mic, Camera, Monitor, Square as SquareIcon, RotateCcw,
  Plus, ArrowUp, ArrowDown, Type
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MediaService } from '../services/media.service';

const ASSET_TYPES = {
  image: { icon: Image, label: 'IMAGE', color: 'cyan', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
  video: { icon: Video, label: 'VIDEO', color: 'violet', bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400' },
  audio: { icon: Music, label: 'AUDIO', color: 'emerald', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  text: { icon: FileText, label: 'TEXT', color: 'amber', bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  document: { icon: FileText, label: 'DOC', color: 'slate', bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400' },
};

const OUTPUT_FORMATS = [
  { id: '16:9', label: '16:9', aspect: '16/9', desc: 'Landscape video' },
  { id: '9:16', label: '9:16', aspect: '9/16', desc: 'Vertical / Stories' },
  { id: '1:1', label: '1:1', aspect: '1/1', desc: 'Square' },
  { id: '4:5', label: '4:5', aspect: '4/5', desc: 'Portrait post' },
  { id: '4:3', label: '4:3', aspect: '4/3', desc: 'Standard' },
  { id: '3:1', label: '3:1', aspect: '3/1', desc: 'Wide banner' },
  { id: '4:1', label: '4:1', aspect: '4/1', desc: 'Banner' },
  { id: '205:78', label: '205:78', aspect: '205/78', desc: 'FB Cover' },
];

const RESOLUTIONS = [
  { id: '1080', label: '1080p', w: 1920, h: 1080 },
  { id: '720', label: '720p', w: 1280, h: 720 },
  { id: '480', label: '480p', w: 854, h: 480 },
];

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', icon: 'f' },
  { id: 'instagram', label: 'Instagram', icon: 'ig' },
  { id: 'youtube', label: 'YouTube', icon: 'yt' },
  { id: 'tiktok', label: 'TikTok', icon: 'tt' },
  { id: 'x', label: 'X / Twitter', icon: 'x' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'in' },
];

const PLATFORM_TEMPLATES = [
  { id: 'fb-banner', name: 'FB Banner', platform: 'facebook', aspect: '205:78', aspectLabel: '205:78', res: { w: 1640, h: 624 }, desc: '820x312 cover' },
  { id: 'fb-post', name: 'FB Post', platform: 'facebook', aspect: '1:1', aspectLabel: '1:1', res: { w: 1080, h: 1080 }, desc: '1080x1080' },
  { id: 'ig-post', name: 'IG Post', platform: 'instagram', aspect: '1:1', aspectLabel: '1:1', res: { w: 1080, h: 1080 }, desc: '1080x1080' },
  { id: 'ig-story', name: 'IG Story', platform: 'instagram', aspect: '9:16', aspectLabel: '9:16', res: { w: 1080, h: 1920 }, desc: '1080x1920' },
  { id: 'ig-reel', name: 'IG Reel', platform: 'instagram', aspect: '9:16', aspectLabel: '9:16', res: { w: 1080, h: 1920 }, desc: '1080x1920' },
  { id: 'yt-banner', name: 'YT Banner', platform: 'youtube', aspect: '16:9', aspectLabel: '16:9', res: { w: 2560, h: 1440 }, desc: '2560x1440' },
  { id: 'yt-thumb', name: 'YT Thumbnail', platform: 'youtube', aspect: '16:9', aspectLabel: '16:9', res: { w: 1280, h: 720 }, desc: '1280x720' },
  { id: 'tt-video', name: 'TikTok', platform: 'tiktok', aspect: '9:16', aspectLabel: '9:16', res: { w: 1080, h: 1920 }, desc: '1080x1920' },
  { id: 'x-post', name: 'X Post', platform: 'x', aspect: '16:9', aspectLabel: '16:9', res: { w: 1200, h: 675 }, desc: '1200x675' },
  { id: 'x-header', name: 'X Header', platform: 'x', aspect: '3:1', aspectLabel: '3:1', res: { w: 1500, h: 500 }, desc: '1500x500' },
  { id: 'li-post', name: 'LinkedIn Post', platform: 'linkedin', aspect: '1:1', aspectLabel: '1:1', res: { w: 1200, h: 1200 }, desc: '1200x1200' },
  { id: 'li-banner', name: 'LI Banner', platform: 'linkedin', aspect: '4:1', aspectLabel: '4:1', res: { w: 1584, h: 396 }, desc: '1584x396' },
];

function resolveAssetType(mimeType) {
  if (!mimeType) return 'text';
  const t = mimeType.toLowerCase();
  if (t.includes('image')) return 'image';
  if (t.includes('video')) return 'video';
  if (t.includes('audio')) return 'audio';
  if (t.includes('pdf') || t.includes('document') || t.includes('spreadsheet') || t.includes('msword') || t.includes('officedocument')) return 'document';
  return 'text';
}

const FONT_OPTIONS = [
  { id: 'sans', label: 'Sans', family: 'Inter, system-ui, sans-serif' },
  { id: 'serif', label: 'Serif', family: 'Georgia, serif' },
  { id: 'mono', label: 'Mono', family: 'JetBrains Mono, monospace' },
  { id: 'display', label: 'Display', family: 'Impact, sans-serif' },
];

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80];

const FONT_STYLES = [
  { id: 'normal', label: 'Regular' },
  { id: 'bold', label: 'Bold' },
  { id: 'italic', label: 'Italic' },
];

function AssetTray({ assets, onDragStart, onTemplateSelect, onAddText }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedCats, setExpandedCats] = useState({});
  const [expandedPlatforms, setExpandedPlatforms] = useState({});

  const categories = [
    { id: 'image', label: 'Images', icon: Image },
    { id: 'video', label: 'Video', icon: Video },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'text', label: 'Text', icon: FileText },
    { id: 'document', label: 'Documents', icon: FileText },
  ];

  const getAssetsByCategory = (cat) => {
    return assets.filter(a => a.type === cat);
  };

  const getTemplatesByPlatform = (pid) => {
    return PLATFORM_TEMPLATES.filter(t => t.platform === pid);
  };

  const handleMultiSelect = (id, e) => {
    if (e.shiftKey || e.ctrlKey) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else {
      setSelectedIds([id]);
    }
  };

  const toggle = (set, key) => set(s => ({ ...s, [key]: !s[key] }));

  return (
    <div className="w-56 flex-shrink-0 bg-[#0a0c10] border-r border-[#1e2024] flex flex-col">
      <div className="px-3 py-2.5 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0a0c10]">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]">VAULT</span>
          <span className="text-[7px] text-slate-600 font-mono">{assets.length}</span>
        </div>
      </div>
      
      <div className="flex-1 p-2 overflow-y-auto space-y-1">
        <button
          onClick={onAddText}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded border border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 transition-all"
        >
          <Type size={10} />
          <span className="text-[8px] font-black uppercase tracking-wider">Add Text Layer</span>
        </button>
        {categories.map(cat => {
          const catAssets = getAssetsByCategory(cat.id);
          const isOpen = expandedCats[cat.id];
          const CatIcon = cat.icon;
          return (
            <div key={cat.id} className="space-y-1">
              <button
                onClick={() => toggle(setExpandedCats, cat.id)}
                className="w-full rounded border border-[#1e2024] bg-[#0f1218] px-2 py-1.5 text-left transition hover:border-cyan-500/30 hover:bg-[#141820] flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5">
                  <CatIcon size={10} className="text-slate-500" />
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{cat.label}</span>
                </div>
                <span className="text-[7px] text-slate-600 font-mono">{isOpen ? '▾' : '▸'} {catAssets.length}</span>
              </button>
              {isOpen && catAssets.length > 0 && (
                <div className="space-y-1 pl-1">
                  {catAssets.map(asset => {
                    const typeInfo = ASSET_TYPES[asset.type] || ASSET_TYPES.text;
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
                        className={`relative p-1.5 rounded cursor-grab active:cursor-grabbing transition-all border flex items-center gap-2 ${
                          isSelected ? 'border-cyan-500 bg-cyan-500/10'
                            : isHovered ? 'border-cyan-500/50 bg-[#141820]'
                            : 'border-[#1e2024] bg-[#0f1218] hover:border-cyan-500/30'
                        }`}
                      >
                        {asset.thumbnail ? (
                          <div className="w-7 h-7 rounded bg-[#1a1d24] overflow-hidden flex items-center justify-center shrink-0">
                            <img src={asset.thumbnail} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${typeInfo.bg} border ${typeInfo.border}`}>
                            {React.createElement(typeInfo.icon, { size: 12, className: typeInfo.text })}
                          </div>
                        )}
                        <span className="text-[7px] text-slate-300 truncate font-medium">{asset.title}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {isOpen && catAssets.length === 0 && (
                <div className="text-[7px] text-slate-600 italic pl-2">empty</div>
              )}
            </div>
          );
        })}

        <div className="border-t border-[#1e2024] pt-1 mt-2">
          <button
            onClick={() => toggle(setExpandedCats, '_templates')}
            className="w-full rounded border border-[#1e2024] bg-[#0f1218] px-2 py-1.5 text-left transition hover:border-amber-500/30 hover:bg-[#141820] flex items-center justify-between"
          >
            <div className="flex items-center gap-1.5">
              <Zap size={10} className="text-amber-400" />
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Templates</span>
            </div>
            <span className="text-[7px] text-slate-600 font-mono">{expandedCats._templates ? '▾' : '▸'} {PLATFORM_TEMPLATES.length}</span>
          </button>
          {expandedCats._templates && (
            <div className="space-y-0.5 mt-1">
              {PLATFORMS.map(p => {
                const pTemplates = getTemplatesByPlatform(p.id);
                const pOpen = expandedPlatforms[p.id];
                return (
                  <div key={p.id}>
                    <button
                      onClick={() => toggle(setExpandedPlatforms, p.id)}
                      className="w-full flex items-center justify-between px-2 py-1 text-[7px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition"
                    >
                      <span>{p.label}</span>
                      <span className="text-[6px] text-slate-600 font-mono">{pOpen ? '▾' : '▸'} {pTemplates.length}</span>
                    </button>
                    {pOpen && pTemplates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => onTemplateSelect?.(t)}
                        className="w-full flex items-center justify-between pl-4 pr-2 py-1 text-[7px] text-slate-400 hover:text-cyan-400 hover:bg-[#141820] rounded transition-all"
                      >
                        <span className="truncate">{t.name}</span>
                        <span className="text-[6px] text-slate-600 font-mono shrink-0 ml-1">{t.aspectLabel}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompositionCanvas({ assets, layers, onSelectAsset, selectedAsset, onMoveAsset, onDeleteAsset, onDropAsset, snapToGrid = true, outputFormat = '16:9', onUpdateAsset, onContextMenu }) {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverPos, setDragOverPos] = useState(null);

  const fmt = OUTPUT_FORMATS.find(f => f.id === outputFormat) || OUTPUT_FORMATS[0];
  const GRID = 20;

  const snap = useCallback((v) => snapToGrid ? Math.round(v / GRID) * GRID : v, [snapToGrid]);

  const [dragState, setDragState] = useState(null);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setContainerSize({ w: r.width, h: r.height });
      }
    };
    measure();
    const obs = new ResizeObserver(measure);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const canvasDims = useMemo(() => {
    const pad = 40;
    const maxW = containerSize.w - pad * 2;
    const maxH = containerSize.h - pad * 2;
    const parts = fmt.aspect.split('/').map(Number);
    const ar = parts[0] / (parts[1] || 1);
    let cw, ch;
    if (maxW / ar <= maxH) { cw = maxW; ch = maxW / ar; }
    else { ch = maxH; cw = maxH * ar; }
    return { w: Math.max(100, cw), h: Math.max(100, ch) };
  }, [containerSize, fmt.aspect]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(5, Math.max(0.2, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => { setIsPanning(false); }, []);

  const canvasOffset = useCallback(() => {
    const ox = (containerSize.w - canvasDims.w * zoom) / 2 + pan.x;
    const oy = (containerSize.h - canvasDims.h * zoom) / 2 + pan.y;
    return { ox, oy };
  }, [containerSize, canvasDims, zoom, pan]);

  const screenToCanvas = useCallback((clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    const { ox, oy } = canvasOffset();
    return {
      x: (clientX - rect.left - ox) / zoom,
      y: (clientY - rect.top - oy) / zoom,
    };
  }, [canvasOffset, zoom]);

  const handleDragOver = (e) => {
    e.preventDefault();
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    setDragOverPos({ x: Math.max(0, x), y: Math.max(0, y) });
    setIsDragOver(true);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const assetData = e.dataTransfer.getData('application/json');
      if (assetData) {
        const asset = JSON.parse(assetData);
        const { x, y } = screenToCanvas(e.clientX, e.clientY);
        const sx = snap(Math.max(0, x - 60));
        const sy = snap(Math.max(0, y - 40));
        if (onDropAsset) { onDropAsset(asset, sx, sy); }
        else { onMoveAsset(asset.id, sx, sy); }
      }
    } catch {}
    setDragOverPos(null);
  };

  const handleAssetMouseDown = useCallback((e, item) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelectAsset(item);
    const { x: cx, y: cy } = screenToCanvas(e.clientX, e.clientY);
    setDragState({ assetId: item.id, offsetX: cx - (item.x || 0), offsetY: cy - (item.y || 0) });
  }, [onSelectAsset, screenToCanvas]);

  const [resizeState, setResizeState] = useState(null);

  const handleResizeStart = useCallback((e, assetId, corner) => {
    e.stopPropagation();
    e.preventDefault();
    const item = assets.find(a => a.id === assetId);
    if (!item) return;
    setResizeState({ assetId, startX: e.clientX, startY: e.clientY, startW: item.width || 120, startH: item.height || 80 });
  }, [assets]);

  useEffect(() => {
    if (!resizeState) return;
    const handleMove = (e) => {
      const dx = (e.clientX - resizeState.startX) / zoom;
      const dy = (e.clientY - resizeState.startY) / zoom;
      const newW = Math.max(20, snap(resizeState.startW + dx));
      const newH = Math.max(20, snap(resizeState.startH + dy));
      onUpdateAsset?.(resizeState.assetId, { width: newW, height: newH });
    };
    const handleUp = () => { setResizeState(null); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [resizeState, zoom, snap, onUpdateAsset]);

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (e) => {
      const { x: cx, y: cy } = screenToCanvas(e.clientX, e.clientY);
      const nx = snap(cx - dragState.offsetX);
      const ny = snap(cy - dragState.offsetY);
      onMoveAsset(dragState.assetId, nx, ny);
    };
    const handleUp = () => { setDragState(null); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragState, screenToCanvas, snap, onMoveAsset]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0f1218]">
        <Layout size={12} className="text-cyan-400" />
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">CANVAS</span>
        <span className="text-[7px] text-slate-600 font-mono ml-2">{fmt.label} • {Math.round(canvasDims.w)}x{Math.round(canvasDims.h)}</span>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[7px] text-slate-600 font-mono">{assets.length} LAYERS</span>
        </div>
      </div>
      
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={() => { setIsDragOver(false); setDragOverPos(null); }}
        onDrop={handleDrop}
        onClick={(e) => { if (e.target === containerRef.current) onSelectAsset(null); }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 relative overflow-hidden cursor-crosshair ${isPanning ? 'cursor-grabbing' : ''}`}
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #1a1d24 1px, transparent 0)',
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          backgroundColor: '#080a0f',
        }}
      >
        {/* Auto-fitted canvas frame — always visible */}
        <div
          className="absolute border border-cyan-500/8 rounded-lg"
          style={{
            left: (containerSize.w - canvasDims.w * zoom) / 2 + pan.x,
            top: (containerSize.h - canvasDims.h * zoom) / 2 + pan.y,
            width: canvasDims.w * zoom,
            height: canvasDims.h * zoom,
          }}
        >
          {/* Outer format boundary — dotted perimeter (grey) */}
          <div className="absolute inset-0 border-2 border-dashed border-slate-600/40 rounded pointer-events-none">
            <span className="absolute top-1 left-1.5 text-[7px] text-slate-500/50 font-black tracking-[0.15em]">{fmt.label}</span>
          </div>

          {/* Inner safe/workable area — thin solid line (cyan) */}
          <div className="absolute pointer-events-none rounded-sm" style={{ inset: `${Math.max(8, Math.min(canvasDims.w, canvasDims.h) * 0.04)}px`, border: '1px solid rgba(6,182,212,0.25)' }} />

          {/* Assets — ordered by layer, hidden layers skipped */}
          {(() => {
            const visibleLayers = (layers || []).filter(l => l.visible !== false);
            const layerOrder = visibleLayers.map(l => l.id);
            const sortedAssets = [...(assets || [])].sort((a, b) => {
              const la = layerOrder.indexOf(a.layerId || 'main');
              const lb = layerOrder.indexOf(b.layerId || 'main');
              return (la < 0 ? 999 : la) - (lb < 0 ? 999 : lb);
            });
            return sortedAssets;
          })().map((item, idx) => {
            const layerItem = (layers || []).find(l => l.id === (item.layerId || 'main'));
            if (layerItem && layerItem.visible === false) return null;
            if (item.visible === false) return null;
            const typeInfo = ASSET_TYPES[item.type] || ASSET_TYPES.text;
            const isSelected = selectedAsset?.id === item.id;
            const fontObj = FONT_OPTIONS.find(f => f.id === item.fontFamily) || FONT_OPTIONS[0];
            const isNativeText = item.type === 'text' && item.source !== 'VAULT';
            const showBorder = item.type === 'text' && item.source === 'VAULT' ? (item.showBorder !== false) : !isNativeText;
            return (
              <div
                key={item.id}
                onMouseDown={(e) => handleAssetMouseDown(e, item)}
                onContextMenu={(e) => onContextMenu?.(e, item.id)}
                className={`absolute cursor-move transition-shadow duration-75 group`}
                style={{ left: (item.x || 0) * zoom, top: (item.y || 0) * zoom, width: (item.width || 120) * zoom, height: (item.height || 80) * zoom, zIndex: isSelected ? 50 : idx + 1 }}
              >
                {isNativeText ? (
                  <div
                    className={`w-full h-full flex items-center justify-center transition-shadow ${isSelected ? 'ring-1 ring-cyan-500/50' : ''}`}
                    style={{ opacity: item.opacity ?? 1 }}
                  >
                    <textarea
                      value={item.content || ''}
                      onChange={(e) => { e.stopPropagation(); onUpdateAsset?.(item.id, { content: e.target.value }); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-full bg-transparent text-white resize-none focus:outline-none p-1 leading-tight placeholder:text-slate-500/40"
                      style={{
                        fontFamily: fontObj.family,
                        fontSize: `${Math.max(8, (item.fontSize || 14) * zoom)}px`,
                        fontStyle: item.fontStyle === 'italic' ? 'italic' : 'normal',
                        fontWeight: item.fontStyle === 'bold' ? 'bold' : 'normal',
                        textAlign: 'center',
                      }}
                      placeholder="Type here..."
                    />
                  </div>
                ) : (
                  <div
                    className={`w-full h-full rounded-lg overflow-hidden flex items-center justify-center shadow-lg transition-shadow ${showBorder ? (isSelected ? 'border-2 border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.4)]' : 'border-2 border-[#1e2024] hover:border-cyan-500/50') : ''}`}
                    style={{ backgroundColor: item.bgColor || (item.type === 'text' ? 'transparent' : '#0f1218'), opacity: item.opacity ?? 1 }}
                  >
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : item.type === 'text' ? (
                      <textarea
                        value={item.content || ''}
                        onChange={(e) => { e.stopPropagation(); onUpdateAsset?.(item.id, { content: e.target.value }); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full h-full bg-transparent text-white resize-none focus:outline-none p-1 leading-tight"
                        style={{
                          fontFamily: fontObj.family,
                          fontSize: `${Math.max(8, (item.fontSize || 14) * zoom)}px`,
                          fontStyle: item.fontStyle === 'italic' ? 'italic' : 'normal',
                          fontWeight: item.fontStyle === 'bold' ? 'bold' : 'normal',
                          textAlign: 'center',
                        }}
                        placeholder="Type here..."
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        {React.createElement(typeInfo.icon, { size: 24 * zoom, className: typeInfo.text })}
                        {item.content && <span className="text-[8px] text-slate-400 truncate max-w-[100px]">{item.content}</span>}
                      </div>
                    )}
                  </div>
                )}
                {/* Resize handles */}
                {isSelected && (
                  <>
                    <div onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); handleResizeStart(e, item.id, 'se'); }} className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-cyan-500 border border-white rounded-sm cursor-se-resize z-50" />
                  </>
                )}
              </div>
            );
          })}

          {/* Empty center prompt */}
          {assets.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2 opacity-20">
                <Image size={18} className="text-slate-400" />
                <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Drop Asset</span>
              </div>
            </div>
          )}

          {/* Drag-over preview */}
          {isDragOver && dragOverPos && (
            <div className="absolute border-2 border-dashed border-cyan-500/50 bg-cyan-500/5 rounded-lg pointer-events-none"
              style={{ left: dragOverPos.x * zoom, top: dragOverPos.y * zoom, width: 120 * zoom, height: 80 * zoom }}
            />
          )}
        </div>

        {/* Pan/Zoom overlay */}
        <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1 z-50">
          <button onClick={() => setPan(p => ({ ...p, y: p.y + 40 }))} className="w-6 h-5 flex items-center justify-center rounded border border-[#1e2024] bg-[#0f1218]/90 text-slate-500 hover:text-slate-300 hover:border-cyan-500/40 transition-all"><ChevronUp size={10} /></button>
          <div className="flex items-center gap-1">
            <button onClick={() => setPan(p => ({ ...p, x: p.x + 40 }))} className="w-6 h-5 flex items-center justify-center rounded border border-[#1e2024] bg-[#0f1218]/90 text-slate-500 hover:text-slate-300 hover:border-cyan-500/40 transition-all"><ChevronLeft size={10} /></button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="w-7 h-5 flex items-center justify-center rounded border border-[#1e2024] bg-[#0f1218]/90 text-[7px] font-bold text-slate-400 hover:text-slate-200 hover:border-cyan-500/40 transition-all">{Math.round(zoom * 100)}</button>
            <button onClick={() => setPan(p => ({ ...p, x: p.x - 40 }))} className="w-6 h-5 flex items-center justify-center rounded border border-[#1e2024] bg-[#0f1218]/90 text-slate-500 hover:text-slate-300 hover:border-cyan-500/40 transition-all"><ChevronRight size={10} /></button>
          </div>
          <button onClick={() => setPan(p => ({ ...p, y: p.y - 40 }))} className="w-6 h-5 flex items-center justify-center rounded border border-[#1e2024] bg-[#0f1218]/90 text-slate-500 hover:text-slate-300 hover:border-cyan-500/40 transition-all"><ChevronDown size={10} /></button>
          <div className="flex items-center gap-0.5 mt-0.5">
            <button onClick={() => setZoom(z => Math.min(5, z * 1.2))} className="w-6 h-5 flex items-center justify-center rounded border border-[#1e2024] bg-[#0f1218]/90 text-[9px] font-bold text-slate-500 hover:text-slate-300 hover:border-cyan-500/40 transition-all">+</button>
            <button onClick={() => setZoom(z => Math.max(0.2, z / 1.2))} className="w-6 h-5 flex items-center justify-center rounded border border-[#1e2024] bg-[#0f1218]/90 text-[9px] font-bold text-slate-500 hover:text-slate-300 hover:border-cyan-500/40 transition-all">−</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertiesPanel({ selectedAsset, onUpdateAsset, onDeleteAsset, outputFormat, onFormatChange, resolution, onResolutionChange, platform, onPlatformChange, canvasAssets, onSelectAsset, onMoveLayer, onToggleVisibility, canvasLayers, onAddLayer, onRenameLayer, onDeleteLayer, onToggleLayerVisibility, onAssetToLayer }) {
  const [outputOpen, setOutputOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [renamingLayer, setRenamingLayer] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const selectClass = "w-full bg-[#0f1218] border border-[#1e2024] rounded px-2 py-1.5 text-[8px] text-slate-300 font-mono focus:border-cyan-500 focus:outline-none";
  const labelClass = "text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1";

  const handleLayerDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleLayerDragOver = (e, id) => {
    e.preventDefault();
    if (dragId && dragId !== id) setDragOverId(id);
  };
  const handleLayerDrop = (e, targetId) => {
    e.preventDefault();
    if (dragId && dragId !== targetId) {
      onMoveLayer(dragId, targetId);
    }
    setDragId(null);
    setDragOverId(null);
  };
  const handleLayerDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const startRename = (layer) => {
    setRenamingLayer(layer.id);
    setRenameValue(layer.name);
  };
  const finishRename = () => {
    if (renamingLayer && renameValue.trim()) {
      onRenameLayer(renamingLayer, renameValue.trim());
    }
    setRenamingLayer(null);
  };

  return (
    <div className="w-56 flex-shrink-0 bg-[#0a0c10] border-l border-[#1e2024] flex flex-col">
      {/* OUTPUT — collapsible */}
      <button onClick={() => setOutputOpen(!outputOpen)} className="w-full flex items-center justify-between px-3 py-2 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0a0c10] hover:from-[#1a1e28] hover:to-[#0f1218] transition-all">
        <div className="flex items-center gap-2">
          <Layout size={10} className="text-cyan-400" />
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">OUTPUT</span>
        </div>
        <span className="text-[7px] text-slate-600">{outputOpen ? '▾' : '▸'}</span>
      </button>
      {outputOpen && (
        <div className="p-3 space-y-3 border-b border-[#1e2024]">
          <div>
            <span className={labelClass}>Format</span>
            <select value={outputFormat} onChange={(e) => onFormatChange(e.target.value)} className={selectClass}>
              {OUTPUT_FORMATS.map(f => (<option key={f.id} value={f.id}>{f.label} — {f.desc}</option>))}
            </select>
          </div>
          <div>
            <span className={labelClass}>Resolution</span>
            <select value={resolution} onChange={(e) => onResolutionChange(e.target.value)} className={selectClass}>
              {RESOLUTIONS.map(r => (<option key={r.id} value={r.id}>{r.label} ({r.w}x{r.h})</option>))}
            </select>
          </div>
          <div>
            <span className={labelClass}>Platform</span>
            <select value={platform} onChange={(e) => onPlatformChange(e.target.value)} className={selectClass}>
              <option value="none">None</option>
              {PLATFORMS.map(p => (<option key={p.id} value={p.id}>{p.label}</option>))}
            </select>
          </div>
        </div>
      )}

{/* LAYERS — collapsible */}
      <button onClick={() => setLayersOpen(!layersOpen)} className="w-full flex items-center justify-between px-3 py-2 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0a0c10] hover:from-[#1a1e28] hover:to-[#0f1218] transition-all">
        <div className="flex items-center gap-2">
          <Layers size={10} className="text-cyan-400" />
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">LAYERS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] text-slate-600 font-mono">{canvasLayers?.length || 0}</span>
          <span className="text-[7px] text-slate-600">{layersOpen ? '▾' : '▸'}</span>
        </div>
      </button>
      {layersOpen && (
        <div className="border-b border-[#1e2024] max-h-52 overflow-y-auto">
          <div className="flex items-center justify-end px-2 py-1 border-b border-[#1e2024]/50">
            <button onClick={onAddLayer} className="flex items-center gap-1 px-1.5 py-0.5 text-[7px] font-bold uppercase rounded border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:bg-cyan-500/10 transition-all">
              <Plus size={8} />
              <span>Layer</span>
            </button>
          </div>
          {(canvasLayers || []).map((layer) => {
            const layerAssets = (canvasAssets || []).filter(a => (a.layerId || 'main') === layer.id);
            return (
              <div key={layer.id}>
                <div
                  className={`flex items-center gap-1 px-2 py-1.5 border-l-2 ${selectedAsset?.layerId === layer.id ? 'border-l-cyan-500 bg-cyan-500/5' : 'border-l-transparent hover:bg-[#0f1218]'}`}
                >
                  <button onClick={() => onToggleLayerVisibility(layer.id)} className="p-0.5 text-slate-600 hover:text-slate-300 transition-colors shrink-0">
                    {layer.visible !== false ? <Eye size={9} /> : <EyeOff size={9} />}
                  </button>
                  {renamingLayer === layer.id ? (
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={finishRename}
                      onKeyDown={(e) => { if (e.key === 'Enter') finishRename(); }}
                      className="flex-1 min-w-0 bg-[#0a0c10] border border-cyan-500/30 rounded px-1 py-0 text-[7px] text-slate-300 font-mono focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <span
                      onDoubleClick={() => startRename(layer)}
                      className="text-[7px] text-slate-400 font-mono truncate flex-1 min-w-0 cursor-default hover:text-slate-200"
                    >
                      {layer.name}
                      <span className="text-slate-600 ml-1">{layerAssets.length}</span>
                    </span>
                  )}
                  {layer.id !== 'main' && (
                    <button onClick={() => onDeleteLayer(layer.id)} className="p-0.5 text-slate-700 hover:text-rose-400 transition-colors shrink-0">
                      <X size={7} />
                    </button>
                  )}
                </div>
                {layerAssets.map((item) => {
                  const typeInfo = ASSET_TYPES[item.type] || ASSET_TYPES.text;
                  const isSelected = selectedAsset?.id === item.id;
                  const itemVisible = item.visible !== false;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleLayerDragStart(e, item.id)}
                      onDragOver={(e) => handleLayerDragOver(e, item.id)}
                      onDrop={(e) => handleLayerDrop(e, item.id)}
                      onDragEnd={handleLayerDragEnd}
                      onClick={() => onSelectAsset(item)}
                      className={`flex items-center gap-1 pl-5 pr-2 py-1 cursor-pointer transition-all border-l-2 ${
                        isSelected ? 'bg-cyan-500/10 border-l-cyan-500' : 'border-l-transparent hover:bg-[#141820]'
                      } ${!itemVisible ? 'opacity-40' : ''}`}
                    >
                      <GripVertical size={7} className="text-slate-700 cursor-grab shrink-0" />
                      {React.createElement(typeInfo.icon, { size: 8, className: typeInfo.text })}
                      <span className="text-[7px] text-slate-500 font-mono truncate flex-1">{item.title?.slice(0, 14) || 'Item'}</span>
                      <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(item.id); }} className="p-0.5 text-slate-700 hover:text-slate-300 transition-colors shrink-0">
                        {itemVisible ? <Eye size={7} /> : <EyeOff size={7} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {(canvasLayers || []).length === 0 && (
            <div className="flex items-center justify-center py-3">
              <span className="text-[7px] text-slate-600 italic">No layers</span>
            </div>
          )}
</div>
      )}

      {/* SELECTED ASSET or empty prompt */}
      {!selectedAsset ? (
        <div className="flex-1 p-4 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-[#12151c] border border-[#1e2024] flex items-center justify-center mb-3">
            <Eye size={20} className="text-slate-600" />
          </div>
          <span className="text-[10px] text-slate-400 font-medium mb-1">SELECT AN ASSET</span>
          <span className="text-[8px] text-slate-600 font-mono">to edit properties</span>
        </div>
      ) : (
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        <div className="space-y-1.5">
          <span className={labelClass}>ASSET</span>
          <div className="flex items-center gap-2 p-2 rounded border border-[#1e2024] bg-[#0f1218]">
            {(() => {
              const typeInfo = ASSET_TYPES[selectedAsset.type] || ASSET_TYPES.text;
              return React.createElement(typeInfo.icon, { size: 16, className: typeInfo.text });
            })()}
            <span className="text-[9px] text-slate-300 font-mono truncate">{selectedAsset.title}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={labelClass}>OPACITY</span>
            <span className="text-[8px] text-slate-400 font-mono">{Math.round((selectedAsset.opacity ?? 1) * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="0" max="100" 
            value={(selectedAsset.opacity ?? 1) * 100}
            onChange={(e) => onUpdateAsset(selectedAsset.id, { opacity: parseInt(e.target.value) / 100 })}
            className="w-full h-1.5 bg-[#1e2024] rounded appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        <div className="space-y-1.5">
          <span className={labelClass}>POSITION</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[6px] text-slate-600 w-3">X</span>
              <input type="number" value={Math.round(selectedAsset.x || 0)}
                onChange={(e) => onUpdateAsset(selectedAsset.id, { x: parseInt(e.target.value) || 0 })}
                className="w-full p-1 text-[8px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[6px] text-slate-600 w-3">Y</span>
              <input type="number" value={Math.round(selectedAsset.y || 0)}
                onChange={(e) => onUpdateAsset(selectedAsset.id, { y: parseInt(e.target.value) || 0 })}
                className="w-full p-1 text-[8px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {selectedAsset.type === 'text' && (
          <div className="space-y-1.5">
            <span className={labelClass}>CONTENT</span>
            <textarea 
              value={selectedAsset.content || ''}
              onChange={(e) => onUpdateAsset(selectedAsset.id, { content: e.target.value })}
              className="w-full h-16 p-2 text-[9px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded resize-none focus:border-cyan-500 focus:outline-none"
              placeholder="Enter text..."
            />
          </div>
        )}

        {selectedAsset.type === 'text' && (
          <div className="space-y-1.5">
            <span className={labelClass}>FONT</span>
            <select value={selectedAsset.fontFamily || 'sans'} onChange={(e) => onUpdateAsset(selectedAsset.id, { fontFamily: e.target.value })} className={selectClass}>
              {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        )}

        {selectedAsset.type === 'text' && (
          <div className="space-y-1.5">
            <span className={labelClass}>SIZE</span>
            <select value={selectedAsset.fontSize || 14} onChange={(e) => onUpdateAsset(selectedAsset.id, { fontSize: parseInt(e.target.value) })} className={selectClass}>
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
            </select>
          </div>
        )}

        {selectedAsset.type === 'text' && (
          <div className="space-y-1.5">
            <span className={labelClass}>STYLE</span>
            <div className="flex gap-1">
              {FONT_STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => onUpdateAsset(selectedAsset.id, { fontStyle: s.id })}
                  className={`flex-1 px-2 py-1 text-[7px] font-black uppercase rounded border transition-all ${
                    (selectedAsset.fontStyle || 'normal') === s.id
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                      : 'border-[#1e2024] bg-[#0f1218] text-slate-500 hover:border-cyan-500/30'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedAsset.type === 'text' && selectedAsset.source === 'VAULT' && (
          <div className="space-y-1.5">
            <span className={labelClass}>BORDER</span>
            <div className="flex gap-1">
              {[
                { id: 'on', label: 'On' },
                { id: 'off', label: 'Off' },
              ].map(b => (
                <button
                  key={b.id}
                  onClick={() => onUpdateAsset(selectedAsset.id, { showBorder: b.id === 'on' })}
                  className={`flex-1 px-2 py-1 text-[7px] font-black uppercase rounded border transition-all ${
                    (selectedAsset.showBorder !== false ? true : false) === (b.id === 'on')
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                      : 'border-[#1e2024] bg-[#0f1218] text-slate-500 hover:border-cyan-500/30'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(selectedAsset.type === 'image' || selectedAsset.type === 'video' || selectedAsset.type === 'text') && (
          <div className="space-y-1.5">
            <span className={labelClass}>SIZE</span>
            <div className="flex gap-2">
              <div className="flex-1">
                <span className="text-[6px] text-slate-600 block mb-1">W</span>
                <input type="number" value={selectedAsset.width || 120}
                  onChange={(e) => onUpdateAsset(selectedAsset.id, { width: parseInt(e.target.value) || 100 })}
                  className="w-full p-1 text-[8px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <span className="text-[6px] text-slate-600 block mb-1">H</span>
                <input type="number" value={selectedAsset.height || 80}
                  onChange={(e) => onUpdateAsset(selectedAsset.id, { height: parseInt(e.target.value) || 60 })}
                  className="w-full p-1 text-[8px] text-slate-300 font-mono bg-[#0f1218] border border-[#1e2024] rounded focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        <button 
          onClick={() => onDeleteAsset(selectedAsset.id)}
          className="flex items-center justify-center gap-1 px-1.5 py-0.5 text-[7px] font-bold uppercase rounded border border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10 transition-all"
        >
          <Trash2 size={8} />
        </button>
      </div>
      )}
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
        <span className="text-[8px] text-slate-600 font-mono">EXPORT {OUTPUT_FORMATS[0].label} MP4</span>
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
  const [canvasLayers, setCanvasLayers] = useState([
    { id: 'main', name: 'Main', visible: true },
  ]);
  const [contextMenu, setContextMenu] = useState(null);
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
      
      const result = await MediaService.uploadMediaFile(file, 'BOOM');
      
      console.log('Boom saved to vault:', result);
      
      // Store result for transcription/forge handoff
      const vaultResult = result;
      
      // Auto-transcribe: trigger Studio transcription path
      if (boomAutoTranscribe && vaultResult?.assetId) {
        try {
          const transcriptResult = await MediaService.createMediaTranscriptJob({
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
        const data = await MediaService.getVault();
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
  const [outputFormat, setOutputFormat] = useState('16:9');
  const [resolution, setResolution] = useState('1080');
  const [platform, setPlatform] = useState('none');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('program');
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [aiGoal, setAiGoal] = useState('');
  const [aiMode, setAiMode] = useState('vector_delta');

  const handleDragStart = useCallback((e, asset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
  }, []);

  const handleDropAsset = useCallback((asset, x, y) => {
    const isTextType = asset.type === 'text' || asset.type === 'document';
    const newAsset = {
      ...asset,
      id: asset.id || `canvas-${Date.now()}`,
      vaultAssetId: asset.vaultAssetId || asset.id,
      x,
      y,
      width: isTextType ? 240 : 120,
      height: isTextType ? 60 : 80,
      opacity: 1,
      visible: true,
      layerId: 'main',
      source: 'VAULT',
    };
    if (isTextType) {
      newAsset.type = 'text';
      newAsset.fontFamily = 'sans';
      newAsset.fontSize = 14;
      newAsset.fontStyle = 'bold';
      newAsset.bgColor = 'transparent';
      if (asset.content) {
        newAsset.content = asset.content;
        setCanvasAssets(prev => [...prev, newAsset]);
      } else if (asset.url) {
        setCanvasAssets(prev => [...prev, { ...newAsset, content: 'Loading...' }]);
        fetch(asset.url)
          .then(r => r.ok ? r.text() : '')
          .then(text => {
            const content = text.slice(0, 5000) || asset.title || 'Text';
            setCanvasAssets(prev => prev.map(a => a.id === newAsset.id ? { ...a, content } : a));
          })
          .catch(() => {
            setCanvasAssets(prev => prev.map(a => a.id === newAsset.id ? { ...a, content: asset.title || 'Text' } : a));
          });
      } else {
        newAsset.content = asset.title || 'Text';
        setCanvasAssets(prev => [...prev, newAsset]);
      }
    } else {
      setCanvasAssets(prev => [...prev, newAsset]);
    }
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

  const handleAddText = useCallback(() => {
    const id = `text-${Date.now()}`;
    const layer = {
      id,
      type: 'text',
      title: 'Text Layer',
      content: '',
      x: 40, y: 40,
      width: 240, height: 60,
      opacity: 1,
      visible: true,
      layerId: 'main',
      bgColor: 'transparent',
      fontFamily: 'sans',
      fontSize: 14,
      fontStyle: 'bold',
    };
    setCanvasAssets(prev => [...prev, layer]);
    setSelectedAsset(layer);
  }, []);

  const handleMoveLayer = useCallback((sourceId, targetId) => {
    setCanvasLayers(prev => {
      const srcIdx = prev.findIndex(l => l.id === sourceId);
      const tgtIdx = prev.findIndex(l => l.id === targetId);
      if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, moved);
      return next;
    });
  }, []);

  const handleToggleVisibility = useCallback((id) => {
    setCanvasAssets(prev => prev.map(a => a.id === id ? { ...a, visible: !a.visible } : a));
    setSelectedAsset(prev => prev?.id === id ? { ...prev, visible: !prev.visible } : prev);
  }, []);

  const handleAddLayer = useCallback(() => {
    const id = `layer-${Date.now()}`;
    setCanvasLayers(prev => [...prev, { id, name: `Layer ${prev.length + 1}`, visible: true }]);
  }, []);

  const handleRenameLayer = useCallback((layerId, name) => {
    setCanvasLayers(prev => prev.map(l => l.id === layerId ? { ...l, name } : l));
  }, []);

  const handleToggleLayerVisibility = useCallback((layerId) => {
    setCanvasLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l));
  }, []);

  const handleDeleteLayer = useCallback((layerId) => {
    if (layerId === 'main') return;
    setCanvasAssets(prev => prev.filter(a => a.layerId !== layerId).map(a => a.layerId === layerId ? { ...a, layerId: 'main' } : a));
    setCanvasLayers(prev => prev.filter(l => l.id !== layerId));
  }, []);

  const handleAssetToLayer = useCallback((assetId, layerId) => {
    setCanvasAssets(prev => prev.map(a => a.id === assetId ? { ...a, layerId } : a));
    setSelectedAsset(prev => prev?.id === assetId ? { ...prev, layerId } : prev);
    setContextMenu(null);
  }, []);

  const handleContextMenu = useCallback((e, assetId) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, assetId });
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

  const handleAutoCompose = useCallback(() => {
    const source = canvasAssets.length > 0 ? canvasAssets : vaultMappedAssets;
    if (source.length === 0) return;

    const images = source.filter(a => a.type === 'image');
    const texts = source.filter(a => a.type === 'text');
    const others = source.filter(a => a.type !== 'image' && a.type !== 'text');
    const layers = [];

    if (images.length === 1) {
      layers.push({
        id: `ac-${Date.now()}-bg`,
        ...images[0],
        type: 'image',
        title: images[0].title || 'Background',
        x: 20, y: 20, width: 400, height: 240,
        opacity: 1, bgColor: '#0f1218', zIndex: 1,
      });
    } else if (images.length >= 2) {
      const cols = Math.ceil(Math.sqrt(images.length));
      const cellW = Math.floor(380 / cols);
      const cellH = Math.floor(220 / cols);
      images.forEach((img, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        layers.push({
          id: `ac-${Date.now()}-${i}`,
          ...img,
          type: 'image',
          title: img.title || `Image ${i + 1}`,
          x: 30 + col * (cellW + 10),
          y: 20 + row * (cellH + 10),
          width: cellW, height: cellH,
          opacity: 1, bgColor: '#0f1218',
        });
      });
    }

    const headline = texts[0] || { title: 'Headline', type: 'text', content: aiGoal || 'Headline' };
    layers.push({
      id: `ac-${Date.now()}-title`,
      ...headline,
      type: 'text',
      title: 'Headline',
      content: headline.content || aiGoal || 'Headline',
      x: 40, y: images.length > 1 ? 240 : 160,
      width: 320, height: 40,
      opacity: 1, bgColor: 'transparent',
    });

    if (texts[1] || aiGoal) {
      layers.push({
        id: `ac-${Date.now()}-sub`,
        type: 'text',
        title: 'Subtext',
        content: texts[1]?.content || '',
        x: 40, y: images.length > 1 ? 290 : 210,
        width: 260, height: 24,
        opacity: 0.7, bgColor: 'transparent',
      });
    }

    others.forEach((asset, i) => {
      layers.push({
        id: `ac-${Date.now()}-other-${i}`,
        ...asset,
        x: 40 + i * 140, y: 300,
        width: 120, height: 80,
        opacity: 1, bgColor: '#0f1218',
      });
    });

    layers.forEach((l, i) => { l.zIndex = i + 1; });

    setCanvasAssets(layers);
    setSelectedAsset(null);
    setShowAiAssist(false);
    setAiGoal('');
  }, [canvasAssets, vaultMappedAssets, aiGoal]);

  // Boom event listener - must be before any early return
  useEffect(() => {
    const handler = () => setBoomMode('screen');
    window.addEventListener('aio:open-boom', handler);
    return () => window.removeEventListener('aio:open-boom', handler);
  }, []);

  if (!isOpen) return null;

  // AI Assist Modal
  if (showAiAssist) {
    return createPortal(
      <div className="fixed inset-0 z-[100002] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowAiAssist(false)}>
        <div className="w-[480px] bg-[#0f1218] border border-[#1e2024] rounded-xl shadow-[0_24px_60px_-15px_rgba(0,0,0,1)] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0f1218]">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-400" />
              <span className="text-[11px] font-black text-slate-200 tracking-[0.15em] uppercase">AI ASSIST</span>
            </div>
            <button onClick={() => setShowAiAssist(false)} className="p-1.5 text-slate-500 hover:text-slate-300 rounded hover:bg-[#1e2024]">
              <X size={14} />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">ASSET SOURCE</span>
              <div className="flex items-center gap-2 p-2 rounded border border-[#1e2024] bg-[#0a0c10]">
                {canvasAssets.length > 0
                  ? <><CheckCircle size={12} className="text-emerald-400" /><span className="text-[9px] text-slate-300 font-mono">Use current canvas ({canvasAssets.length} layers)</span></>
                  : <><Image size={12} className="text-slate-500" /><span className="text-[9px] text-slate-400 font-mono">Use vault assets ({vaultMappedAssets.length} available)</span></>
                }
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">GOAL</span>
              <input
                type="text"
                value={aiGoal}
                onChange={(e) => setAiGoal(e.target.value)}
                placeholder="Describe the composition intent..."
                className="w-full p-2 text-[9px] text-slate-300 font-mono bg-[#0a0c10] border border-[#1e2024] rounded focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] block">MODE</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'vector', label: 'Vector', desc: 'Layout only' },
                  { id: 'delta', label: 'Delta', desc: 'Timing only' },
                  { id: 'vector_delta', label: 'Vector + Delta', desc: 'Layout & timing' },
                  { id: 'auto', label: 'Take the Lead', desc: 'Full auto' },
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setAiMode(mode.id)}
                    className={`p-2 rounded border text-left transition-all ${
                      aiMode === mode.id
                        ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                        : 'border-[#1e2024] bg-[#0a0c10] text-slate-500 hover:border-violet-500/30'
                    }`}
                  >
                    <span className="text-[9px] font-black uppercase block">{mode.label}</span>
                    <span className="text-[7px] text-slate-600">{mode.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleAutoCompose}
              disabled={canvasAssets.length === 0 && vaultMappedAssets.length === 0}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-b from-violet-900/40 to-[#0a0c10] border border-violet-500/30 text-violet-400 text-[10px] font-black uppercase tracking-[0.2em] hover:from-violet-800/40 hover:to-[#0f1218] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles size={14} />
              BUILD COMPOSITION
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

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

  // Context menu for right-click "Move to Layer"
  const contextMenuOverlay = contextMenu && (
    <div
      className="fixed inset-0 z-[200000]" 
      onClick={() => setContextMenu(null)}
      onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
    >
      <div
        className="fixed bg-[#12151c] border border-[#1e2024] rounded shadow-lg py-1 min-w-[140px] z-[200001]"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1 text-[7px] font-black text-slate-500 uppercase tracking-wider border-b border-[#1e2024] mb-1">Move to Layer</div>
        {canvasLayers.map((layer) => {
          const asset = canvasAssets.find(a => a.id === contextMenu.assetId);
          const current = (asset?.layerId || 'main') === layer.id;
          return (
            <button
              key={layer.id}
              onClick={() => handleAssetToLayer(contextMenu.assetId, layer.id)}
              disabled={current}
              className={`w-full text-left px-2 py-1 text-[8px] font-mono transition-colors flex items-center gap-1.5 ${
                current ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:bg-[#1a1d24] hover:text-slate-200'
              }`}
            >
              {layer.visible !== false ? <Eye size={8} /> : <EyeOff size={8} />}
              <span className="truncate">{layer.name}</span>
              {current && <span className="ml-auto text-[6px] text-cyan-500">●</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return createPortal(
    <>
    {contextMenuOverlay}
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-[95vw] max-w-7xl h-[85vh] bg-[#0f1218] border border-[#1e2024] rounded-xl shadow-[0_24px_60px_-15px_rgba(0,0,0,1),0_0_0_1px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e2024] bg-gradient-to-b from-[#12151c] to-[#0f1218] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-cyan-400" />
              <span className="text-[12px] font-black text-slate-200 tracking-[0.15em] uppercase">Composer</span>
            </div>
            <div className="flex items-center bg-[#0a0c10] p-[2px] rounded border border-[#1e2024] gap-[2px]">
              {[
                { id: 'program', icon: Layout, label: 'PROGRAM' },
                { id: 'publish', icon: MonitorPlay, label: 'PUBLISH' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAiAssist(true)}
              className="btn-secondary text-[9px] font-black uppercase tracking-[0.14em] flex items-center gap-1.5 py-1.5 px-3"
            >
              <Sparkles size={12} />
              AI ASSIST
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('aio:open-boom'))}
              className="btn-secondary text-[9px] font-black uppercase tracking-[0.14em] flex items-center gap-1.5 py-1.5 px-3"
            >
              <Camera size={12} />
              BOOM
            </button>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none rounded hover:bg-[#1e2024]">
              <X size={16} />
            </button>
          </div>
        </div>

        {activeTab === 'program' ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <AssetTray 
            assets={vaultMappedAssets} 
            onDragStart={handleDragStart}
            onTemplateSelect={(t) => {
              setOutputFormat(t.aspect);
              setPlatform(t.platform);
            }}
            onAddText={handleAddText}
          />
          <CompositionCanvas 
            assets={canvasAssets}
            layers={canvasLayers}
            onSelectAsset={handleSelectAsset}
            selectedAsset={selectedAsset}
            onMoveAsset={handleMoveAsset}
            onDropAsset={handleDropAsset}
            onDeleteAsset={handleDeleteAsset}
            outputFormat={outputFormat}
            onUpdateAsset={handleUpdateAsset}
            onContextMenu={handleContextMenu}
          />
          <PropertiesPanel 
            selectedAsset={selectedAsset}
            onUpdateAsset={handleUpdateAsset}
            onDeleteAsset={handleDeleteAsset}
            outputFormat={outputFormat}
            onFormatChange={setOutputFormat}
            resolution={resolution}
            onResolutionChange={setResolution}
            platform={platform}
            onPlatformChange={setPlatform}
            canvasAssets={canvasAssets}
            onSelectAsset={handleSelectAsset}
            onMoveLayer={handleMoveLayer}
            onToggleVisibility={handleToggleVisibility}
            canvasLayers={canvasLayers}
            onAddLayer={handleAddLayer}
            onRenameLayer={handleRenameLayer}
            onDeleteLayer={handleDeleteLayer}
            onToggleLayerVisibility={handleToggleLayerVisibility}
            onAssetToLayer={handleAssetToLayer}
          />
        </div>
        ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#080a0f]">
          <div className="max-w-lg w-full space-y-6">
            <div className="text-center">
              <MonitorPlay size={32} className="text-slate-600 mx-auto mb-3" />
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">Publish Pipeline</span>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleRender}
                disabled={isProcessing || canvasAssets.length === 0}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-b from-[#1b2533] to-[#121927] hover:from-[#212d3d] hover:to-[#171f2d] active:from-[#050810] active:to-[#050810] disabled:from-[#0B1120] disabled:to-[#0B1120] text-cyan-500 disabled:text-slate-700 border border-black rounded shadow-[0_4px_6px_rgba(0,0,0,0.6)] disabled:shadow-none transition-all"
              >
                {isProcessing ? <Loader2 size={14} className="animate-spin text-cyan-500/60" /> : <MonitorPlay size={14} className="fill-cyan-500/40" />}
                <span className="text-[10px] font-black tracking-[0.2em]">RENDER</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleExport} disabled={canvasAssets.length === 0} className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[9px] font-black uppercase rounded border border-[#1e2024] bg-[#0f1218] text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-all disabled:opacity-50">
                  <Download size={12} /> EXPORT
                </button>
                <button onClick={handleSendToFlow} disabled={canvasAssets.length === 0} className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[9px] font-black uppercase rounded border border-[#1e2024] bg-[#0f1218] text-slate-400 hover:text-violet-400 hover:border-violet-500/50 transition-all disabled:opacity-50">
                  <Send size={12} /> FLOW
                </button>
                <button onClick={handleQueueSocial} disabled={canvasAssets.length === 0} className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[9px] font-black uppercase rounded border border-[#1e2024] bg-[#0f1218] text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-all disabled:opacity-50">
                  <Zap size={12} /> QUEUE
                </button>
                <button disabled={canvasAssets.length === 0} className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[9px] font-black uppercase rounded border border-indigo-500/30 bg-indigo-500/5 text-indigo-400 hover:bg-indigo-500/10 transition-all disabled:opacity-50">
                  <Sparkles size={12} /> ALPHA VIA CHARLIE
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <CheckCircle size={12} className={canvasAssets.length > 0 ? 'text-emerald-500' : 'text-slate-700'} />
                <span className="text-[9px] text-slate-500 font-mono">{canvasAssets.length} LAYERS {canvasAssets.length > 0 ? 'READY' : 'EMPTY'}</span>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
    </>,
    document.body
  );
}
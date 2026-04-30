// DO NOT statically import @excalidraw/excalidraw.
// This module MUST remain lazy-loaded to prevent main bundle bloat.
// Use React.lazy for UI and dynamic import() for utilities only.
import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import '@excalidraw/excalidraw/index.css';
import { Download, Check, X, Box } from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useNotice } from '../../contexts/NoticeContext';
import { MediaService } from '../../services/media.service';

const Excalidraw = lazy(() => import('@excalidraw/excalidraw').then(mod => ({ default: mod.Excalidraw })));

const STORAGE_KEY = 'aioDesignScene';

const DesignModule = () => {
  const [sceneData, setSceneData] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.warn('Failed to load saved design scene:', e);
        }
      }
    }
    return null;
  });
  const [isClient, setIsClient] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [formats, setFormats] = useState({ png: true, json: false });
  const [destinations, setDestinations] = useState({ download: true, vault: false });

  const { openAIAssist, toggleAIAssist } = useAIAssist();
  const { showNotice } = useNotice();
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSceneChange = useCallback((elements, appState) => {
    if (!elements || elements.length === 0) return;

    const { collaborators, ...serializableAppState } = appState;

    const data = {
      elements,
      appState: {
        ...serializableAppState,
        viewBackgroundColor: appState?.viewBackgroundColor || '#1a1a1a',
        theme: appState?.theme || 'dark',
      },
      lastSavedAt: new Date().toISOString(),
    };

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }, 1000);
  }, []);

  const handleClearCanvas = useCallback(() => {
    if (excalidrawAPI) {
      excalidrawAPI.resetScene();
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [excalidrawAPI]);

  const handleExportExecute = async () => {
    console.log('[Design] Export execution triggered', { formats, destinations });
    if (!excalidrawAPI || exporting) {
      console.warn('[Design] Export blocked: API ready?', !!excalidrawAPI, 'Exporting?', exporting);
      return;
    }
    
    setExporting(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const timestamp = Date.now();

      console.log('[Design] Gathering artifacts...', { elementCount: elements.length });

      const outputs = [];

      if (formats.png) {
        const { exportToBlob } = await import('@excalidraw/excalidraw');
        const blob = await exportToBlob({ 
          elements, 
          appState: { ...appState, exportWithDarkMode: true }, 
          files, 
          mimeType: 'image/png' 
        });
        
        if (destinations.download) {
          outputs.push({ blob, name: `design-${timestamp}.png`, type: 'download' });
        }
        if (destinations.vault) {
          outputs.push({ 
            blob, 
            name: `design-${timestamp}.png`, 
            type: 'vault',
            tags: 'SOURCE:DESIGN,TYPE:IMAGE,VAULT'
          });
        }
      }

      if (formats.json) {
        const data = JSON.stringify({ elements, appState, files }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        
        if (destinations.download) {
          outputs.push({ blob, name: `design-${timestamp}.excalidraw`, type: 'download' });
        }
        if (destinations.vault) {
          outputs.push({ 
            blob, 
            name: `design-${timestamp}.excalidraw`, 
            type: 'vault',
            tags: 'SOURCE:DESIGN,TYPE:EXCALIDRAW,VAULT'
          });
        }
      }

      for (const out of outputs) {
        if (out.type === 'download') {
          const url = URL.createObjectURL(out.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = out.name;
          a.click();
          URL.revokeObjectURL(url);
        } else if (out.type === 'vault') {
          const file = new File([out.blob], out.name, { type: out.blob.type });
          await MediaService.uploadMediaFile(file, out.tags);
        }
      }

      showNotice({ type: 'success', message: 'Export sequence completed.' });
      setShowExportModal(false);
    } catch (error) {
      console.error('Export failed:', error);
      showNotice({ type: 'error', message: error.message || 'Export failed.' });
    } finally {
      setExporting(false);
    }
  };

  const initialData = React.useMemo(() => {
    return sceneData ? {
      elements: sceneData.elements || [],
      appState: (({ collaborators, ...rest }) => rest)(sceneData.appState || {}),
    } : undefined;
  }, [sceneData]);

  const UIOptions = React.useMemo(() => ({
    tools: {
      arrow: true,
      assignment: true,
      diamond: true,
      ellipse: true,
      freedraw: true,
      line: true,
      rectangle: true,
      text: true,
    },
  }), []);

  const isValid = (formats.png || formats.json) && (destinations.download || destinations.vault);

  if (!isClient) {
    return (
      <div className="module-root-standard flex items-center justify-center bg-[#070708]">
        <div className="text-center animate-pulse">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mb-2">Design Surface</div>
          <div className="text-xs text-slate-600">Initializing canvas engine...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="module-root-standard relative">
      <ModuleHeader
        title="Design Surface"
        showTitle={false}
        leftActions={[
          {
            label: '+ NEW CANVAS',
            icon: null,
            onClick: handleClearCanvas,
            variant: 'primary'
          }
        ]}
        actions={[
          {
            label: 'Export Assets',
            icon: Download,
            onClick: () => setShowExportModal(true),
            variant: 'secondary'
          }
        ]}
        onModuleAi={() => toggleAIAssist({ mode: 'help', context: { module: 'design' } })}
      />

      <div className="module-content-stage relative">
        <div className="absolute inset-0">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full w-full bg-[#070708]">
              <div className="text-center animate-pulse">
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mb-2">Design Surface</div>
                <div className="text-xs text-slate-600">Loading canvas engine...</div>
              </div>
            </div>
          }>
            <Excalidraw
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              initialData={initialData}
              onChange={handleSceneChange}
              theme="dark"
              viewBackgroundColor="#1a1a1a"
              className="h-full w-full"
              UIOptions={UIOptions}
            />
          </Suspense>
        </div>
      </div>

      {showExportModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0A0C10] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <Box size={16} className="text-cyan-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-200">Export Assets</span>
              </div>
              <button onClick={() => setShowExportModal(false)} className="text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <label className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">Formats</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'png', label: 'PNG Image' },
                    { id: 'json', label: 'Raw Script' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFormats(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all ${formats[f.id] ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-100' : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10'}`}
                    >
                      <span className="text-[10px] font-semibold">{f.label}</span>
                      {formats[f.id] && <Check size={12} className="text-cyan-400" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">Destinations</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'download', label: 'Download' },
                    { id: 'vault', label: 'Push to Vault' }
                  ].map(d => (
                    <button
                      key={d.id}
                      onClick={() => setDestinations(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all ${destinations[d.id] ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-100' : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10'}`}
                    >
                      <span className="text-[10px] font-semibold">{d.label}</span>
                      {destinations[d.id] && <Check size={12} className="text-cyan-400" />}
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={!isValid || exporting}
                onClick={handleExportExecute}
                className={`mt-4 w-full rounded-2xl py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${isValid && !exporting ? 'bg-cyan-500 text-black hover:bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'bg-white/5 text-slate-600 grayscale cursor-not-allowed'}`}
              >
                {exporting ? 'Executing...' : 'Start Export'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesignModule;
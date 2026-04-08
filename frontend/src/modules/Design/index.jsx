import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import ModuleHeader from '../../components/ModuleHeader';
import { BrainIcon, Crosshair } from '../../components/ui/icons';
import { useAIAssist } from '../../contexts/AIAssistContext';

const STORAGE_KEY = 'aioDesignScene';

const DesignModule = () => {
  const [sceneData, setSceneData] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const { openAIAssist } = useAIAssist();
  const excalidrawRef = useRef(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSceneData(parsed);
      } catch (e) {
        console.warn('Failed to load saved design scene:', e);
      }
    }
  }, []);

  const handleSceneChange = useCallback((elements, appState) => {
    if (!elements || elements.length === 0) return;
    
    // Sanitize appState for storage (remove non-serializable fields)
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
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, []);

  const handleClearCanvas = useCallback(() => {
    if (excalidrawRef.current) {
      excalidrawRef.current.resetScene();
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const handleExportPng = useCallback(() => {
    if (excalidrawRef.current) {
      const elements = excalidrawRef.current.getSceneElements();
      const appState = excalidrawRef.current.getAppState();
      
      import('@excalidraw/excalidraw').then(({ exportToPng }) => {
        exportToPng({ elements, appState }).then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `design-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        });
      });
    }
  }, []);

  const handleExportJson = useCallback(() => {
    if (excalidrawRef.current) {
      const elements = excalidrawRef.current.getSceneElements();
      const appState = excalidrawRef.current.getAppState();
      const data = JSON.stringify({ elements, appState }, null, 2);
      
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `design-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const initialData = sceneData ? {
    elements: sceneData.elements || [],
    appState: (({ collaborators, ...rest }) => rest)(sceneData.appState || {}),
  } : undefined;

  return (
    <div className="flex flex-col h-full gap-1.5">
      {/* Toolbar */}
      <div className="h-12 shrink-0 flex items-center justify-between gap-3 px-4 border border-[var(--color-border)]/50 bg-[var(--color-bg-tertiary)]/90 backdrop-blur-md rounded-xl shadow-island-sm">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            onClick={handleClearCanvas}
            className="btn-toolbar-lead shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"
          >
            <span className="font-bold uppercase tracking-[0.14em]">New</span>
          </button>
          <button
            onClick={handleExportPng}
            className="btn-secondary shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"
          >
            <span className="font-bold uppercase tracking-[0.14em]">Export PNG</span>
          </button>
          <button
            onClick={handleExportJson}
            className="btn-secondary shrink-0 whitespace-nowrap text-[10px] py-1.5 px-3 h-8 flex items-center justify-center gap-2"
          >
            <span className="font-bold uppercase tracking-[0.14em]">Export JSON</span>
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 px-1.5 py-1 bg-black/30 rounded-lg border border-white/10">
            <button
              onClick={() => openAIAssist()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all group"
              title="Brain (Global KB)"
            >
              <BrainIcon size={14} />
            </button>
            <button
              onClick={() => openAIAssist({ context: { module: 'design' } })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all group"
              title="Crosshair (Module AI)"
            >
              <Crosshair size={14} />
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 overflow-hidden">
        {isClient ? (
          <Excalidraw
            ref={excalidrawRef}
            initialData={initialData}
            onChange={handleSceneChange}
            theme="dark"
            viewBackgroundColor="#1a1a1a"
            UIOptions={{
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
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--color-text-secondary)]">
            Loading Design...
          </div>
        )}
      </div>
    </div>
  );
};

export default DesignModule;

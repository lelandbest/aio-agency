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
    <div className="module-root-standard bg-[#1a1a1a]">
      {/* Toolbar */}
      <div className="module-toolbar">
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
          <div className="module-toolbar-utility">
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
      
<div className="module-content-stage bg-[#1a1a1a] p-2">
        <Excalidraw
          ref={excalidrawRef}
          initialData={initialData}
          onChange={handleSceneChange}
          theme="dark"
          viewBackgroundColor="#1a1a1a"
          className="h-full w-full"
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
      </div>
    </div>
  );
};

export default DesignModule;

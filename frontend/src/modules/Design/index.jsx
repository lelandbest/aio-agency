import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import ModuleHeader from '../../components/ModuleHeader';

const STORAGE_KEY = 'aioDesignScene';

const DesignModule = () => {
  const [sceneData, setSceneData] = useState(null);
  const [isClient, setIsClient] = useState(false);
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
    <div className="flex flex-col h-full">
      <ModuleHeader
        title="Design"
        rightActions={[
          {
            label: 'New',
            onClick: handleClearCanvas,
            variant: 'secondary',
          },
          {
            label: 'Export PNG',
            onClick: handleExportPng,
            variant: 'secondary',
          },
          {
            label: 'Export JSON',
            onClick: handleExportJson,
            variant: 'secondary',
          },
        ]}
      />
      
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

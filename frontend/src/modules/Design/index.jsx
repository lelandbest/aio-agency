import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import ModuleHeader from '../../components/ModuleHeader';
import { BrainIcon, Crosshair } from '../../components/ui/icons';
import { useAIAssist } from '../../contexts/AIAssistContext';

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
  const { openAIAssist } = useAIAssist();
  const excalidrawRef = useRef(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    setIsClient(true);
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

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }, 1000);
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

  if (!isClient) {
    return <div className="module-root-standard bg-[#1a1a1a]" />;
  }

  return (
    <div className="module-root-standard bg-[#050505] flex flex-col h-full w-full overflow-hidden">
      <ModuleHeader
        title="Design Surface"
        showTitle={false}
        className="mx-2 mt-2"
        leftActions={[
          {
            label: 'New',
            icon: null,
            onClick: handleClearCanvas,
            variant: 'primary'
          }
        ]}
        actions={[
          {
            label: 'Export PNG',
            icon: null,
            onClick: handleExportPng,
            variant: 'secondary'
          },
          {
            label: 'Export JSON',
            icon: null,
            onClick: handleExportJson,
            variant: 'secondary'
          }
        ]}
        onModuleAi={() => toggleAIAssist({ mode: 'help', context: { module: 'design' } })}
      />

      <div className="module-surface-shell flex-1 mx-2 mb-2 relative overflow-hidden">
        <Excalidraw
          ref={excalidrawRef}
          initialData={initialData}
          onChange={handleSceneChange}
          theme="dark"
          viewBackgroundColor="#1a1a1a"
          className="h-full w-full"
          UIOptions={UIOptions}
        />
      </div>
    </div>
  );
};

export default DesignModule;

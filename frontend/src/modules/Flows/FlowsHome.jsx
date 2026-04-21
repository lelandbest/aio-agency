import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOpen, Layers, Plus, Search, Tag, Workflow, Trash2, FolderPlus } from 'lucide-react';
import FolderTable from '../../components/FolderTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { useNotice } from '../../contexts/NoticeContext';
import { BrainIcon, Crosshair, CommandSurfaceIcon } from '../../components/ui/icons';
import { openGlobalOverlay } from '../../components/GlobalOverlay';
import TemplateLibraryModal from './components/TemplateLibraryModal';
import flowRepository from './utils/flowRepository';
import { getStoredCustomTemplates } from './utils/templateLibraryStore';
import { deleteFlowApi, bulkDeleteFlowsApi, createFlowFolderApi, listFlowFoldersApi, renameFlowFolderApi, deleteFlowFolderApi, saveFlowApi } from '../../services/backendApi';
import { useSystemConfirm } from '../../hooks/useSystemConfirm';
import SystemConfirmModal from '../../components/Modals/SystemConfirmModal';

const SAVED_FLOWS_FOLDER_ID = 'saved-flows';

const formatRelativeDate = (value) => {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getFlowSourceMeta = (flow) => {
  const templateName = flow?.metadata?.sourceTemplateName;
  if (templateName) {
    return {
      label: templateName,
      tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
      helper: 'Template-based',
    };
  }
  return {
    label: 'Blank / Custom',
    tone: 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]',
    helper: 'Saved flow',
  };
};

const FlowsHome = ({ onCreateFlow, onOpenFlow, onCreateFromTemplate, onSelectFlow = null, selectionMode = false }) => {
  const { openAIAssist, toggleAIAssist } = useAIAssist();
  const { showNotice } = useNotice();
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [renameFlowId, setRenameFlowId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectedFlowIds, setSelectedFlowIds] = useState([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [busyAction, setBusyAction] = useState('');
  const { confirm: systemConfirm, modalState, setPromptValue } = useSystemConfirm();
  const [savedFlowsExpanded, setSavedFlowsExpanded] = useState(true);
  const [tableSearch, setTableSearch] = useState('');

  const loadFlows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const collection = await flowRepository.getAllFlows();
      const nextFlows = Object.values(collection || {}).map((flow) => ({
        ...flow,
        flowGroup: SAVED_FLOWS_FOLDER_ID,
      }));
      setFlows(nextFlows);
    } catch (loadError) {
      setFlows([]);
      setError(loadError.message || 'Unable to load flows.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  useEffect(() => {
    setCustomTemplates(getStoredCustomTemplates());
  }, []);

  useEffect(() => {
    if (showTemplateGallery) {
      setCustomTemplates(getStoredCustomTemplates());
    }
  }, [showTemplateGallery]);

  const totalTemplatesUsed = useMemo(
    () => flows.filter((flow) => Boolean(flow?.metadata?.sourceTemplateId)).length,
    [flows]
  );

  const recentFlows = useMemo(() => flows.slice(0, 3), [flows]);

  const [backendFolders, setBackendFolders] = useState([]);

  useEffect(() => {
    listFlowFoldersApi().then(setBackendFolders).catch(() => setBackendFolders([]));
  }, []);

  const flowFolders = useMemo(
    () => [
      ...backendFolders.map(f => ({ ...f, expanded: savedFlowsExpanded })),
      {
        id: SAVED_FLOWS_FOLDER_ID,
        name: 'Saved Flows',
        expanded: savedFlowsExpanded,
      },
    ],
    [backendFolders, savedFlowsExpanded]
  );

  const handleFolderRename = async (folderId, newName) => {
    try {
      await renameFlowFolderApi(folderId, newName);
      setBackendFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName } : f));
    } catch (err) {
      showNotice({ type: 'error', message: 'Rename failed: ' + err.message });
    }
  };

  const handleFolderDelete = async (folderId, e) => {
    e?.stopPropagation();
    const isConfirmed = await systemConfirm({
      title: 'Delete Folder',
      message: 'Delete this folder? This action cannot be undone.',
      variant: 'danger',
      confirmText: 'Delete Folder'
    });

    if (isConfirmed) {
      try {
        await deleteFlowFolderApi(folderId);
        setBackendFolders(prev => prev.filter(f => f.id !== folderId));
      } catch (err) {
        showNotice({ type: 'error', message: 'Delete failed: ' + err.message });
      }
    }
  };

  const startRename = useCallback((flow) => {
    setRenameFlowId(flow.id);
    setRenameValue(flow.name || 'Untitled Flow');
  }, []);

  const cancelRename = useCallback(() => {
    setRenameFlowId(null);
    setRenameValue('');
  }, []);

  const saveRename = useCallback(
    async (flow) => {
      const nextName = renameValue.trim();
      if (!nextName) {
        return;
      }
      setBusyAction(`rename:${flow.id}`);
      setError('');
      try {
        await flowRepository.saveFlow({
          ...flow,
          name: nextName,
        });
        cancelRename();
        await loadFlows();
      } catch (saveError) {
        setError(saveError.message || 'Unable to rename flow.');
      } finally {
        setBusyAction('');
      }
    },
    [cancelRename, loadFlows, renameValue]
  );

  const handleCreateBlank = useCallback(async () => {
    setBusyAction('create');
    setError('');
    try {
      await onCreateFlow?.();
    } catch (createError) {
      setError(createError.message || 'Unable to create flow.');
    } finally {
      setBusyAction('');
    }
  }, [onCreateFlow]);

  const handleCreateFolder = useCallback(async () => {
    const name = await systemConfirm({
      title: 'Create Folder',
      message: 'Enter folder name for flow organization:',
      showPrompt: true,
      promptValue: 'New Folder',
      confirmText: 'Create Folder'
    });

    if (name) {
      try {
        await createFlowFolderApi(name);
        loadFlows();
      } catch (err) {
        showNotice({ type: 'error', message: 'Failed to create folder: ' + err.message });
      }
    }
  }, [loadFlows, systemConfirm]);

  const toggleSelectAllFlows = useCallback(() => {
    if (selectedFlowIds.length === flows.length && selectedFolderIds.length === flowFolders.length) {
      setSelectedFlowIds([]);
      setSelectedFolderIds([]);
    } else {
      setSelectedFlowIds(flows.map((f) => f.id));
      setSelectedFolderIds(flowFolders.map((f) => f.id));
    }
  }, [flows, flowFolders, selectedFlowIds, selectedFolderIds]);

  const toggleFolderSelection = useCallback((folderId) => {
    setSelectedFolderIds((prev) =>
      prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]
    );
  }, []);

  const bulkDeleteSelectedFlows = useCallback(async () => {
    const totalSelected = selectedFlowIds.length + selectedFolderIds.length;
    if (totalSelected === 0) return;
    const isConfirmed = await systemConfirm({
      title: 'Delete Selected',
      message: `Permanently delete ${totalSelected} item${totalSelected > 1 ? 's' : ''}? This cannot be undone.`,
      confirmText: `Delete ${totalSelected} Item${totalSelected > 1 ? 's' : ''}`,
      variant: 'danger'
    });
    if (isConfirmed) {
      try {
        setLoading(true);
        if (selectedFlowIds.length > 0) {
          await bulkDeleteFlowsApi(selectedFlowIds);
        }
        for (const folderId of selectedFolderIds) {
          await deleteFlowFolderApi(folderId).catch(() => {});
        }
        setSelectedFlowIds([]);
        setSelectedFolderIds([]);
        await loadFlows();
      } catch (err) {
        setError('Bulk delete failed: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  }, [selectedFlowIds, selectedFolderIds, loadFlows, systemConfirm]);

  const handleCreateFromTemplate = useCallback(
    async (template) => {
      setBusyAction(`template:${template.id}`);
      setError('');
      try {
        await onCreateFromTemplate?.(template);
        setShowTemplateGallery(false);
      } catch (createError) {
        setError(createError.message || 'Unable to create flow from template.');
      } finally {
        setBusyAction('');
      }
    },
    [onCreateFromTemplate]
  );

  const tableColumns = [
    {
      header: 'Name',
      key: 'name',
      render: (flow) => {
        if (renameFlowId === flow.id) {
          return (
            <div className="flex items-center gap-2">
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    saveRename(flow);
                  }
                  if (event.key === 'Escape') {
                    cancelRename();
                  }
                }}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => saveRename(flow)}
                className="btn-toolbar-lead !px-3 !py-2 !text-xs"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelRename}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)]"
              >
                Cancel
              </button>
            </div>
          );
        }
        return (
          <button
            type="button"
            onClick={() => onOpenFlow?.(flow)}
            className="text-left"
          >
            <div className="text-sm font-semibold text-[var(--color-text-primary)] transition hover:text-[var(--color-primary)]">
              {flow.name || 'Untitled Flow'}
            </div>
            <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              {flow?.metadata?.sourceTemplateName ? 'Created from template' : 'Editable saved flow'}
            </div>
          </button>
        );
      },
    },
    {
      header: 'Source',
      key: 'source',
      width: '180px',
      render: (flow) => {
        const source = getFlowSourceMeta(flow);
        return (
          <div className="space-y-1">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${source.tone}`}>
              <Tag size={11} />
              {source.helper}
            </span>
            <div className="text-xs text-[var(--color-text-secondary)]">{source.label}</div>
          </div>
        );
      },
    },
    {
      header: 'Forms',
      key: 'forms',
      width: '100px',
      render: (flow) => {
        const formCount = flow.formIds?.length || 0;
        return (
          <span className="text-sm text-[var(--color-text-secondary)]">
            {formCount} {formCount === 1 ? 'Form' : 'Forms'}
          </span>
        );
      },
    },
    {
      header: 'Status',
      key: 'status',
      width: '120px',
      render: (flow) => {
        const isActive = flow.status === 'Active';
        return (
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              {isActive ? 'Active' : 'Inactive'}
            </span>
            <button
              id={`flow-status-${flow.id}`}
              type="button"
              onClick={() => {
                const newStatus = isActive ? 'Draft' : 'Active';
                const previousStatus = flow.status;
                setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, status: newStatus } : f));
                saveFlowApi(flow.id, { ...flow, status: newStatus, updatedAt: new Date().toISOString() })
                  .then(() => loadFlows())
                  .catch(() => {
                    setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, status: previousStatus } : f));
                  });
              }}
              className={`w-12 h-6 rounded-full relative transition-colors ${isActive ? 'bg-emerald-500' : 'bg-[var(--color-bg-tertiary)]'}`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  isActive ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        );
      },
    },
    {
      header: 'Last Updated',
      key: 'updatedAt',
      width: '180px',
      render: (flow) => (
        <div className="text-xs text-[var(--color-text-secondary)]">
          <div>{formatRelativeDate(flow.updatedAt || flow.updated_at)}</div>
          <div className="mt-1 text-[var(--color-text-tertiary)]">By {flow.lastEditedBy || 'Current User'}</div>
        </div>
      ),
    },
    {
      header: 'Nodes',
      key: 'nodes',
      width: '100px',
      render: (flow) => (
        <span className="text-sm text-[var(--color-text-secondary)]">
          {Array.isArray(flow?.nodes) 
              ? flow.nodes.filter(n => !n?.data?.isGhost && n?.type !== 'note' && n?.type !== 'frame').length 
              : (flow?.metadata?.nodeCount || 0)}
        </span>
      ),
    },
    {
      header: '',
      key: 'actions',
      width: '200px',
      render: (flow) => (
        <div className="flex items-center justify-end gap-2">
          {selectionMode && onSelectFlow ? (
            <button
              type="button"
              onClick={() => onSelectFlow(flow)}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
            >
              Select
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const isConfirmed = await systemConfirm({
                    title: 'Delete Flow',
                    message: `Permanently delete "${flow.name || 'this flow'}"? Access will be eradicated.`,
                    variant: 'danger',
                    confirmText: 'Delete Flow'
                  });
                  if (isConfirmed) {
                    deleteFlowApi(flow.id).then(() => loadFlows());
                  }
                }}
                className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20"
                title="Delete flow"
              >
                <Trash2 size={14} />
              </button>
              <button
                type="button"
                onClick={async () => {
                  const newName = await systemConfirm({
                    title: 'Rename Flow',
                    message: 'Enter a new identity for this flow:',
                    showPrompt: true,
                    promptValue: flow.name,
                    confirmText: 'Rename'
                  });
                  if (newName && newName.trim()) {
                    setRenameValue(newName.trim());
                    // We need a slightly different approach since saveRename depends on state
                    // I'll update renameValue and then call saveRename
                    await flowRepository.saveFlow({
                      ...flow,
                      name: newName.trim(),
                    });
                    await loadFlows();
                  }
                }}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                title="Rename"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => onOpenFlow?.(flow)}
                className="btn-toolbar-lead !px-3 !py-2 !text-xs"
              >
                Open
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const tableActions = (
    <button
      type="button"
      onClick={() => setShowTemplateGallery(true)}
      className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-bg-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition hover:bg-[var(--color-hover)]"
    >
      <Layers size={16} />
      Browse Templates
    </button>
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" message="Loading flows..." />
      </div>
    );
  }

  return (
    <div className="module-root-standard">
      
      {/* ABSOLUTE TOOLBAR CONTRACT — ZONE RECONSTRUCTION */}
      <div className="module-toolbar">
        {/* LEFT ZONE: MODULE ACTIONS ONLY */}
        <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
          <button
            onClick={handleCreateBlank}
            disabled={Boolean(busyAction)}
            className="btn-toolbar-lead px-3 py-1.5 text-[10px]"
          >
            <Plus size={12} />
            <span className="font-bold uppercase tracking-[0.14em]">NEW FLOW</span>
          </button>

          <button
            onClick={handleCreateFolder}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
            title="New Folder"
          >
            <FolderPlus size={15} />
          </button>

          <button
            onClick={() => setSavedFlowsExpanded(!savedFlowsExpanded)}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
            title="Collapse All"
          >
            <Layers size={15} className={savedFlowsExpanded ? '' : 'rotate-180'} />
          </button>
        </div>

        {/* CENTER ZONE: STATUS ONLY */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
          <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[9px] font-bold text-[var(--color-text-secondary)] shadow-island-sm h-7 pointer-events-auto">
            <Workflow size={12} className="text-[var(--color-text-tertiary)]" />
            <span>SAVED</span>
            <span className="text-[var(--color-text-primary)]">{flows.length}</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[9px] font-bold text-[var(--color-text-secondary)] shadow-island-sm h-7 pointer-events-auto">
            <Tag size={12} className="text-[var(--color-text-tertiary)]" />
            <span>TEMPLATES</span>
            <span className="text-[var(--color-text-primary)]">{totalTemplatesUsed}</span>
          </div>
        </div>

        {/* RIGHT ZONE: GLOBAL CONTROLS ONLY */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplateGallery(true)}
            className="btn-secondary flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em]"
          >
            <Search size={14} />
            <span>Browse Templates</span>
          </button>

          <div className="module-toolbar-utility">
            <button
              onClick={() => toggleAIAssist({ mode: 'brain' })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"
              title="Brain (Global KB)"
            >
              <BrainIcon size={15} />
            </button>
            <button
              onClick={() => toggleAIAssist({ mode: 'help', context: { module: 'flows' } })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"
              title="Crosshair (Module AI)"
            >
              <Crosshair size={15} />
            </button>
            <button
              onClick={() => openGlobalOverlay()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"
              title="Composer"
            >
              <CommandSurfaceIcon size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-2">
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto no-scrollbar">
            <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Recent Flows</div>
            {recentFlows.length > 0 ? (
              recentFlows.map((flow) => (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => onOpenFlow?.(flow)}
                  className="inline-flex shrink-0 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2.5 text-left text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-hover)]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-violet-300">
                    <Workflow size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{flow.name || 'Untitled Flow'}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                      {Array.isArray(flow?.nodes) ? flow.nodes.filter(n => !n?.data?.isGhost && n?.type !== 'note' && n?.type !== 'frame').length : (flow?.metadata?.nodeCount || 0)} nodes | {flow.status || 'Draft'}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="shrink-0 text-sm text-[var(--color-text-secondary)]">Create a blank flow or start from a template to populate this workspace.</div>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="module-content-stage px-2 pb-2">
        <FolderTable
          title="Flows"
          description="Open, rename, or launch your saved flows."
          folders={flowFolders}
          items={flows}
          columns={tableColumns}
          onFolderToggle={() => setSavedFlowsExpanded((current) => !current)}
          onFolderRename={handleFolderRename}
          onFolderDelete={handleFolderDelete}
          onItemSelect={(flowId) => {
            setSelectedFlowIds((current) =>
              current.includes(flowId) ? current.filter((item) => item !== flowId) : [...current, flowId]
            );
          }}
          onSelectAll={toggleSelectAllFlows}
          selectedItems={selectedFlowIds}
          selectedFolders={selectedFolderIds}
          onFolderSelect={toggleFolderSelection}
          onCreateItem={handleCreateBlank}
          createItemLabel="Create Flow"
          actions={
            <div className="flex items-center gap-2">
              {(selectedFlowIds.length + selectedFolderIds.length) > 0 && (
                <button
                  onClick={bulkDeleteSelectedFlows}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded border border-red-500/30 transition shadow-sm"
                >
                  <Trash2 size={14} />
                  <span>DELETE SELECTED ({selectedFlowIds.length + selectedFolderIds.length})</span>
                </button>
              )}
              {tableActions}
            </div>
          }
          folderProperty="flowGroup"
          showHeader={false}
          searchQuery={tableSearch}
          onSearchQueryChange={setTableSearch}
        />
      </div>

      {showTemplateGallery && (
        <TemplateLibraryModal
          isOpen={showTemplateGallery}
          onClose={() => setShowTemplateGallery(false)}
          onSelectTemplate={handleCreateFromTemplate}
          customTemplates={customTemplates}
        />
      )}
      <SystemConfirmModal
        isOpen={modalState.isOpen}
        onClose={modalState.onClose}
        onConfirm={() => modalState.onConfirm(modalState.promptValue)}
        title={modalState.title}
        message={modalState.message}
        variant={modalState.variant}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        showPrompt={modalState.showPrompt}
        promptValue={modalState.promptValue}
        onPromptChange={setPromptValue}
      />
    </div>
  );
};

export default FlowsHome;

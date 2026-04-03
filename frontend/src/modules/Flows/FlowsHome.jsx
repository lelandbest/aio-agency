import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, FolderOpen, Layers, Plus, Search, Tag, Workflow, Trash2, FolderPlus } from 'lucide-react';
import FolderTable from '../../components/FolderTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import ModuleHeader from '../../components/ModuleHeader';
import AIAssistButton from '../../components/AIAssistButton';
import TemplateGallery from './components/TemplateGallery';
import flowRepository from './utils/flowRepository';
import { deleteFlowApi, bulkDeleteFlowsApi, createFlowFolderApi, listFlowFoldersApi, renameFlowFolderApi, deleteFlowFolderApi } from '../../services/backendApi';
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
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [renameFlowId, setRenameFlowId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectedFlowIds, setSelectedFlowIds] = useState([]);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
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
      alert('Rename failed: ' + err.message);
    }
  };

  const handleFolderDelete = async (folderId, e) => {
    e?.stopPropagation();
    if (!confirm('Delete this folder?')) return;
    try {
      await deleteFlowFolderApi(folderId);
      setBackendFolders(prev => prev.filter(f => f.id !== folderId));
    } catch (err) {
      alert('Delete failed: ' + err.message);
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
    const name = prompt("Enter folder name:", "New Folder");
    if (name) {
      try {
        await createFlowFolderApi(name);
        loadFlows();
      } catch (err) {
        alert('Failed to create folder: ' + err.message);
      }
    }
  }, [loadFlows]);

  const toggleSelectAllFlows = useCallback(() => {
    setSelectedFlowIds((prev) => (prev.length === flows.length ? [] : flows.map((f) => f.id)));
  }, [flows.length, flows]);

  const bulkDeleteSelectedFlows = useCallback(async () => {
    if (selectedFlowIds.length === 0) return;
    const isConfirmed = await systemConfirm({
      title: 'Delete Selected Flows',
      message: `Permanently delete ${selectedFlowIds.length} automation flow(s)? This cannot be undone.`,
      confirmText: `Delete ${selectedFlowIds.length} Flows`,
      variant: 'danger'
    });
    if (isConfirmed) {
      try {
        setLoading(true);
        await bulkDeleteFlowsApi(selectedFlowIds);
        setSelectedFlowIds([]);
        await loadFlows();
      } catch (err) {
        setError('Bulk delete failed: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  }, [selectedFlowIds, loadFlows, systemConfirm]);

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
      header: 'Flow Name',
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
                className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
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
      width: '220px',
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
      header: 'Status',
      key: 'status',
      width: '120px',
      render: (flow) => (
        <span
          className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${flow.status === 'Active'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]'
            }`}
        >
          {flow.status || 'Draft'}
        </span>
      ),
    },
    {
      header: 'Nodes',
      key: 'nodes',
      width: '100px',
      render: (flow) => (
        <span className="text-sm text-[var(--color-text-secondary)]">
          {flow?.metadata?.nodeCount ?? flow?.nodes?.length ?? 0}
        </span>
      ),
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
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Delete this flow? This cannot be undone.')) {
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
                onClick={() => startRename(flow)}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => onOpenFlow?.(flow)}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
              >
                Open
                <ArrowRight size={14} />
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ModuleHeader
        title="Flows"
        showTitle={false}
        leftActions={[
          {
            label: 'Create Flow',
            icon: Plus,
            onClick: handleCreateBlank,
            variant: 'secondary',
            disabled: Boolean(busyAction)
          },
          {
            label: 'New Folder',
            icon: FolderPlus,
            onClick: handleCreateFolder,
            variant: 'secondary'
          }
        ]}
        toolbarCenterSlot={(
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Search flows"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-2 pl-10 pr-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
        )}
        toolbarRightSlot={(
          <div className="flex items-center gap-2">
            <div className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[10px] font-bold text-[var(--color-text-secondary)] shadow-island-sm h-8">
              <FolderOpen size={14} className="text-[var(--color-text-tertiary)]" />
              <span>SAVED</span>
              <span className="text-[var(--color-text-primary)]">{flows.length}</span>
            </div>
            <div className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[10px] font-bold text-[var(--color-text-secondary)] shadow-island-sm h-8">
              <Tag size={14} className="text-[var(--color-text-tertiary)]" />
              <span>TEMPLATES</span>
              <span className="text-[var(--color-text-primary)]">{totalTemplatesUsed}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowTemplateGallery(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-hover)] hover:border-[var(--color-primary)]/40 h-8"
            >
              <Layers size={14} />
              <span className="uppercase text-[10px] font-bold tracking-widest">Browse Templates</span>
            </button>
          </div>
        )}
      />

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-4">
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
                      {(flow?.metadata?.nodeCount ?? flow?.nodes?.length ?? 0)} nodes • {flow.status || 'Draft'}
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

      <div className="min-h-0 flex-1">
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
          onCreateItem={handleCreateBlank}
          createItemLabel="Create Flow"
          actions={
            <div className="flex items-center gap-2">
              {selectedFlowIds.length > 0 && (
                <button
                  onClick={bulkDeleteSelectedFlows}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded border border-red-500/30 transition shadow-sm"
                >
                  <Trash2 size={14} />
                  <span>DELETE SELECTED ({selectedFlowIds.length})</span>
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
        <TemplateGallery
          onClose={() => setShowTemplateGallery(false)}
          onSelectTemplate={handleCreateFromTemplate}
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

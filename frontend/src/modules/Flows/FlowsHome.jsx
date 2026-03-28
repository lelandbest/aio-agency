import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, FolderOpen, Layers, Plus, Search, Tag, Workflow } from 'lucide-react';
import FolderTable from '../../components/FolderTable';
import LoadingSpinner from '../../components/LoadingSpinner';
import ModuleHeader from '../../components/ModuleHeader';
import TemplateGallery from './components/TemplateGallery';
import flowRepository from './utils/flowRepository';

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
  const [savedFlowsExpanded, setSavedFlowsExpanded] = useState(true);
  const [tableSearch, setTableSearch] = useState('');

  const loadFlows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const collection = await flowRepository.getAllFlows();
      const nextFlows = Object.values(collection || {}).map((flow) => ({
        ...flow,
        flow_group: SAVED_FLOWS_FOLDER_ID,
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

  const flowFolders = useMemo(
    () => [
      {
        id: SAVED_FLOWS_FOLDER_ID,
        name: 'Saved Flows',
        expanded: savedFlowsExpanded,
      },
    ],
    [savedFlowsExpanded]
  );

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
          className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
            flow.status === 'Active'
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
      width: '170px',
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
          ) : null}
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
    <div className="flex h-full flex-col gap-4 bg-[var(--color-bg-primary)] p-4">
      <ModuleHeader
        title="Flows"
        titleIcon={Workflow}
        subtitle={selectionMode ? 'Selection mode active. Choose a flow to bind back into Agents.' : 'Select, create, and launch automation flows from one workspace.'}
        showTitle={false}
        showCompactTitle
        actions={[
          {
            label: 'Create Flow',
            icon: Plus,
            onClick: handleCreateBlank,
            variant: 'primary',
            color: 'primary',
            disabled: Boolean(busyAction)
          },
          {
            label: 'Browse Templates',
            icon: Layers,
            onClick: () => setShowTemplateGallery(true),
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
      />

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Recent Flows</div>
            {recentFlows.length > 0 ? (
              <div className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar">
                {recentFlows.map((flow) => (
                  <button
                    key={flow.id}
                    type="button"
                    onClick={() => onOpenFlow?.(flow)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-hover)]"
                  >
                    <FolderOpen size={14} />
                    {flow.name || 'Untitled Flow'}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--color-text-secondary)]">Create a blank flow or start from a template to populate this workspace.</div>
            )}
          </div>

          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto no-scrollbar">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
                <FolderOpen size={14} />
                Saved Flows
              </div>
              <div className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{flows.length}</div>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
                <Tag size={14} />
                Template-based
              </div>
              <div className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">{totalTemplatesUsed}</div>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <FolderTable
        title="Flows"
        description="Open, rename, or launch your saved flows."
        folders={flowFolders}
        items={flows}
        columns={tableColumns}
        onFolderToggle={() => setSavedFlowsExpanded((current) => !current)}
        onItemSelect={(flowId) => {
          setSelectedFlowIds((current) =>
            current.includes(flowId) ? current.filter((item) => item !== flowId) : [...current, flowId]
          );
        }}
        selectedItems={selectedFlowIds}
        onCreateItem={handleCreateBlank}
        createItemLabel="Create Flow"
        actions={tableActions}
        folderProperty="flow_group"
        showHeader={false}
        searchQuery={tableSearch}
        onSearchQueryChange={setTableSearch}
      />

      <TemplateGallery
        isOpen={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
        onSelectTemplate={handleCreateFromTemplate}
      />
    </div>
  );
};

export default FlowsHome;

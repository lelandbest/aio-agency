import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Database, FilePlus2, Library, Link2, Save, Trash2 } from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import AIAssistButton from '../../components/AIAssistButton';
import BrainGraphPanel from './BrainGraphPanel';
import {
  assistAiApi,
  createBrainItemApi,
  createBrainLinkApi,
  createBrainSourceApi,
  deleteBrainItemApi,
  deleteBrainLinkApi,
  deleteBrainSourceApi,
  getBrainOverviewApi,
  updateBrainItemApi,
  updateBrainProfileApi,
  updateBrainSourceApi,
} from '../../services/backendApi';

const EMPTY_PROFILE = {
  company_name: '',
  website: '',
  industry: '',
  overview: '',
  mission: '',
  brand_voice: '',
  ideal_customer: '',
};

const EMPTY_SOURCE = {
  label: '',
  source_type: 'document',
  status: 'draft',
  location: '',
  notes: '',
};

const EMPTY_MCP = {
  label: '',
  location: '',
  notes: '',
};

const EMPTY_ITEM = {
  title: '',
  category: 'note',
  content: '',
  source_id: '',
  status: 'draft',
  tags: '',
};

const StatCard = ({ label, value, hint, icon: Icon }) => (
  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{label}</div>
        <div className="mt-1.5 text-2xl font-semibold text-[var(--color-text-primary)]">{value}</div>
        {hint && <div className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{hint}</div>}
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-[var(--color-primary)]">
        <Icon size={16} />
      </div>
    </div>
  </div>
);

const GraphPanel = ({ profile, sources, items }) => {
  const [nodeFilter, setNodeFilter] = useState('all');
  const [selectedNodeId, setSelectedNodeId] = useState('profile');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const visibleSources = sources.slice(0, 5);
  const visibleItems = items.slice(0, 8);
  const profileNode = profile?.company_name
    ? { id: 'profile', label: profile.company_name, type: 'profile', x: 50, y: 50, size: 'lg' }
    : null;

  const sourceNodes = visibleSources.map((source, index) => ({
    id: source.id,
    label: source.label,
    type: 'source',
    sourceType: source.source_type,
    x: 18 + (index % 2) * 10,
    y: 18 + index * 15,
    size: 'md',
  }));

  const itemNodes = visibleItems.map((item, index) => ({
    id: item.id,
    label: item.title,
    type: 'item',
    sourceId: item.source_id,
    category: item.category,
    x: 72 + (index % 2) * 8,
    y: 14 + index * 10,
    size: 'sm',
  }));

  const nodes = [profileNode, ...sourceNodes, ...itemNodes].filter(Boolean);
  const sourceLookup = Object.fromEntries(sourceNodes.map((node) => [node.id, node]));
  const itemLookup = Object.fromEntries(visibleItems.map((item) => [item.id, item]));

  const edges = [
    ...sourceNodes.map((node) => ({
      id: `edge-${node.id}-profile`,
      from: node,
      to: profileNode,
      tone: 'source',
    })),
    ...itemNodes.map((node) => ({
      id: `edge-${node.id}-${node.sourceId || 'profile'}`,
      from: node,
      to: sourceLookup[node.sourceId] || profileNode,
      tone: node.sourceId ? 'item-linked' : 'item-direct',
    })),
  ].filter((edge) => edge.from && edge.to);

  const filteredNodes = nodes.filter((node) => {
    if (nodeFilter === 'all') {
      return true;
    }
    if (nodeFilter === 'profile') {
      return node.type === 'profile';
    }
    if (nodeFilter === 'source') {
      return node.type === 'source';
    }
    if (nodeFilter === 'item') {
      return node.type === 'item';
    }
    return true;
  });
  const filteredNodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = edges.filter((edge) => filteredNodeIds.has(edge.from.id) && filteredNodeIds.has(edge.to.id));
  const selectedNode = filteredNodes.find((node) => node.id === selectedNodeId) || filteredNodes[0] || null;
  const selectedSource = selectedNode?.type === 'source' ? sources.find((entry) => entry.id === selectedNode.id) : null;
  const selectedItem = selectedNode?.type === 'item' ? itemLookup[selectedNode.id] : null;

  useEffect(() => {
    if (!selectedNode || !filteredNodeIds.has(selectedNode.id)) {
      setSelectedNodeId(filteredNodes[0]?.id || 'profile');
    }
  }, [filteredNodes, filteredNodeIds, selectedNode]);

  const nodeToneClass = {
    profile: 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/12 text-[var(--color-text-primary)] shadow-[0_0_0_1px_rgba(96,165,250,0.08)]',
    source: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-100',
    item: 'border-sky-500/30 bg-sky-500/12 text-sky-100',
  };

  const edgeTone = {
    source: 'rgba(16,185,129,0.32)',
    'item-linked': 'rgba(56,189,248,0.28)',
    'item-direct': 'rgba(96,165,250,0.18)',
  };

  const nodeSizeClass = {
    lg: 'min-h-[82px] w-[170px] px-4 py-3',
    md: 'min-h-[68px] w-[148px] px-3 py-2.5',
    sm: 'min-h-[60px] w-[138px] px-3 py-2',
  };

  const beginPan = (event) => {
    if (event.target.closest('[data-graph-node="true"]')) {
      return;
    }
    setDragging(true);
    dragStateRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const updatePan = (event) => {
    if (!dragging) {
      return;
    }
    const deltaX = event.clientX - dragStateRef.current.x;
    const deltaY = event.clientY - dragStateRef.current.y;
    setPan({
      x: dragStateRef.current.panX + deltaX,
      y: dragStateRef.current.panY + deltaY,
    });
  };

  const endPan = () => setDragging(false);

  const handleWheelZoom = (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    setZoom((current) => Math.max(0.72, Math.min(1.8, Number((current + delta).toFixed(2)))));
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Knowledge Graph</div>
          <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Visual map of how profile context, sources, and knowledge objects connect inside workspace memory.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'profile', label: 'Profile' },
            { id: 'source', label: 'Sources' },
            { id: 'item', label: 'Knowledge' },
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setNodeFilter(filter.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                nodeFilter === filter.id
                  ? 'bg-[var(--color-primary)] text-[var(--color-text-on-primary)]'
                  : 'border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <div className="ml-1 flex items-center gap-2">
            <button
              onClick={() => setZoom((current) => Math.max(0.72, Number((current - 0.1).toFixed(2))))}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-sm text-[var(--color-text-secondary)]"
              title="Zoom out"
            >
              -
            </button>
            <button
              onClick={resetView}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]"
            >
              Reset
            </button>
            <button
              onClick={() => setZoom((current) => Math.min(1.8, Number((current + 0.1).toFixed(2))))}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-sm text-[var(--color-text-secondary)]"
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div
            className={`relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
              minHeight: 440,
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.16) 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
            onMouseDown={beginPan}
            onMouseMove={updatePan}
            onMouseUp={endPan}
            onMouseLeave={endPan}
            onWheel={handleWheelZoom}
          >
            <div className="absolute right-4 top-4 z-10 flex gap-2">
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                {visibleSources.length} sources
              </span>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                {visibleItems.length} items
              </span>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <div
              className="absolute inset-0 origin-center transition-transform duration-150"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {filteredEdges.map((edge) => (
                  <line
                    key={edge.id}
                    x1={edge.from.x}
                    y1={edge.from.y}
                    x2={edge.to.x}
                    y2={edge.to.y}
                    stroke={edgeTone[edge.tone]}
                    strokeWidth={edge.tone === 'source' ? 0.4 : 0.32}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>

              {filteredNodes.map((node) => (
                <button
                  key={node.id}
                  data-graph-node="true"
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border backdrop-blur-sm text-left transition ${nodeToneClass[node.type] || nodeToneClass.item} ${nodeSizeClass[node.size] || nodeSizeClass.sm} ${selectedNodeId === node.id ? 'ring-2 ring-white/30' : ''}`}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                    {node.type === 'profile' ? 'Workspace' : node.type === 'source' ? node.sourceType || 'source' : node.category || 'item'}
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-5">
                    {node.label}
                  </div>
                </button>
              ))}
            </div>

            {!filteredNodes.length && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[var(--color-text-secondary)]">
                Add profile context, sources, and knowledge items to shape the graph.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Node Focus</div>
            {selectedNode ? (
              <div className="mt-4 space-y-4">
                <div className={`rounded-2xl border p-4 ${nodeToneClass[selectedNode.type] || nodeToneClass.item}`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                    {selectedNode.type === 'profile' ? 'Workspace Profile' : selectedNode.type === 'source' ? selectedNode.sourceType || 'source' : selectedNode.category || 'knowledge'}
                  </div>
                  <div className="mt-2 text-base font-semibold">{selectedNode.label}</div>
                </div>

                {selectedNode.type === 'profile' ? (
                  <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                    <div>{profile.overview || 'No workspace overview yet.'}</div>
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                      Mission: {profile.mission || 'Not defined yet.'}
                    </div>
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                      Brand voice: {profile.brand_voice || 'Not defined yet.'}
                    </div>
                  </div>
                ) : null}

                {selectedSource ? (
                  <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                      Status: {selectedSource.status || 'draft'}
                    </div>
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                      Location: {selectedSource.location || 'Not defined'}
                    </div>
                    <div>{selectedSource.notes || 'No source notes yet.'}</div>
                  </div>
                ) : null}

                {selectedItem ? (
                  <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                      Status: {selectedItem.status || 'draft'}
                    </div>
                    <div>{selectedItem.content || 'No knowledge content yet.'}</div>
                    {selectedItem.tags?.length ? (
                      <div className="flex gap-2 flex-wrap">
                        {selectedItem.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-[var(--color-hover)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 text-sm text-[var(--color-text-secondary)]">
                Pick a node to inspect the connected memory object.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const AssistActionButton = ({ label, description, onClick, loading }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 text-left transition hover:border-[var(--color-primary)]/50"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{loading ? 'Working...' : label}</div>
        <div className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{description}</div>
      </div>
      <AIAssistButton
        onAssist={onClick}
        loading={loading}
        tooltip={label}
        iconType="crosshair"
      />
    </div>
  </button>
);

const Brain = () => {
  const [overview, setOverview] = useState(null);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [sourceDraft, setSourceDraft] = useState(EMPTY_SOURCE);
  const [mcpDraft, setMcpDraft] = useState(EMPTY_MCP);
  const [itemDraft, setItemDraft] = useState(EMPTY_ITEM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [creatingSource, setCreatingSource] = useState(false);
  const [creatingMcp, setCreatingMcp] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);
  const [assistMode, setAssistMode] = useState('');
  const [pendingNodeId, setPendingNodeId] = useState('');

  const sources = overview?.sources || [];
  const items = overview?.items || [];
  const links = overview?.links || [];
  const stats = overview?.stats || { source_count: 0, knowledge_count: 0, active_count: 0, draft_count: 0 };
  const mcpServers = sources.filter((source) => source.source_type === 'mcp');
  const sourcesById = useMemo(
    () => Object.fromEntries(sources.map((source) => [source.id, source])),
    [sources]
  );

  const sourceOptions = useMemo(
    () => sources.map((source) => ({ value: source.id, label: source.label })),
    [sources]
  );

  const loadBrain = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getBrainOverviewApi();
      setOverview({
        ...data,
        sources: data?.sources || [],
        items: data?.items || [],
        links: data?.links || [],
      });
      setProfile(data?.profile || EMPTY_PROFILE);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load AIO Brain.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrain();
  }, []);

  const triggerSavedState = () => {
    setSavedProfile(true);
    window.setTimeout(() => setSavedProfile(false), 1400);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setError('');
    try {
      const updated = await updateBrainProfileApi(profile);
      setProfile(updated || profile);
      await loadBrain();
      triggerSavedState();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save brain profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateSource = async () => {
    if (!sourceDraft.label.trim()) {
      setError('Source label is required.');
      return;
    }
    setCreatingSource(true);
    setError('');
    try {
      await createBrainSourceApi({
        ...sourceDraft,
        label: sourceDraft.label.trim(),
      });
      setSourceDraft(EMPTY_SOURCE);
      await loadBrain();
    } catch (createError) {
      setError(createError.message || 'Unable to create source.');
    } finally {
      setCreatingSource(false);
    }
  };

  const handleCreateMcp = async () => {
    if (!mcpDraft.label.trim()) {
      setError('MCP server name is required.');
      return;
    }
    setCreatingMcp(true);
    setError('');
    try {
      await createBrainSourceApi({
        label: mcpDraft.label.trim(),
        source_type: 'mcp',
        status: 'connected',
        location: mcpDraft.location.trim(),
        notes: mcpDraft.notes.trim(),
      });
      setMcpDraft(EMPTY_MCP);
      await loadBrain();
    } catch (createError) {
      setError(createError.message || 'Unable to connect MCP server.');
    } finally {
      setCreatingMcp(false);
    }
  };

  const handleCreateItem = async () => {
    if (!itemDraft.title.trim()) {
      setError('Knowledge title is required.');
      return;
    }
    setCreatingItem(true);
    setError('');
    try {
      await createBrainItemApi({
        ...itemDraft,
        title: itemDraft.title.trim(),
        content: itemDraft.content.trim(),
        source_id: itemDraft.source_id || null,
        tags: itemDraft.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setItemDraft(EMPTY_ITEM);
      await loadBrain();
    } catch (createError) {
      setError(createError.message || 'Unable to create knowledge item.');
    } finally {
      setCreatingItem(false);
    }
  };

  const handleDeleteSource = async (sourceId) => {
    try {
      await deleteBrainSourceApi(sourceId);
      await loadBrain();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete source.');
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await deleteBrainItemApi(itemId);
      await loadBrain();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete knowledge item.');
    }
  };

  const handleMoveNode = async (node, position) => {
    if (node.type === 'profile') {
      return;
    }
    setPendingNodeId(node.id);
    setOverview((current) => {
      if (!current) {
        return current;
      }
      const key = node.type === 'source' ? 'sources' : 'items';
      return {
        ...current,
        [key]: (current[key] || []).map((entry) =>
          entry.id === node.id ? { ...entry, graph_x: position.x, graph_y: position.y } : entry
        ),
      };
    });
    try {
      if (node.type === 'source') {
        await updateBrainSourceApi(node.id, { graph_x: position.x, graph_y: position.y });
      } else {
        await updateBrainItemApi(node.id, { graph_x: position.x, graph_y: position.y });
      }
    } catch (moveError) {
      setError(moveError.message || 'Unable to save graph position.');
      await loadBrain();
    } finally {
      setPendingNodeId('');
    }
  };

  const handleCreateLink = async (payload) => {
    setError('');
    try {
      await createBrainLinkApi(payload);
      await loadBrain();
    } catch (linkError) {
      setError(linkError.message || 'Unable to create graph link.');
    }
  };

  const handleDeleteLink = async (linkId) => {
    setError('');
    try {
      await deleteBrainLinkApi(linkId);
      await loadBrain();
    } catch (linkError) {
      setError(linkError.message || 'Unable to remove graph link.');
    }
  };

  const runBrainAssist = async (mode) => {
    setAssistMode(mode);
    setError('');
    try {
      const result = await assistAiApi({
        module: 'brain',
        surface: mode === 'source-brief' ? 'source' : mode === 'knowledge-note' ? 'knowledge' : 'ai-workbench',
        field: mode,
        intent: 'draft',
        current_value:
          mode === 'knowledge-note'
            ? itemDraft.content || ''
            : mode === 'source-brief'
            ? sourceDraft.notes || ''
            : profile.overview || '',
        context: {
          profile,
          source_count: stats.source_count,
          knowledge_count: stats.knowledge_count,
          current_source: sourceDraft,
          current_item: itemDraft,
        },
      });

      const suggestion = result?.suggestion || '';

      if (mode === 'company-profile' || mode === 'overview') {
        setProfile((current) => ({ ...current, overview: suggestion || current.overview }));
      } else if (mode === 'mission') {
        setProfile((current) => ({ ...current, mission: suggestion || current.mission }));
      } else if (mode === 'brand-voice') {
        setProfile((current) => ({ ...current, brand_voice: suggestion || current.brand_voice }));
      } else if (mode === 'ideal-customer') {
        setProfile((current) => ({ ...current, ideal_customer: suggestion || current.ideal_customer }));
      } else if (mode === 'ops-playbook') {
        setSourceDraft((current) => ({
          ...current,
          label: current.label || 'Ops Playbook',
          source_type: current.source_type || 'document',
          status: current.status || 'draft',
        }));
        setItemDraft((current) => ({
          ...current,
          title: current.title || 'Ops Playbook Entry',
          category: 'operations',
          content: suggestion || current.content,
          tags: current.tags || 'ops, playbook, agents',
        }));
      } else if (mode === 'source-brief') {
        setSourceDraft((current) => ({ ...current, notes: suggestion || current.notes }));
      } else {
        setItemDraft((current) => ({
          ...current,
          title: current.title || 'Brain starter note',
          category: current.category || 'strategy',
          content: suggestion || current.content,
        }));
      }
    } catch (assistError) {
      setError(assistError.message || 'Unable to run AIO Brain assist.');
    } finally {
      setAssistMode('');
    }
  };

  if (loading) {
    return (
      <div className="h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 text-[var(--color-text-secondary)]">
        Loading AIO Brain...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6">
      <ModuleHeader
        title="AIO Brain"
        showTitle={false}
        actions={[
          {
            label: savedProfile ? 'Saved' : savingProfile ? 'Saving...' : 'Save Profile',
            icon: Save,
            onClick: handleSaveProfile,
            disabled: savingProfile,
            variant: 'primary',
          },
        ]}
        aiAssistSlot={
          <AIAssistButton
            onAssist={() => runBrainAssist('knowledge-note')}
            loading={assistMode === 'knowledge-note'}
            tooltip="Draft a starter knowledge note for this workspace"
            iconType="crosshair"
          />
        }
      />

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <StatCard label="Sources" value={stats.source_count} hint="Knowledge inputs connected" icon={Database} />
        <StatCard label="Knowledge" value={stats.knowledge_count} hint="Saved memory objects" icon={BookOpen} />
        <StatCard label="Active" value={stats.active_count} hint="Ready for AI retrieval" icon={Library} />
        <StatCard label="Drafts" value={stats.draft_count} hint="Still being shaped" icon={FilePlus2} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <BrainGraphPanel
            profile={profile}
            sources={sources}
            items={items}
            links={links}
            onMoveNode={handleMoveNode}
            onCreateLink={handleCreateLink}
            onDeleteLink={handleDeleteLink}
            pendingNodeId={pendingNodeId}
          />

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Company Memory Profile</div>
              <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Define the identity, mission, and voice that future AI assists and agents should inherit.
              </div>
              </div>
              <div className="flex items-center gap-2">
                <AIAssistButton
                  onAssist={() => runBrainAssist('company-profile')}
                  loading={assistMode === 'company-profile'}
                  tooltip="Draft company profile overview"
                  iconType="crosshair"
                />
                <AIAssistButton
                  onAssist={() => runBrainAssist('brand-voice')}
                  loading={assistMode === 'brand-voice'}
                  tooltip="Build brand voice"
                  iconType="crosshair"
                />
                <AIAssistButton
                  onAssist={() => runBrainAssist('ideal-customer')}
                  loading={assistMode === 'ideal-customer'}
                  tooltip="Define ideal customer profile"
                  iconType="crosshair"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-[var(--color-text-secondary)]">
                <div className="mb-1">Company Name</div>
                <input
                  value={profile.company_name || ''}
                  onChange={(event) => setProfile((current) => ({ ...current, company_name: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                />
              </label>
              <label className="text-sm text-[var(--color-text-secondary)]">
                <div className="mb-1">Website</div>
                <input
                  value={profile.website || ''}
                  onChange={(event) => setProfile((current) => ({ ...current, website: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                />
              </label>
              <label className="text-sm text-[var(--color-text-secondary)] md:col-span-2">
                <div className="mb-1">Industry</div>
                <input
                  value={profile.industry || ''}
                  onChange={(event) => setProfile((current) => ({ ...current, industry: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                />
              </label>
              <label className="text-sm text-[var(--color-text-secondary)] md:col-span-2">
                <div className="mb-1">Overview</div>
                <textarea
                  rows={4}
                  value={profile.overview || ''}
                  onChange={(event) => setProfile((current) => ({ ...current, overview: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                />
              </label>
              <label className="text-sm text-[var(--color-text-secondary)]">
                <div className="mb-1">Mission</div>
                <textarea
                  rows={4}
                  value={profile.mission || ''}
                  onChange={(event) => setProfile((current) => ({ ...current, mission: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                />
              </label>
              <label className="text-sm text-[var(--color-text-secondary)]">
                <div className="mb-1">Brand Voice</div>
                <textarea
                  rows={4}
                  value={profile.brand_voice || ''}
                  onChange={(event) => setProfile((current) => ({ ...current, brand_voice: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                />
              </label>
              <label className="text-sm text-[var(--color-text-secondary)] md:col-span-2">
                <div className="mb-1">Ideal Customer</div>
                <textarea
                  rows={3}
                  value={profile.ideal_customer || ''}
                  onChange={(event) => setProfile((current) => ({ ...current, ideal_customer: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Knowledge Items</div>
              <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Capture durable facts, strategy, SOPs, and reusable intelligence for agents and AI assists.
              </div>
              </div>
              <div className="flex items-center gap-2">
                <AIAssistButton
                  onAssist={() => runBrainAssist('ops-playbook')}
                  loading={assistMode === 'ops-playbook'}
                  tooltip="Draft an ops playbook entry"
                  iconType="crosshair"
                />
                <AIAssistButton
                  onAssist={() => runBrainAssist('knowledge-note')}
                  loading={assistMode === 'knowledge-note'}
                  tooltip="Draft a knowledge note"
                  iconType="crosshair"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                placeholder="Title"
                value={itemDraft.title}
                onChange={(event) => setItemDraft((current) => ({ ...current, title: event.target.value }))}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              />
              <select
                value={itemDraft.category}
                onChange={(event) => setItemDraft((current) => ({ ...current, category: event.target.value }))}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              >
                <option value="note">Note</option>
                <option value="strategy">Strategy</option>
                <option value="operations">Operations</option>
                <option value="brand">Brand</option>
                <option value="customer">Customer</option>
              </select>
              <textarea
                rows={4}
                placeholder="What should the workspace remember?"
                value={itemDraft.content}
                onChange={(event) => setItemDraft((current) => ({ ...current, content: event.target.value }))}
                className="md:col-span-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              />
              <select
                value={itemDraft.source_id}
                onChange={(event) => setItemDraft((current) => ({ ...current, source_id: event.target.value }))}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              >
                <option value="">No linked source</option>
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                placeholder="Tags, comma separated"
                value={itemDraft.tags}
                onChange={(event) => setItemDraft((current) => ({ ...current, tags: event.target.value }))}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              />
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleCreateItem}
                disabled={creatingItem}
                className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-primary)]"
              >
                {creatingItem ? 'Creating...' : 'Add Knowledge'}
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-[var(--color-text-primary)]">{item.title}</div>
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                          {item.category}
                        </span>
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                          {item.status}
                        </span>
                        {item.source_id && sourcesById[item.source_id] ? (
                          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-emerald-200">
                            {sourcesById[item.source_id].label}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{item.content}</div>
                      {item.tags?.length ? (
                        <div className="mt-3 flex gap-2 flex-wrap">
                          {item.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-[var(--color-hover)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-2 text-[var(--color-text-secondary)] hover:text-red-300"
                      title="Delete knowledge item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">AI Workbench</div>
              <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Use AIO Brain to build durable workspace memory instead of one-off prompts. These helpers shape the profile and seed reusable knowledge.
              </div>
            </div>
            <div className="grid gap-3">
              <AssistActionButton
                label="Build Company Profile"
                description="Draft a sharper company overview from the current business context."
                onClick={() => runBrainAssist('company-profile')}
                loading={assistMode === 'company-profile'}
              />
              <AssistActionButton
                label="Shape Brand Voice"
                description="Generate a reusable voice block that bullseyes and agents can inherit."
                onClick={() => runBrainAssist('brand-voice')}
                loading={assistMode === 'brand-voice'}
              />
              <AssistActionButton
                label="Define Ideal Customer"
                description="Turn the workspace context into an ICP that can inform CRM, messaging, and flows."
                onClick={() => runBrainAssist('ideal-customer')}
                loading={assistMode === 'ideal-customer'}
              />
              <AssistActionButton
                label="Draft Ops Playbook Entry"
                description="Seed an operations rule or SOP entry for agents, workflows, and comms handling."
                onClick={() => runBrainAssist('ops-playbook')}
                loading={assistMode === 'ops-playbook'}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Knowledge Sources</div>
              <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Track the documents, profiles, URLs, and internal references that feed workspace memory.
              </div>
              </div>
              <AIAssistButton
                onAssist={() => runBrainAssist('source-brief')}
                loading={assistMode === 'source-brief'}
                tooltip="Explain what this source should contribute to Brain memory"
                iconType="crosshair"
              />
            </div>

            <div className="space-y-3">
              <input
                placeholder="Source label"
                value={sourceDraft.label}
                onChange={(event) => setSourceDraft((current) => ({ ...current, label: event.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={sourceDraft.source_type}
                  onChange={(event) => setSourceDraft((current) => ({ ...current, source_type: event.target.value }))}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                >
                  <option value="document">Document</option>
                  <option value="mcp">MCP Server</option>
                  <option value="profile">Profile</option>
                  <option value="url">URL</option>
                  <option value="workspace">Workspace</option>
                </select>
                <select
                  value={sourceDraft.status}
                  onChange={(event) => setSourceDraft((current) => ({ ...current, status: event.target.value }))}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
                >
                  <option value="draft">Draft</option>
                  <option value="ready">Ready</option>
                  <option value="connected">Connected</option>
                </select>
              </div>
              <input
                placeholder="Location or endpoint"
                value={sourceDraft.location}
                onChange={(event) => setSourceDraft((current) => ({ ...current, location: event.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              />
              <textarea
                rows={3}
                placeholder="Notes about what this source contributes"
                value={sourceDraft.notes}
                onChange={(event) => setSourceDraft((current) => ({ ...current, notes: event.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              />
              <button
                onClick={handleCreateSource}
                disabled={creatingSource}
                className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-primary)]"
              >
                {creatingSource ? 'Adding...' : 'Add Source'}
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {sources.filter((source) => source.source_type !== 'mcp').map((source) => (
                <div key={source.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-[var(--color-text-primary)]">{source.label}</div>
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                          {source.source_type}
                        </span>
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                          {source.status}
                        </span>
                      </div>
                      {source.location ? (
                        <div className="mt-2 text-sm text-[var(--color-text-secondary)]">{source.location}</div>
                      ) : null}
                      {source.notes ? (
                        <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{source.notes}</div>
                      ) : null}
                    </div>
                    <button
                      onClick={() => handleDeleteSource(source.id)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-2 text-[var(--color-text-secondary)] hover:text-red-300"
                      title="Delete source"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">MCP Servers</div>
                <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Register model context protocol endpoints that should participate in workspace memory and agent access.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <input
                placeholder="Server name"
                value={mcpDraft.label}
                onChange={(event) => setMcpDraft((current) => ({ ...current, label: event.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              />
              <input
                placeholder="Endpoint, command, or transport hint"
                value={mcpDraft.location}
                onChange={(event) => setMcpDraft((current) => ({ ...current, location: event.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              />
              <textarea
                rows={3}
                placeholder="What should this MCP server expose to Brain and agents?"
                value={mcpDraft.notes}
                onChange={(event) => setMcpDraft((current) => ({ ...current, notes: event.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)]"
              />
              <button
                onClick={handleCreateMcp}
                disabled={creatingMcp}
                className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-primary)]"
              >
                {creatingMcp ? 'Connecting...' : 'Connect MCP Server'}
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {mcpServers.length ? mcpServers.map((source) => (
                <div key={source.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-[var(--color-text-primary)]">{source.label}</div>
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                          MCP
                        </span>
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                          {source.status}
                        </span>
                      </div>
                      {source.location ? (
                        <div className="mt-2 text-sm text-[var(--color-text-secondary)]">{source.location}</div>
                      ) : null}
                      {source.notes ? (
                        <div className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{source.notes}</div>
                      ) : null}
                    </div>
                    <button
                      onClick={() => handleDeleteSource(source.id)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-2 text-[var(--color-text-secondary)] hover:text-red-300"
                      title="Delete MCP server"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-5 text-sm text-[var(--color-text-secondary)]">
                  No MCP servers connected yet.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">What This Becomes</div>
            <div className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
              AIO Brain is the workspace memory layer that future agents, bullseye assists, flows, and Comms threads can query
              before drafting or deciding. This first pass gives you a real place to store company profile context, knowledge
              entries, and source references without hiding that system behind another iframe.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Brain;

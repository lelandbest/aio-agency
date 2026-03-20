import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, X, Trash2 } from 'lucide-react';

const clampPosition = (value, min, max) => Math.max(min, Math.min(max, value));

const buildNodeLayout = (profile, sources, items) => {
  const profileNode = profile?.company_name
    ? { id: 'profile', label: profile.company_name, type: 'profile', x: 50, y: 50, size: 'lg' }
    : null;

  const sourceNodes = sources.map((source, index) => ({
    id: source.id,
    label: source.label,
    type: 'source',
    sourceType: source.source_type,
    x: source.graph_x ?? 24 + (index % 2) * 7,
    y: source.graph_y ?? 20 + index * 12,
    size: source.source_type === 'mcp' ? 'md' : 'sm',
  }));

  const sourceNodesById = Object.fromEntries(sourceNodes.map((node) => [node.id, node]));

  const itemNodes = items.map((item, index) => {
    const sourceAnchor = item.source_id ? sourceNodesById[item.source_id] : null;
    const inferredX = sourceAnchor
      ? clampPosition(sourceAnchor.x + 14 + ((index % 2) * 4), 12, 90)
      : 71 + (index % 2) * 8;
    const inferredY = sourceAnchor
      ? clampPosition(sourceAnchor.y + ((index % 3) - 1) * 6, 12, 88)
      : 18 + index * 11;
    return {
      id: item.id,
      label: item.title,
      type: 'item',
      category: item.category,
      sourceId: item.source_id,
      x: item.graph_x ?? inferredX,
      y: item.graph_y ?? inferredY,
      size: 'sm',
    };
  });

  return [profileNode, ...sourceNodes, ...itemNodes].filter(Boolean);
};

const toneClassByType = {
  profile: 'border-[var(--color-primary)]/45 bg-[var(--color-primary)]/12 text-[var(--color-text-primary)] shadow-[0_0_0_1px_rgba(96,165,250,0.08)]',
  source: 'border-emerald-500/40 bg-emerald-500/14 text-[var(--color-text-primary)]',
  item: 'border-sky-500/40 bg-sky-500/14 text-[var(--color-text-primary)]',
};

const edgeToneByType = {
  source: 'rgba(16,185,129,0.5)',
  'item-linked': 'rgba(56,189,248,0.44)',
  'item-direct': 'rgba(96,165,250,0.28)',
  link: 'rgba(250,204,21,0.52)',
};

const nodeSizeClass = {
  lg: 'min-h-[84px] w-[170px] px-4 py-3',
  md: 'min-h-[70px] w-[148px] px-3 py-2.5',
  sm: 'min-h-[60px] w-[136px] px-3 py-2',
};

export default function BrainGraphPanel({
  profile,
  sources,
  items,
  links,
  onMoveNode,
  onCreateLink,
  onDeleteLink,
  pendingNodeId,
}) {
  const [nodeFilter, setNodeFilter] = useState('all');
  const [selectedNodeId, setSelectedNodeId] = useState('profile');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draggingPan, setDraggingPan] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState('');
  const [nodePositions, setNodePositions] = useState({});
  const [contextNodeId, setContextNodeId] = useState('');
  const [contextAnchor, setContextAnchor] = useState({ x: 0, y: 0 });
  const [linkDraft, setLinkDraft] = useState({ toId: '', relationshipType: 'supports' });
  const dragStateRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, nodeId: '' });
  const canvasRef = useRef(null);

  const nodes = useMemo(() => buildNodeLayout(profile, sources, items), [profile, sources, items]);
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((node) => [node.id, node])), [nodes]);
  const sourceLookup = useMemo(() => Object.fromEntries(sources.map((source) => [source.id, source])), [sources]);
  const itemLookup = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items]);

  useEffect(() => {
    setNodePositions((current) => {
      const next = {};
      nodes.forEach((node) => {
        next[node.id] = current[node.id] || { x: node.x, y: node.y };
      });
      return next;
    });
  }, [nodes]);

  const positionedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        x: nodePositions[node.id]?.x ?? node.x,
        y: nodePositions[node.id]?.y ?? node.y,
      })),
    [nodePositions, nodes]
  );

  const automaticEdges = useMemo(() => {
    const profileNode = nodesById.profile;
    const sourceNodes = positionedNodes.filter((node) => node.type === 'source');
    const itemNodes = positionedNodes.filter((node) => node.type === 'item');
    const sourceNodesById = Object.fromEntries(sourceNodes.map((node) => [node.id, node]));
    return [
      ...sourceNodes.map((node) => ({
        id: `auto-source-${node.id}`,
        from: node,
        to: profileNode,
        tone: 'source',
        label: 'source',
      })),
      ...itemNodes.map((node) => ({
        id: `auto-item-${node.id}`,
        from: node,
        to: node.sourceId ? sourceNodesById[node.sourceId] || profileNode : profileNode,
        tone: node.sourceId ? 'item-linked' : 'item-direct',
        label: node.sourceId ? 'derived' : '',
      })),
    ].filter((edge) => edge.from && edge.to);
  }, [nodesById, positionedNodes]);

  const explicitEdges = useMemo(
    () =>
      (links || [])
        .map((link) => ({
          ...link,
          from: nodesById[link.from_id],
          to: nodesById[link.to_id],
          tone: 'link',
          label: link.relationship_type || 'supports',
        }))
        .filter((edge) => edge.from && edge.to),
    [links, nodesById]
  );

  const edges = [...automaticEdges, ...explicitEdges];
  const filteredNodes = positionedNodes.filter((node) => (nodeFilter === 'all' ? true : node.type === nodeFilter));
  const filteredNodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = edges.filter((edge) => filteredNodeIds.has(edge.from.id) && filteredNodeIds.has(edge.to.id));
  const selectedNode = filteredNodes.find((node) => node.id === selectedNodeId) || filteredNodes[0] || null;
  const contextNode = positionedNodes.find((node) => node.id === contextNodeId) || null;
  const contextSource = contextNode?.type === 'source' ? sourceLookup[contextNode.id] : null;
  const contextItem = contextNode?.type === 'item' ? itemLookup[contextNode.id] : null;
  const contextLinks = explicitEdges.filter((edge) => edge.from.id === contextNodeId || edge.to.id === contextNodeId);
  const linkableNodes = positionedNodes.filter((node) => contextNode && node.id !== contextNode.id);

  useEffect(() => {
    if (!selectedNode || !filteredNodeIds.has(selectedNode.id)) {
      setSelectedNodeId(filteredNodes[0]?.id || 'profile');
    }
  }, [filteredNodes, filteredNodeIds, selectedNode]);

  const beginPan = (event) => {
    if (event.target.closest('[data-graph-node="true"]')) {
      return;
    }
    setContextNodeId('');
    setDraggingPan(true);
    dragStateRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      nodeId: '',
    };
  };

  const beginNodeDrag = (event, node) => {
    if (node.type === 'profile') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDraggedNodeId(node.id);
    setSelectedNodeId(node.id);
    dragStateRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      nodeId: node.id,
    };
  };

  const updateInteraction = (event) => {
    if (draggedNodeId) {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const nextX = clampPosition(((event.clientX - rect.left - pan.x) / rect.width / zoom) * 100, 8, 92);
      const nextY = clampPosition(((event.clientY - rect.top - pan.y) / rect.height / zoom) * 100, 10, 90);
      setNodePositions((current) => ({
        ...current,
        [draggedNodeId]: { x: nextX, y: nextY },
      }));
      return;
    }
    if (!draggingPan) {
      return;
    }
    const deltaX = event.clientX - dragStateRef.current.x;
    const deltaY = event.clientY - dragStateRef.current.y;
    setPan({
      x: dragStateRef.current.panX + deltaX,
      y: dragStateRef.current.panY + deltaY,
    });
  };

  const endInteraction = async () => {
    if (draggedNodeId) {
      const nextPosition = nodePositions[draggedNodeId];
      const draggedNode = positionedNodes.find((node) => node.id === draggedNodeId);
      setDraggedNodeId('');
      if (draggedNode && nextPosition && (Math.abs(nextPosition.x - draggedNode.x) > 0.2 || Math.abs(nextPosition.y - draggedNode.y) > 0.2)) {
        await onMoveNode?.(draggedNode, nextPosition);
      }
      return;
    }
    setDraggingPan(false);
  };

  const openNodeContext = (event, node) => {
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    setSelectedNodeId(node.id);
    setContextNodeId(node.id);
    setContextAnchor({
      x: clampPosition(event.clientX - rect.left, 18, rect.width - 338),
      y: clampPosition(event.clientY - rect.top, 18, rect.height - 360),
    });
    setLinkDraft({ toId: '', relationshipType: 'supports' });
  };

  const handleWheelZoom = (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    setZoom((current) => Math.max(0.72, Math.min(1.8, Number((current + delta).toFixed(2)))));
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleCreateLink = async () => {
    if (!contextNode || !linkDraft.toId) {
      return;
    }
    const targetNode = positionedNodes.find((node) => node.id === linkDraft.toId);
    if (!targetNode) {
      return;
    }
    await onCreateLink?.({
      from_type: contextNode.type,
      from_id: contextNode.id,
      to_type: targetNode.type,
      to_id: targetNode.id,
      relationship_type: linkDraft.relationshipType,
    });
    setLinkDraft((current) => ({ ...current, toId: '' }));
  };

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Knowledge Graph</div>
          <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Drag nodes, pan the canvas, and right-click any node to inspect or connect memory.
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
          <button
            onClick={() => setZoom((current) => Math.max(0.72, Number((current - 0.1).toFixed(2))))}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-sm text-[var(--color-text-secondary)]"
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
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className={`relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] ${draggingPan ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          minHeight: 640,
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.14) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
        onMouseDown={beginPan}
        onMouseMove={updateInteraction}
        onMouseUp={endInteraction}
        onMouseLeave={endInteraction}
        onWheel={handleWheelZoom}
      >
        <div className="absolute right-4 top-4 z-10 flex gap-2">
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
            {sources.length} sources
          </span>
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
            {items.length} items
          </span>
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <div
          className="absolute inset-0 origin-center transition-transform duration-150"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {filteredEdges.map((edge) => (
              <g key={edge.id}>
                <path
                  id={`graph-edge-${edge.id}`}
                  d={`M ${edge.from.x} ${edge.from.y} L ${edge.to.x} ${edge.to.y}`}
                  stroke={edgeToneByType[edge.tone] || edgeToneByType.link}
                  strokeWidth={edge.tone === 'source' ? 0.46 : 0.38}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
                {edge.label ? (
                  <text
                    fontSize="1.45"
                    fill="var(--color-text-tertiary)"
                    letterSpacing="0.12em"
                    textTransform="uppercase"
                  >
                    <textPath href={`#graph-edge-${edge.id}`} startOffset="50%" textAnchor="middle">
                      {edge.label}
                    </textPath>
                  </text>
                ) : null}
              </g>
            ))}
          </svg>

          {filteredNodes.map((node) => (
            <button
              key={node.id}
              data-graph-node="true"
              onClick={() => setSelectedNodeId(node.id)}
              onMouseDown={(event) => beginNodeDrag(event, node)}
              onContextMenu={(event) => openNodeContext(event, node)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border backdrop-blur-sm text-left transition ${toneClassByType[node.type] || toneClassByType.item} ${nodeSizeClass[node.size] || nodeSizeClass.sm} ${selectedNodeId === node.id ? 'ring-2 ring-white/30' : ''} ${node.type === 'profile' ? 'cursor-pointer' : 'cursor-move'}`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                  {node.type === 'profile' ? 'Workspace' : node.type === 'source' ? node.sourceType || 'source' : node.category || 'item'}
                </div>
                {pendingNodeId === node.id ? (
                  <span className="text-[9px] uppercase tracking-[0.14em] text-emerald-200">Saving</span>
                ) : null}
              </div>
              <div className="mt-1 text-sm font-semibold leading-5">{node.label}</div>
            </button>
          ))}
        </div>

        {contextNode ? (
          <div
            className="absolute z-20 w-[320px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-2xl"
            style={{ left: contextAnchor.x, top: contextAnchor.y }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                  {contextNode.type === 'profile' ? 'Workspace Profile' : contextNode.type === 'source' ? contextNode.sourceType || 'source' : contextNode.category || 'knowledge'}
                </div>
                <div className="mt-1 text-base font-semibold text-[var(--color-text-primary)]">{contextNode.label}</div>
              </div>
              <button
                onClick={() => setContextNodeId('')}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-[var(--color-text-secondary)]"
              >
                <X size={14} />
              </button>
            </div>

            {contextNode.type === 'profile' ? (
              <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <div>{profile.overview || 'No workspace overview yet.'}</div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                  Mission: {profile.mission || 'Not defined yet.'}
                </div>
              </div>
            ) : null}

            {contextSource ? (
              <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                  Status: {contextSource.status || 'draft'}
                </div>
                <div>{contextSource.location || 'No source location yet.'}</div>
                {contextSource.notes ? <div>{contextSource.notes}</div> : null}
              </div>
            ) : null}

            {contextItem ? (
              <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                  Status: {contextItem.status || 'draft'}
                </div>
                {contextItem.source_id && sourceLookup[contextItem.source_id] ? (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2">
                    Source: {sourceLookup[contextItem.source_id].label}
                  </div>
                ) : null}
                <div>{contextItem.content || 'No knowledge content yet.'}</div>
              </div>
            ) : null}

            {contextNode.type !== 'profile' ? (
              <div className="mt-4 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  <Link2 size={14} />
                  Relationships
                </div>
                <select
                  value={linkDraft.toId}
                  onChange={(event) => setLinkDraft((current) => ({ ...current, toId: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                >
                  <option value="">Select node to connect</option>
                  {linkableNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
                <select
                  value={linkDraft.relationshipType}
                  onChange={(event) => setLinkDraft((current) => ({ ...current, relationshipType: event.target.value }))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                >
                  <option value="supports">Supports</option>
                  <option value="derived-from">Derived From</option>
                  <option value="related-to">Related To</option>
                  <option value="used-by-agent">Used By Agent</option>
                </select>
                <button
                  onClick={handleCreateLink}
                  disabled={!linkDraft.toId}
                  className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-primary)] disabled:opacity-50"
                >
                  Create Link
                </button>
                <div className="space-y-2">
                  {contextLinks.length ? contextLinks.map((edge) => {
                    const counterpart = edge.from.id === contextNodeId ? edge.to : edge.from;
                    return (
                      <div key={edge.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                        <div className="min-w-0">
                          <div className="truncate text-[var(--color-text-primary)]">{counterpart?.label || 'Unknown node'}</div>
                          <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{edge.label}</div>
                        </div>
                        <button
                          onClick={() => onDeleteLink?.(edge.id)}
                          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-2 text-[var(--color-text-secondary)] hover:text-red-300"
                          title="Remove graph link"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  }) : (
                    <div className="text-sm text-[var(--color-text-secondary)]">
                      No explicit graph links yet.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

import React, { useMemo, useState } from 'react';
import { ChevronRight, Layers, Search, X, Zap } from 'lucide-react';
import { categories as staticCategories, templates as staticTemplates } from '../data/templates';

const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 112;
const PREVIEW_PADDING = 16;
const PREVIEW_MIN_SPAN_X = 240;
const PREVIEW_MIN_SPAN_Y = 180;

const getNodeTone = (type) => {
  if (type === 'trigger') return { fill: 'rgba(14,165,233,0.18)', stroke: '#38bdf8' };
  if (type === 'logic') return { fill: 'rgba(245,158,11,0.18)', stroke: '#f59e0b' };
  return { fill: 'rgba(129,140,248,0.16)', stroke: '#818cf8' };
};

const getPreviewLayout = (template) => {
  const nodes = Array.isArray(template?.nodes) ? template.nodes : [];
  if (nodes.length === 0) {
    return { nodes: [], nodeMap: new Map() };
  }

  const projectedNodes = nodes.map((node, index) => ({
    ...node,
    position: {
      x: Number.isFinite(node?.position?.x) ? node.position.x : index * 180,
      y: Number.isFinite(node?.position?.y) ? node.position.y : (index % 2 === 0 ? 80 : 160),
    },
  }));

  const xs = projectedNodes.map((node) => node.position.x);
  const ys = projectedNodes.map((node) => node.position.y);
  const rawMinX = Math.min(...xs);
  const rawMaxX = Math.max(...xs);
  const rawMinY = Math.min(...ys);
  const rawMaxY = Math.max(...ys);
  const centerX = (rawMinX + rawMaxX) / 2;
  const centerY = (rawMinY + rawMaxY) / 2;
  const usableWidth = PREVIEW_WIDTH - PREVIEW_PADDING * 2;
  const usableHeight = PREVIEW_HEIGHT - PREVIEW_PADDING * 2;
  const xSpan = Math.max(1, rawMaxX - rawMinX, PREVIEW_MIN_SPAN_X);
  const ySpan = Math.max(1, rawMaxY - rawMinY, PREVIEW_MIN_SPAN_Y);
  const minX = centerX - (xSpan / 2);
  const minY = centerY - (ySpan / 2);
  const scale = Math.min(usableWidth / xSpan, usableHeight / ySpan);
  const contentWidth = xSpan * scale;
  const contentHeight = ySpan * scale;
  const offsetX = PREVIEW_PADDING + (usableWidth - contentWidth) / 2;
  const offsetY = PREVIEW_PADDING + (usableHeight - contentHeight) / 2;

  const scaledNodes = projectedNodes.map((node) => ({
    ...node,
    previewX: offsetX + (node.position.x - minX) * scale,
    previewY: offsetY + (node.position.y - minY) * scale,
  }));

  return {
    nodes: scaledNodes,
    nodeMap: new Map(scaledNodes.map((node) => [node.id, node])),
  };
};

const FlowPreview = ({ template }) => {
  const layout = getPreviewLayout(template);
  const nodes = layout.nodes;
  const edges = Array.isArray(template?.edges) ? template.edges : [];

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.28))]">
      <svg
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        className="block h-28 w-full"
        role="img"
        aria-label={`${template.name} flow preview`}
      >
        <rect x="0" y="0" width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} fill="rgba(2,6,23,0.25)" />
        <g opacity="0.94">
          {edges.map((edge) => {
            const source = layout.nodeMap.get(edge.source);
            const target = layout.nodeMap.get(edge.target);
            if (!source || !target) return null;
            const controlX = (source.previewX + target.previewX) / 2;
            return (
              <path
                key={edge.id}
                d={`M ${source.previewX} ${source.previewY} C ${controlX} ${source.previewY}, ${controlX} ${target.previewY}, ${target.previewX} ${target.previewY}`}
                fill="none"
                stroke="rgba(148,163,184,0.82)"
                strokeWidth="2"
                strokeDasharray="8 6"
                strokeLinecap="round"
              />
            );
          })}
          {nodes.map((node) => {
            const tone = getNodeTone(node.type);
            return (
              <g key={node.id}>
                <circle cx={node.previewX} cy={node.previewY} r="11" fill={tone.fill} stroke={tone.stroke} strokeWidth="2" />
                <circle cx={node.previewX} cy={node.previewY} r="3.5" fill={tone.stroke} />
              </g>
            );
          })}
        </g>
      </svg>
      <div className="flex items-center justify-between border-t border-white/6 bg-black/25 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
        <span>{nodes.length} nodes</span>
        <span>{edges.length} edges</span>
      </div>
    </div>
  );
};

const TemplateLibraryModal = ({ isOpen, onClose, onSelectTemplate, customTemplates = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const allTemplates = useMemo(() => [...customTemplates, ...staticTemplates], [customTemplates]);
  const categories = useMemo(() => {
    const baseCategories = ['All', ...staticCategories.filter((category) => category !== 'All')];
    return customTemplates.length > 0 ? [...baseCategories, 'My Templates'] : baseCategories;
  }, [customTemplates]);

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((template) => {
      const haystack = `${template.name || ''} ${template.description || ''}`.toLowerCase();
      const matchesSearch = !searchQuery || haystack.includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All'
        || template.category === selectedCategory
        || (selectedCategory === 'My Templates' && String(template.id || '').startsWith('custom-'));
      return matchesSearch && matchesCategory;
    });
  }, [allTemplates, searchQuery, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/85 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10">
              <Layers className="h-4 w-4 text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-text-primary)]">Template Library</h2>
              <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">{allTemplates.length} templates available</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/55 px-5 py-3">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search templates"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-2 pl-9 pr-3 text-xs text-[var(--color-text-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)]/65 focus:border-[var(--color-primary)]/40"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest transition-all ${
                  selectedCategory === category
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-sm'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] hover:border-[var(--color-text-tertiary)]/30 hover:text-[var(--color-text-primary)]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {filteredTemplates.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className={`cursor-pointer overflow-hidden rounded-xl border transition-all ${
                    selectedTemplate?.id === template.id
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/6 shadow-lg'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary)]/30 hover:shadow-md'
                  }`}
                  onClick={() => setSelectedTemplate(template)}
                  onDoubleClick={() => onSelectTemplate?.(template)}
                >
                  <FlowPreview template={template} />
                  <div className="p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="truncate text-xs font-bold text-[var(--color-text-primary)]">{template.name}</h3>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest ${
                          template.complexity === 'Advanced'
                            ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300'
                            : template.complexity === 'Intermediate'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        }`}
                      >
                        {template.complexity || 'Basic'}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
                      {template.description || 'No description available.'}
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-[8px] uppercase tracking-widest text-[var(--color-text-tertiary)]">
                      <Zap className="h-2.5 w-2.5" />
                      <span>{template.nodes?.length || 0} nodes</span>
                      <span className="opacity-50">/</span>
                      <span>{template.edges?.length || 0} edges</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                <Search className="h-5 w-5 text-[var(--color-text-tertiary)]" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-primary)]">No templates found</p>
              <p className="mt-1 text-[9px] uppercase tracking-tight text-[var(--color-text-tertiary)]">Adjust the search or category filter.</p>
            </div>
          )}
        </div>

        {selectedTemplate && (
          <div className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/85 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[var(--color-text-primary)]">{selectedTemplate.name}</p>
              <p className="truncate text-[9px] text-[var(--color-text-tertiary)]">{selectedTemplate.description || 'No description available.'}</p>
            </div>
            <button
              type="button"
              onClick={() => onSelectTemplate?.(selectedTemplate)}
              className="btn-primary-skeuo !px-4 !py-2 !text-xs flex items-center gap-2"
            >
              Use Template
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateLibraryModal;

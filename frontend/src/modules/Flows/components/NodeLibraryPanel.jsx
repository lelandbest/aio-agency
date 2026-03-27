/**
 * Add Node Panel
 * Left sidebar with categorized, draggable nodes
 * All categories open by default
 * Drag nodes to canvas to create instances
 */

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { nodeLibrary, getIconComponent, triggerNodes } from '../data/nodeLibrary';

const NodeLibraryPanel = ({ embedded = false, openOnlyCategory = null, onAddNode = null, onAddNodeAtViewport = null }) => {
  const [expandedCategories, setExpandedCategories] = useState(
    Object.keys(nodeLibrary).reduce((acc, category) => {
      acc[category] = category === 'Webhook/API' || category === 'AI Agents';
      return acc;
    }, {})
  );

  const sortedCategories = Object.entries(nodeLibrary)
    .filter(([category]) => category !== 'Triggers')
    .map(([category, nodes]) => [category, [...nodes].sort((a, b) => (a.label || '').localeCompare(b.label || ''))])
    .sort((a, b) => a[0].localeCompare(b[0]));

  const aiIndex = sortedCategories.findIndex(([category]) => category === 'AI Agents');
  if (aiIndex > 0) {
    const [aiEntry] = sortedCategories.splice(aiIndex, 1);
    sortedCategories.unshift(aiEntry);
  }

  const triggers = triggerNodes ? [...triggerNodes].sort((a, b) => (a.label || '').localeCompare(b.label || '')) : [];

  useEffect(() => {
    if (!openOnlyCategory) return;
    setExpandedCategories((prev) =>
      Object.keys(nodeLibrary).reduce((acc, category) => {
        acc[category] = category === openOnlyCategory;
        return acc;
      }, {})
    );
  }, [openOnlyCategory]);

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const onDragStart = (event, node) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/reactflow', node.type);
    event.dataTransfer.setData('nodeData', JSON.stringify(node));
  };

  const getCardClasses = (nodeColor) => `flex items-center gap-2.5 p-2 rounded-lg cursor-move transition-all border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:shadow-md hover:border-[var(--node-${nodeColor})] group`;

  const iconContainerStyle = (nodeColor) => ({
    borderColor: `var(--node-${nodeColor})`,
    color: `var(--node-${nodeColor})`,
    backgroundColor: 'var(--color-bg-secondary)',
    boxShadow: `0 0 6px var(--node-${nodeColor})40`,
    borderWidth: '1.5px',
  });

  const renderNodeCard = (node) => {
    const IconComponent = getIconComponent(node.iconName);
    return (
      <div
        key={node.id}
        draggable
        onDragStart={(e) => onDragStart(e, node)}
        onDoubleClick={() => onAddNodeAtViewport?.(node)}
        className={getCardClasses(node.nodeColor)}
      >
        <div
          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={iconContainerStyle(node.nodeColor)}
        >
          {IconComponent ? (
            <IconComponent className="w-4 h-4" />
          ) : (
            <span className="w-4 h-4 flex items-center justify-center text-xs">o</span>
          )}
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-[11px] font-semibold text-[var(--color-text-primary)] leading-tight">
            {node.label}
          </p>
          <p className="text-[10px] text-[var(--color-text-tertiary)] opacity-80 line-clamp-1 mt-0.5">
            {node.description}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className={`${embedded ? 'w-full border-none' : 'w-64 border-r'} bg-[var(--color-bg-primary)] border-[var(--color-border)] overflow-y-auto flex-shrink-0 flex flex-col`}>
      {!embedded && (
        <div className="px-3 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <h2 className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
            Node Library
          </h2>
          <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
            Drag to canvas
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {!openOnlyCategory && triggers.length > 0 && (
            <div className="mb-2">
              <div className="px-2 py-1.5 text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Triggers
              </div>
              <div className="space-y-1 mt-1">
                {triggers.map(renderNodeCard)}
              </div>
            </div>
          )}

          {sortedCategories.map(([category, nodes]) => (
            <div key={category}>
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[var(--color-hover)] transition-colors"
              >
                <span className="text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                  {category}
                </span>
                {expandedCategories[category] ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                )}
              </button>

              {expandedCategories[category] && (
                <div className="space-y-1 mt-1 ml-1">
                  {nodes.map(renderNodeCard)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NodeLibraryPanel;

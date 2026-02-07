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
      acc[category] = category === 'Webhook/API';
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

  return (
    <div className={`${embedded ? 'w-full border-none' : 'w-64 border-r'} bg-[var(--color-bg-primary)] border-[var(--color-border)] overflow-y-auto flex-shrink-0 flex flex-col`}>
      {/* Header */}
      {!embedded && (
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Add Node
          </h2>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            Drag nodes to canvas
          </p>
        </div>
      )}

      {/* Categories */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-2">
        {!openOnlyCategory && triggers.length > 0 && (
          <div className="mb-3">
            <div className="px-2 py-1 text-xs font-semibold text-[var(--color-text-primary)]">
              Triggers
            </div>
            <div className="pl-2 space-y-1 mt-2">
              {triggers.map((node) => {
                const IconComponent = getIconComponent(node.iconName);
                return (
                  <div
                    key={node.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, node)}
                        onDoubleClick={() => onAddNodeAtViewport?.(node)}
                    className={
                      `p-2.5 rounded-lg cursor-move transition-all
` +
                      ` border border-[var(--color-border)]
` +
                      ` bg-[var(--color-bg-primary)]
` +
                      ` hover:shadow-md hover:border-[var(--node-${node.nodeColor})]
` +
                      ` group`
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border"
                        style={{
                          borderColor: `var(--node-${node.nodeColor})`,
                          color: `var(--node-${node.nodeColor})`,
                          backgroundColor: 'var(--color-bg-secondary)',
                          boxShadow: `0 0 8px var(--node-${node.nodeColor})`,
                        }}
                      >
                        {IconComponent ? (
                          <IconComponent className="w-4 h-4" />
                        ) : (
                          <span className="w-4 h-4 flex items-center justify-center text-xs">o</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)] leading-tight">
                          {node.label}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)] line-clamp-1">
                          {node.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

          {sortedCategories.map(([category, nodes]) => (
            <div key={category}>
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-2 rounded-md hover:bg-[var(--color-hover)] transition-colors"
              >
                <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                  {category}
                </span>
                {expandedCategories[category] ? (
                  <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                )}
              </button>

              {/* Nodes */}
              {expandedCategories[category] && (
                <div className="pl-2 space-y-1 mt-1">
                  {nodes.map((node) => {
                    const IconComponent = getIconComponent(node.iconName);
                    return (
                      <div
                        key={node.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, node)}
                        onDoubleClick={() => onAddNodeAtViewport?.(node)}
                        className={`
                          p-2.5 rounded-lg cursor-move transition-all
                          border border-[var(--color-border)]
                          bg-[var(--color-bg-primary)]
                          hover:shadow-md hover:border-[var(--node-${node.nodeColor})]
                          group
                        `}
                        style={{
                          borderColor: expandedCategories[category]
                            ? 'var(--color-border)'
                            : undefined,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {/* Node Icon */}
                          <div
                            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border"
                            style={{
                              borderColor: `var(--node-${node.nodeColor})`,
                              color: `var(--node-${node.nodeColor})`,
                              backgroundColor: 'var(--color-bg-secondary)',
                              boxShadow: `0 0 8px var(--node-${node.nodeColor})`,
                            }}
                          >
                            {IconComponent ? (
                              <IconComponent className="w-4 h-4" />
                            ) : (
                              <span className="w-4 h-4 flex items-center justify-center text-xs">o</span>
                            )}
                          </div>

                          {/* Node Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[var(--color-text-primary)] leading-tight">
                              {node.label}
                            </p>
                            <p className="text-xs text-[var(--color-text-tertiary)] line-clamp-1">
                              {node.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

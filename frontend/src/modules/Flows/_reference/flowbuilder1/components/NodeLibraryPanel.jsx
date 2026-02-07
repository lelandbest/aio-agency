import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { nodeLibrary } from '../data/nodeLibrary';

const NodeLibraryPanel = () => {
  const [expandedCategories, setExpandedCategories] = useState(
    Object.keys(nodeLibrary).reduce((acc, category) => {
      acc[category] = true;
      return acc;
    }, {})
  );

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const onDragStart = (event, nodeType, label, category) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('label', label);
    event.dataTransfer.setData('category', category);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-y-auto flex-shrink-0">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Node Library
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Drag nodes to the canvas
        </p>
      </div>

      <div className="p-4 space-y-3">
        {Object.entries(nodeLibrary).map(([category, nodes]) => (
          <div key={category} className="space-y-2">
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {category}
              </span>
              {expandedCategories[category] ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {expandedCategories[category] && (
              <div className="space-y-1 pl-2">
                {nodes.map((node) => (
                  <div
                    key={node.id}
                    draggable
                    onDragStart={(e) =>
                      onDragStart(e, node.type, node.label, category)
                    }
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing transition-all hover:shadow-md"
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg ${node.iconBg}`}
                    >
                      {node.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {node.label}
                      </p>
                      {node.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {node.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NodeLibraryPanel;

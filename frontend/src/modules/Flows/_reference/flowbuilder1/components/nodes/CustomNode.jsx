import React from 'react';
import { Handle, Position } from '@xyflow/react';

const CustomNode = ({ data, selected }) => {
  const getNodeStyles = () => {
    const baseStyles = 'px-4 py-3 rounded-xl shadow-lg border-2 transition-all min-w-[200px]';
    
    if (selected) {
      return `${baseStyles} ring-4 ring-blue-500/30 border-blue-500 bg-white dark:bg-gray-800`;
    }
    
    return `${baseStyles} border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:shadow-xl`;
  };

  const getCategoryColor = (category) => {
    const colors = {
      Messaging: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      Logic: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
      CRM: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
      'Data Services': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      'AI Employee': 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
    };
    return colors[category] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
  };

  return (
    <div className={getNodeStyles()}>
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-blue-500 !border-2 !border-white dark:!border-gray-800"
      />
      
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoryColor(data.category)}`}>
              {data.category}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {data.label}
          </h3>
          {data.config?.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
              {data.config.description}
            </p>
          )}
          {data.config?.event && (
            <div className="mt-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">Event: </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {data.config.event}
              </span>
            </div>
          )}
          {data.config?.actionType && (
            <div className="mt-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">Action: </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {data.config.actionType}
              </span>
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-blue-500 !border-2 !border-white dark:!border-gray-800"
      />
    </div>
  );
};

export default CustomNode;

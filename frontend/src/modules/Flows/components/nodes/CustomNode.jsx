/**
 * CustomNode Component
 * Token-driven styling for all node types
 * Colors from CSS variables: --node-trigger, --node-action, --node-logic, --node-webhook, --node-socket
 */

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { getIconComponent } from '../../data/nodeLibrary';

const nodeColorTokens = {
  trigger: 'var(--node-trigger)',
  action: 'var(--node-action)',
  logic: 'var(--node-logic)',
  webhook: 'var(--node-webhook)',
  socket: 'var(--node-socket)',
  input: 'var(--node-input)',
};

const CustomNode = ({ data, selected, isConnectable }) => {
  const colorToken = nodeColorTokens[data.nodeColor] || nodeColorTokens.action;
  const IconComponent = getIconComponent(data.iconName);
  const isGhost = Boolean(data.isGhost);
  const borderColor = isGhost ? 'var(--color-border)' : colorToken;
  const iconColor = isGhost ? 'var(--color-text-tertiary)' : colorToken;

  return (
    <div className="relative flex flex-col items-center">
      <div
        className={`
          relative w-20 h-20 shadow-md border-2 transition-all
          bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-secondary)]
          rounded-full
          flex items-center justify-center text-center
          ${selected ? 'ring-2 ring-offset-0' : 'hover:shadow-lg'}
          ${isGhost ? 'border-dashed opacity-70' : ''}
        `}
        style={{
          borderColor,
          ringColor: borderColor,
        }}
      >
        {/* Left Handle (incoming connection) */}
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className="w-[54px] h-[54px] !border-2 -left-7"
          style={{
            backgroundColor: isGhost ? 'var(--color-border)' : colorToken,
            borderColor: 'var(--color-border)',
            boxShadow: isGhost ? 'none' : `0 0 10px ${colorToken}`,
          }}
        />

        {/* Icon */}
        <div
          className="flex-shrink-0 p-2 rounded-full"
          style={{
            backgroundColor: isGhost ? 'transparent' : `${colorToken}15`,
            color: iconColor,
          }}
        >
          {IconComponent ? (
            <IconComponent className="w-10 h-10" />
          ) : (
            <span className="w-10 h-10 flex items-center justify-center text-xs">o</span>
          )}
        </div>

        {/* Right Handle (outgoing connection) */}
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className="w-[54px] h-[54px] !border-2 -right-7"
          style={{
            backgroundColor: isGhost ? 'var(--color-border)' : colorToken,
            borderColor: 'var(--color-border)',
            boxShadow: isGhost ? 'none' : `0 0 10px ${colorToken}`,
          }}
        />
      </div>

      {/* Labels below node */}
      <div className="mt-2 min-w-0 text-center">
        <h3 className="text-[11px] font-semibold text-[var(--color-text-primary)] leading-tight max-w-[90px]">
          {data.label}
        </h3>

        <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-wide">
          {data.typeLabel || data.type}
        </p>
      </div>
    </div>
  );
};

export default CustomNode;

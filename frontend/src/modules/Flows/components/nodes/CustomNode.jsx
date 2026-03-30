/**
 * CustomNode Component
 * Token-driven styling for all node types
 * Colors from CSS variables: --node-trigger, --node-action, --node-logic, --node-webhook, --node-socket
 * Glow effects by category
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

const nodeGlowTokens = {
  trigger: { primary: '#22d3ee', secondary: '#06b6d4' }, // cyan
  action: { primary: '#a855f7', secondary: '#9333ea' }, // purple
  logic: { primary: '#facc15', secondary: '#eab308' }, // yellow
  webhook: { primary: '#f97316', secondary: '#ea580c' }, // orange
  socket: { primary: '#22c55e', secondary: '#16a34a' }, // green
  input: { primary: '#ef4444', secondary: '#dc2626' }, // red
  agent: { primary: '#06b6d4', secondary: '#0891b2' }, // blue aqua - agents only
};

const getGlowColor = (nodeColor, nodeType) => {
  if (nodeType === 'agent' || nodeColor === 'agent') {
    return nodeGlowTokens.agent;
  }
  return nodeGlowTokens[nodeColor] || nodeGlowTokens.action;
};

const CustomNode = ({ data, selected, isConnectable }) => {
  const colorToken = nodeColorTokens[data.nodeColor] || nodeColorTokens.action;
  const IconComponent = getIconComponent(data.iconName);
  const isGhost = Boolean(data.isGhost);
  const borderColor = isGhost ? 'var(--color-border)' : colorToken;
  const iconColor = isGhost ? 'var(--color-text-tertiary)' : colorToken;
  
  const glowColor = getGlowColor(data.nodeColor, data.type);

  return (
    <div 
      className="relative flex flex-col items-center transition-all"
      style={{
        transform: isGhost ? 'scale(1.2)' : 'none',
        transformOrigin: 'center center'
      }}
    >
      <div
        className={`
          relative w-[72px] h-[72px] border-2 transition-all
          bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-secondary)]
          rounded-full flex items-center justify-center text-center
          ${selected ? 'ring-2 ring-offset-2' : 'hover:ring-1 hover:ring-offset-1'}
          ${isGhost ? 'border-dashed opacity-60' : ''}
        `}
        style={{
          borderColor: selected ? glowColor.primary : borderColor,
          ringColor: glowColor.primary,
          boxShadow: isGhost ? 'none' : selected 
            ? `0 0 12px ${glowColor.primary}50, 0 0 24px ${glowColor.secondary}25`
            : `0 0 8px ${glowColor.primary}25, 0 0 16px ${glowColor.secondary}15`,
        }}
      >
        {/* Left Handle (incoming connection) */}
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className="!w-3 !h-3 !border-2 !rounded-full !-left-0"
          style={{
            borderColor: isGhost ? 'var(--color-border)' : colorToken,
            backgroundColor: 'var(--color-bg-primary)',
            zIndex: 10,
          }}
        />

        {/* Icon */}
        <div
          className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full"
          style={{
            backgroundColor: isGhost ? 'transparent' : `${colorToken}20`,
            color: iconColor,
          }}
        >
          {IconComponent ? (
            <IconComponent 
              className="w-8 h-8" 
              style={{
                filter: isGhost ? 'none' : `drop-shadow(0 0 4px ${glowColor.primary}60)`,
              }}
            />
          ) : (
            <span className="w-8 h-8 flex items-center justify-center text-xs">o</span>
          )}
        </div>

        {/* Right Handle (outgoing connection) */}
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className="!w-3 !h-3 !border-2 !rounded-full !-right-0"
          style={{
            borderColor: isGhost ? 'var(--color-border)' : colorToken,
            backgroundColor: 'var(--color-bg-primary)',
            zIndex: 10,
          }}
        />
      </div>

      {/* Labels below node */}
      <div className="mt-2 min-w-0 text-center">
        <h3 className="text-[11px] font-semibold text-[var(--color-text-primary)] leading-tight max-w-[85px] truncate">
          {data.label}
        </h3>
        <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-wide mt-0.5">
          {data.typeLabel || data.type}
        </p>
      </div>
    </div>
  );
};

export default CustomNode;

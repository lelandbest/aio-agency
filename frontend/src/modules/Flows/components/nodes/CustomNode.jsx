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
  const isAgent = data.nodeColor === 'agent' || data.type === 'agent';

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
          boxShadow: isGhost ? 'none' : `0 0 20px ${glowColor.primary}40, 0 0 40px ${glowColor.secondary}20`,
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

        {/* Icon with glow */}
        <div
          className="flex-shrink-0 p-2 rounded-full relative"
          style={{
            backgroundColor: isGhost ? 'transparent' : `${colorToken}25`,
            color: iconColor,
          }}
        >
          {/* Glow effect behind icon */}
          {!isGhost && (
            <div 
              className="absolute inset-0 rounded-full blur-md"
              style={{
                backgroundColor: `${glowColor.primary}30`,
                boxShadow: `0 0 15px ${glowColor.primary}60`,
              }}
            />
          )}
          <div className="relative z-10">
            {IconComponent ? (
              <IconComponent 
                className="w-10 h-10" 
                style={{
                  filter: isGhost ? 'none' : `drop-shadow(0 0 8px ${glowColor.primary})`,
                }}
              />
            ) : (
              <span className="w-10 h-10 flex items-center justify-center text-xs">o</span>
            )}
          </div>
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

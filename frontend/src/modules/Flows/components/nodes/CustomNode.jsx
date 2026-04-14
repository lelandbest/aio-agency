/**
 * CustomNode Component
 * Token-driven styling for all node types
 * Colors from CSS variables: --node-trigger, --node-action, --node-logic, --node-webhook, --node-socket
 * Glow effects by category
 */

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { getIconComponent } from '../../data/nodeLibrary';
import { Settings, AlertTriangle } from 'lucide-react';

const nodeColorTokens = {
  trigger: 'var(--node-trigger)',
  action: 'var(--node-action)',
  logic: 'var(--node-logic)',
  webhook: 'var(--node-webhook)',
  socket: 'var(--node-socket)',
  input: 'var(--node-input)',
  agent: 'var(--node-agent)',
  media: 'var(--node-media)',
};

const nodeGlowTokens = {
  trigger: { primary: 'var(--node-trigger)', secondary: 'var(--node-trigger)' },
  action: { primary: 'var(--node-action)', secondary: 'var(--node-action)' },
  logic: { primary: 'var(--node-logic)', secondary: 'var(--node-logic)' },
  webhook: { primary: 'var(--node-webhook)', secondary: 'var(--node-webhook)' },
  socket: { primary: 'var(--node-socket)', secondary: 'var(--node-socket)' },
  input: { primary: 'var(--node-input)', secondary: 'var(--node-input)' },
  agent: { primary: 'var(--node-agent)', secondary: 'var(--node-agent)' },
  media: { primary: 'var(--node-media)', secondary: 'var(--node-media)' },
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

  const isEmailOrSms = data.iconName === 'Mail' || data.iconName === 'MessageSquare';

  const iconColor = isGhost
    ? 'var(--color-text-tertiary)'
    : isEmailOrSms
      ? 'var(--color-text-primary)'
      : ['action', 'logic', 'input'].includes(data.nodeColor)
        ? 'var(--color-text-secondary)'
        : colorToken;
  
  const glowColor = getGlowColor(data.nodeColor, data.type);

  const isProcessing = Boolean(data.isProcessing);

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
          relative w-[50px] h-[50px] border-2 transition-all
          bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-secondary)]
          rounded-full flex items-center justify-center text-center
          ${selected ? 'ring-2 ring-offset-2' : 'hover:ring-1 hover:ring-offset-1'}
          ${isGhost ? 'border-dashed opacity-60' : ''}
        `}
        style={{
          borderColor: selected ? glowColor.primary : borderColor,
          ringColor: glowColor.primary,
          boxShadow: isGhost ? 'none' : selected 
            ? `0 0 0 3px var(--color-bg-primary), 0 0 0 5px ${glowColor.primary}, 0 0 15px ${glowColor.primary}60`
            : isProcessing
              ? `0 0 16px ${glowColor.primary}80, 0 0 32px ${glowColor.secondary}40`
              : `0 0 8px ${glowColor.primary}25, 0 0 16px ${glowColor.secondary}15`,
        }}
      >
        {isProcessing && (
          <>
            <div className="pointer-events-none absolute inset-[-6px] rounded-full border border-white/15" />
            <div className="pointer-events-none absolute inset-[-10px] animate-spin">
              <div
                className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-black/35 shadow-[0_0_10px_rgba(255,255,255,0.18)]"
                style={{ backgroundColor: glowColor.primary }}
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-[1.5px]">
              <Settings className="w-7 h-7 text-white/55 animate-spin" style={{ animationDuration: '2.4s' }} />
            </div>
          </>
        )}
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

        {/* Icon / Socket Badge */}
        <div
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full"
          style={{
            backgroundColor: isGhost ? 'transparent' : `${colorToken}20`,
            color: iconColor,
          }}
        >
          {data.isSocket && data.socketBadge ? (
            <span
              className="w-5 h-5 flex items-center justify-center text-[14px] font-bold leading-none"
              style={{
                color: 'var(--node-socket)',
                fontFamily: 'monospace',
                fontWeight: 800,
              }}
            >
              {data.socketBadge}
            </span>
          ) : IconComponent ? (
            <IconComponent
              className="w-5 h-5"
              style={{
                filter: isGhost ? 'none' : `drop-shadow(0 0 4px ${glowColor.primary}60)`,
              }}
            />
          ) : (
            <span className="w-5 h-5 flex items-center justify-center text-[10px]">o</span>
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
        {data.providerStatus && data.providerStatus !== 'connected' && (
          <div className="mt-0.5 flex items-center justify-center gap-0.5 aio-tooltip" data-tooltip={`${data.providerKey}: ${data.providerStatus.replace('_', ' ')}`}>
            <AlertTriangle size={9} className="text-amber-400" />
            <span className="text-[8px] text-amber-400 font-bold uppercase tracking-tight">{data.providerKey}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomNode;

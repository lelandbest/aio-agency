import React, { useState } from 'react';
import { getBrandIcon, getBrandColors } from '../utils/brandIcons.jsx';

/**
 * IntegrationCard Component
 * Displays a single integration as a card with logo, toggle, and settings
 */
export const IntegrationCard = ({
  integration,
  provider,
  isEnabled,
  onToggle,
  onSettings,
  onRemove,
  customLogo,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const colors = getBrandColors(provider.id);
  const logoUrl = customLogo || provider.logo;

  return (
    <div
      className="rounded-lg border-2 transition-all bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] relative overflow-hidden"
      style={{
        borderColor: isEnabled ? colors.primary : 'var(--color-border)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card Header */}
      <div className="p-4 rounded-t-md" style={{ backgroundColor: colors.secondary || 'var(--color-bg-tertiary)' }}>
        <div className="flex items-start gap-3">
          {/* Logo Section */}
          <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)]">
            {logoUrl ? (
              <img src={logoUrl} alt={provider.name} className="w-full h-full object-contain p-1" />
            ) : (
              <div>{getBrandIcon(provider.id, 40)}</div>
            )}
          </div>

          {/* Provider Info */}
          <div className="flex-1 min-w-0">
            <h3 className="m-0 text-base font-semibold text-[var(--color-text-primary)]">{provider.name}</h3>
            <p className="m-0 text-xs text-[var(--color-text-secondary)] truncate">{provider.description}</p>
          </div>

          {/* Controls - Toggle and Settings */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Enable/Disable Toggle */}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={() => onToggle(integration.id)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-300 peer-checked:bg-purple-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            </label>

            {/* Settings Gear Icon */}
            <button
              className="p-1.5 hover:bg-[var(--color-hover)] rounded transition-colors"
              onClick={() => onSettings(integration.id)}
              title="Configure settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: isEnabled ? colors.primary : 'var(--color-text-secondary)' }}>
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 0l4.24-4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08 0l4.24 4.24"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Card Body - Status and Connection Details */}
      <div className="p-4 border-t border-[var(--color-border)]">
        {/* Status */}
        <div className="mb-3">
          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
            isEnabled 
              ? 'bg-purple-100 dark:bg-purple-950 text-green-700 dark:text-green-300' 
              : 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300'
          }`}>
            <span className={`inline-block w-2 h-2 rounded-full ${
              isEnabled ? 'bg-purple-500' : 'bg-gray-400'
            }`}></span>
            {isEnabled ? 'Connected' : 'Inactive'}
          </span>
        </div>

        {/* Connection Details */}
        {integration.config && (
          <div className="mb-3 text-xs text-[var(--color-text-secondary)] space-y-1">
            <div className="flex justify-between">
              <span>Configured:</span>
              <span className="text-[var(--color-text-primary)]">
                {new Date(integration.configuredAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          <button
            className="flex-1 px-3 py-2 text-sm font-medium border border-[var(--color-border)] rounded hover:bg-[var(--color-hover)] transition-colors text-[var(--color-text-primary)]"
            onClick={() => onSettings(integration.id)}
          >
            Configure
          </button>
          <button
            className="flex-1 px-3 py-2 text-sm font-medium border border-red-500 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            onClick={() => onRemove(integration.id)}
          >
            Remove
          </button>
        </div>
      </div>

      {/* Hover Overlay */}
      {isHovered && isEnabled && (
        <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
          <div className="text-white text-sm font-medium">
            <p>Last active: Now</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegrationCard;


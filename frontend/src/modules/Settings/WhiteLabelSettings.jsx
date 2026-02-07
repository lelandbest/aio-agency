
import React, { useState } from 'react';

const WhiteLabelSettings = () => {
  const [settings, setSettings] = useState({ tenantId: '', brand: '', themePreset: '' });

  const updateSettings = (updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">White Label</h2>

      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Tenant / Brand</h3>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">Tenant ID</label>
          <input
            value={settings?.tenantId || ''}
            onChange={(e) => updateSettings?.({ tenantId: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">Brand</label>
          <input
            value={settings?.brand || ''}
            onChange={(e) => updateSettings?.({ brand: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">Theme Preset</label>
          <select
            value={settings?.themePreset || ''}
            onChange={(e) => updateSettings?.({ themePreset: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
          >
            <option value="">Default</option>
            <option value="AIO">AIO</option>
            <option value="BLTV">BLTV</option>
          </select>
        </div>
      </div>

    </div>
  );
};

export default WhiteLabelSettings;

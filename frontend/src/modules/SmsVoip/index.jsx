import React from 'react';
import { Phone } from 'lucide-react';

const SmsVoipModule = () => {
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
      <div className="rounded-full bg-[var(--color-primary)]/10 p-6 text-[var(--color-primary)]">
        <Phone size={48} />
      </div>
      <h2 className="text-2xl font-semibold text-[var(--color-text-primary)]">SMS & VoIP</h2>
      <p className="max-w-md text-[var(--color-text-secondary)]">
        The integrated communications engine is currently being migrated to the high-density appliance architecture. 
        Please interface with the legacy Dispatch module for active operations.
      </p>
      <div className="flex gap-4">
        <button className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]">
          View Documentation
        </button>
        <button className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">
          Open Dispatch
        </button>
      </div>
    </div>
  );
};

export default SmsVoipModule;

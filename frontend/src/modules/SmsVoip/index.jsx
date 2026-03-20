import React from 'react';
import { Phone, RadioTower, Clock3 } from 'lucide-react';

const panelClass = 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]';

const SmsVoipModule = () => {
  return (
    <div className="h-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Placeholder</div>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">SMS/VoIP</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">
              This module is reserved for future telephony operations. It stays visible in navigation, but it is not mounting
              the Comms runtime anymore.
            </p>
          </div>
          <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-[var(--color-primary)]">
            <Phone size={20} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-6 md:grid-cols-3">
        <div className={panelClass + ' p-5'}>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[var(--color-bg-secondary)] p-2 text-[var(--color-primary)]">
              <RadioTower size={18} />
            </div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">Provider Layer Pending</div>
          </div>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            Phone numbers, call routing, voicemail ingestion, and provider setup will live here once telephony is active.
          </p>
        </div>

        <div className={panelClass + ' p-5'}>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[var(--color-bg-secondary)] p-2 text-amber-300">
              <Clock3 size={18} />
            </div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">No Background Traffic</div>
          </div>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
            This page is intentionally static right now. It does not fetch Comms snapshots, threads, or mailbox data.
          </p>
        </div>

        <div className={panelClass + ' p-5'}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Planned Scope</div>
          <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]">
            <li>Numbers and line assignment</li>
            <li>Call logs and voicemail</li>
            <li>SMS queues and automations</li>
            <li>Telephony provider configuration</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SmsVoipModule;

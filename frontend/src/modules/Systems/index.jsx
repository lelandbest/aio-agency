import React from 'react';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import { normalizeDisplayText } from '../../utils/text';

const DESCRIPTIONS = {
  'aio-agents': 'Command center for your named AI operators, chain of command, and tactical coordination.',
  'aio-bots': 'Deploy and manage customer-facing AI bots for websites, intake, and conversational automation.',
  'aio-flows': 'Design operational automations, workflow logic, and event-driven execution paths.',
  'aio-hide': 'Secure visibility controls, protected data operations, and sensitive intelligence handling.',
  'aio-livebots': 'Operate live automation experiences, real-time messaging, and engagement-first bot sessions.',
  'aio-sniper': 'Pinpoint lead targeting, precision outreach, and high-intent opportunity intelligence.',
  'postly-ai': 'Create and coordinate social publishing flows, scheduled campaigns, and content distribution.',
  'aio-market': 'Browse the AIO marketplace catalog and launch supporting products without leaving the workspace.'
};

const gradients = [
  'from-sky-500/20 via-cyan-500/10 to-transparent',
  'from-violet-500/20 via-fuchsia-500/10 to-transparent',
  'from-emerald-500/20 via-teal-500/10 to-transparent',
  'from-amber-500/20 via-orange-500/10 to-transparent',
  'from-rose-500/20 via-pink-500/10 to-transparent',
  'from-blue-500/20 via-indigo-500/10 to-transparent',
];

const Systems = ({ systems = [], iconMap = {}, onOpenSystem }) => {
  const launcherSystems = systems.filter(system => system.id !== 'aio-systems');

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="max-w-4xl">
        <p className="text-sm uppercase tracking-[0.26em] text-[var(--color-text-tertiary)] mb-2">
          AIO Systems Network
        </p>
        <p className="text-base text-[var(--color-text-secondary)] leading-7 m-0">
          Launch each specialized AIO system from a single clean surface, keep the main menu focused on daily operations,
          and choose the tools that actually belong in the workflow at hand.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2">
        {launcherSystems.map((system, index) => {
          const SystemIcon = iconMap[system.icon];
          const tone = gradients[index % gradients.length];
          const domainLabel = system.url ? new URL(system.url).hostname.replace('www.', '') : 'Built into AIO CRM';

          return (
            <button
              key={system.id}
              onClick={() => onOpenSystem(system.id)}
              className="text-left rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden transition-all hover:border-[var(--color-primary)]/50 hover:-translate-y-0.5"
            >
              <div className={`h-32 px-5 py-4 bg-gradient-to-br ${tone} border-b border-[var(--color-border)] flex flex-col justify-between`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-primary)]/80 border border-white/10 flex items-center justify-center">
                    {SystemIcon && <SystemIcon size={22} className="text-[var(--color-primary)]" />}
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] bg-[var(--color-bg-primary)]/70 text-[var(--color-text-secondary)]">
                    {system.type === 'iframe' ? 'Live system' : 'Internal'}
                  </span>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
                    {domainLabel}
                  </div>
                  <div className="text-lg font-semibold text-[var(--color-text-primary)] mt-1">
                    {normalizeDisplayText(system.label)}
                  </div>
                </div>
              </div>

              <div className="p-5 flex flex-col gap-4">
                <p className="text-sm leading-6 text-[var(--color-text-secondary)] min-h-[72px] m-0">
                  {DESCRIPTIONS[system.id] || system.description || 'Open this system inside the embedded workspace and keep the rest of AIO CRM in reach.'}
                </p>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--color-text-tertiary)]">
                    {system.type === 'iframe' ? 'Launch in workspace iframe' : 'Open internal workspace'}
                  </span>
                  <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-primary)]">
                    Open
                    {system.type === 'iframe' ? <ExternalLink size={16} /> : <ArrowUpRight size={16} />}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Systems;

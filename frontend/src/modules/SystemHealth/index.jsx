import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { getSystemHealthApi } from '../../services/backendApi';

const STATUS_STYLES = {
  healthy: {
    icon: CheckCircle2,
    badge: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25',
    iconClass: 'text-emerald-400',
  },
  warning: {
    icon: AlertTriangle,
    badge: 'bg-amber-500/12 text-amber-300 border-amber-500/25',
    iconClass: 'text-amber-400',
  },
  critical: {
    icon: AlertOctagon,
    badge: 'bg-rose-500/12 text-rose-300 border-rose-500/25',
    iconClass: 'text-rose-400',
  },
};

const SEVERITY_STYLES = {
  critical: 'border-rose-500/30 bg-rose-500/8 text-rose-200',
  warning: 'border-amber-500/30 bg-amber-500/8 text-amber-200',
  info: 'border-sky-500/30 bg-sky-500/8 text-sky-200',
};

const SUMMARY_CARD_META = [
  { key: 'failedRuns24h', label: 'Failed Runs / 24h' },
  { key: 'degradedFlows', label: 'Degraded Flows' },
  { key: 'inactiveExpectedFlows', label: 'Inactive Expected Flows' },
  { key: 'deploymentFailures7d', label: 'Deployment Failures / 7d' },
];

const formatTimestamp = (value) => {
  if (!value) {
    return 'Unknown time';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

const dispatchNavigation = (target = {}) => {
  if (!target?.module) {
    return;
  }
  window.dispatchEvent(new CustomEvent('aio:navigate', { detail: target }));
};

const SystemHealthModule = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHealth = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const next = await getSystemHealthApi();
      setHealth(next || null);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load system health.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const intervalId = window.setInterval(() => loadHealth({ silent: true }), 60000);
    return () => window.clearInterval(intervalId);
  }, [loadHealth]);

  const status = String(health?.status || 'healthy').toLowerCase();
  const statusMeta = STATUS_STYLES[status] || STATUS_STYLES.healthy;
  const StatusIcon = statusMeta.icon;
  const summary = health?.summary || {};
  const alerts = Array.isArray(health?.alerts) ? health.alerts : [];

  return (
    <div className="module-root-standard">
      <ModuleHeader
        showTitle={false}
        leftActions={[
          { label: 'Refresh', icon: RefreshCw, onClick: () => loadHealth(), variant: 'secondary' }
        ]}
        actions={[]}
      />
      <div className="module-content-stage overflow-y-auto px-1.5 pb-1.5">
      {loading ? (
        <div className="module-surface-shell p-6">
          <div className="flex items-center gap-3 text-[var(--color-text-primary)]">
            <RefreshCw size={18} className="animate-spin" />
            <span>Loading system health...</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-6 text-rose-200">
          <div className="font-semibold">System Health unavailable</div>
          <div className="mt-2 text-sm">{error}</div>
          <button
            type="button"
            onClick={() => loadHealth()}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-400/30 px-4 py-2 text-sm hover:bg-rose-500/10"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-6">
      <section className="surface-elevated rounded-[var(--radius-modal)] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Operator Visibility</div>
            <div className="mt-2 flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] border ${statusMeta.badge}`}>
                <StatusIcon size={22} className={statusMeta.iconClass} />
              </div>
              <div>
                <div className="text-2xl font-black text-[var(--color-text-primary)] capitalize">{status}</div>
                <div className="text-sm text-[var(--color-text-secondary)]">
                  Derived from current runs, flows, deployments, and canonical settings.
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="surface-base inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm text-[var(--color-text-secondary)]">
              <Clock3 size={14} />
              Updated {formatTimestamp(health?.generatedAt)}
            </div>
            <button
              type="button"
              onClick={() => loadHealth()}
              className="surface-base inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SUMMARY_CARD_META.map((item) => (
          <div key={item.key} className="surface-elevated rounded-[var(--radius-panel)] p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">{item.label}</div>
            <div className="mt-3 text-3xl font-black text-[var(--color-text-primary)]">{summary[item.key] ?? 0}</div>
          </div>
        ))}
      </section>

      <section className="surface-elevated rounded-[var(--radius-modal)] p-6">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-[var(--color-text-secondary)]" />
          <div>
            <div className="text-lg font-black text-[var(--color-text-primary)]">Active Alerts</div>
            <div className="text-sm text-[var(--color-text-secondary)]">
              Distilled operator-facing issues only. Routine successes and raw traces are intentionally omitted.
            </div>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="mt-6 rounded-[var(--radius-panel)] border border-emerald-500/20 bg-emerald-500/8 p-5 text-emerald-100">
            <div className="font-semibold">No active health alerts</div>
            <div className="mt-1 text-sm text-emerald-200/80">Current tenant state did not produce any warning or critical operator issues.</div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {alerts.map((alert) => (
              <article
                key={alert.id}
                className={`rounded-[var(--radius-panel)] border p-5 shadow-[var(--shadow-base)] ${SEVERITY_STYLES[String(alert.severity || 'info').toLowerCase()] || SEVERITY_STYLES.info}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]">
                        {alert.severity}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">{alert.type}</span>
                    </div>
                    <div className="mt-3 text-lg font-black text-[var(--color-text-primary)]">{alert.title}</div>
                    <div className="mt-2 text-sm text-[var(--color-text-secondary)]">{alert.message}</div>
                    <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--color-text-secondary)]">
                      <span>Entity: {alert.entityType}{alert.entityId ? ` / ${alert.entityId}` : ''}</span>
                      <span>Time: {formatTimestamp(alert.timestamp)}</span>
                    </div>
                    <div className="mt-3 text-sm text-[var(--color-text-primary)]">
                      <span className="font-semibold">Suggested action:</span> {alert.suggestedAction}
                    </div>
                  </div>
                  {alert.navigationTarget?.module ? (
                    <button
                      type="button"
                      onClick={() => dispatchNavigation(alert.navigationTarget)}
                      className="surface-base inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
                    >
                      <ExternalLink size={14} />
                      Open Related Surface
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
        </div>
      )}
      </div>
    </div>
  );
};

export default SystemHealthModule;

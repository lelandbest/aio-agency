import React, { useEffect, useMemo, useState } from 'react';
import { getCMSTableData } from '../../services/formProcessor';
export default function CMSDataViewer({ tableSlug, title, className }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!tableSlug) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCMSTableData(tableSlug);
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load CMS data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tableSlug]);

  const columns = useMemo(() => {
    if (!rows.length) return [];
    const keys = new Set();
    rows.forEach(r => Object.keys(r || {}).forEach(k => keys.add(k)));
    return [...keys];
  }, [rows]);

  return (
    <div className={`${className} bg-[var(--color-bg-primary)] rounded-[var(--radius-card)] border border-[var(--color-border)] overflow-hidden shadow-island-sm`}>
      {loading && <div className="p-4 text-sm text-[var(--color-text-tertiary)] animate-pulse">Loading…</div>}
      {!loading && error && <div className="p-4 text-sm text-red-400 bg-red-400/10">{error}</div>}
      {!loading && !error && rows.length === 0 && <div className="p-4 text-sm text-[var(--color-text-tertiary)] italic">No records</div>}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg-tertiary)] border-b border-[var(--color-border)]">
              <tr>{columns.map(c => <th key={c} className="px-4 py-2 text-left text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((r,i) => (
                <tr key={i} className="hover:bg-[var(--color-hover)] transition-colors">
                  {columns.map(c => <td key={c} className="px-4 py-2 text-[var(--color-text-primary)]">{String(r[c] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

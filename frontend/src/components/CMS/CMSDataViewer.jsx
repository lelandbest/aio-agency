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
    <div className={className}>
      {loading && <div>Loading…</div>}
      {!loading && error && <div>{error}</div>}
      {!loading && !error && rows.length === 0 && <div>No records</div>}
      {!loading && !error && rows.length > 0 && (
        <table>
          <thead>
            <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={i}>{columns.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

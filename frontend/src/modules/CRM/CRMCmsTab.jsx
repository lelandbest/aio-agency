import React, { useEffect, useMemo, useState } from 'react';
import { getFormsApi, getCmsTableDataApi } from '../../services/backendApi';
import CMSDataViewer from '../../components/CMS/CMSDataViewer';

export default function CRMCmsTab() {
  const [loadingTables, setLoadingTables] = useState(false);
  const [tables, setTables] = useState([]);
  const [tableData, setTableData] = useState({});
  const [selectedSlug, setSelectedSlug] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingTables(true);
      setError(null);

      try {
        const forms = await getFormsApi();
        if (!cancelled) {
          const cmsTables = (forms || []).map(form => ({
            slug: form.slug || form.id,
            name: form.name || 'Untitled Form',
            id: form.id,
            description: form.description || ''
          })).filter(t => t.slug);
          setTables(cmsTables);
        }
      } catch (e) {
        console.error('Error loading CMS tables:', e);
        if (!cancelled) {
          setError(e?.message || 'Failed to load forms');
          setTables([]);
        }
      } finally {
        if (!cancelled) setLoadingTables(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    
    let cancelled = false;
    
    (async () => {
      setLoadingData(true);
      try {
        const data = await getCmsTableDataApi(selectedSlug);
        if (!cancelled) {
          setTableData({ [selectedSlug]: data || [] });
        }
      } catch (e) {
        console.error('Error loading form data:', e);
        if (!cancelled) {
          setTableData({ [selectedSlug]: [] });
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  const options = useMemo(
    () =>
      (tables || [])
        .map(t => ({
          slug: t?.slug || '',
          name: t?.name || t?.slug || '',
        }))
        .filter(o => o.slug),
    [tables]
  );

  const selectedName = useMemo(() => {
    const hit = tables.find(o => o.slug === selectedSlug);
    return hit?.name || selectedSlug;
  }, [tables, selectedSlug]);

  const currentData = tableData[selectedSlug] || [];

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">Form Data</div>
          <div className="text-xs opacity-70">View submissions from your forms</div>
        </div>

        {loadingTables && (
          <div className="rounded-xl border p-4 text-sm">Loading form tables...</div>
        )}

        {!loadingTables && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <div className="font-semibold mb-1 text-red-200">Failed to load forms</div>
            <div className="opacity-80 text-red-300">{error}</div>
          </div>
        )}

        {!loadingTables && !error && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
            <label className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Select Form</label>
            <div className="mt-2">
              <select
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                value={selectedSlug}
                onChange={e => setSelectedSlug(e.target.value)}
              >
                <option value="">-- Choose a form --</option>
                {options.map(o => (
                  <option key={o.slug} value={o.slug}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {selectedSlug && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedName} Submissions</div>
              <div className="text-xs text-[var(--color-text-tertiary)]">
                {loadingData ? 'Loading...' : `${currentData.length} records`}
              </div>
            </div>
            
            {loadingData ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--color-primary)]" />
              </div>
            ) : currentData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {Object.keys(currentData[0] || {}).map(key => (
                        <th key={key} className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                          {key.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-tertiary)]/30">
                        {Object.values(row).map((val, vidx) => (
                          <td key={vidx} className="px-3 py-2 text-[var(--color-text-secondary)]">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {currentData.length > 50 && (
                  <div className="mt-2 text-xs text-[var(--color-text-tertiary)] text-center">
                    Showing 50 of {currentData.length} records. Export for full data.
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-[var(--color-text-tertiary)] text-sm">
                No submissions yet for this form.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

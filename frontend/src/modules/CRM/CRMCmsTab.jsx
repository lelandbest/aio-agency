import React, { useEffect, useMemo, useState } from 'react';
import { mockSupabase } from '../../services/mockSupabase';
import CMSDataViewer from '../../components/CMS/CMSDataViewer';

export default function CRMCmsTab() {
  const [loadingTables, setLoadingTables] = useState(false);
  const [tables, setTables] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingTables(true);
      setError(null);

      try {
        const { data } = await mockSupabase.from('cms_tables').select();
        if (!cancelled) setTables(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Error loading CMS tables:', e);
        if (!cancelled) {
          setError(e?.message || 'Failed to load CMS tables');
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

  const options = useMemo(
    () =>
      (tables || [])
        .map(t => ({
          slug: t?.slug || t?.name || '',
          name: t?.name || t?.slug || '',
        }))
        .filter(o => o.slug),
    [tables]
  );

  const selectedName = useMemo(() => {
    const hit = options.find(o => o.slug === selectedSlug);
    return hit?.name || selectedSlug;
  }, [options, selectedSlug]);

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">CMS</div>
          <div className="text-xs opacity-70">Shared pipeline with Forms CMS Data</div>
        </div>

        {loadingTables && (
          <div className="rounded-xl border p-4 text-sm">Loading CMS tables…</div>
        )}

        {!loadingTables && error && (
          <div className="rounded-xl border p-4 text-sm">
            <div className="font-semibold mb-1">Couldn’t load CMS tables</div>
            <div className="opacity-80">{error}</div>
          </div>
        )}

        {!loadingTables && !error && (
          <div className="rounded-xl border p-3">
            <label className="text-xs font-semibold opacity-70">Select a CMS table</label>
            <div className="mt-2">
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={selectedSlug}
                onChange={e => setSelectedSlug(e.target.value)}
              >
                <option value="">-- Choose --</option>
                {options.map(o => (
                  <option key={o.slug} value={o.slug}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {selectedSlug && <CMSDataViewer tableSlug={selectedSlug} title={selectedName} />}
      </div>
    </div>
  );
}

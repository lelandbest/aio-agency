import React, { useEffect, useState } from 'react';
import { getFormsApi, getCmsTableDataApi } from '../../services/backendApi';
import { FileText, List, Grid3X3, Download, Loader2 } from 'lucide-react';

export default function CRMCmsTab() {
  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [selectedForm, setSelectedForm] = useState(null);
  const [formData, setFormData] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [viewMode, setViewMode] = useState('cards');
  const [rowHeight, setRowHeight] = useState('compact');
  const [error, setError] = useState(null);

  const rowHeightClasses = {
    compact: 'py-1.5 text-xs',
    normal: 'py-2 text-sm',
    expanded: 'py-3 text-sm'
  };

  useEffect(() => {
    const loadForms = async () => {
      setLoadingTables(true);
      try {
        const forms = await getFormsApi();
        setTables((forms || []).map(f => ({
          id: f.id,
          slug: f.slug || f.id,
          name: f.name || 'Untitled Form',
          description: f.description || '',
          fields: f.schema?.length || 0,
          submissions: f.responses_count || 0
        })));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingTables(false);
      }
    };
    loadForms();
  }, []);

  const loadFormData = async (form) => {
    setSelectedForm(form);
    setLoadingData(true);
    try {
      const data = await getCmsTableDataApi(form.slug);
      setFormData(Array.isArray(data) ? data : []);
    } catch (e) {
      setFormData([]);
    } finally {
      setLoadingData(false);
    }
  };

  const closeFormData = () => {
    setSelectedForm(null);
    setFormData([]);
  };

  const exportToCSV = () => {
    if (!formData.length) return;
    const headers = Object.keys(formData[0]);
    const csvRows = [
      headers.join(','),
      ...formData.map(row => 
        headers.map(h => {
          const val = row[h];
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
          return str.includes(',') ? `"${str}"` : str;
        }).join(',')
      )
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedForm.name.replace(/\s+/g, '_')}_submissions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    if (!formData.length) return;
    const blob = new Blob([JSON.stringify(formData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedForm.name.replace(/\s+/g, '_')}_submissions.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadingTables) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={24} className="animate-spin text-sky-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200">
        Error loading forms: {error}
      </div>
    );
  }

  if (selectedForm) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={closeFormData}
              className="text-xs text-sky-400 hover:text-sky-300 uppercase tracking-wider"
            >
              Back
            </button>
            <div className="text-lg font-bold text-white">{selectedForm.name}</div>
            <div className="text-xs text-slate-500">({formData.length} submissions)</div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>Height:</span>
              {['compact', 'normal', 'expanded'].map(h => (
                <button
                  key={h}
                  onClick={() => setRowHeight(h)}
                  className={`px-2 py-1 rounded capitalize ${rowHeight === h ? 'bg-sky-500/20 text-sky-400' : 'hover:bg-slate-700'}`}
                >
                  {h}
                </button>
              ))}
            </div>
            
            <div className="flex gap-1 ml-2">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 rounded ${viewMode === 'cards' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500 hover:bg-slate-700'}`}
              >
                <Grid3X3 size={14} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500 hover:bg-slate-700'}`}
              >
                <List size={14} />
              </button>
            </div>

            <div className="flex gap-1 ml-2">
              <button
                onClick={exportToCSV}
                disabled={!formData.length}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-40 text-xs font-medium"
              >
                <Download size={12} /> CSV
              </button>
              <button
                onClick={exportToJSON}
                disabled={!formData.length}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 disabled:opacity-40 text-xs font-medium"
              >
                <Download size={12} /> JSON
              </button>
            </div>
          </div>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-sky-400" />
          </div>
        ) : formData.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No submissions yet for this form.
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {formData.map((row, idx) => (
              <div 
                key={idx} 
                className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 hover:border-sky-500/40 transition-colors"
              >
                <div className="text-[10px] font-mono text-sky-400 mb-2">#{idx + 1}</div>
                {Object.entries(row).slice(0, 4).map(([key, val]) => (
                  <div key={key} className="mb-1.5">
                    <div className="text-[8px] uppercase tracking-wider text-slate-600">{key.replace(/_/g, ' ')}</div>
                    <div className="text-[11px] text-slate-300 line-clamp-2">
                      {typeof val === 'object' ? JSON.stringify(val).slice(0, 30) : String(val || '-').slice(0, 40)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-800/90 backdrop-blur-sm z-10">
                  <tr className="border-b border-slate-700/50">
                    <th className="px-3 py-2 text-left text-slate-400 uppercase tracking-wider font-semibold w-12">#</th>
                    {Object.keys(formData[0] || {}).map(key => (
                      <th key={key} className="px-3 py-2 text-left text-slate-400 uppercase tracking-wider font-semibold">
                        {key.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {formData.slice(0, 200).map((row, idx) => (
                    <tr key={idx} className={`border-b border-slate-700/30 hover:bg-slate-800/30 ${rowHeightClasses[rowHeight]}`}>
                      <td className="px-3 text-slate-600 font-mono">{idx + 1}</td>
                      {Object.values(row).map((val, vidx) => (
                        <td key={vidx} className="px-3 text-slate-300 max-w-xs truncate">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val || '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {formData.length > 200 && (
              <div className="p-2 text-center text-[10px] text-slate-500 bg-slate-800/30">
                Showing 200 of {formData.length} records. Export for full data.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-white">Form Data</div>
          <div className="text-xs text-slate-500">{tables.length} forms available</div>
        </div>
      </div>

      {tables.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          No forms created yet. Create forms in the Forms module.
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tables.map(form => (
            <button
              key={form.id}
              onClick={() => loadFormData(form)}
              className="group relative rounded-xl border border-slate-700/50 bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-4 text-left hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-500/10 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-3">
                <FileText size={18} className="text-sky-400" />
              </div>
              
              <div className="font-semibold text-white text-sm mb-1 truncate pr-4">
                {form.name}
              </div>
              
              <div className="space-y-1">
                <div className="text-[10px] text-slate-500">
                  {form.fields} fields
                </div>
                <div className="text-[10px] text-sky-400">
                  {form.submissions} submissions
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

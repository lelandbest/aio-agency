import React, { useEffect, useMemo, useState } from 'react';
import { getCmsTablesApi } from '../../services/backendApi';
import { getCMSTableData, exportCMSToCSV } from '../../services/formProcessor';
import { Database, Table, Search, Download } from 'lucide-react';

/**
 * Shared CMS UI extracted from Forms so CRM + Forms stay identical.
 *
 * Props:
 * - onExit: optional callback for a left "Exit" button (Forms uses this to go back)
 * - exitLabel: label for exit button (default "Back")
 */
export default function CMSDataHub({ onExit, exitLabel = 'Back' }) {
  const [cmsTables, setCmsTables] = useState([]);
  const [selectedCmsTable, setSelectedCmsTable] = useState(null);
  const [cmsTableData, setCmsTableData] = useState([]);
  const [cmsSearchQuery, setCmsSearchQuery] = useState('');
  const [cmsDataLoading, setCmsDataLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getCmsTablesApi();
        setCmsTables(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Error loading cms_tables:', e);
        setCmsTables([]);
      }
    })();
  }, []);

  const loadCmsTableData = async (table) => {
    setSelectedCmsTable(table);
    setCmsDataLoading(true);

    try {
      const slug = table?.slug || table?.name;
      const data = await getCMSTableData(slug);
      setCmsTableData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading CMS data:', error);
      setCmsTableData([]);
    }

    setCmsDataLoading(false);
  };

  const handleExportCMS = async (table) => {
    try {
      const slug = table?.slug || table?.name;
      const name = table?.name || slug || 'cms_export';
      await exportCMSToCSV(slug, name);
    } catch (e) {
      console.error('Error exporting CMS CSV:', e);
    }
  };

  const filteredCmsData = useMemo(() => {
    return (cmsTableData || []).filter((row) => {
      if (!cmsSearchQuery) return true;
      return Object.values(row || {}).some((val) =>
        String(val).toLowerCase().includes(cmsSearchQuery.toLowerCase())
      );
    });
  }, [cmsTableData, cmsSearchQuery]);

  return (
    <div className="h-full bg-[#0F0F11] rounded-xl border border-[#27272A] flex flex-col overflow-hidden">
      <div className="p-6 border-b border-[#27272A] bg-[#050505] flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Database size={20} className="text-purple-500" />
            CMS Data
          </h2>

          {onExit && (
            <button
              onClick={() => {
                onExit();
                setSelectedCmsTable(null);
              }}
              className="px-4 py-2 bg-[#27272A] hover:bg-[#3f3f46] text-white rounded text-sm font-medium"
            >
              {exitLabel}
            </button>
          )}
        </div>

        {selectedCmsTable && (
          <button
            onClick={() => {
              setSelectedCmsTable(null);
              setCmsSearchQuery('');
            }}
            className="text-gray-400 hover:text-white text-sm"
          >
            ← Back to Tables
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {!selectedCmsTable ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cmsTables.map((table) => (
              <div
                key={table.id || table.slug || table.name}
                className="bg-[#18181B] border border-[#27272A] hover:border-purple-500/50 p-6 rounded-xl transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 bg-purple-900/20 rounded-lg flex items-center justify-center text-purple-400">
                    <Table size={20} />
                  </div>

                  <span className="px-2 py-1 rounded text-[10px] bg-blue-900/20 text-blue-400 uppercase font-bold">
                    {(table.record_count ?? 0)} Records
                  </span>
                </div>

                <h3 className="text-white font-bold mb-2">{table.name || table.slug}</h3>
                <p className="text-gray-500 text-xs mb-4">{table.description || ''}</p>

                <div className="flex gap-2">
                  <button
                    onClick={() => loadCmsTableData(table)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm font-medium"
                  >
                    View Data
                  </button>

                  <button
                    onClick={() => handleExportCMS(table)}
                    className="bg-[#27272A] hover:bg-[#3f3f46] text-white px-3 py-2 rounded text-sm"
                    title="Export CSV"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">{selectedCmsTable.name}</h3>

              <div className="flex gap-2">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={cmsSearchQuery}
                    onChange={(e) => setCmsSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-[#18181B] border border-[#27272A] rounded text-white text-sm focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={() => handleExportCMS(selectedCmsTable)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2"
                >
                  <Download size={16} /> Export CSV
                </button>
              </div>
            </div>

            {cmsDataLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                <p className="mt-4 text-gray-400">Loading data...</p>
              </div>
            ) : filteredCmsData.length === 0 ? (
              <div className="text-center py-12">
                <Database size={48} className="mx-auto text-gray-600 mb-4" />
                <p className="text-gray-400">No submissions yet</p>
              </div>
            ) : (
              <div className="bg-[#18181B] border border-[#27272A] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#27272A]">
                      <tr>
                        {Object.keys(filteredCmsData[0] || {}).map((key) => (
                          <th
                            key={key}
                            className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider"
                          >
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272A]">
                      {filteredCmsData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#27272A]/50">
                          {Object.entries(row || {}).map(([key, value]) => (
                            <td key={key} className="px-4 py-3 text-sm text-gray-300">
                              {key === 'submitted_at' || key === 'created_at'
                                ? new Date(value).toLocaleString()
                                : typeof value === 'object'
                                  ? JSON.stringify(value)
                                  : String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

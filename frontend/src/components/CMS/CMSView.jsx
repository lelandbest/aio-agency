import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Database, Search, Download, Table, ArrowLeft } from 'lucide-react';
import { getCmsTablesApi } from '../../services/backendApi';
import { getCMSTableData, exportCMSToCSV } from '../../services/formProcessor';
import LoadingSpinner from '../../components/LoadingSpinner';

const CMSView = ({ onBack }) => {
    const [cmsTables, setCmsTables] = useState([]);
    const [selectedCmsTable, setSelectedCmsTable] = useState(null);
    const [cmsTableData, setCmsTableData] = useState([]);
    const [cmsSearchQuery, setCmsSearchQuery] = useState('');
    const [cmsDataLoading, setCmsDataLoading] = useState(false);

    useEffect(() => {
        fetchCmsTables();
    }, []);

    const fetchCmsTables = async () => {
        try {
            const data = await getCmsTablesApi();
            setCmsTables(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error loading cms tables:', error);
            setCmsTables([]);
        }
    };

    const loadCmsTableData = async (table) => {
        setSelectedCmsTable(table);
        setCmsDataLoading(true);
        try {
            const data = await getCMSTableData(table.slug);
            setCmsTableData(data);
        } catch (error) {
            console.error('Error loading CMS data:', error);
        }
        setCmsDataLoading(false);
    };

    const handleExportCMS = async (table) => {
        await exportCMSToCSV(table.slug, table.name);
    };

    const filteredCmsData = cmsTableData.filter(row => {
        if (!cmsSearchQuery) return true;
        return Object.values(row).some(val =>
            String(val).toLowerCase().includes(cmsSearchQuery.toLowerCase())
        );
    });

    return (
        <div className="h-full bg-[var(--color-bg-secondary)] rounded-[var(--radius-panel)] border border-[var(--color-border)] flex flex-col overflow-hidden shadow-island">
            <div className="h-12 shrink-0 flex items-center justify-between gap-3 px-4 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/90 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-tight flex items-center gap-2">
                        <Database size={14} className="text-[var(--color-primary)]" />
                        CMS Data
                    </h2>
                </div>
                {(selectedCmsTable || onBack) && (
                    <button
                        onClick={() => {
                            if (selectedCmsTable) {
                                setSelectedCmsTable(null);
                                setCmsSearchQuery('');
                            } else if (onBack) {
                                onBack();
                            }
                        }}
                        className="text-[10px] font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] uppercase tracking-widest transition flex items-center gap-1"
                    >
                        <ArrowLeft size={12} />
                        {selectedCmsTable ? 'Back to Tables' : 'Back'}
                    </button>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4">
                {!selectedCmsTable ? (
                    // CMS Tables Grid
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {cmsTables.map(table => (
                            <div
                                key={table.id}
                                className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 p-4 rounded-[var(--radius-card)] transition-all shadow-island-sm hover:-translate-y-0.5"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="w-9 h-9 bg-[var(--color-primary)]/10 rounded-[var(--radius-card)] flex items-center justify-center text-[var(--color-primary)] border border-[var(--color-primary)]/20 shadow-island-sm">
                                        <Table size={18} />
                                    </div>
                                    <span className="px-2 py-0.5 rounded-[var(--radius-pill)] text-[9px] bg-[var(--color-accent)]/10 text-[var(--color-accent)] uppercase font-bold border border-[var(--color-accent)]/20">
                                        {table.record_count} Records
                                    </span>
                                </div>
                                <h3 className="text-[var(--color-text-primary)] font-bold mb-1 text-sm">{table.name}</h3>
                                <p className="text-[var(--color-text-tertiary)] text-[11px] mb-3">{table.description}</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => loadCmsTableData(table)}
                                        className="btn-toolbar-lead flex-1 !text-xs"
                                    >
                                        View Data
                                    </button>
                                    <button
                                        onClick={() => handleExportCMS(table)}
                                        className="btn-secondary !px-2.5 !py-2"
                                        title="Export CSV"
                                    >
                                        <Download size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    // CMS Table Data Viewer
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-tight">{selectedCmsTable.name}</h3>
                            <div className="flex gap-2">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={cmsSearchQuery}
                                        onChange={(e) => setCmsSearchQuery(e.target.value)}
                                        className="pl-9 pr-3 py-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] text-[var(--color-text-primary)] text-xs focus:border-[var(--color-primary)] focus:outline-none transition-all"
                                    />
                                </div>
                                <button
                                    onClick={() => handleExportCMS(selectedCmsTable)}
                                    className="btn-toolbar-lead !text-xs flex items-center gap-1.5"
                                >
                                    <Download size={14} /> Export CSV
                                </button>
                            </div>
                        </div>

                        {cmsDataLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <LoadingSpinner size="lg" message="Loading data..." />
                            </div>
                        ) : filteredCmsData.length === 0 ? (
                            <div className="text-center py-12">
                                <Database size={48} className="mx-auto text-[var(--color-text-tertiary)] mb-4" />
                                <p className="text-[var(--color-text-secondary)]">No submissions yet</p>
                            </div>
                        ) : (
                            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] overflow-hidden shadow-island-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-[var(--color-bg-tertiary)]">
                                            <tr>
                                                {Object.keys(filteredCmsData[0]).map(key => (
                                                    <th key={key} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                                                        {key}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--color-border)]">
                                            {filteredCmsData.map((row, idx) => (
                                                <tr key={idx} className="hover:bg-[var(--color-hover)]/50 transition">
                                                    {Object.entries(row).map(([key, value]) => (
                                                        <td key={key} className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                                                            {key === 'submitted_at' || key === 'created_at' ?
                                                                new Date(value).toLocaleString() :
                                                                typeof value === 'object' ? JSON.stringify(value) : value
                                                            }
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
};

CMSView.propTypes = {
    onBack: PropTypes.func
};

export default CMSView;

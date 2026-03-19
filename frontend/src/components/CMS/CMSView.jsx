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
        <div className="h-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                        <Database size={20} className="text-[var(--color-primary)]" />
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
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm flex items-center gap-1"
                    >
                        {selectedCmsTable ? '← Back to Tables' : '← Back'}
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-auto p-6">
                {!selectedCmsTable ? (
                    // CMS Tables Grid
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {cmsTables.map(table => (
                            <div
                                key={table.id}
                                className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 p-6 rounded-xl transition-all"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-10 h-10 bg-[var(--color-primary)]/10 rounded-lg flex items-center justify-center text-[var(--color-primary)]">
                                        <Table size={20} />
                                    </div>
                                    <span className="px-2 py-1 rounded text-[10px] bg-[var(--color-accent)]/10 text-[var(--color-accent)] uppercase font-bold">
                                        {table.record_count} Records
                                    </span>
                                </div>
                                <h3 className="text-[var(--color-text-primary)] font-bold mb-2">{table.name}</h3>
                                <p className="text-[var(--color-text-tertiary)] text-xs mb-4">{table.description}</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => loadCmsTableData(table)}
                                        className="flex-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] px-3 py-2 rounded text-sm font-medium"
                                    >
                                        View Data
                                    </button>
                                    <button
                                        onClick={() => handleExportCMS(table)}
                                        className="bg-[var(--color-hover)] hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] px-3 py-2 rounded text-sm"
                                        title="Export CSV"
                                    >
                                        <Download size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    // CMS Table Data Viewer
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold text-[var(--color-text-primary)]">{selectedCmsTable.name}</h3>
                            <div className="flex gap-2">
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={cmsSearchQuery}
                                        onChange={(e) => setCmsSearchQuery(e.target.value)}
                                        className="pl-10 pr-4 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                    />
                                </div>
                                <button
                                    onClick={() => handleExportCMS(selectedCmsTable)}
                                    className="bg-[var(--color-success)] hover:bg-[var(--color-success-hover)] text-[var(--color-text-on-primary)] px-4 py-2 rounded text-sm font-medium flex items-center gap-2"
                                >
                                    <Download size={16} /> Export CSV
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
                            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl overflow-hidden">
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

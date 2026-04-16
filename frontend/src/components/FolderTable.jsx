import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
    Folder, FolderOpen, ChevronRight, Search, Plus,
    Edit2, Trash2, FolderPlus, Copy, ArrowRight
} from 'lucide-react';

const FolderTable = ({
    title,
    description,
    folders,
    items,
    columns,
    onFolderToggle,
    onFolderCreate,
    onFolderRename,
    onFolderDelete,
    onFolderCopy,
    onFolderOpen,
    onItemSelect,
    selectedItems = [],
    onSelectAll,
    onCreateItem,
    createItemLabel = "Create New",
    actions,
    folderProperty = "folder_id",
    showHeader = true,
    searchQuery: controlledSearchQuery,
    onSearchQueryChange,
    searchPlaceholder = "Search...",
    selectedFolders = [],
    onFolderSelect,
    bulkDeleteLabel = "DELETE SELECTED",
}) => {
    const [localSearchQuery, setLocalSearchQuery] = useState('');
    const [editingFolderId, setEditingFolderId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const searchQuery = controlledSearchQuery ?? localSearchQuery;

    const startRename = (e, folder) => {
        e.stopPropagation();
        setEditingFolderId(folder.id);
        setRenameValue(folder.name);
    };

    const saveRename = (e, folderId) => {
        e.stopPropagation();
        if (onFolderRename) {
            onFolderRename(folderId, renameValue);
        }
        setEditingFolderId(null);
    };

    const handleRenameKeyDown = (e, folderId) => {
        if (e.key === 'Enter') {
            saveRename(e, folderId);
        }
    };

    const filteredItems = items.filter(item =>
        Object.values(item).some(val =>
            String(val).toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    const filteredFolders = folders.filter(folder =>
        folder.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        filteredItems.some(item => item[folderProperty] === folder.id)
    );

    const allVisibleCount = filteredItems.length + filteredFolders.length;
    const allSelectedCount = selectedItems.length + selectedFolders.length;
    const allSelected = allVisibleCount > 0 && allSelectedCount >= allVisibleCount;

    const headerActions = [];
    if (onFolderCreate) {
        headerActions.push({
            label: 'New Folder',
            icon: FolderPlus,
            onClick: onFolderCreate,
            variant: 'secondary'
        });
    }
    if (onCreateItem) {
        headerActions.push({
            label: createItemLabel,
            icon: Plus,
            onClick: onCreateItem,
            variant: 'primary'
        });
    }

    const handleSelectAll = () => {
        if (onSelectAll) {
            onSelectAll();
        }
    };

    return (
        <div className="h-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
            {showHeader ? (
                <div className="px-6 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{title}</h2>
                        {description && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{description}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative w-48">
                            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                            <input
                                type="text"
                                placeholder={searchPlaceholder}
                                value={searchQuery}
                                onChange={(e) => {
                                    if (onSearchQueryChange) {
                                        onSearchQueryChange(e.target.value);
                                        return;
                                    }
                                    setLocalSearchQuery(e.target.value);
                                }}
                                className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-xs focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center justify-end gap-2 overflow-x-auto no-scrollbar">
                            {actions}
                            {headerActions.map((action, idx) => (
                                <button
                                    key={idx}
                                    onClick={action.onClick}
                                    className={`${action.variant === 'primary' ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white' : 'bg-[var(--color-hover)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'} px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition`}
                                >
                                    {action.icon && <action.icon size={16} />}
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="no-scrollbar flex-1 overflow-auto px-4">
                <table className="w-full">
                    <thead className="rounded-lg mb-2">
                        <tr className="border-b border-[var(--color-border)]">
                            <th className="px-3 py-2 text-left w-10">
                                <input
                                    type="checkbox"
                                    className="rounded border-[var(--color-border)] bg-[var(--color-bg-primary)]"
                                    checked={allSelected}
                                    ref={(el) => { if (el) el.indeterminate = allSelectedCount > 0 && !allSelected; }}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            {columns.map((col, idx) => (
                                <th key={idx} className={`px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider ${col.width || ''}`}>
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                        {filteredFolders.map(folder => (
                            <React.Fragment key={`folder-${folder.id}`}>
                                <tr className="hover:bg-[var(--color-bg-tertiary)]/50 cursor-pointer group border-b border-[var(--color-border)]/50">
                                    <td className="px-3 py-2">
                                        <input
                                            type="checkbox"
                                            className="rounded border-[var(--color-border)] bg-[var(--color-bg-primary)]"
                                            checked={selectedFolders.includes(folder.id)}
                                            onChange={() => onFolderSelect?.(folder.id)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </td>
                                    <td className="px-3 py-2" colSpan={columns.length - 1}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2" onClick={() => onFolderToggle(folder.id)}>
                                                <button>
                                                    <ChevronRight size={16} className={`text-[var(--color-text-tertiary)] transition-transform ${folder.expanded ? 'rotate-90' : ''}`} />
                                                </button>
                                                {folder.expanded ? <FolderOpen size={16} className="text-yellow-500" /> : <Folder size={16} className="text-yellow-500" />}
                                                {editingFolderId === folder.id ? (
                                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            value={renameValue}
                                                            onChange={(e) => setRenameValue(e.target.value)}
                                                            onKeyDown={(e) => handleRenameKeyDown(e, folder.id)}
                                                            onBlur={(e) => saveRename(e, folder.id)}
                                                            autoFocus
                                                            className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-2 py-0.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                                                        {folder.name} <span className="text-[var(--color-text-tertiary)] ml-1">({filteredItems.filter(f => f[folderProperty] === folder.id).length})</span>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onFolderDelete?.(folder.id); }}
                                                    className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-[var(--color-hover)] transition"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                                <button
                                                    onClick={(e) => startRename(e, folder)}
                                                    className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-hover)] transition font-medium ghost-button"
                                                    title="Rename"
                                                >
                                                    Rename
                                                </button>
                                                {onFolderOpen && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onFolderOpen(folder.id); }}
                                                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition"
                                                        title="Open"
                                                    >
                                                        Open
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>

                                {folder.expanded && filteredItems.filter(f => f[folderProperty] === folder.id).map(item => (
                                    <tr key={item.id} className="hover:bg-[var(--color-hover)] group">
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.includes(item.id)}
                                                onChange={() => onItemSelect(item.id)}
                                                className="rounded border-[var(--color-border)] bg-[var(--color-bg-primary)]"
                                            />
                                        </td>
                                        {columns.map((col, idx) => (
                                            <td key={idx} className={`px-3 py-2 text-sm text-[var(--color-text-secondary)] ${col.width || ''}`}>
                                                {col.render ? col.render(item) : item[col.key] || '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}

                        {filteredItems.filter(f => !f[folderProperty] || !folders.find(fol => fol.id === f[folderProperty])).length > 0 && (
                            <>
                                {filteredFolders.length > 0 && (
                                    <tr className="bg-[var(--color-bg-tertiary)]/50">
                                        <td colSpan={columns.length + 1} className="px-3 py-2 text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                                            Uncategorized
                                        </td>
                                    </tr>
                                )}
                                {filteredItems.filter(f => !f[folderProperty] || !folders.find(fol => fol.id === f[folderProperty])).map(item => (
                                    <tr key={item.id} className="hover:bg-[var(--color-hover)] group">
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.includes(item.id)}
                                                onChange={() => onItemSelect(item.id)}
                                                className="rounded border-[var(--color-border)] bg-[var(--color-bg-primary)]"
                                            />
                                        </td>
                                        {columns.map((col, idx) => (
                                            <td key={idx} className={`px-3 py-2 text-sm text-[var(--color-text-secondary)] ${col.width || ''}`}>
                                                {col.render ? col.render(item) : item[col.key] || '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

FolderTable.propTypes = {
    title: PropTypes.string,
    description: PropTypes.string,
    folders: PropTypes.array.isRequired,
    items: PropTypes.array.isRequired,
    columns: PropTypes.arrayOf(PropTypes.shape({
        header: PropTypes.string.isRequired,
        key: PropTypes.string,
        render: PropTypes.func,
        width: PropTypes.string,
    })).isRequired,
    onFolderToggle: PropTypes.func.isRequired,
    onFolderCreate: PropTypes.func,
    onFolderRename: PropTypes.func,
    onFolderDelete: PropTypes.func,
    onFolderCopy: PropTypes.func,
    onFolderOpen: PropTypes.func,
    onItemSelect: PropTypes.func.isRequired,
    onSelectAll: PropTypes.func,
    onCreateItem: PropTypes.func,
    createItemLabel: PropTypes.string,
    actions: PropTypes.node,
    folderProperty: PropTypes.string,
    showHeader: PropTypes.bool,
    searchQuery: PropTypes.string,
    onSearchQueryChange: PropTypes.func,
    searchPlaceholder: PropTypes.string,
    selectedFolders: PropTypes.array,
    onFolderSelect: PropTypes.func,
    bulkDeleteLabel: PropTypes.string,
};

export default FolderTable;
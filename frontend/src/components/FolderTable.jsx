import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
    Folder, FolderOpen, ChevronRight, Search, Plus,
    MoreHorizontal, ChevronDown, Edit2, Trash2, FolderPlus
} from 'lucide-react';
import ModuleHeader from './ModuleHeader';

/**
 * FolderTable Component
 * Reusable component for displaying items categorized into folders with a table view
 */
const FolderTable = ({
    title,
    description,
    folders,
    items,
    columns,
    onFolderToggle,
    onFolderCreate,
    onFolderRename, // New Prop
    onItemSelect,
    selectedItems,
    onCreateItem,
    createItemLabel = "Create New",
    actions,
    folderProperty = "folder_id", // The property on items that links to folder.id
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [editingFolderId, setEditingFolderId] = useState(null);
    const [renameValue, setRenameValue] = useState('');

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

    // Filter items based on search
    const filteredItems = items.filter(item =>
        Object.values(item).some(val =>
            String(val).toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

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

    return (
        <div className="h-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
            {/* Header */}
            <ModuleHeader
                title={title}
                titleIcon={FolderPlus}
                actions={headerActions}
                showActions={headerActions.length > 0}
                className="border-b-0"
            />
            <div className="px-6 pb-4 bg-[var(--color-bg-tertiary)] border-b border-[var(--color-border)]">
                {description && (
                    <p className="text-xs text-[var(--color-text-secondary)]">{description}</p>
                )}
                {/* Search Bar */}
                <div className={`flex items-center gap-4 ${description ? 'mt-4' : ''}`}>
                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-sm focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                    {actions}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full">
                    <thead className="bg-[var(--color-bg-tertiary)] sticky top-0 z-10">
                        <tr className="border-b border-[var(--color-border)]">
                            <th className="px-4 py-3 text-left w-12">
                                <input type="checkbox" className="rounded border-[var(--color-border)] bg-[var(--color-bg-primary)]" />
                            </th>
                            <th className="px-4 py-3 text-left w-12"></th>
                            {columns.map((col, idx) => (
                                <th key={idx} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                        {folders.map(folder => (
                            <React.Fragment key={`folder-${folder.id}`}>
                                {/* Folder Row */}
                                <tr className="hover:bg-[var(--color-hover)] cursor-pointer group">
                                    <td className="px-4 py-3">
                                        <input type="checkbox" className="rounded border-[var(--color-border)] bg-[var(--color-bg-primary)]" />
                                    </td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => onFolderToggle(folder.id)}>
                                            {folder.expanded ? <FolderOpen size={20} className="text-yellow-500" /> : <Folder size={20} className="text-yellow-500" />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3" colSpan={columns.length}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2" onClick={() => onFolderToggle(folder.id)}>
                                                <button>
                                                    <ChevronRight size={16} className={`text-[var(--color-text-tertiary)] transition-transform ${folder.expanded ? 'rotate-90' : ''}`} />
                                                </button>
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
                                            {/* Folder Actions - visible on hover */}
                                            <div className="opacity-0 group-hover:opacity-100 flex gap-2 mr-4">
                                                <button
                                                    onClick={(e) => startRename(e, folder)}
                                                    className="p-1 hover:text-[var(--color-primary)] text-[var(--color-text-secondary)]"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>

                                {/* Items in Folder */}
                                {folder.expanded && filteredItems.filter(f => f[folderProperty] === folder.id).map(item => (
                                    <tr key={item.id} className="hover:bg-[var(--color-hover)]">
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.includes(item.id)}
                                                onChange={() => onItemSelect(item.id)}
                                                className="rounded border-[var(--color-border)] bg-[var(--color-bg-primary)]"
                                            />
                                        </td>
                                        <td className="px-4 py-3 pl-12">
                                            {/* Placeholder for item icon, maybe passed in? For now default link */}
                                            <div className="text-blue-400 opacity-70">
                                                {/* We could add logic here for different icons */}
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                            </div>
                                        </td>
                                        {columns.map((col, idx) => (
                                            <td key={idx} className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                                                {col.render ? col.render(item) : item[col.key] || '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}

                        {/* Uncategorized Items (if any, optional) */}
                        {filteredItems.filter(f => !f[folderProperty] || !folders.find(fol => fol.id === f[folderProperty])).length > 0 && (
                            <>
                                <tr className="bg-[var(--color-bg-tertiary)]/50">
                                    <td colSpan={columns.length + 2} className="px-4 py-2 text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                                        Uncategorized
                                    </td>
                                </tr>
                                {filteredItems.filter(f => !f[folderProperty] || !folders.find(fol => fol.id === f[folderProperty])).map(item => (
                                    <tr key={item.id} className="hover:bg-[var(--color-hover)]">
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.includes(item.id)}
                                                onChange={() => onItemSelect(item.id)}
                                                className="rounded border-[var(--color-border)] bg-[var(--color-bg-primary)]"
                                            />
                                        </td>
                                        <td className="px-4 py-3 pl-12 text-blue-400 opacity-70">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                        </td>
                                        {columns.map((col, idx) => (
                                            <td key={idx} className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
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
        render: PropTypes.func
    })).isRequired,
    onFolderToggle: PropTypes.func.isRequired,
    onFolderCreate: PropTypes.func,
    onFolderRename: PropTypes.func,
    onItemSelect: PropTypes.func.isRequired,
    selectedItems: PropTypes.array.isRequired,
    onCreateItem: PropTypes.func,
    createItemLabel: PropTypes.string,
    actions: PropTypes.node,
    folderProperty: PropTypes.string
};

export default FolderTable;

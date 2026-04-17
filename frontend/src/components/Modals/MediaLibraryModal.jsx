import React from 'react';
import PropTypes from 'prop-types';
import { X, Trash2, Image as ImageIcon } from 'lucide-react';

const MediaLibraryModal = ({ 
    isOpen, 
    onClose, 
    assets, 
    onSelect, 
    onDelete, 
    currentSelection,
    isLoading
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in duration-300">
                <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-tertiary)]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-accent)]">
                            <ImageIcon size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-[var(--color-text-primary)]">Media Library</h3>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">{assets.length} total assets</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-lg transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
                    {isLoading ? (
                        <div className="flex h-64 flex-col items-center justify-center gap-4 text-[var(--color-text-tertiary)]">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                            <p className="text-xs font-bold uppercase tracking-widest text-animate-pulse">Loading Assets...</p>
                        </div>
                    ) : assets.length === 0 ? (
                        <div className="flex h-64 flex-col items-center justify-center gap-4 text-[var(--color-text-tertiary)]">
                            <ImageIcon size={48} className="opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-widest">No assets found</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {assets.map((asset) => (
                                <div 
                                    key={asset.id || asset.assetId} 
                                    className={`relative group aspect-square rounded-xl border overflow-hidden bg-[var(--color-bg-tertiary)] transition-all ring-offset-4 ring-offset-[var(--color-bg-primary)] cursor-pointer ${
                                        currentSelection === asset.sourceUrl 
                                            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]' 
                                            : 'border-[var(--color-border)] hover:border-[var(--color-text-tertiary)]'
                                    }`}
                                    onClick={() => onSelect(asset.sourceUrl)}
                                >
                                    <img 
                                        src={asset.sourceUrl} 
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        alt={asset.title || asset.filename}
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform">
                                        <p className="text-[9px] font-bold text-white truncate drop-shadow-md">{asset.title || asset.filename || asset.assetId}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(asset.id || asset.assetId);
                                        }}
                                        className="absolute top-2 right-2 p-2 bg-red-600/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 shadow-xl backdrop-blur-md"
                                        title="Delete Asset"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-3 bg-[var(--color-bg-tertiary)]">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-all"
                    >
                        Close Library
                    </button>
                </div>
            </div>
        </div>
    );
};

MediaLibraryModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    assets: PropTypes.array.isRequired,
    onSelect: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
    currentSelection: PropTypes.string,
    isLoading: PropTypes.bool
};

export default MediaLibraryModal;

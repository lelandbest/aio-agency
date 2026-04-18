import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { X, Trash2, Image as ImageIcon, MessageSquare, Copy, Check } from 'lucide-react';

const SEED_CANNED = [
    { id: '1', shortcode: "/stat", content: "Hi, I wanted to provide you with an update on the status of your issue. Unfortunately, our development team has not been able to resolve your problem yet, but please rest assured that we are actively working on finding a solution. We understand that this must be frustrating for you, and we sincerely apologize for any inconvenience this may have caused. We appreciate your patience and understanding while we work to resolve your issue. Our development team is dedicated to finding the root cause of the problem and implementing a fix as soon as possible. We will keep you updated throughout the process and provide you with an estimated timeline for resolution. Thank you for bringing this to our attention, and please don't hesitate to reach out if you have any further questions or concerns." },
    { id: '2', shortcode: "/det", content: "Thank you for reaching out to us for support. We're here to help and we'll do our best to assist you. Please provide us with a detailed description of the issue you're facing and any relevant information that may help us better understand your situation. This could include: • A description of the problem • Account Email • Any relevant screenshots or other supporting materials The more information you can provide, the better we'll be able to assist you. Thank you for choosing our service." },
    { id: '3', shortcode: "/dev", content: "Thank you for reaching out to us. I have reviewed your issue and it appears that it falls under the responsibility of our development team. I will forward your case to them for further review and action. Please allow some time for the team to investigate and resolve the issue. I will keep you updated on the progress. If you have any further questions or concerns, please don't hesitate to reach out to us." },
    { id: '4', shortcode: "/thank", content: "Thank you for sharing details. I have received your request and I am looking into it." },
    { id: '5', shortcode: "/time", content: "Please allow me some time to gather the necessary information and thoroughly review your case. I will do my best to find a resolution and get back to you as soon as possible with an update." },
    { id: '6', shortcode: "/update", content: "I wanted to reach out and provide an update on the issue you reported. Our development team is currently working on it and we appreciate your patience while we resolve it. Please know that your satisfaction is our top priority and we are doing everything we can to resolve this as soon as possible. If you need anything further in the meantime, please do not hesitate to reach out. Thank you for your understanding and continued business." },
    { id: '7', shortcode: "/assure", content: "Rest assured, your issue is important to us, and we will make sure to address it as soon as possible. We appreciate your patience and understanding as we work to provide the best possible service to all our customers." },
    { id: '8', shortcode: "/apology", content: "Thank you for reaching out to us. We apologize for the delay in addressing your issue. Our development team is currently working on a new feature that requires their full attention and resources. If you have any further concerns or questions, please don't hesitate to let us know." },
    { id: '9', shortcode: "/hi", content: "Hello there! You've reached Sales & Support. How can I help you today?" },
    { id: '10', shortcode: "/hrs", content: "Support available from 9am - 5pm ET M-F. Chat will stay open for tech review. If closed, support replies will be emailed to you." }
];


const MediaLibraryModal = ({ 
    isOpen, 
    onClose, 
    assets = [], 
    onSelect, 
    onDelete, 
    currentSelection,
    isLoading
}) => {
    const [activeTab, setActiveTab] = useState('media'); // 'media' | 'canned'
    const [cannedResponses, setCannedResponses] = useState(SEED_CANNED);
    const [copiedId, setCopiedId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');


    useEffect(() => {
        if (isOpen) {
            const stored = localStorage.getItem('aio_canned_responses');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setCannedResponses(parsed);
                    }
                } catch (e) {
                    console.error('Failed to parse canned responses:', e);
                }
            }
        }
    }, [isOpen]);

    const handleCopy = (content, id) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in duration-300">
                {/* Header */}
                <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-tertiary)]/50">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-primary)] shadow-inner">
                                {activeTab === 'media' ? <ImageIcon size={20} /> : <MessageSquare size={20} />}
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--color-text-primary)]">System Library</h3>
                                <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">
                                    {activeTab === 'media' ? `${assets.length} total assets` : `${cannedResponses.length} canned responses`}
                                </p>
                            </div>
                        </div>

                        {/* Tab Switcher */}
                        <div className="flex p-1 bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border)]">
                            <button 
                                onClick={() => setActiveTab('media')}
                                className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${activeTab === 'media' ? 'bg-[var(--color-primary)] text-white shadow-lg' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}
                            >
                                Media
                            </button>
                            <button 
                                onClick={() => setActiveTab('canned')}
                                className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${activeTab === 'canned' ? 'bg-[var(--color-primary)] text-white shadow-lg' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}
                            >
                                Canned
                            </button>
                        </div>
                    </div>
                    
                    <button onClick={onClose} className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-lg transition-all">
                        <X size={20} />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto min-h-0 bg-[var(--color-bg-secondary)]/30">
                    {activeTab === 'media' ? (
                        <div className="p-6">
                            {isLoading ? (
                                <div className="flex h-64 flex-col items-center justify-center gap-4 text-[var(--color-text-tertiary)]">
                                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                                    <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Loading Assets...</p>
                                </div>
                            ) : assets.length === 0 ? (
                                <div className="flex h-64 flex-col items-center justify-center gap-4 text-[var(--color-text-tertiary)]">
                                    <ImageIcon size={48} className="opacity-10" />
                                    <p className="text-xs font-bold uppercase tracking-widest">No assets found</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {assets.map((asset) => (
                                        <div 
                                            key={asset.id || asset.assetId} 
                                            className={`relative group aspect-square rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg-tertiary)] transition-all cursor-pointer hover:border-[var(--color-text-tertiary)] hover:shadow-xl ${
                                                currentSelection === asset.sourceUrl 
                                                    ? 'ring-2 ring-[var(--color-primary)] border-transparent' 
                                                    : ''
                                            }`}
                                            onClick={() => onSelect(asset.sourceUrl)}
                                        >
                                            <img 
                                                src={asset.sourceUrl} 
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                alt={asset.title || asset.filename}
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                            <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                                                <p className="text-[10px] font-bold text-white truncate drop-shadow-md">{asset.title || asset.filename || asset.assetId}</p>
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
                    ) : (
                        <div className="p-6 space-y-6">
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
                                    <MessageSquare size={14} />
                                </span>
                                <input 
                                    type="text"
                                    placeholder="Search shortcodes or content..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl py-2 pl-10 pr-4 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none transition-all"
                                />
                            </div>
                            
                            <div className="space-y-4">
                                {cannedResponses.filter(res => 
                                    res.shortcode.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                    res.content.toLowerCase().includes(searchTerm.toLowerCase())
                                ).map((res, idx) => (
                                    <div 
                                        key={res.id || idx}

                                    className="group relative bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-4 transition-all hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-bg-tertiary)]/30 cursor-pointer"
                                    onClick={() => onSelect(res.content)}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <code className="text-xs font-mono text-[var(--color-primary)] font-bold bg-[var(--color-primary)]/10 px-2 py-0.5 rounded">
                                            {res.shortcode}
                                        </code>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopy(res.content, res.id || idx);
                                            }}
                                            className={`p-2 rounded-lg transition-all ${copiedId === (res.id || idx) ? 'bg-green-500/20 text-green-400' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]' }`}
                                        >
                                            {copiedId === (res.id || idx) ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                    <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">
                                        {res.content}
                                    </p>
                                </div>
                            ))}
                            </div>
                        </div>

                    )}
                </div>


                {/* Footer */}
                <div className="p-4 border-t border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-tertiary)]/50">
                    <p className="text-[10px] text-[var(--color-text-tertiary)] font-bold uppercase tracking-widest italic">
                        Select an item to use it in your project
                    </p>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] border border-transparent hover:border-[var(--color-border)] transition-all"
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
    assets: PropTypes.array,
    onSelect: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
    currentSelection: PropTypes.string,
    isLoading: PropTypes.bool
};

export default MediaLibraryModal;


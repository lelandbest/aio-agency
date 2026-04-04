import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { X, Shield, Users, Rocket, Zap, User, Briefcase, Fingerprint } from 'lucide-react';
import { processFormSubmission } from '../../services/formProcessor';

const TabbedBrainFormModal = ({ onClose, onSuccess, initialData = {} }) => {
    const [activeTab, setActiveTab] = useState('identity');
    const [formData, setFormData] = useState(initialData);
    const [submitting, setSubmitting] = useState(false);

    const tabs = [
        { id: 'identity', label: 'Identity', icon: Shield },
        { id: 'mission', label: 'Mission', icon: Rocket },
        { id: 'audience', label: 'Targeting', icon: Users },
        { id: 'market', label: 'Market', icon: Zap },
    ];

    const handleChange = (fieldId, value) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await processFormSubmission('brand-dna-form', formData);
            if (onSuccess) onSuccess(formData);
            onClose();
        } catch (error) {
            console.error('Error submitting form:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const renderField = (id, label, type = 'text', placeholder = '') => (
        <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 block">{label}</label>
            {type === 'textarea' ? (
                <textarea
                    value={formData[id] || ''}
                    onChange={(e) => handleChange(id, e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none transition-all placeholder:text-slate-600 resize-none"
                    placeholder={placeholder}
                    rows={4}
                />
            ) : (
                <input
                    type="text"
                    value={formData[id] || ''}
                    onChange={(e) => handleChange(id, e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none transition-all placeholder:text-slate-600"
                    placeholder={placeholder}
                />
            )}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[3000] p-4">
            <div className="bg-[#0D0F13] border border-white/10 rounded-xl w-full max-w-2xl h-[600px] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in duration-200">
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between flex-shrink-0 bg-[#0A0C10]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-500/10 border border-cyan-500/20">
                            <Fingerprint size={16} className="text-cyan-400" />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-slate-200">Business DNA Registry</div>
                            <div className="text-[10px] font-medium text-slate-500 mt-0.5">Cortex Operational Profile</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-5 pt-1.5 border-b border-white/5 flex items-end gap-1 flex-shrink-0 bg-[#0A0C10]">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-all border-b-2 ${activeTab === tab.id
                                ? 'border-cyan-500/60 text-cyan-400 bg-cyan-500/5'
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <tab.icon size={13} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto no-scrollbar p-6">
                    {activeTab === 'identity' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-left-2 duration-200">
                            <div className="flex items-center gap-2 mb-1">
                                <Briefcase size={14} className="text-cyan-500" />
                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Brand Identity</h4>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {renderField('companyName', 'Business Name', 'text', 'e.g. AIO BrandMaster™')}
                                {renderField('brandVoice', 'Brand Voice', 'text', 'e.g. AI-first, professional...')}
                            </div>
                            {renderField('valueProp', 'Value Proposition', 'textarea', 'What is your core value promise?')}
                        </div>
                    )}

                    {activeTab === 'mission' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-left-2 duration-200">
                            <div className="flex items-center gap-2 mb-1">
                                <Rocket size={14} className="text-cyan-500" />
                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Operational Mission</h4>
                            </div>
                            {renderField('mission', 'Mission Statement', 'textarea', 'Describe your core purpose...')}
                            {renderField('differentiation', 'Differentiators', 'textarea', 'What sets you apart?')}
                        </div>
                    )}

                    {activeTab === 'audience' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-left-2 duration-200">
                            <div className="flex items-center gap-2 mb-1">
                                <User size={14} className="text-cyan-500" />
                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Target Audience (ICP)</h4>
                            </div>
                            {renderField('idealCustomer', 'Customer Profile', 'textarea', 'Describe your ideal buyer...')}
                            {renderField('painPoints', 'Customer Pain Points', 'textarea', 'Add primary friction points identified...')}
                        </div>
                    )}

                    {activeTab === 'market' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-left-2 duration-200">
                            <div className="flex items-center gap-2 mb-1">
                                <Zap size={14} className="text-cyan-500" />
                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">Market & Competitive Strategy</h4>
                            </div>
                            {renderField('competitors', 'Competitor Landscape', 'textarea', 'Identify key competitors and their gaps...')}
                            {renderField('marketingStrategy', 'Marketing Angle', 'textarea', 'Primary marketing analysis/strategy...')}
                            {renderField('workflow', 'Operational Workflow', 'textarea', 'Execution path...')}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 border-t border-white/8 flex justify-end items-center gap-3 flex-shrink-0 bg-[#0A0C10]">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600 mr-auto">DNA Profile v2.1</p>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-300 transition border border-transparent hover:border-white/10"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex items-center gap-2 px-5 py-2 bg-cyan-600/90 hover:bg-cyan-500/90 text-xs font-semibold uppercase tracking-wide text-white rounded disabled:opacity-40 transition"
                    >
                        <Shield size={13} />
                        {submitting ? 'Syncing...' : 'Commit to DNA'}
                    </button>
                </div>
            </div>
        </div>
    );
};

TabbedBrainFormModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    onSuccess: PropTypes.func,
    initialData: PropTypes.object
};

export default TabbedBrainFormModal;

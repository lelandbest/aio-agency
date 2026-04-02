import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { X, Save, Shield, Users, Rocket, Zap, User, Briefcase } from 'lucide-react';
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
        <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{label}</label>
            {type === 'textarea' ? (
                <textarea
                    value={formData[id] || ''}
                    onChange={(e) => handleChange(id, e.target.value)}
                    className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] outline-none transition-all shadow-island-sm"
                    placeholder={placeholder}
                    rows={3}
                />
            ) : (
                <input
                    type="text"
                    value={formData[id] || ''}
                    onChange={(e) => handleChange(id, e.target.value)}
                    className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] outline-none transition-all shadow-island-sm"
                    placeholder={placeholder}
                />
            )}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[3000] p-4">
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] w-full max-w-2xl h-[600px] overflow-hidden flex flex-col shadow-island animate-in zoom-in duration-300">
                {/* Header with Tabs */}
                <div className="p-1 px-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-tertiary)] flex-shrink-0">
                    <div className="flex gap-1">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === tab.id ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={onClose} className="p-2 text-[var(--color-text-tertiary)] hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar p-8">
                    {activeTab === 'identity' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex items-center gap-3 mb-2">
                                <Briefcase className="text-[var(--color-primary)]" size={18} />
                                <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white">Brand Identity</h4>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {renderField('companyName', 'Business Name', 'text', 'e.g. AIO BrandMaster™')}
                                {renderField('brandVoice', 'Brand Voice', 'text', 'e.g. AI-first, professional...')}
                            </div>
                            {renderField('valueProp', 'Value Proposition', 'textarea', 'What is your core value promise?')}
                        </div>
                    )}

                    {activeTab === 'mission' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex items-center gap-3 mb-2">
                                <Rocket className="text-[var(--color-primary)]" size={18} />
                                <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white">Operational Mission</h4>
                            </div>
                            {renderField('mission', 'Mission Statement', 'textarea', 'Describe your core purpose...')}
                            {renderField('differentiation', 'Differentiators', 'textarea', 'What sets you apart?')}
                        </div>
                    )}

                    {activeTab === 'audience' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex items-center gap-3 mb-2">
                                <User className="text-[var(--color-primary)]" size={18} />
                                <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white">Target Audience (ICP)</h4>
                            </div>
                            {renderField('idealCustomer', 'Customer Profile', 'textarea', 'Describe your ideal buyer...')}
                            {renderField('painPoints', 'Customer Pain Points', 'textarea', 'Add primary friction points identified...')}
                        </div>
                    )}

                    {activeTab === 'market' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex items-center gap-3 mb-2">
                                <Zap className="text-[var(--color-primary)]" size={18} />
                                <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white">Market & Competitive Strategy</h4>
                            </div>
                            {renderField('competitors', 'Competitor Landscape', 'textarea', 'Identify key competitors and their gaps...')}
                            {renderField('marketingStrategy', 'Marketing Angle', 'textarea', 'Primary marketing analysis/strategy...')}
                            {renderField('workflow', 'Operational workflow', 'textarea', 'Execution path...')}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex justify-end items-center gap-4 flex-shrink-0">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mr-auto italic opacity-50">Operational DNA Sync v2.1</p>
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-[var(--radius-card)] text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] hover:text-white transition-all border border-transparent hover:border-[var(--color-border)]"
                    >
                        Discard
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex items-center gap-3 px-8 py-3 bg-[var(--color-primary)] hover:opacity-90 text-[10px] font-black uppercase tracking-widest text-white rounded-[var(--radius-card)] shadow-island disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                    >
                        <Save size={14} />
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

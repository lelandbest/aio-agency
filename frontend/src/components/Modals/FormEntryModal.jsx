import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { X, Save } from 'lucide-react';
import { processFormSubmission } from '../../services/formProcessor';
import { normalizeSourceUrl } from '../../services/backendApi';

const normalizeFormEntrySettings = (settings = {}) => {
    const source = settings || {};
    let rawHeaderImage = (
        source.headerImage || 
        source.header_image || 
        source.heroImage || 
        source.hero_image || 
        ''
    );
    if (rawHeaderImage && typeof rawHeaderImage === 'object') {
        rawHeaderImage = rawHeaderImage.sourceUrl || rawHeaderImage.url || '';
    }
    return {
        headerImage: normalizeSourceUrl(rawHeaderImage),
        headerImageFit: source.headerImageFit || source.header_image_fit || 'cover',
    };
};

const FormEntryModal = ({ form, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            await processFormSubmission(form.id, formData);
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error('Error submitting form:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleChange = (fieldId, value) => {
        setFormData(prev => ({
            ...prev,
            [fieldId]: value
        }));
    };

    const renderField = (field) => {
        const commonClasses = "w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none shadow-island-sm transition-all";

        switch (field.type) {
            case 'textarea':
                return (
                    <textarea
                        required={field.required}
                        onChange={(e) => handleChange(field.name || field.label, e.target.value)}
                        className={commonClasses}
                        placeholder={field.placeholder}
                        rows={4}
                    />
                );
            case 'select':
                return (
                    <select
                        required={field.required}
                        onChange={(e) => handleChange(field.name || field.label, e.target.value)}
                        className={commonClasses}
                    >
                        <option value="">Select...</option>
                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                );
            case 'radio':
                return (
                    <div className="space-y-2">
                        {field.options?.map(opt => (
                            <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name={field.id}
                                    value={opt}
                                    onChange={(e) => handleChange(field.name || field.label, e.target.value)}
                                    className="text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                />
                                <span className="text-[var(--color-text-primary)] text-sm">{opt}</span>
                            </label>
                        ))}
                    </div>
                );
            case 'checkbox':
                return (
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            onChange={(e) => handleChange(field.name || field.label, e.target.checked)}
                            className="text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <span className="text-[var(--color-text-primary)] text-sm">{field.label}</span>
                    </label>
                );
            case 'content':
                return <div className="prose prose-invert text-sm" dangerouslySetInnerHTML={{ __html: field.content }} />;
            default:
                return (
                    <input
                        type={field.type}
                        required={field.required}
                        onChange={(e) => handleChange(field.name || field.label, e.target.value)}
                        className={commonClasses}
                        placeholder={field.placeholder}
                    />
                );
        }
    };

    const settings = normalizeFormEntrySettings(form?.settings);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-island animate-in zoom-in duration-300">
                <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-tertiary)]">
                    <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{form.name}</h3>
                    <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {settings.headerImage ? (
                        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
                            <img
                                src={settings.headerImage}
                                alt={`${form.name} header`}
                                className="h-40 w-full"
                                style={{ objectFit: settings.headerImageFit || 'cover' }}
                            />
                        </div>
                    ) : null}
                    {form.schema?.map((field, idx) => (
                        <div key={field.id || idx}>
                            {!field.hideLabel && field.type !== 'checkbox' && field.type !== 'content' && (
                                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                                    {field.label} {field.required && <span className="text-red-500">*</span>}
                                </label>
                            )}
                            {renderField(field)}
                        </div>
                    ))}
                    {(!form.schema || form.schema.length === 0) && (
                        <div className="text-center text-[var(--color-text-tertiary)] py-10 italic">
                            This form has no fields.
                        </div>
                    )}
                </form>

                <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-2 bg-[var(--color-bg-tertiary)]">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] rounded-[var(--radius-card)] text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-all shadow-island-sm hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Save size={16} />
                        {submitting ? 'Submitting...' : 'Submit Entry'}
                    </button>
                </div>
            </div>
        </div>
    );
};

FormEntryModal.propTypes = {
    form: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    onSuccess: PropTypes.func
};

export default FormEntryModal;

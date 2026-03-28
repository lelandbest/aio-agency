/**
 * LOCKED: AI Provider Unified Architecture - Phase 1 & 2
 * Verified Stable: March 25, 2026
 * DO NOT MODIFY SCHEMA OR STATS LOGIC WITHOUT OPERATOR APPROVAL
 */
import React, { useState } from 'react';
import { getProviderConfig, getProvidersByCategory } from '../utils/integrationConfigs';
import { getBrandIcon, getBrandColors } from '../utils/brandIcons.jsx';

/**
 * AddIntegrationPanel Component
 * Slide-out panel for adding new integrations
 */
export const AddIntegrationPanel = ({
  isOpen,
  category,
  onClose,
  onSave,
  onCategoryChange,
  categories,
}) => {
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [formData, setFormData] = useState({});
  const [customLogo, setCustomLogo] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);

  const providers = getProvidersByCategory(category);
  const provider = selectedProvider ? getProviderConfig(selectedProvider) : null;

  // Handle Fetching Models for Ollama
  const handleFetchModels = async () => {
    const baseUrl = formData.base_url || 'http://192.168.4.28:11434';
    setFetchingModels(true);
    setSubmitError('');
    try {
      const response = await fetch(`/api/ai/ollama/models?base_url=${encodeURIComponent(baseUrl)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch models');
      }
      const result = await response.json();
      setAvailableModels(result.data || []);
      if (result.data?.length > 0 && !formData.model) {
        handleInputChange('model', result.data[0]);
      }
    } catch (error) {
      setSubmitError(`Model Fetch Error: ${error.message}`);
    } finally {
      setFetchingModels(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (fieldName, value) => {
    setSubmitError('');
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
    // Clear error for this field
    if (errors[fieldName]) {
      setErrors((prev) => ({
        ...prev,
        [fieldName]: null,
      }));
    }
  };

  // Handle logo upload
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCustomLogo(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Validate form
  const validateForm = () => {
    if (!provider) {
      setErrors({ provider: 'Please select a provider' });
      return false;
    }

    const newErrors = {};
    provider.fields.forEach((field) => {
      if (field.required && !formData[field.name]) {
        newErrors[field.name] = `${field.label} is required`;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }

    return true;
  };

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setSubmitError('');
    try {
      const result = await onSave({
        providerId: selectedProvider,
        category,
        config: formData,
        customLogo,
      });
      if (result === false) {
        return;
      }

      setSelectedProvider(null);
      setFormData({});
      setCustomLogo(null);
      setErrors({});
      onClose();
    } catch (error) {
      setSubmitError(error?.message || 'Unable to attach integration.');
    } finally {
      setSaving(false);
    }
  };

  // Handle close
  const handleClose = () => {
    setSelectedProvider(null);
    setFormData({});
    setCustomLogo(null);
    setErrors({});
    setSubmitError('');
    setSaving(false);
    onClose();
  };

  const colors = provider ? getBrandColors(provider.id) : {};

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[999] animate-fadeIn"
          onClick={handleClose} 
        />
      )}

      {/* Panel */}
      <div className={`fixed top-0 right-0 w-[500px] h-full bg-[var(--color-bg-primary)] shadow-lg z-[1000] flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="px-5 py-5 border-b border-[var(--color-border)] flex justify-between items-center">
          <h2 className="m-0 text-lg font-semibold text-[var(--color-text-primary)]">Attach</h2>
          <button 
            className="bg-transparent border-none cursor-pointer p-1 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded transition-all"
            onClick={handleClose}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Step 1: Category Selection */}
          {!selectedProvider && (
            <div className="flex flex-col">
              <h3 className="m-0 mb-4 text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">Select Integration Type</h3>
              <div className="flex flex-col gap-2 mb-5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    className={`flex justify-between items-center px-4 py-3 rounded-lg transition-all cursor-pointer font-medium text-sm ${
                      category === cat.id 
                        ? 'border-2 border-[var(--color-primary)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]' 
                        : 'border-2 border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-primary)] text-[var(--color-text-primary)]'
                    }`}
                    onClick={() => onCategoryChange(cat.id)}
                  >
                    <span className="flex-1 text-left">{cat.name}</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                      category === cat.id 
                        ? 'bg-[var(--color-primary)]/20 text-[var(--color-text-primary)]' 
                        : 'bg-[var(--color-hover)] text-[var(--color-text-secondary)]'
                    }`}>{cat.providerCount}</span>
                  </button>
                ))}
              </div>

              {/* Step 2: Provider Selection */}
              <h3 className="m-0 mt-6 mb-4 text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
                Select Provider
              </h3>
              <div className="flex flex-col gap-3">
                {providers.map((prov) => (
                  <button
                    key={prov.id}
                    className="flex items-center gap-3 px-4 py-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)] cursor-pointer transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-tertiary)] text-left"
                    onClick={() => setSelectedProvider(prov.id)}
                  >
                    <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)]">
                      {prov.logo ? (
                        <img src={prov.logo} alt={prov.name} className="w-full h-full object-contain p-1" />
                      ) : (
                        getBrandIcon(prov.id, 32)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="m-0 mb-0.5 text-sm font-semibold text-[var(--color-text-primary)]">{prov.name}</p>
                      <p className="m-0 text-xs text-[var(--color-text-secondary)] whitespace-nowrap overflow-hidden text-ellipsis">{prov.description}</p>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex-shrink-0">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Config Form */}
          {selectedProvider && provider && (
            <div className="flex flex-col">
              {/* Provider Info */}
              <div className="flex items-center gap-3 px-4 py-4 rounded-2xl mb-6 border border-[var(--color-border)] bg-[var(--color-bg-secondary)] relative border-l-4" style={{ borderColor: colors.primary || 'var(--color-primary)' }}>
                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)]">
                  {provider.logo ? (
                    <img src={provider.logo} alt={provider.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    getBrandIcon(provider.id, 40)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="m-0 mb-1 text-sm font-semibold text-[var(--color-text-primary)]">{provider.name}</h3>
                  <p className="m-0 text-xs text-[var(--color-text-secondary)]">{provider.description}</p>
                </div>
                <button
                  className="bg-transparent border-none cursor-pointer p-1 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] absolute right-3 top-1/2 transform -translate-y-1/2 transition-all"
                  onClick={() => setSelectedProvider(null)}
                  title="Back to providers"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
              </div>

              {/* Form Fields */}
              <form className="flex flex-col gap-3">
                {provider.fields.map((field) => {
                  const errorClass = errors[field.name] ? 'border-red-500/60' : 'border-[var(--color-border)]';
                  const inputClass = `w-full rounded-xl border ${errorClass} bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]`;

                  return (
                    <div key={field.name} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor={field.name} className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                          {field.label}
                          {field.required && <span className="text-red-400 ml-1">*</span>}
                        </label>
                        {field.name === 'model' && provider.id === 'ollama' && (
                          <button
                            type="button"
                            onClick={handleFetchModels}
                            disabled={fetchingModels}
                            className="bg-transparent border-none text-[var(--color-text-secondary)] text-[10px] uppercase tracking-[0.18em] cursor-pointer p-0 h-4 flex items-center hover:text-[var(--color-text-primary)] disabled:opacity-50"
                          >
                            {fetchingModels ? 'Fetching...' : 'Fetch Models'}
                          </button>
                        )}
                      </div>
                      {field.type === 'checkbox' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={field.name}
                            checked={formData[field.name] || false}
                            onChange={(e) => handleInputChange(field.name, e.target.checked)}
                            className="h-4 w-4 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] accent-[var(--color-primary)]"
                          />
                          <label htmlFor={field.name} className="text-sm text-[var(--color-text-primary)] cursor-pointer">
                            {field.label}
                          </label>
                        </div>
                      ) : field.type === 'textarea' ? (
                        <textarea
                          id={field.name}
                          rows={4}
                          placeholder={field.placeholder || ''}
                          value={formData[field.name] || ''}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          className={`${inputClass} resize-none`}
                        />
                      ) : field.name === 'model' && provider.id === 'ollama' && availableModels.length > 0 ? (
                        <select
                          id={field.name}
                          value={formData[field.name] || ''}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          className={inputClass}
                        >
                          {availableModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type === 'password' ? 'password' : 'text'}
                          autoComplete={field.type === 'password' ? 'new-password' : undefined}
                          id={field.name}
                          placeholder={field.placeholder || ''}
                          value={formData[field.name] || ''}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          className={inputClass}
                          defaultValue={field.default}
                        />
                      )}
                      {errors[field.name] && (
                        <span className="text-xs text-red-400">{errors[field.name]}</span>
                      )}
                    </div>
                  );
                })}


                {/* Custom Logo Upload */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Custom Logo (Optional)</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload"
                    />
                    <label 
                      htmlFor="logo-upload" 
                      className="flex flex-col items-center justify-center gap-2 px-6 py-6 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-secondary)] cursor-pointer transition-all text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
                    >
                      {customLogo ? (
                        <>
                          <img src={customLogo} alt="Custom logo" className="w-15 h-15 object-contain" />
                          <span>Change Logo</span>
                        </>
                      ) : (
                        <>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                          </svg>
                          <span>Upload Logo</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </form>
              {submitError ? <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-300">{submitError}</div> : null}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] flex gap-3">
          <button 
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all"
            onClick={handleClose}
          >
            Cancel
          </button>
          {selectedProvider && (
            <button 
              className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-on-primary)] transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Attaching...' : 'Attach'}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default AddIntegrationPanel;

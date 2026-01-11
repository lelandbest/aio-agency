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

  const providers = getProvidersByCategory(category);
  const provider = selectedProvider ? getProviderConfig(selectedProvider) : null;

  // Handle form input changes
  const handleInputChange = (fieldName, value) => {
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
  const handleSave = () => {
    if (validateForm()) {
      onSave({
        providerId: selectedProvider,
        category,
        config: formData,
        customLogo,
      });

      // Reset form
      setSelectedProvider(null);
      setFormData({});
      setCustomLogo(null);
      setErrors({});
      onClose();
    }
  };

  // Handle close
  const handleClose = () => {
    setSelectedProvider(null);
    setFormData({});
    setCustomLogo(null);
    setErrors({});
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
          <h2 className="m-0 text-lg font-semibold text-[var(--color-text-primary)]">Add New Integration</h2>
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
                        ? 'border-2 border-blue-500 bg-blue-50 dark:bg-purple-950 text-blue-900 dark:text-blue-100' 
                        : 'border-2 border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-text-secondary)] text-[var(--color-text-primary)]'
                    }`}
                    onClick={() => onCategoryChange(cat.id)}
                  >
                    <span className="flex-1 text-left">{cat.name}</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                      category === cat.id 
                        ? 'bg-purple-200 dark:bg-purple-800 text-blue-900 dark:text-blue-100' 
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
                    className="flex items-center gap-3 px-4 py-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)] cursor-pointer transition-all hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-purple-950 text-left"
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-text-secondary)] hover:text-blue-500 flex-shrink-0">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Configuration Form */}
          {selectedProvider && provider && (
            <div className="flex flex-col">
              {/* Provider Info */}
              <div className="flex items-center gap-3 px-4 py-4 rounded-lg mb-6 bg-[var(--color-bg-secondary)] relative border-l-4" style={{ borderColor: colors.primary || '#3B82F6' }}>
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
              <form className="flex flex-col gap-4">
                {provider.fields.map((field) => (
                  <div key={field.name} className="flex flex-col gap-2">
                    <label htmlFor={field.name} className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {field.label}
                      {field.required && <span className="text-red-600 ml-1">*</span>}
                    </label>
                    {field.type === 'checkbox' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={field.name}
                          checked={formData[field.name] || false}
                          onChange={(e) => handleInputChange(field.name, e.target.checked)}
                          className="w-[18px] h-[18px] cursor-pointer accent-blue-500"
                        />
                        <label htmlFor={field.name} className="text-sm text-[var(--color-text-primary)] cursor-pointer">
                          {field.label}
                        </label>
                      </div>
                    ) : (
                      <input
                        type={field.type}
                        id={field.name}
                        placeholder={field.label}
                        value={formData[field.name] || ''}
                        onChange={(e) => handleInputChange(field.name, e.target.value)}
                        className={`px-3 py-2.5 border rounded transition-all text-sm font-inherit bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] ${
                          errors[field.name] 
                            ? 'border-red-600 focus:outline-none focus:shadow-[0_0_0_3px_rgba(220,38,38,0.1)]' 
                            : 'border-[var(--color-border)] focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]'
                        }`}
                        defaultValue={field.default}
                      />
                    )}
                    {errors[field.name] && (
                      <span className="text-xs text-red-600">{errors[field.name]}</span>
                    )}
                  </div>
                ))}

                {/* Custom Logo Upload */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-[var(--color-text-primary)]">Custom Logo (Optional)</label>
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
                      className="flex flex-col items-center justify-center gap-2 px-6 py-6 border-2 border-dashed border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)] cursor-pointer transition-all hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-purple-950 text-sm font-medium text-[var(--color-text-secondary)] hover:text-blue-500"
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
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] flex gap-3">
          <button 
            className="flex-1 px-4 py-2.5 border border-[var(--color-border)] rounded text-sm font-semibold cursor-pointer transition-all bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
            onClick={handleClose}
          >
            Cancel
          </button>
          {selectedProvider && (
            <button 
              className="flex-1 px-4 py-2.5 border-none rounded text-sm font-semibold cursor-pointer transition-all bg-purple-500 text-white hover:bg-purple-600"
              onClick={handleSave}
            >
              Add Integration
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default AddIntegrationPanel;


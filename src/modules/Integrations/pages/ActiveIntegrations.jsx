import React, { useState, useEffect } from 'react';
import IntegrationCard from '../components/IntegrationCard';
import IntegrationTabs from '../components/IntegrationTabs';
import AddIntegrationPanel from '../components/AddIntegrationPanel';
import { getAllCategories, getProviderConfig, INTEGRATION_CATEGORIES } from '../utils/integrationConfigs';
import { mockSupabase } from '../../../lib/mockSupabase';

/**
 * ActiveIntegrations Page
 * Main dashboard showing all active/connected integrations
 */
export const ActiveIntegrations = () => {
  const [integrations, setIntegrations] = useState([]);
  const [activeCategory, setActiveCategory] = useState(INTEGRATION_CATEGORIES.AUTOMATION);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const categories = getAllCategories();

  // Load integrations from mockSupabase
  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const { data, error } = await mockSupabase.from('integrations').select('*');
      if (error) {
        setError(error);
        setIntegrations([]);
        return;
      }
      setIntegrations(data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading integrations:', err);
      setError('Failed to load integrations');
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  };

  // Get integrations for current category
  const getCategoryIntegrations = () => {
    return integrations.filter((integration) => integration.category === activeCategory);
  };

  // Get count of integrations per category
  const getCategoryCounts = () => {
    const counts = {};
    categories.forEach((cat) => {
      counts[cat.id] = integrations.filter((int) => int.category === cat.id).length;
    });
    return counts;
  };

  // Toggle integration enabled/disabled
  const handleToggleIntegration = async (integrationId) => {
    try {
      const integration = integrations.find((int) => int.id === integrationId);
      if (!integration) return;

      const oldEnabled = integration.enabled;
      const updated = { ...integration, enabled: !integration.enabled };
      
      // Optimistic update
      setIntegrations((prev) =>
        prev.map((int) => (int.id === integrationId ? updated : int))
      );

      // Server update with error handling
      const { data, error } = await mockSupabase.from('integrations').update(integrationId, updated);
      
      if (error) {
        // Rollback on error
        setIntegrations((prev) =>
          prev.map((int) => (int.id === integrationId ? { ...int, enabled: oldEnabled } : int))
        );
        setError(`Failed to update integration: ${error}`);
      }
    } catch (err) {
      console.error('Error toggling integration:', err);
      setError(`Failed to update integration: ${err.message}`);
    }
  };

  // Remove integration
  const handleRemoveIntegration = async (integrationId) => {
    if (!window.confirm('Are you sure you want to remove this integration?')) return;

    try {
      const { data, error } = await mockSupabase.from('integrations').delete(integrationId);
      
      if (error) {
        setError(`Failed to remove integration: ${error}`);
        return;
      }
      
      setIntegrations((prev) => prev.filter((int) => int.id !== integrationId));
      setError(null);
    } catch (err) {
      console.error('Error removing integration:', err);
      setError(`Failed to remove integration: ${err.message}`);
    }
  };

  // Open settings/configuration for an integration
  const handleSettingsIntegration = (integrationId) => {
    // TODO: Implement settings modal
    console.log('Open settings for:', integrationId);
  };

  // Add new integration
  const handleAddIntegration = async (data) => {
    try {
      // Validate required fields
      if (!data.providerId || !data.category) {
        setError('Provider and category are required');
        return;
      }

      const newIntegration = {
        id: Date.now().toString(),
        providerId: data.providerId,
        category: data.category,
        config: data.config,
        customLogo: data.customLogo,
        enabled: true,
        createdAt: new Date().toISOString(),
        configuredAt: new Date().toISOString(),
      };

      const { data: insertedData, error } = await mockSupabase.from('integrations').insert([newIntegration]);
      
      if (error) {
        setError(`Failed to add integration: ${error}`);
        return;
      }

      setIntegrations((prev) => [...prev, newIntegration]);
      setError(null);
      setPanelOpen(false);
    } catch (err) {
      console.error('Error adding integration:', err);
      setError(`Failed to add integration: ${err.message}`);
    }
  };

  const currentCategoryIntegrations = getCategoryIntegrations();
  const categoryCounts = getCategoryCounts();
  const currentCategory = categories.find((cat) => cat.id === activeCategory);

  return (
    <div className="flex flex-col h-full gap-6 p-6 bg-[var(--color-bg-primary)]">
      {/* Page Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="m-0 text-3xl font-bold text-[var(--color-text-primary)]">Integrations</h1>
          <p className="m-0 mt-2 text-sm text-[var(--color-text-secondary)]">
            Manage all your connected integrations and API services
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white border-none rounded font-semibold cursor-pointer hover:bg-purple-600 transition-all"
          onClick={() => setPanelOpen(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add Integration
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-text-secondary)] font-medium">Total Integrations</div>
          <div className="text-2xl font-bold text-[var(--color-text-primary)] mt-2">{integrations.length}</div>
        </div>
        <div className="p-4 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-text-secondary)] font-medium">Active</div>
          <div className="text-2xl font-bold text-green-500 mt-2">
            {integrations.filter((int) => int.enabled).length}
          </div>
        </div>
        <div className="p-4 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-text-secondary)] font-medium">Categories</div>
          <div className="text-2xl font-bold text-[var(--color-text-primary)] mt-2">{categories.length}</div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-4 bg-red-100 dark:bg-red-950 border border-red-500 rounded-lg">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-600 dark:text-red-400">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span className="text-sm text-red-800 dark:text-red-200">{error}</span>
          </div>
          <button
            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-bold text-lg cursor-pointer bg-transparent border-none"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <IntegrationTabs
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        counts={categoryCounts}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="w-8 h-8 border-4 border-[var(--color-border)] border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-[var(--color-text-secondary)]">Loading integrations...</p>
          </div>
        ) : currentCategoryIntegrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-text-secondary)]">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path>
              <path d="M12 6v6"></path>
              <circle cx="12" cy="14" r="1"></circle>
            </svg>
            <h3 className="m-0 text-lg font-semibold text-[var(--color-text-primary)]">No integrations yet</h3>
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">Add your first {currentCategory?.name.toLowerCase()} integration to get started</p>
            <button
              className="mt-2 px-4 py-2 bg-purple-500 text-white border-none rounded font-semibold cursor-pointer hover:bg-purple-600 transition-all"
              onClick={() => setPanelOpen(true)}
            >
              Add {currentCategory?.name} Integration
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentCategoryIntegrations.map((integration) => {
              const provider = getProviderConfig(integration.providerId);
              if (!provider) return null;

              return (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  provider={provider}
                  isEnabled={integration.enabled}
                  onToggle={handleToggleIntegration}
                  onSettings={handleSettingsIntegration}
                  onRemove={handleRemoveIntegration}
                  customLogo={integration.customLogo}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Add Integration Panel */}
      <AddIntegrationPanel
        isOpen={panelOpen}
        category={activeCategory}
        onClose={() => setPanelOpen(false)}
        onSave={handleAddIntegration}
        onCategoryChange={setActiveCategory}
        categories={categories}
      />
    </div>
  );
};

export default ActiveIntegrations;


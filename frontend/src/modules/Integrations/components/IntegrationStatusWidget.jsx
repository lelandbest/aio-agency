import React, { useState, useEffect } from 'react';
import { mockSupabase } from '../../../lib/mockSupabase';

/**
 * IntegrationStatusWidget Component
 * Dashboard widget showing integration status overview
 */
export const IntegrationStatusWidget = ({ onViewAllClick }) => {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load integrations on mount
  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const { data, error } = await mockSupabase.from('integrations').select('*');
      if (error) {
        console.error('Error loading integrations:', error);
        setIntegrations([]);
        return;
      }
      setIntegrations(data || []);
    } catch (err) {
      console.error('Error loading integrations:', err);
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  };

  const totalIntegrations = integrations.length;
  const activeIntegrations = integrations.filter((int) => int.enabled).length;
  const inactiveIntegrations = totalIntegrations - activeIntegrations;

  return (
    <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border)] p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="m-0 text-base font-semibold text-[var(--color-text-primary)]">Integration Status</h3>
        <button
          className="bg-transparent border-none text-blue-500 text-xs font-semibold cursor-pointer hover:text-blue-600 hover:underline px-2 py-1 transition-all"
          onClick={onViewAllClick}
        >
          View All
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-3 border-[var(--color-border)] border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      ) : totalIntegrations === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="m-0 text-sm text-[var(--color-text-secondary)]">No integrations configured yet</p>
          <button
            className="px-4 py-2 bg-purple-500 text-white border-none rounded text-xs font-semibold cursor-pointer hover:bg-purple-600 transition-all"
            onClick={onViewAllClick}
          >
            Set Up Now
          </button>
        </div>
      ) : (
        <>
          {/* Status Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-[var(--color-bg-secondary)] rounded border-l-4 border-[var(--color-border)] text-center">
              <div className="text-xl font-bold text-[var(--color-text-primary)] leading-none">{totalIntegrations}</div>
              <div className="text-xs text-[var(--color-text-secondary)] font-medium mt-1">Total</div>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-950 rounded border-l-4 border-green-500 text-center">
              <div className="text-xl font-bold text-green-700 dark:text-green-300 leading-none">{activeIntegrations}</div>
              <div className="text-xs text-green-700 dark:text-green-300 font-medium mt-1">Active</div>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-950 rounded border-l-4 border-red-500 text-center">
              <div className="text-xl font-bold text-red-700 dark:text-red-300 leading-none">{inactiveIntegrations}</div>
              <div className="text-xs text-red-700 dark:text-red-300 font-medium mt-1">Inactive</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--color-text-secondary)] font-medium">Active Rate</span>
              <span className="text-[var(--color-text-primary)] font-semibold">
                {Math.round((activeIntegrations / totalIntegrations) * 100)}%
              </span>
            </div>
            <div className="h-2 bg-[var(--color-border)] rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300"
                style={{
                  width: `${(activeIntegrations / totalIntegrations) * 100}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Recent Integrations */}
          {integrations.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border)]">
              <h4 className="m-0 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Recent</h4>
              <div className="flex flex-col gap-2">
                {integrations.slice(0, 3).map((integration) => (
                  <div key={integration.id} className="flex items-center gap-2.5 p-2 rounded bg-[var(--color-bg-secondary)] hover:bg-[var(--color-hover)] transition-all">
                    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          integration.enabled
                            ? 'bg-purple-500 animate-pulse'
                            : 'bg-red-500'
                        }`}
                      ></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="m-0 mb-0.5 text-xs font-semibold text-[var(--color-text-primary)] whitespace-nowrap overflow-hidden text-ellipsis capitalize">
                        {integration.providerId}
                      </p>
                      <p className="m-0 text-xs text-[var(--color-text-tertiary)] whitespace-nowrap overflow-hidden text-ellipsis capitalize">
                        {integration.category}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default IntegrationStatusWidget;


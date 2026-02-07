/**
 * Flow Info Panel
 * Right sidebar showing flow metadata and statistics
 * Future: will support context switching (Flow vs Node config)
 */

import React, { useEffect, useState } from 'react';
import { Edit2, User, Clock, Hash, Bot, FileText } from 'lucide-react';
import { mockSupabase } from '../../../services/mockSupabase';
import flowDraftRepository from '../utils/flowDraftRepository';

const FlowInfoPanel = ({
  flow,
  onFlowUpdate,
  libraryContent = null,
  onApplyDraft,
  onInsertFormTrigger,
  showDetails = false,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(flow?.name || 'Untitled Flow');
  const [agents, setAgents] = useState([]);
  const [forms, setForms] = useState([]);
  const [selectedForm, setSelectedForm] = useState(null);

  const handleNameSave = () => {
    onFlowUpdate?.({ name: tempName });
    setIsEditingName(false);
  };

  const handleNameCancel = () => {
    setTempName(flow?.name || 'Untitled Flow');
    setIsEditingName(false);
  };

  useEffect(() => {
    mockSupabase.from('aio_agents').select().then(({ data }) => setAgents(data || []));
    mockSupabase.from('forms').select().then(({ data }) => setForms(data || []));
  }, []);

  useEffect(() => {
    setTempName(flow?.name || 'Untitled Flow');
  }, [flow?.name]);

  if (!flow) return null;

  return (
    <div className="w-80 bg-[var(--color-bg-primary)] border-l border-[var(--color-border)] overflow-hidden flex-shrink-0 flex flex-col">
      {showDetails && (
        <div className="flex-1 bg-[var(--color-bg-secondary)] overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
              Flow Details
            </h2>

            <div className="space-y-6">
              {/* Flow Name */}
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-2 uppercase tracking-wide">
                  Flow Name
                </label>
                {isEditingName ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      className={`
                        w-full px-3 py-2 text-sm font-semibold rounded-lg
                        bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                        text-[var(--color-text-primary)]
                        focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
                        focus:border-transparent
                      `}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNameSave();
                        if (e.key === 'Escape') handleNameCancel();
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleNameSave}
                        className="flex-1 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleNameCancel}
                        className="flex-1 px-3 py-1.5 text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-hover)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between group">
                    <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
                      {flow.name}
                    </h1>
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-[var(--color-hover)] rounded-lg transition-all"
                    >
                      <Edit2 className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                    </button>
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-[var(--color-text-tertiary)] mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-tertiary)]">Created by</p>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {flow.createdBy || 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-[var(--color-text-tertiary)] mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-tertiary)]">Last edited by</p>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {flow.lastEditedBy || 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-[var(--color-text-tertiary)] mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-tertiary)]">Created</p>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {flow.createdAt
                        ? new Date(flow.createdAt).toLocaleDateString()
                        : 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-[var(--color-text-tertiary)] mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-tertiary)]">Last updated</p>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {flow.updatedAt
                        ? new Date(flow.updatedAt).toLocaleDateString()
                        : 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Hash className="w-4 h-4 text-[var(--color-text-tertiary)] mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-tertiary)]">Total nodes</p>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {flow.nodes?.length || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tenant/Brand Context */}
              <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
                <p className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">Tenant / Brand</p>
                <div>
                  <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">Tenant ID</label>
                  <input
                    value={flow.metadata?.tenantId || ''}
                    onChange={(e) => onFlowUpdate?.({ metadata: { ...flow.metadata, tenantId: e.target.value } })}
                    className="w-full px-3 py-2 text-xs rounded bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">Brand</label>
                  <input
                    value={flow.metadata?.brand || ''}
                    onChange={(e) => onFlowUpdate?.({ metadata: { ...flow.metadata, brand: e.target.value } })}
                    className="w-full px-3 py-2 text-xs rounded bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-tertiary)] mb-1">Theme Preset</label>
                  <select
                    value={flow.metadata?.themePreset || ''}
                    onChange={(e) => onFlowUpdate?.({ metadata: { ...flow.metadata, themePreset: e.target.value } })}
                    className="w-full px-3 py-2 text-xs rounded bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
                  >
                    <option value="">Default</option>
                    <option value="AIO">AIO</option>
                    <option value="BLTV">BLTV</option>
                  </select>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {!showDetails && libraryContent && (
        <div className="flex-1 bg-[var(--color-bg-primary)] overflow-y-auto">
          <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Nodes
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              Drag to canvas
            </p>
          </div>
          <div className="p-3">
            {libraryContent}
          </div>
        </div>
      )}

      {selectedForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wide">Form Preview</p>
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  {selectedForm.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedForm(null)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
              >
                x
              </button>
            </div>
            <div className="space-y-3">
              {(selectedForm.schema || []).map((field) => (
                <div key={field.id} className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] rounded-lg p-3">
                  <p className="text-sm text-[var(--color-text-primary)]">{field.label}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{field.type}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setSelectedForm(null)}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onInsertFormTrigger?.(selectedForm);
                  setSelectedForm(null);
                }}
                className="flex-1 px-3 py-2 rounded text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                Use as Trigger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowInfoPanel;

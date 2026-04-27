/**
 * Flow Info Panel
 * Right sidebar showing flow metadata and statistics
 * Future: will support context switching (Flow vs Node config)
 */

import React, { useEffect, useState } from 'react';
import { Edit2, User, Clock, Hash, FileText, Settings } from 'lucide-react';

const FlowInfoPanel = ({
  flow,
  selectedNode = null,
  onFlowUpdate,
  libraryContent = null,
  onApplyDraft,
  onInsertFormTrigger,
  onSaveAsTemplate,
  showDetails = false,
  formsList = [],
  onFetchForms = null,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(flow?.name || 'Untitled Flow');
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
    if (onFetchForms && formsList.length === 0) {
      onFetchForms().catch(() => {});
    }
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
            <div className="space-y-6">
              {/* Selected Node Details Block */}
              {selectedNode && (
                <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg p-3">
                  <h2 className="text-xs font-bold text-[var(--color-text-primary)] mb-3 pb-2 border-b border-[var(--color-border)] uppercase tracking-wide">
                    Active Node
                  </h2>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--color-text-tertiary)] mb-1 uppercase tracking-wide">
                        Node Label
                      </label>
                      <h1 className="text-sm font-semibold text-[var(--color-primary)] truncate">{selectedNode.data?.label || 'Unknown Node'}</h1>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="flex items-start gap-2">
                        <Settings className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">Domain</p>
                          <p className="text-[11px] font-medium text-[var(--color-text-primary)] capitalize truncate">
                            {selectedNode.data?.nodeColor || 'Unknown'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Settings className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">Type</p>
                          <p className="text-[11px] font-medium text-[var(--color-text-primary)] capitalize truncate">
                            {selectedNode.data?.typeLabel || selectedNode.type || 'Standard'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {(selectedNode.data?.templateId || selectedNode.data?.actionType) && (
                      <div className="flex items-start gap-2 pt-2 border-t border-[var(--color-border)]">
                        <Hash className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">Base Identity</p>
                          <p className="text-[10px] font-mono font-medium text-[var(--color-primary)] break-all">
                            {selectedNode.data?.templateId || selectedNode.data?.actionType}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Flow Details Block */}
              <div>
                <h2 className="text-xs font-bold text-[var(--color-text-primary)] mb-3 pb-2 border-b border-[var(--color-border)] uppercase tracking-wide">
                  Flow Settings
                </h2>
                <div className="space-y-5">
                  {/* Flow Name + Total Nodes */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] mb-1 uppercase tracking-wide">
                    Flow Name
                  </label>
                  {isEditingName ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-semibold rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleNameSave();
                          if (e.key === 'Escape') handleNameCancel();
                        }}
                      />
                      <div className="flex gap-2">
                        <button onClick={handleNameSave} className="flex-1 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity">Save</button>
                        <button onClick={handleNameCancel} className="flex-1 px-3 py-1.5 text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-hover)] transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h1 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{flow.name}</h1>
                      <button onClick={() => setIsEditingName(true)} className="p-1 hover:bg-[var(--color-hover)] rounded transition-all flex-shrink-0">
                        <Edit2 className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                      </button>
                    </div>
                  )}
                </div>
                {!isEditingName && (
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-wide font-bold">Total Nodes</p>
                    <p className="text-lg font-black text-[var(--color-text-primary)] leading-none">{flow.nodes?.length || 0}</p>
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
              </div>

              {/* Save as Template */}
              <div className="pt-2">
                <button
                  onClick={() => onSaveAsTemplate?.()}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-[10px] font-black uppercase tracking-widest hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-bg-tertiary)] transition-all shadow-sm"
                >
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  Save as Template
                </button>
              </div>
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

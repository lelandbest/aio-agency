/**
 * Node Config Drawer
 * Right-side drawer panel for configuring selected node
 * Slides in from right, token-first styling
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const NodeConfigDrawer = ({ node, isOpen, onClose, onSave }) => {
  const [config, setConfig] = useState(node?.data?.config || {});

  useEffect(() => {
    setConfig(node?.data?.config || {});
  }, [node]);

  if (!node || !isOpen) return null;

  const handleSave = () => {
    onSave?.(node.id, config);
    onClose();
  };

  const handleInputChange = (field, value) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Render node-type-specific config UI
  const renderConfigForm = () => {
    const nodeType = node.type;

    if (nodeType === 'trigger') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Trigger Event
            </label>
            <select
              value={config.event || ''}
              onChange={(e) => handleInputChange('event', e.target.value)}
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
              `}
            >
              <option value="">Select event...</option>
              <option value="form_submitted">Form Submitted</option>
              <option value="contact_created">Contact Created</option>
              <option value="deal_updated">Deal Updated</option>
              <option value="scheduled">Scheduled Time</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Description
            </label>
            <textarea
              value={config.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe trigger behavior..."
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
                min-h-[100px]
              `}
            />
          </div>
        </div>
      );
    }

    if (nodeType === 'action') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Action Type
            </label>
            <select
              value={config.actionType || ''}
              onChange={(e) => handleInputChange('actionType', e.target.value)}
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
              `}
            >
              <option value="">Select action...</option>
              <option value="send_email">Send Email</option>
              <option value="send_sms">Send SMS</option>
              <option value="store_data">Store Data</option>
              <option value="create_task">Create Task</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Configuration
            </label>
            <textarea
              value={config.configuration || ''}
              onChange={(e) => handleInputChange('configuration', e.target.value)}
              placeholder="Enter action configuration..."
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
                min-h-[100px]
              `}
            />
          </div>
        </div>
      );
    }

    if (nodeType === 'logic') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Logic Type
            </label>
            <select
              value={config.logicType || ''}
              onChange={(e) => handleInputChange('logicType', e.target.value)}
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
              `}
            >
              <option value="">Select logic...</option>
              <option value="if_then">If/Then Condition</option>
              <option value="switch">Switch/Branch</option>
              <option value="filter">Filter Data</option>
            </select>
          </div>
        </div>
      );
    }

    if (nodeType === 'input') {
      const isAiBuilder = node.data.id === 'ai-form-builder';
      
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              {isAiBuilder ? 'AI Form Description' : 'Form Fields'}
            </label>
            <textarea
              value={config.fields || config.prompt || ''}
              onChange={(e) => handleInputChange(isAiBuilder ? 'prompt' : 'fields', e.target.value)}
              placeholder={isAiBuilder 
                ? 'Describe the form you want to create. Example: "Lead capture form with name, email, phone, company, and message fields"' 
                : 'Enter field definitions (JSON)...'}
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
                min-h-[120px]
              `}
            />
          </div>
          
          {isAiBuilder && (
            <>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  Form Name
                </label>
                <input
                  type="text"
                  value={config.formName || ''}
                  onChange={(e) => handleInputChange('formName', e.target.value)}
                  placeholder="My AI Generated Form"
                  className={`
                    w-full px-3 py-2 rounded-lg
                    bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                    text-[var(--color-text-primary)]
                    focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
                  `}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  Target Module
                </label>
                <select
                  value={config.targetModule || ''}
                  onChange={(e) => handleInputChange('targetModule', e.target.value)}
                  className={`
                    w-full px-3 py-2 rounded-lg
                    bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                    text-[var(--color-text-primary)]
                    focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
                  `}
                >
                  <option value="">Select module...</option>
                  <option value="crm">CRM (Create Contact)</option>
                  <option value="pipeline">Pipeline (Create Deal)</option>
                  <option value="comms">Comms (Send Message)</option>
                  <option value="brain">Brain (Save to Memory)</option>
                </select>
              </div>
            </>
          )}
          
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Output Variable Name
            </label>
            <input
              type="text"
              value={config.outputVar || ''}
              onChange={(e) => handleInputChange('outputVar', e.target.value)}
              placeholder="formData"
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
              `}
            />
          </div>
        </div>
      );
    }

    if (node.data?.isSocket) {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Workflow / Scenario ID or URL
            </label>
            <input
              type="text"
              value={config.workflowRef || ''}
              onChange={(e) => handleInputChange('workflowRef', e.target.value)}
              placeholder="workflow-id or https://..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Credential Reference
            </label>
            <input
              type="text"
              value={config.authRef || ''}
              onChange={(e) => handleInputChange('authRef', e.target.value)}
              placeholder="authRef"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Payload Mapping (JSON)
            </label>
            <textarea
              value={config.payloadMap || ''}
              onChange={(e) => handleInputChange('payloadMap', e.target.value)}
              placeholder='{"inputKey": "node.output"}'
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[80px] font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Timeout (ms)</label>
              <input
                type="number"
                value={config.timeout || 30000}
                onChange={(e) => handleInputChange('timeout', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Retry Count</label>
              <input
                type="number"
                value={config.retryCount || 1}
                onChange={(e) => handleInputChange('retryCount', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
          General Configuration
        </label>
        <textarea
          value={config.general || ''}
          onChange={(e) => handleInputChange('general', e.target.value)}
          placeholder="Enter node configuration..."
          className={`
            w-full px-3 py-2 rounded-lg
            bg-[var(--color-bg-primary)] border border-[var(--color-border)]
            text-[var(--color-text-primary)]
            focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
            min-h-[120px]
          `}
        />
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)] shadow-lg z-50 flex flex-col animate-slideIn">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Configure {node.data.label}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--color-text-tertiary)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderConfigForm()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-border)] flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] font-medium text-sm hover:bg-[var(--color-hover)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slideIn {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
};

export default NodeConfigDrawer;

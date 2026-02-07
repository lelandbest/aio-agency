import React, { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';

const NodeConfigPanel = ({ node, onClose, onSave }) => {
  const [config, setConfig] = useState(node.data.config || {});
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    setConfig(node.data.config || {});
  }, [node]);

  const handleSave = () => {
    onSave(node.id, config);
  };

  const handleInputChange = (field, value) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Render different configuration forms based on node type
  const renderConfigForm = () => {
    switch (node.type) {
      case 'trigger':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Trigger Event
              </label>
              <select
                value={config.event || ''}
                onChange={(e) => handleInputChange('event', e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              >
                <option value="">Select event...</option>
                <option value="contact_created">Contact Created</option>
                <option value="deal_won">Deal Won</option>
                <option value="email_opened">Email Opened</option>
                <option value="form_submitted">Form Submitted</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Conditions
              </label>
              <textarea
                value={config.conditions || ''}
                onChange={(e) => handleInputChange('conditions', e.target.value)}
                placeholder="Enter trigger conditions..."
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 min-h-24"
              />
            </div>
          </div>
        );

      case 'action':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Action Type
              </label>
              <select
                value={config.actionType || ''}
                onChange={(e) => handleInputChange('actionType', e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              >
                <option value="">Select action...</option>
                <option value="send_email">Send Email</option>
                <option value="create_task">Create Task</option>
                <option value="update_contact">Update Contact</option>
                <option value="send_sms">Send SMS</option>
              </select>
            </div>

            {config.actionType === 'send_email' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Template
                  </label>
                  <select
                    value={config.template || ''}
                    onChange={(e) => handleInputChange('template', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Select template...</option>
                    <option value="welcome">Welcome Email</option>
                    <option value="followup">Follow-up Email</option>
                    <option value="reminder">Reminder Email</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Recipient
                  </label>
                  <input
                    type="text"
                    value={config.recipient || ''}
                    onChange={(e) => handleInputChange('recipient', e.target.value)}
                    placeholder="email@example.com or {{contact.email}}"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={config.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe this action..."
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 min-h-20"
              />
            </div>
          </div>
        );

      case 'logic':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Condition Type
              </label>
              <select
                value={config.conditionType || ''}
                onChange={(e) => handleInputChange('conditionType', e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              >
                <option value="">Select condition...</option>
                <option value="if_else">If/Else</option>
                <option value="switch">Switch</option>
                <option value="time_delay">Time Delay</option>
                <option value="wait_until">Wait Until</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Logic Rules
              </label>
              <textarea
                value={config.rules || ''}
                onChange={(e) => handleInputChange('rules', e.target.value)}
                placeholder="Define your logic rules..."
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 min-h-32"
              />
            </div>
          </div>
        );

      case 'webhook':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Webhook URL
              </label>
              <input
                type="url"
                value={config.url || ''}
                onChange={(e) => handleInputChange('url', e.target.value)}
                placeholder="https://api.example.com/webhook"
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                HTTP Method
              </label>
              <select
                value={config.method || 'POST'}
                onChange={(e) => handleInputChange('method', e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Headers (JSON)
              </label>
              <textarea
                value={config.headers || ''}
                onChange={(e) => handleInputChange('headers', e.target.value)}
                placeholder='{"Authorization": "Bearer token"}'
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 font-mono text-sm min-h-20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Body (JSON)
              </label>
              <textarea
                value={config.body || ''}
                onChange={(e) => handleInputChange('body', e.target.value)}
                placeholder='{"data": "value"}'
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 font-mono text-sm min-h-32"
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No configuration available for this node type
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Configure Node
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {node.data.label}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'general'
                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-t border-x border-gray-200 dark:border-gray-700'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('advanced')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'advanced'
                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-t border-x border-gray-200 dark:border-gray-700'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            Advanced
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'general' ? (
            renderConfigForm()
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Node Label
                </label>
                <input
                  type="text"
                  value={config.customLabel || node.data.label}
                  onChange={(e) => handleInputChange('customLabel', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Error Handling
                </label>
                <select
                  value={config.errorHandling || 'continue'}
                  onChange={(e) => handleInputChange('errorHandling', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                >
                  <option value="continue">Continue on Error</option>
                  <option value="stop">Stop on Error</option>
                  <option value="retry">Retry on Error</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Timeout (seconds)
                </label>
                <input
                  type="number"
                  value={config.timeout || 30}
                  onChange={(e) => handleInputChange('timeout', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableLogging"
                  checked={config.enableLogging || false}
                  onChange={(e) => handleInputChange('enableLogging', e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label
                  htmlFor="enableLogging"
                  className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Enable detailed logging
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default NodeConfigPanel;

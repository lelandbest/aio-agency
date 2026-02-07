import React, { useState } from 'react';
import { Save, Power, Edit2, User, Clock, Hash } from 'lucide-react';

const AutomationInfoPanel = ({ automationInfo, onUpdate }) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(automationInfo.name);

  const handleNameSave = () => {
    onUpdate({ name: tempName });
    setIsEditingName(false);
  };

  const handleNameCancel = () => {
    setTempName(automationInfo.name);
    setIsEditingName(false);
  };

  const handleStatusToggle = () => {
    const newStatus = automationInfo.status === 'Active' ? 'Draft' : 'Active';
    onUpdate({ status: newStatus });
  };

  return (
    <div className="w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 overflow-y-auto flex-shrink-0">
      <div className="p-6 space-y-6">
        {/* Flow Name */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
            Automation Name
          </label>
          {isEditingName ? (
            <div className="space-y-2">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="w-full px-3 py-2 text-lg font-semibold bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSave();
                  if (e.key === 'Escape') handleNameCancel();
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleNameSave}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={handleNameCancel}
                  className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex-1">
                {automationInfo.name}
              </h1>
              <button
                onClick={() => setIsEditingName(true)}
                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
              >
                <Edit2 className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          )}
        </div>

        {/* Status Badge */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
            Status
          </label>
          <div className="flex items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                automationInfo.status === 'Active'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  automationInfo.status === 'Active'
                    ? 'bg-green-500'
                    : 'bg-gray-400'
                }`}
              />
              {automationInfo.status}
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 text-sm">
            <User className="w-4 h-4 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Created by
              </p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">
                {automationInfo.createdBy}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <User className="w-4 h-4 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last edited by
              </p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">
                {automationInfo.editedBy}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last edited
              </p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">
                {automationInfo.lastEdited}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Hash className="w-4 h-4 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Total nodes
              </p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">
                {automationInfo.nodeCount}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md">
            <Save className="w-4 h-4" />
            Save Changes
          </button>

          <button
            onClick={handleStatusToggle}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors shadow-sm hover:shadow-md ${
              automationInfo.status === 'Active'
                ? 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400'
                : 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400'
            }`}
          >
            <Power className="w-4 h-4" />
            {automationInfo.status === 'Active' ? 'Deactivate' : 'Activate'}
          </button>
        </div>

        {/* Additional Info Section */}
        <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide font-medium">
            Configuration
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                Run on schedule
              </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                Disabled
              </span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">
                Error handling
              </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                Continue
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomationInfoPanel;

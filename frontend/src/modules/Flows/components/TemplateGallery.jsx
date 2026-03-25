/**
 * Template Gallery
 * Pre-built flow templates for quick automation setup
 */

import React, { useState } from 'react';
import { X, Zap, ArrowRight, Clock, Layers } from 'lucide-react';

const templates = [
  {
    id: 'welcome-sequence',
    name: 'Welcome Sequence',
    description: 'New contact onboarding with email sequence',
    category: 'CRM',
    nodes: ['form-trigger', 'email-action', 'delay-action', 'task-action'],
    estimatedTime: '5 min',
  },
  {
    id: 'lead-scorer',
    name: 'Lead Scoring',
    description: 'Automatically score and route leads based on engagement',
    category: 'Automation',
    nodes: ['form-trigger', 'condition-action', 'email-action', 'crm-action'],
    estimatedTime: '8 min',
  },
  {
    id: 'support-triage',
    name: 'Support Triage',
    description: 'Route support requests to the right team',
    category: 'Support',
    nodes: ['form-trigger', 'condition-action', 'slack-action', 'task-action'],
    estimatedTime: '6 min',
  },
  {
    id: 'social-poster',
    name: 'Social Media Poster',
    description: 'Schedule and publish content across platforms',
    category: 'Marketing',
    nodes: ['schedule-trigger', 'ai-action', 'social-action'],
    estimatedTime: '4 min',
  },
  {
    id: 'meeting-booker',
    name: 'Meeting Booker',
    description: 'Handle meeting requests and calendar scheduling',
    category: 'Sales',
    nodes: ['form-trigger', 'calendar-action', 'email-action', 'notification-action'],
    estimatedTime: '7 min',
  },
  {
    id: 'invoice-followup',
    name: 'Invoice Follow-up',
    description: 'Automated payment reminders for overdue invoices',
    category: 'Finance',
    nodes: ['schedule-trigger', 'condition-action', 'email-action', 'task-action'],
    estimatedTime: '5 min',
  },
];

const categoryColors = {
  CRM: 'var(--node-action)',
  Automation: 'var(--node-logic)',
  Support: 'var(--node-trigger)',
  Marketing: 'var(--node-webhook)',
  Sales: 'var(--node-socket)',
  Finance: 'var(--node-input)',
};

const TemplateGallery = ({ isOpen, onClose, onSelectTemplate }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const categories = ['all', ...new Set(templates.map(t => t.category))];

  const filteredTemplates = templates.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Flow Templates</h2>
              <p className="text-[11px] text-[var(--color-text-tertiary)]">Start faster with pre-built automation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--color-text-tertiary)]" />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="p-4 border-b border-[var(--color-border)]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full px-3 py-2 text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] mb-3"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {category === 'all' ? 'All' : category}
              </button>
            ))}
          </div>
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredTemplates.map(template => (
              <button
                key={template.id}
                onClick={() => {
                  onSelectTemplate(template);
                  onClose();
                }}
                className="text-left p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-bg-primary)] transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
                      {template.name}
                    </h3>
                    <span 
                      className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ color: categoryColors[template.category], backgroundColor: `${categoryColors[template.category]}20` }}
                    >
                      {template.category}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)] group-hover:text-[var(--color-primary)] transition-colors" />
                </div>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mb-3 line-clamp-2">
                  {template.description}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-tertiary)]">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {template.nodes.length} nodes
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {template.estimatedTime}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {filteredTemplates.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[13px] text-[var(--color-text-tertiary)]">No templates found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateGallery;

import React, { useState, useMemo } from 'react';
import { Search, Sparkles, Filter, Layers, Info } from 'lucide-react';
import { templates as staticTemplates, categories as staticCategories } from '../data/templates';
import TemplateCard from './TemplateCard';

const TemplateLibraryPanel = ({ onApplyTemplate, onPreviewTemplate, customTemplates = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const allTemplates = useMemo(() => [...customTemplates, ...staticTemplates], [customTemplates]);
  const categories = useMemo(() => {
    if (customTemplates.length > 0) return [...staticCategories, 'My Templates'];
    return staticCategories;
  }, [customTemplates]);

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter(template => {
      const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          template.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesCategory = selectedCategory === 'All' || template.category === selectedCategory;
      if (selectedCategory === 'My Templates') {
        matchesCategory = template.id.startsWith('custom-');
      }
      
      return matchesSearch && matchesCategory;
    });
  }, [allTemplates, searchQuery, selectedCategory]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-primary)] overflow-hidden">
      {/* Header with Search */}
      <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
          <input 
            type="text"
            placeholder="Search marketplace..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]/40 transition-all placeholder:text-[var(--color-text-tertiary)]/60"
          />
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 crm-scroll-hidden">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`whitespace-nowrap px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all border ${
                selectedCategory === category 
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-sm' 
                  : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-tertiary)]/30'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 crm-scroll-hidden pb-20">
        {filteredTemplates.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {filteredTemplates.map(template => (
              <TemplateCard 
                key={template.id} 
                template={template} 
                onApply={onApplyTemplate}
                onPreview={onPreviewTemplate}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center opacity-60">
            <div className="w-12 h-12 rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex items-center justify-center mb-3">
              <Search className="w-5 h-5 text-[var(--color-text-tertiary)]" />
            </div>
            <p className="text-[11px] font-bold text-[var(--color-text-primary)] uppercase tracking-widest">No results found</p>
            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 uppercase tracking-tight">Try adjusting your search or filters</p>
          </div>
        )}

        {/* Footer Info */}
        <div className="pt-6 border-t border-[var(--color-border)]/30">
          <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/10 flex flex-col items-center text-center gap-2">
            <Sparkles className="w-8 h-8 text-sky-400/30" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-secondary)]">Bridge the Gap</p>
            <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-widest leading-relaxed px-4">
              Premium templates arrive weekly via Canonical AI Engine v1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateLibraryPanel;

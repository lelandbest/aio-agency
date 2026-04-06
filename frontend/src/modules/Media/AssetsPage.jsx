import React, { useState } from 'react';
import { ChevronLeft, Image as ImageIcon, FileText, Video, Mic, Globe, Vault, Box, Music } from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';

const ASSET_CATEGORIES = [
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'documents', label: 'DOCUMENTS', icon: FileText },
  { id: 'images', label: 'IMAGES / INFOGRAPHICS', icon: ImageIcon },
  { id: 'transcripts', label: 'TRANSCRIPTS', icon: Mic },
  { id: 'videos', label: 'VIDEOS', icon: Video },
  { id: 'website', label: 'WEBSITE .ZIP', icon: Globe },
];

const AssetsPage = ({ onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState('images');
  const activeCategory = ASSET_CATEGORIES.find(c => c.id === selectedCategory) || ASSET_CATEGORIES[0];
  const CategoryIcon = activeCategory.icon;

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader
        title="Assets"
        leftActions={[
          {
            label: 'Back',
            icon: ChevronLeft,
            onClick: onBack,
            variant: 'secondary',
          },
        ]}
      />
      
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">Asset Discovery</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Browse and manage your creative assets across all categories.
            </p>
          </div>

          <div className="grid grid-cols-6 gap-2 mb-6">
            {ASSET_CATEGORIES.map(category => {
              const Icon = category.icon;
              const isActive = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`
                    flex flex-col items-center gap-1 px-2 py-3 rounded-xl border transition-all
                    ${isActive 
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]' 
                      : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50'
                    }
                  `}
                >
                  <Icon size={18} />
                  <span className="text-[8px] font-bold uppercase tracking-wider text-center leading-tight">
                    {category.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
                  <CategoryIcon size={20} className="text-[var(--color-text-secondary)]" />
                </div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
                  {activeCategory.label}
                </h3>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <Vault size={10} />
                  Vault
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <Box size={10} />
                  Nexus
                </span>
              </div>
            </div>

            <div className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-12 text-center">
              <CategoryIcon size={48} className="mx-auto mb-4 text-[var(--color-text-secondary)] opacity-30" />
              <h4 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">
                {activeCategory.label}
              </h4>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Asset discovery grid coming soon...
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetsPage;

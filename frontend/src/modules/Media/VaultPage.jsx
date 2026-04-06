import React, { useState } from 'react';
import { ChevronLeft, Image as ImageIcon, FileText, Video, Mic, Globe, Vault, Box, Music } from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';

const VAULT_CATEGORIES = [
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'documents', label: 'DOCUMENTS', icon: FileText },
  { id: 'images', label: 'IMAGES / INFOGRAPHICS', icon: ImageIcon },
  { id: 'transcripts', label: 'TRANSCRIPTS', icon: Mic },
  { id: 'videos', label: 'VIDEOS', icon: Video },
  { id: 'website', label: 'WEBSITE .ZIP', icon: Globe },
];

const VaultPage = ({ onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState('images');
  const activeCategory = VAULT_CATEGORIES.find(c => c.id === selectedCategory) || VAULT_CATEGORIES[0];
  const CategoryIcon = activeCategory.icon;

  return (
    <div className="flex flex-col h-full uppercase">
      <ModuleHeader
        title="Vault"
        leftActions={[
          {
            label: 'Back',
            icon: ChevronLeft,
            onClick: onBack,
            variant: 'secondary',
          },
        ]}
      />
      
      <div className="flex-1 overflow-auto p-6 bg-[#070708]">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white mb-1 tracking-widest">VAULT DISCOVERY</h2>
            <p className="text-[10px] text-slate-500 font-mono tracking-[0.2em]">
              BROWSE AND MANAGE YOUR MISSION ASSETS ACROSS ALL CATEGORIES.
            </p>
          </div>

          <div className="grid grid-cols-6 gap-2 mb-6">
            {VAULT_CATEGORIES.map(category => {
              const Icon = category.icon;
              const isActive = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`
                    flex flex-col items-center gap-1 px-2 py-3 rounded-xl border transition-all
                    ${isActive 
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' 
                      : 'border-[#1E2024] bg-black/40 text-slate-500 hover:border-cyan-500/30'
                    }
                  `}
                >
                  <Icon size={18} />
                  <span className="text-[7px] font-bold uppercase tracking-wider text-center leading-tight">
                    {category.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="bg-[#111318] rounded-xl border border-[#1E2024] p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"></div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-black/40 border border-[#1E2024]">
                  <CategoryIcon size={20} className="text-cyan-400" />
                </div>
                <h3 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">
                  {activeCategory.label}
                </h3>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full border border-white/5 bg-black/60 px-2.5 py-1 text-[7px] font-black uppercase tracking-widest text-slate-500">
                  <Vault size={10} className="text-cyan-500" />
                  CORE VAULT
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-white/5 bg-black/60 px-2.5 py-1 text-[7px] font-black uppercase tracking-widest text-slate-500">
                  <Box size={10} className="text-emerald-500" />
                  NEXUS
                </span>
              </div>
            </div>

            <div className="border border-dashed border-[#1E2024] bg-black/20 rounded-xl p-12 text-center">
              <CategoryIcon size={48} className="mx-auto mb-4 text-slate-700 opacity-20" />
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                {activeCategory.label} GATEWAY
              </h4>
              <p className="text-[8px] font-mono text-slate-600 uppercase tracking-[0.3em]">
                VAULT DISCOVERY GRID INITIALIZING...
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultPage;

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Image as ImageIcon, FileText, Video, Mic, Globe, Vault, Box, Music, File } from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { MediaService } from '../../services/media.service';

const VAULT_CATEGORIES = [
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'images', label: 'IMAGES / INFOGRAPHICS', icon: ImageIcon },
  { id: 'videos', label: 'VIDEOS', icon: Video },
];

const VaultPage = ({ onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState('images');
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const activeCategory = VAULT_CATEGORIES.find(c => c.id === selectedCategory) || VAULT_CATEGORIES[0];
  const CategoryIcon = activeCategory.icon;

  useEffect(() => {
    const fetchVaultItems = async () => {
      try {
        const items = await MediaService.getVault();
        // Strict Filter: Allow ONLY media types based on normalized TYPE tag/property
        const mediaOnly = items.filter(item => {
          const type = (item.type || '').toUpperCase();
          const tags = item.tags || [];
          const typeTag = tags.find(t => t.startsWith('TYPE:'))?.replace('TYPE:', '').toUpperCase();
          
          return ['IMAGE', 'VIDEO', 'AUDIO'].includes(type) || ['IMAGE', 'VIDEO', 'AUDIO'].includes(typeTag);
        });
        setMediaItems(mediaOnly);
      } catch (error) {
        console.error('Failed to fetch vault items:', error);
        setMediaItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchVaultItems();
  }, []);

  const _categorizeItem = (item) => {
    const mediaType = (item.mediaType || '').toLowerCase();
    const type = (item.type || '').toLowerCase();
    const tags = item.tags || [];
    const typeTag = tags.find(t => t.startsWith('TYPE:'))?.replace('TYPE:', '').toLowerCase();

    if (mediaType === 'audio' || type === 'audio' || typeTag === 'audio') return 'audio';
    if (mediaType === 'image' || type === 'image' || typeTag === 'image') return 'images';
    if (mediaType === 'video' || type === 'video' || typeTag === 'video' || type === 'render') return 'videos';

    return null;
  };

  const categorizedItems = {
    audio: [],
    images: [],
    videos: [],
  };

  mediaItems.forEach(item => {
    const cat = _categorizeItem(item);
    if (cat && categorizedItems[cat]) {
      categorizedItems[cat].push(item);
    }
  });

  const currentItems = categorizedItems[selectedCategory] || [];

  return (
    <div className="module-root-standard uppercase">
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
      
      <div className="flex-1 overflow-auto p-2 bg-[#070708]">
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
              const count = categorizedItems[category.id]?.length || 0;
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
                  {count > 0 && (
                    <span className="text-[6px] text-slate-600">({count})</span>
                  )}
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

            {loading ? (
              <div className="border border-dashed border-[#1E2024] bg-black/20 rounded-xl p-12 text-center">
                <CategoryIcon size={48} className="mx-auto mb-4 text-slate-700 opacity-20" />
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                  {activeCategory.label} GATEWAY
                </h4>
                <p className="text-[8px] font-mono text-slate-600 uppercase tracking-[0.3em]">
                  VAULT DISCOVERY GRID INITIALIZING...
                </p>
              </div>
            ) : currentItems.length === 0 ? (
              <div className="border border-dashed border-[#1E2024] bg-black/20 rounded-xl p-12 text-center">
                <CategoryIcon size={48} className="mx-auto mb-4 text-slate-700 opacity-20" />
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                  {activeCategory.label} GATEWAY
                </h4>
                <p className="text-[8px] font-mono text-slate-600 uppercase tracking-[0.3em]">
                  NO {activeCategory.label.toUpperCase()} FOUND
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {currentItems.map(item => (
                  <div
                    key={item.assetId}
                    className="group relative bg-black/40 border border-[#1E2024] rounded-lg p-3 hover:border-cyan-500/30 transition-all cursor-pointer"
                  >
                    {item.sourceUrl && (
                      <div className="aspect-square mb-2 rounded bg-black/60 flex items-center justify-center overflow-hidden">
                        {item.mediaType === 'image' ? (
                          <img 
                            src={item.sourceUrl} 
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : item.mediaType === 'audio' ? (
                          <Music size={24} className="text-cyan-500/50" />
                        ) : item.mediaType === 'video' ? (
                          <Video size={24} className="text-cyan-500/50" />
                        ) : (
                          <File size={24} className="text-cyan-500/50" />
                        )}
                      </div>
                    )}
                    <h5 className="text-[8px] font-bold text-slate-300 uppercase truncate leading-tight">
                      {item.title}
                    </h5>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[6px] text-slate-600 uppercase">
                        {item.status}
                      </span>
                      <span className="text-[6px] text-slate-700">•</span>
                      <span className="text-[6px] text-slate-600 uppercase">
                        {item.source}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultPage;

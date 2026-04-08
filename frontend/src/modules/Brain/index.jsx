import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Globe, Link2, Search, Trash2, UploadCloud, ChevronRight, X, Zap, Activity, Rocket, 
  Bot, Workflow, FileText, Lock, Loader2, PenTool, 
  Database, Radio, Share2, Server, GraduationCap, ExternalLink,
  Cpu, User, Shield, ChevronDown, CheckCircle, RefreshCcw, Save, Trash, Code, Table, Presentation, Image, Video,
  Plus, File, Check
} from 'lucide-react';
import { BrainIcon } from '../../components/ui/icons';
import FormEntryModal from '../../components/Modals/FormEntryModal';
import ModuleHeader from '../../components/ModuleHeader';

const CATEGORIES = [
  { id: 'b-doc', label: 'DOC', bin: 'DOC', dbCategory: 'document', icon: FileText, types: ['.pdf', '.docx', '.doc', '.txt', '.rtf', '.odt'] },
  { id: 'b-dig', label: 'DIG', bin: 'DIG', dbCategory: 'digital', icon: Image, types: ['.jpg', '.png', '.svg', '.webp'] },
  { id: 'b-dat', label: 'DAT', bin: 'DAT', dbCategory: 'data', icon: Table, types: ['.csv', '.xls', '.xlsx', '.json'] },
  { id: 'b-ttv', label: 'TTV', bin: 'TTV', dbCategory: 'scribe', icon: Radio, types: ['.mp4', '.mp3', '.wav', '.mov', '.avi'] },
  { id: 'b-hlp', label: 'HLP', bin: 'HLP', dbCategory: 'help', icon: GraduationCap, types: ['.md', '.txt'] }
];

const getCategoryByFile = (filename) => {
  const ext = '.' + filename.split('.').pop().toLowerCase();
  const cat = CATEGORIES.find(c => c.types.includes(ext));
  return cat ? cat.dbCategory : 'document';
};

const getBinByCategory = (dbCategory) => {
  const cat = CATEGORIES.find(c => c.dbCategory === dbCategory);
  return cat ? cat.id : 'b-doc';
};

const COMMS_WORKSPACE_SCALE = 0.75;
const COMMS_PANEL = 'modal-surface rounded-[var(--radius-modal)]';
const COMMS_SUBPANEL = 'surface-elevated rounded-[var(--radius-panel)]';
const COMMS_COLUMN_BG = 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg-secondary)_96%,var(--color-bg-primary)_4%),color-mix(in_srgb,var(--color-bg-primary)_94%,black_6%))]';
const COMMS_MAIN_BG = 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg-secondary)_82%,transparent),color-mix(in_srgb,var(--color-bg-primary)_88%,transparent)_38%,color-mix(in_srgb,var(--color-bg-primary)_94%,transparent))]';
const COMMS_TOOLBAR_PRIMARY = 'rounded-[var(--radius-card)] border border-[var(--color-primary)]/45 bg-[linear-gradient(180deg,rgba(32,71,126,0.28),rgba(12,22,38,0.42))] px-5 text-[var(--color-text-primary)] shadow-island-sm hover:border-[var(--color-primary)]/65 hover:bg-[linear-gradient(180deg,rgba(40,88,154,0.36),rgba(13,24,42,0.48))] transition-all';
const COMMS_TOOLBAR_GHOST = 'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 text-[var(--color-text-secondary)] shadow-island-sm hover:border-[var(--color-primary)]/45 hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-all';
import { 
  getBrainOverviewApi, 
  updateBrainProfileApi, 
  createBrainIngestApi, 
  createBrainLinkApi, 
  createBrainSourceApi,
  probeBrainMcpApi,
  getAiProviderConfigsApi,
  getOllamaModelsApi,
  upsertAiProviderConfigApi,
  getBrainItemsApi,
  getVaultApi,
  createBrainItemApi,
  updateBrainItemApi,
  deleteBrainItemApi,
  getAnalyticsSummaryApi,
  generateReportApi
} from '../../services/backendApi';
import BrainGraphPanel from './BrainGraphPanel';
import TabbedBrainFormModal from './TabbedBrainFormModal';
import { INSIGHT_REPORTS } from './reports';
import { useBrand } from '../../contexts/BrandContext';

const EMPTY_PROFILE = {
  companyName: '',
  mission: '',
  idealCustomer: '',
  valueProp: '',
  brandVoice: '',
  painPoints: '',
  marketingStrategy: '',
  competitors: '',
  differentiation: '',
  workflow: '',
  legalEntity: '',
  primaryBrand: '',
  brandArchitecture: '',
  legacyBrandNotes: '',
  brandUsageRules: '',
};

const SubPanelHeader = ({ title, icon: Icon }) => (
  <div className="flex items-center gap-3 mb-6">
    {Icon && <Icon size={18} className="text-sky-400/80" />}
    <div className="text-[14px] font-black uppercase tracking-[0.4em] text-slate-500 leading-none">{title}</div>
  </div>
);

const FilePickerModal = ({ isOpen, onClose, onIngest }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const handleSync = async () => {
    for (const file of selectedFiles) {
      await onIngest(file);
    }
    setSelectedFiles([]);
    onClose();
  };

  return (
    <div className="overlay-scrim fixed inset-0 z-[5000] flex items-center justify-center p-6">
      <div className={COMMS_PANEL + " w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in duration-300"}>
        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-primary)]/35">
          <div>
            <div className="text-[12px] font-black uppercase tracking-[0.4em] text-[var(--color-text-primary)]">Ingest</div>
            <div className="text-[9px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest mt-1">Multi-source sync</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--color-hover)] rounded-full text-[var(--color-text-tertiary)]">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 flex-1 space-y-6">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-outer)] p-10 flex flex-col items-center justify-center gap-4 hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 transition-all cursor-pointer group shadow-island-sm"
          >
            <UploadCloud size={40} className="text-[var(--color-text-tertiary)] group-hover:text-[var(--color-primary)] transition-colors" />
            <div className="text-center">
              <div className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-secondary)]">Browse files</div>
              <div className="text-[9px] font-medium text-[var(--color-text-tertiary)] mt-1 uppercase">or drop ops files</div>
            </div>
            <input type="file" ref={fileInputRef} hidden multiple onChange={handleFileChange} />
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-2 max-h-[200px] overflow-y-auto no-scrollbar">
              {selectedFiles.map((f, i) => (
                <div key={i} className="surface-tertiary flex items-center gap-3 p-3 rounded-[var(--radius-card)]">
                  <File size={14} className="text-sky-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-[var(--color-text-primary)] truncate uppercase">{f.name}</div>
                    <div className="text-[8px] text-[var(--color-text-tertiary)] font-bold uppercase">{(f.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="p-1 hover:text-red-400 text-[var(--color-text-tertiary)]">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]/30 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all">Cancel</button>
          <button 
            onClick={handleSync}
            disabled={selectedFiles.length === 0}
            className={COMMS_TOOLBAR_PRIMARY + " !px-10 !h-12 !rounded-full disabled:opacity-30 border-transparent"}
          >
            Start Ingest
          </button>
        </div>
      </div>
    </div>
  );
};

const NeuralEngine = ({ activeProviderId, onProviderChange, activeModelId, onModelChange, providers = [] }) => {
  const provider = providers.find(p => p.providerKey === activeProviderId) || { models: [] };
  
  return (
    <div className={COMMS_SUBPANEL + " p-5 flex flex-col gap-4 relative z-[200]"}>
      <SubPanelHeader title="Neural Engine" icon={BrainIcon} />
      <div className="space-y-4">
        <div className="relative">
          <div className="text-[11px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest mb-1.5 ml-1">Provider</div>
          <select 
            value={activeProviderId}
            onChange={(e) => onProviderChange(e.target.value)}
            className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-4 py-3 text-[13px] font-black uppercase tracking-widest text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]/40 transition-all cursor-pointer shadow-island-sm appearance-none"
          >
            {providers.filter(p => p.apiKeyPresent || p.providerKey === 'ollama' || p.isConnected).map(p => (
              <option key={p.providerKey} value={p.providerKey} className="bg-[var(--color-bg-secondary)] text-sm italic">{p.label || p.providerKey}</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-4 top-[38px] text-[var(--color-text-tertiary)] pointer-events-none" />
        </div>
        <div className="relative">
          <div className="text-[11px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest mb-1.5 ml-1">Model</div>
          <select 
            value={activeModelId}
            onChange={(e) => onModelChange(e.target.value)}
            className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-4 py-3 text-[13px] font-black uppercase tracking-widest text-[var(--color-text-primary)] outline-none focus:border-sky-500/40 transition-all cursor-pointer shadow-[var(--shadow-base)] appearance-none"
          >
            {provider.models?.length > 0 ? provider.models.map(m => (
              <option key={m} value={m} className="bg-[var(--color-bg-tertiary)] text-sm italic">{m}</option>
            )) : provider.model ? (
              <option key={provider.model} value={provider.model} className="bg-[var(--color-bg-tertiary)] text-sm italic">{provider.model}</option>
            ) : (
              <option key="default" value="" className="bg-[var(--color-bg-tertiary)] text-sm italic">Select Provider First</option>
            )}
          </select>
          <ChevronDown size={16} className="absolute right-4 top-[38px] text-[var(--color-text-tertiary)] pointer-events-none" />
        </div>
      </div>
    </div>
  );
};

const EditAssetModal = ({ item, isOpen, onClose, onUpdate }) => {
  const [title, setTitle] = useState(item?.title || item?.label || '');
  const [category, setCategory] = useState(item?.category || 'document');

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdate(item.id, { title, category });
    onClose();
  };

  return (
    <div className="overlay-scrim fixed inset-0 z-[7000] flex items-center justify-center p-6" onClick={onClose}>
      <div className={COMMS_PANEL + " w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in duration-200"} onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-primary)]/35">
           <div className="text-[12px] font-black uppercase tracking-[0.3em] text-sky-400">Edit Asset Metadata</div>
           <button onClick={onClose} className="p-2 hover:bg-[var(--color-hover)] rounded-full text-[var(--color-text-tertiary)]"><X size={18} /></button>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] ml-1">Asset Title</label>
            <input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-4 py-3 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-sky-500/40"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] ml-1">Cortex Bucket (Category)</label>
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-4 py-3 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-sky-500/40 appearance-none uppercase tracking-widest font-black"
            >
              {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
            </select>
          </div>
        </div>
        <div className="p-6 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]/30 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-secondary)]">Cancel</button>
          <button onClick={handleSave} className="px-8 py-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] text-[var(--color-text-on-primary)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--color-primary-hover)] transition-all shadow-island-sm">Persist Changes</button>
        </div>
      </div>
    </div>
  );
};

const CortexCategoryModal = ({ category, items, isOpen, onClose, onDelete, onUpdate }) => {
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  
  if (!isOpen) return null;

  // Partition items into Uploads vs Internal Intel (Help Docs)
  const allFiltered = items.filter(i => {
    const itemCat = i.category?.toLowerCase();
    const targetCat = category.dbCategory?.toLowerCase();
    if (category.id === 'b-doc') {
      return itemCat === 'document' || itemCat === 'help';
    }
    return itemCat === targetCat;
  });

  const uploads = allFiltered.filter(i => i.category !== 'help');
  const internal = allFiltered.filter(i => i.category === 'help');

  const handleNavigateHelp = (item) => {
    window.dispatchEvent(new CustomEvent('aio:navigate', { 
      detail: { module: 'aio-help' } 
    }));
    onClose();
  };

  const renderTableRows = (rowItems, sectionLabel = null) => {
    if (rowItems.length === 0 && !sectionLabel) return null;
    
    return (
      <>
        {sectionLabel && rowItems.length > 0 && (
          <tr className="bg-white/[0.02]">
            <td colSpan="4" className="py-3 px-4 text-[9px] font-black uppercase tracking-[0.3em] text-sky-400/60 border-y border-white/5">{sectionLabel}</td>
          </tr>
        )}
        {rowItems.map(item => {
          const isInternal = item.category === 'help';
          return (
            <tr 
              key={item.id} 
              onClick={() => setSelectedItem(item)}
              className="group hover:bg-white/[0.03] transition-all duration-300 cursor-pointer"
            >
              <td className="py-5 text-[14px] font-black text-slate-300 uppercase tracking-widest group-hover:text-sky-400 transition-colors">
                <div className="flex items-center gap-3">
                  {isInternal && <GraduationCap size={14} className="text-sky-500" />}
                  {item.title || item.label}
                </div>
              </td>
              <td className="py-5">
                <span className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                  isInternal ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-sky-500/10 border-sky-500/20 text-sky-500'
                }`}>
                  {isInternal ? 'Internal Intel' : (item.category || item.type || 'Generic')}
                </span>
              </td>
              <td className="py-5 text-[11px] text-slate-500 font-bold uppercase tracking-widest">{item.timestamp || 'Recent'}</td>
              <td className="py-5 text-right">
                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   {isInternal ? (
                     <button 
                       onClick={(e) => { e.stopPropagation(); handleNavigateHelp(item); }} 
                       className="p-2 text-sky-400 hover:text-white transition-colors bg-sky-500/10 rounded-lg border border-sky-500/20 hover:bg-sky-500/30"
                       title="View in Help Docs"
                     >
                       <ExternalLink size={16} />
                     </button>
                   ) : (
                     <>
                       <button 
                         onClick={(e) => { e.stopPropagation(); setEditingItem(item); }} 
                         className="p-2 text-slate-600 hover:text-sky-400 transition-colors bg-white/5 rounded-lg border border-white/5 hover:border-sky-500/30"
                         title="Edit Asset"
                       >
                         <PenTool size={16} />
                       </button>
                       <button 
                         onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} 
                         className="p-2 text-slate-600 hover:text-red-500 transition-colors bg-white/5 rounded-lg border border-white/5 hover:border-red-500/30"
                         title="Delete Asset"
                       >
                         <Trash2 size={16} />
                       </button>
                     </>
                   )}
                </div>
              </td>
            </tr>
          );
        })}
      </>
    );
  };

  return (
    <>
      <div className="overlay-scrim fixed inset-0 z-[9999] flex items-center justify-center p-6" onClick={onClose}>
        <div className={COMMS_PANEL + " w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in duration-300"} onClick={e => e.stopPropagation()}>
          <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-primary)]/35">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[0_0_20px_rgba(56,189,248,0.15)]">
                <category.icon size={24} />
              </div>
              <div>
                <div className="text-[16px] font-black uppercase tracking-[0.5em] text-[var(--color-text-primary)]">{category.bin} Operations</div>
                <div className="text-[10px] font-bold text-sky-500/60 uppercase tracking-widest mt-1">{category.label} Ingest Queue</div>
              </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-[var(--color-hover)] rounded-full text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-all">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-x-auto p-8 no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="pb-5 text-[11px] font-black uppercase tracking-[0.3em] text-[var(--color-text-tertiary)]">Signal Identifier</th>
                  <th className="pb-5 text-[11px] font-black uppercase tracking-[0.3em] text-[var(--color-text-tertiary)]">Asset Bin</th>
                  <th className="pb-5 text-[11px] font-black uppercase tracking-[0.3em] text-[var(--color-text-tertiary)]">Temporal Stamp</th>
                  <th className="pb-5 text-right text-[11px] font-black uppercase tracking-[0.3em] text-[var(--color-text-tertiary)]">Operational Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {renderTableRows(uploads, uploads.length > 0 && internal.length > 0 ? "Operational Uploads" : null)}
                {renderTableRows(internal, uploads.length > 0 && internal.length > 0 ? "Internal Cortex" : null)}
                
                {allFiltered.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-24 text-center">
                      <div className="flex flex-col items-center gap-4 text-slate-600">
                        <category.icon size={48} className="opacity-10" />
                        <div className="text-[12px] font-black uppercase tracking-[0.3em]">No assets detected in this pathway</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedItem && (
        <div className="overlay-scrim fixed inset-0 z-[6000] flex items-center justify-center p-12" onClick={() => setSelectedItem(null)}>
          <div className={COMMS_PANEL + " w-full max-w-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300"} onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-primary)]/35">
              <div>
                <div className="text-[12px] font-black uppercase tracking-[0.4em] text-sky-400">
                  {selectedItem.category === 'help' ? 'System Knowledge' : 'Database Entry'}
                </div>
                <div className="text-[20px] font-black text-[var(--color-text-primary)] uppercase tracking-widest mt-1">{selectedItem.title || selectedItem.label}</div>
              </div>
              <button onClick={() => setSelectedItem(null)} className="p-3 hover:bg-[var(--color-hover)] rounded-full text-[var(--color-text-tertiary)]"><X size={24} /></button>
            </div>
            <div className="p-8 space-y-8 overflow-y-auto no-scrollbar max-h-[70vh]">
              {selectedItem.category === 'help' ? (
                <div className="p-10 rounded-[2.5rem] bg-sky-500/5 border border-sky-500/10 flex flex-col items-center gap-8 text-center">
                  <div className="p-8 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 shadow-[0_0_50px_rgba(56,189,248,0.1)]">
                    <GraduationCap size={64} />
                  </div>
                  <div className="space-y-4">
                    <div className="text-[14px] font-black uppercase tracking-[0.4em] text-slate-100">Internal Documentation Pathway</div>
                    <div className="text-[11px] text-slate-400 max-w-sm leading-relaxed font-medium uppercase tracking-widest">
                      This asset is part of the core AIO Help & Knowledge layer. Operational controls are managed within the Help Docs module.
                    </div>
                  </div>
                  <button 
                    onClick={() => handleNavigateHelp(selectedItem)}
                    className={COMMS_TOOLBAR_PRIMARY + " !h-14 !px-12 !rounded-full !text-[11px] font-black uppercase tracking-[0.3em] flex items-center gap-3 transition-all hover:scale-105 active:scale-95"}
                  >
                    Enter Help Module <ExternalLink size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="surface-tertiary p-4 rounded-[var(--radius-card)]">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">Relocate to Bin</div>
                      <select 
                        value={getBinByCategory(selectedItem.category || 'document')}
                        onChange={(e) => {
                          const newCat = CATEGORIES.find(c => c.id === e.target.value);
                          onUpdate(selectedItem.id, { category: newCat?.dbCategory || 'document' });
                          setSelectedItem(prev => ({ ...prev, category: newCat?.dbCategory || 'document' }));
                        }}
                        className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-[11px] font-black uppercase tracking-widest text-sky-400 outline-none"
                      >
                        {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.bin}</option>)}
                      </select>
                    </div>
                    <div className="surface-tertiary p-4 rounded-[var(--radius-card)]">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">Internal UID</div>
                      <div className="text-[11px] font-mono text-[var(--color-text-primary)] truncate">{selectedItem.id}</div>
                    </div>
                  </div>

                  {/* Media Preview / Content Editor */}
                  <div className="surface-base p-6 rounded-[var(--radius-panel)]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--color-text-primary)]">Live Asset View</div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={async () => {
                            await onUpdate(selectedItem.id, { content: selectedItem.content });
                          }}
                          className="px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[9px] font-black text-sky-400 hover:bg-sky-500/20 transition-all uppercase tracking-widest"
                        >
                          Persist Seed
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Image Preview */}
                      {(selectedItem.content?.startsWith('data:image') || selectedItem.title?.match(/\.(jpeg|jpg|gif|png|webp)$/i)) ? (
                        <div className="surface-tertiary aspect-video w-full rounded-[var(--radius-card)] overflow-hidden flex items-center justify-center">
                          <img src={selectedItem.content} alt="Asset Preview" className="max-w-full max-h-full object-contain shadow-2xl" />
                        </div>
                      ) : null}

                      {/* Video Player */}
                      {selectedItem.title?.match(/\.(mp4|mov|avi)$/i) && selectedItem.content && (
                        <div className="surface-tertiary aspect-video w-full rounded-[var(--radius-card)] overflow-hidden">
                          <video src={selectedItem.content} controls className="w-full h-full" />
                        </div>
                      )}

                      {/* Audio Player */}
                      {selectedItem.title?.match(/\.(mp3|wav)$/i) && selectedItem.content && (
                        <div className="surface-tertiary w-full rounded-[var(--radius-card)] p-4">
                          <audio src={selectedItem.content} controls className="w-full" />
                        </div>
                      )}

                      {/* PDF Stub / AI Summary */}
                      {selectedItem.title?.match(/\.(pdf|docx|doc|xls|xlsx|rtf|odt)$/i) && (
                        <div className="surface-tertiary p-6 rounded-[var(--radius-card)]">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Document Extract</div>
                            <div className="text-[8px] font-black uppercase tracking-widest text-amber-500/60">Extraction Pending</div>
                          </div>
                          <div className="text-[11px] text-[var(--color-text-secondary)] font-mono leading-relaxed">
                            {selectedItem.content || `[DOCUMENT STUB] Content from '${selectedItem.title}' - queued for AI extraction and summarization.`}
                          </div>
                        </div>
                      )}

                      {/* Text/JSON/HTML Editor */}
                      {selectedItem.title?.match(/\.(txt|json|html|md|csv|xml)$/i) && (
                        <textarea 
                          value={selectedItem.content || ''}
                          onChange={(e) => setSelectedItem(prev => ({ ...prev, content: e.target.value }))}
                          className="w-full h-[250px] bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] p-4 text-[12px] font-mono text-[var(--color-text-secondary)] outline-none focus:border-sky-500/40 no-scrollbar resize-none font-medium leading-relaxed"
                          placeholder="Content notes..."
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-[10px] font-black text-green-500 uppercase tracking-widest">Validated Protocol</div>
                    <div className="px-4 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[10px] font-black text-sky-400 uppercase tracking-widest">SQLite Sync Active</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {editingItem && (
        <EditAssetModal 
          item={editingItem} 
          isOpen={!!editingItem} 
          onClose={() => setEditingItem(null)} 
          onUpdate={onUpdate} 
        />
      )}
    </>
  );
};

const SourceNexus = ({ onIngestFile, onSyncLink, onProbeMcp }) => {
  const [activeTab, setActiveTab] = useState('files');
  const [linkInput, setLinkInput] = useState('');
  const [mcpInput, setMcpInput] = useState('');
  const [dragCategory, setDragCategory] = useState(null);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [requestTranscription, setRequestTranscription] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  
  const fileInputRef = useRef(null);

  const isAVFile = (file) => {
    if (!file) return false;
    const ext = file.name.split('.').pop().toLowerCase();
    return ['mp4', 'mp3', 'wav', 'mov', 'avi'].includes(ext);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragCategory('general');
  };

  return (
    <div className={COMMS_SUBPANEL + " flex flex-col h-[400px] overflow-hidden relative z-40"}>
      <div className="p-1 border-b border-white/5 bg-black/20 flex gap-1.5 justify-center">
        {['files', 'web', 'mcp'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`${activeTab === tab ? COMMS_TOOLBAR_PRIMARY : COMMS_TOOLBAR_GHOST} h-9 px-2 text-[10px] font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center whitespace-nowrap min-w-[80px]`}>
            {tab === 'files' ? 'File Ingest' : tab === 'web' ? 'Web Ingest' : 'MCP Link'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-2">
        {activeTab === 'files' && (
          <div className="h-full flex flex-col">
            <div 
              className={`flex-1 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-6 transition-all cursor-pointer group relative overflow-hidden ${dragCategory ? 'bg-sky-500/15 border-sky-400 shadow-[0_0_40px_rgba(56,189,248,0.15)]' : 'border-slate-800 bg-black/40 hover:border-sky-500/40 hover:bg-white/[0.02]'}`}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragCategory(null)}
              onDrop={(e) => { 
                e.preventDefault(); 
                setDragCategory(null); 
                const file = e.dataTransfer.files[0];
                if (!file) return;
                setPendingFile(file);
                if (!isAVFile(file)) {
                  onIngestFile(file, false);
                  setPendingFile(null);
                }
              }}
              onClick={() => {
                if (pendingFile && isAVFile(pendingFile)) {
                  onIngestFile(pendingFile, requestTranscription);
                  setPendingFile(null);
                  setRequestTranscription(false);
                } else if (pendingFile) {
                  onIngestFile(pendingFile, false);
                  setPendingFile(null);
                } else {
                  fileInputRef.current?.click();
                }
              }}
            >
              <div className="flex flex-col items-center gap-6 pointer-events-none z-10">
                <div className={`p-8 rounded-full bg-slate-900/50 border border-slate-700/50 shadow-2xl transition-all duration-500 ${dragCategory ? 'scale-110 border-sky-400/50' : 'group-hover:scale-105'}`}>
                  <UploadCloud size={48} className={`transition-all duration-500 ${dragCategory ? 'text-sky-400 animate-bounce' : 'text-slate-600 group-hover:text-sky-400/80'}`} />
                </div>
                <div className="text-center space-y-2">
                  <div className="flex flex-col items-center leading-tight">
                    <div className="text-[20px] font-black uppercase tracking-[0.5em] text-slate-100/90 selection:bg-sky-500/20 font-ethnocentric">Nexus</div>
                    <div className="text-[14px] font-black uppercase tracking-[0.4em] text-slate-400 group-hover:text-slate-300 transition-colors">Drop Zone</div>
                  </div>
                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] group-hover:text-slate-500 transition-colors">Drop assets or paste JSON/raw data</div>
                </div>

                {pendingFile && isAVFile(pendingFile) && (
                  <div className="mt-4 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <input 
                      type="checkbox" 
                      id="transcribe-toggle"
                      checked={requestTranscription}
                      onChange={(e) => setRequestTranscription(e.target.checked)}
                      className="accent-sky-500 h-4 w-4 bg-slate-900 border-slate-700"
                    />
                    <label htmlFor="transcribe-toggle" className="text-[10px] font-black uppercase tracking-widest text-sky-400 cursor-pointer">Transcribe & Store in Unison</label>
                  </div>
                )}
              </div>

              {/* Background Glow */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.03),transparent_70%)] pointer-events-none" />
              
              <textarea 
                placeholder="PROMPT / DATA INPUT"
                className="absolute inset-0 w-full h-full bg-slate-900/90 border-0 outline-none text-[13px] text-sky-400 p-12 resize-none font-mono no-scrollbar opacity-0 focus:opacity-100 transition-opacity z-20 placeholder:text-slate-700 text-center flex items-center justify-center"
                onChange={(e) => {
                  const file = new File([e.target.value], "pasted-content.txt", {type: "text/plain"});
                  setPendingFile(file);
                }}
                onBlur={(e) => { 
                  if(e.target.value) { 
                    onIngestFile(new File([e.target.value], "pasted-content.txt", {type: "text/plain"}), requestTranscription); 
                    e.target.value = ""; 
                    setPendingFile(null);
                    setRequestTranscription(false);
                  } 
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            
            <div className="mt-3 flex justify-center">
              <div className="px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-[9px] font-black text-sky-400 uppercase tracking-widest">Extension Aware</div>
            </div>
          </div>
        )}

        {activeTab === 'web' && (
          <div className="space-y-4 p-4">
            <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em]">Target Extraction URL</div>
            <div className="flex gap-2">
              <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)} placeholder="https://..." className="flex-1 bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-sky-500/40" />
              <button onClick={() => { onSyncLink(linkInput); setLinkInput(''); }} className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20"><Link2 size={16} /></button>
            </div>
          </div>
        )}

        {activeTab === 'mcp' && (
          <div className="space-y-4 p-4">
            <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em]">MCP Server Protocol</div>
            <div className="flex gap-2">
              <input value={mcpInput} onChange={(e) => setMcpInput(e.target.value)} placeholder="mcp://..." className="flex-1 bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-sky-500/40" />
              <button onClick={() => { onProbeMcp(mcpInput); setMcpInput(''); }} className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20"><Server size={16} /></button>
            </div>
          </div>
        )}
      </div>

      <FilePickerModal isOpen={showFilePicker} onClose={() => setShowFilePicker(false)} onIngest={onIngestFile} />
    </div>
  );
};

const SavedIntelligence = ({ items, vaultItems = [], onSelectCategory }) => {
  const getCount = (catId) => {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return 0;
    
    return items.filter(i => {
      const itemCat = i.category?.toLowerCase();
      const targetCat = cat.dbCategory?.toLowerCase();
      // Combine Help docs with DOC bin count
      if (catId === 'b-doc') {
        return itemCat === 'document' || itemCat === 'help';
      }
      return itemCat === targetCat;
    }).length;
  };

  const getVaultCount = (type) => {
    if (type === 'media') {
      return vaultItems.filter(v => v.mediaType === 'audio' || v.mediaType === 'video').length;
    }
    if (type === 'transcript') {
      return vaultItems.filter(v => v.artifactType === 'transcript' || v.type === 'transcript').length;
    }
    return 0;
  };

  const total = items.length;
  const getStatus = () => {
    if (total === 0) return 'RECON READY (EMPTY)';
    if (total <= 20) return 'INTEL ENGAGED';
    if (total <= 50) return 'SIGNAL ACCUMULATING';
    if (total <= 100) return 'OPERATIONAL LIMIT';
    return 'ARCHIVE PROTOCOL REQ\'D';
  };
  
  const status = getStatus();
  const statusColor = total === 0 ? 'text-slate-600' : total > 50 ? 'text-magenta-500' : 'text-sky-400';

  return (
    <div className={COMMS_SUBPANEL + " p-5 flex-1 flex flex-col min-h-0 relative z-30 overflow-hidden"}>
      <SubPanelHeader title="Cortex" icon={Lock} />
      
      <div className="grid grid-cols-2 gap-2 flex-none mt-2">
        {CATEGORIES.filter(c => c.id !== 'b-hlp').map(cat => {
          const count = getCount(cat.id);
          const isGhost = count === 0;
          return (
            <button 
              key={cat.id}
              onClick={() => onSelectCategory(cat)}
              className={`
                flex flex-col items-center justify-center p-3 rounded-2xl border transition-all group
                ${isGhost 
                  ? 'bg-slate-900/10 border-slate-800/30 opacity-30 grayscale' 
                  : 'bg-white/[0.03] border-white/5 hover:border-sky-500/40 hover:bg-sky-500/5 shadow-lg'}
              `}
            >
              <cat.icon size={20} className={isGhost ? 'text-slate-500' : 'text-sky-300 group-hover:scale-110 transition-transform'} />
              <div className="mt-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-slate-200 transition-colors uppercase">{cat.label}</div>
              <div className="mt-0.5 text-[12px] font-black text-slate-200">{count}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
         <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-2">Vault Statistics (Studio)</div>
         <div className="grid grid-cols-2 gap-2">
            <div className="surface-tertiary p-3 rounded-xl border border-white/5 flex flex-col items-center">
              <Video size={14} className="text-magenta-400 mb-1" />
              <div className="text-[14px] font-black text-slate-200">{getVaultCount('media')}</div>
              <div className="text-[7px] font-black uppercase tracking-widest text-slate-500">Media Assets</div>
            </div>
            <div className="surface-tertiary p-3 rounded-xl border border-white/5 flex flex-col items-center">
              <FileText size={14} className="text-sky-400 mb-1" />
              <div className="text-[14px] font-black text-slate-200">{getVaultCount('transcript')}</div>
              <div className="text-[7px] font-black uppercase tracking-widest text-slate-500">Transcripts</div>
            </div>
         </div>
      </div>

      <div className="mt-auto pt-4 border-t border-white/5 flex justify-center">
        <div className={`text-[9px] font-black uppercase tracking-[0.3em] ${statusColor} animate-pulse`}>{status}</div>
      </div>
    </div>
  );
};

const generateTemplateReport = (reportId, analytics) => {
  const { crm, comms, ai } = analytics || {};
  const c = crm || {};
  const com = comms || {};
  const aiData = ai || {};
  
  const formatStage = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const safeNum = (n) => typeof n === 'number' ? n : 0;
  
  const lines = ['[ANALYSIS COMPLETE]\n'];
  
  switch (reportId) {
    case 'brand-avatar':
      lines.push(`[CRM TELEMETRY] ${safeNum(c.totalContacts)} contacts analyzed`);
      if (c.sources && Object.keys(c.sources).length > 0) {
        const topSource = Object.entries(c.sources).sort((a, b) => b[1] - a[1])[0];
        lines.push(`Top Source: ${topSource[0]} (${topSource[1]} contacts)`);
      }
      if (c.scoreDistribution) {
        lines.push(`Lead Quality: ${safeNum(c.scoreDistribution['90+'])} hot, ${safeNum(c.scoreDistribution['70-89'])} warm, ${safeNum(c.scoreDistribution['50-69'])} cool`);
      }
      if (c.recentContacts?.length > 0) {
        lines.push(`Latest Entry: ${c.recentContacts[0].name || c.recentContacts[0].email || 'Unknown'}`);
      }
      lines.push('\n[STRATEGY] Focus on high-score leads for immediate conversion. Diversify lead sources to reduce concentration risk.');
      break;
      
    case 'awareness-attention':
      lines.push(`[FUNNEL STATS] ${safeNum(c.totalDeals)} deals in pipeline`);
      if (c.stages) {
        const activeStages = Object.entries(c.stages).filter(([k]) => k !== 'Closed Won' && k !== 'Closed Lost');
        lines.push(`Active Stages: ${activeStages.map(([k, v]) => `${formatStage(k)}: ${v}`).join(', ')}`);
      }
      lines.push(`[ENGAGEMENT] ${safeNum(com.totalThreads)} communication threads`);
      if (com.activeThreads !== undefined) {
        lines.push(`Active: ${com.activeThreads}, Archived: ${com.archivedThreads}`);
      }
      lines.push('\n[STRATEGY] Optimize top-of-funnel. Increase engagement on stalled deals. Re-engage archived conversations.');
      break;
      
    case 'content-performance':
      lines.push(`[DEAL VALUE] Total pipeline value: $${Object.values(c.stageValues || {}).reduce((a, b) => a + safeNum(b), 0).toLocaleString()}`);
      if (c.stages && c.stageValues) {
        const stageData = Object.entries(c.stages).map(([stage, count]) => ({
          stage: formatStage(stage),
          count,
          value: safeNum(c.stageValues[stage])
        }));
        lines.push('Pipeline Breakdown:');
        stageData.forEach(s => lines.push(`  ${s.stage}: ${s.count} deals, $${s.value.toLocaleString()}`));
      }
      lines.push('\n[STRATEGY] Focus on high-value stages. Track conversion rates between stages. Identify bottlenecks.');
      break;
      
    case 'offer-conversion':
      lines.push(`[CONVERSION METRICS] ${safeNum(c.totalDeals)} deals tracked`);
      if (c.stages) {
        const won = safeNum(c.stages['Closed Won'] || 0);
        const lost = safeNum(c.stages['Closed Lost'] || 0);
        const total = won + lost;
        const rate = total > 0 ? Math.round((won / total) * 100) : 0;
        lines.push(`Win Rate: ${rate}% (${won} won / ${lost} lost)`);
      }
      if (c.qualityDistribution) {
        lines.push(`Quality Distribution: ${JSON.stringify(c.qualityDistribution)}`);
      }
      lines.push('\n[STRATEGY] Analyze lost deals for patterns. Improve follow-up timing. Test offer variations.');
      break;
      
    case 'customer-journey':
      lines.push(`[JOURNEY MAP] ${safeNum(c.totalContacts)} customer touchpoints`);
      if (c.recentContacts?.length > 0) {
        lines.push(`Recent Journey Sample: ${c.recentContacts.slice(0, 3).map(x => x.name || x.email).join(', ')}`);
      }
      if (c.engagementDistribution) {
        lines.push(`Engagement Levels: ${JSON.stringify(c.engagementDistribution)}`);
      }
      lines.push('\n[STRATEGY] Map common journey patterns. Identify friction points. Optimize automation triggers.');
      break;
      
    case 'market-intelligence':
      lines.push(`[MARKET SIGNALS] ${safeNum(c.totalContacts)} contacts in database`);
      if (c.sources) {
        lines.push(`Lead Sources: ${Object.entries(c.sources).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
      }
      lines.push(`[COMPETITIVE] ${safeNum(com.totalThreads)} active conversations`);
      lines.push('\n[STRATEGY] Monitor source effectiveness. Track emerging channels. Analyze competitor mentions in conversations.');
      break;
      
    case 'competitive-intelligence':
      lines.push(`[COMPETITOR DATA] ${safeNum(c.totalContacts)} contacts analyzed`);
      if (c.qualityDistribution) {
        lines.push(`Quality Segmentation: ${Object.entries(c.qualityDistribution).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
      }
      lines.push(`[DISPATCH] ${safeNum(com.activeThreads)} active threads`);
      lines.push('\n[STRATEGY] Identify positioning gaps. Benchmark against industry standards. Find blue ocean opportunities.');
      break;
      
    case 'service-performance':
      lines.push(`[SERVICE METRICS] ${safeNum(c.totalDeals)} active projects/deals`);
      if (c.stageValues) {
        const topStage = Object.entries(c.stageValues).sort((a, b) => safeNum(b[1]) - safeNum(a[1]))[0];
        if (topStage) lines.push(`Highest Value Stage: ${formatStage(topStage[0])} ($${safeNum(topStage[1]).toLocaleString()})`);
      }
      lines.push('\n[STRATEGY] Identify scaling bottlenecks. Optimize delivery workflow. Prioritize high-margin services.');
      break;
      
    case 'operational-efficiency':
      lines.push(`[AI OPERATIONS] ${safeNum(aiData.totalRuns)} AI executions logged`);
      if (aiData.runsByModule) {
        lines.push('AI Usage by Module:');
        Object.entries(aiData.runsByModule).forEach(([mod, count]) => lines.push(`  ${mod}: ${count} runs`));
      }
      lines.push(`[AUTOMATION] ${safeNum(c.totalContacts)} contacts in system`);
      lines.push('\n[STRATEGY] Optimize AI routing. Reduce manual touchpoints. Scale successful workflows.');
      break;
      
    case 'revenue-intelligence':
      lines.push(`[REVENUE] $${Object.values(c.stageValues || {}).reduce((a, b) => a + safeNum(b), 0).toLocaleString()} total pipeline value`);
      if (c.stages) {
        const wonVal = safeNum(c.stageValues?.['Closed Won'] || 0);
        lines.push(`Closed Revenue: $${wonVal.toLocaleString()}`);
      }
      lines.push(`[CONCENTRATION] ${safeNum(c.totalContacts)} customers`);
      if (c.scoreDistribution) {
        const highValue = safeNum(c.scoreDistribution['90+']) + safeNum(c.scoreDistribution['70-89']);
        lines.push(`High-Value Contacts: ${highValue}`);
      }
      lines.push('\n[STRATEGY] Track LTV patterns. Diversify revenue sources. Monitor concentration risk.');
      break;
      
    case 'client-retention':
      lines.push(`[RETENTION] ${safeNum(c.totalContacts)} contacts tracked`);
      if (c.engagementDistribution) {
        lines.push(`Engagement: ${JSON.stringify(c.engagementDistribution)}`);
      }
      if (c.qualityDistribution) {
        lines.push(`Quality: ${JSON.stringify(c.qualityDistribution)}`);
      }
      lines.push(`[GROWTH] ${safeNum(com.totalThreads)} conversations`);
      lines.push('\n[STRATEGY] Nurture high-engagement contacts. Re-engage dormant accounts. Identify expansion opportunities.');
      break;
      
    case 'innovation-opportunity':
      lines.push(`[INNOVATION SIGNALS] ${safeNum(c.totalContacts)} contact profiles`);
      if (c.recentContacts?.length > 0) {
        lines.push(`Recent additions: ${c.recentContacts.slice(0, 3).map(x => x.name || x.email).join(', ')}`);
      }
      const unmetNeeds = [];
      if (c.scoreDistribution && safeNum(c.scoreDistribution['<50']) > 0) unmetNeeds.push('Low-score leads need better nurturing');
      if (com.activeThreads === 0) unmetNeeds.push('Expand communication channels');
      if (Object.keys(c.sources || {}).length < 3) unmetNeeds.push('Diversify lead sources');
      if (unmetNeeds.length > 0) lines.push(`Potential Gaps: ${unmetNeeds.join('; ')}`);
      lines.push('\n[STRATEGY] Prioritize feature requests from high-value clients. Test new offer concepts. Prototype solutions.');
      break;
      
    default:
      lines.push(`[DATA] CRM: ${safeNum(c.totalContacts)} contacts, ${safeNum(c.totalDeals)} deals`);
      lines.push(`Comms: ${safeNum(com.totalThreads)} threads`);
      lines.push(`AI: ${safeNum(aiData.totalRuns)} runs`);
  }
  
  lines.push('\n[STATUS] ARCHIVED TO LOCAL REPORTS');
  return lines.join('\n');
};

const AIInsights = ({ onRunReport, activeReportId, output, setOutput, onSave }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(output);
  };

  const handleDownload = () => {
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CORTEX_REPORT_${Date.now()}.txt`;
    a.click();
  };

  return (
    <div className={COMMS_PANEL + " flex-1 flex flex-col h-full overflow-hidden"}>
      <div className="p-5 border-b border-slate-800/60 bg-black/10">
        <div className="flex items-center gap-3">
          <Cpu size={20} className="text-sky-400" />
          <div className="text-[16px] font-black uppercase tracking-[0.5em] text-slate-100 leading-none">AI Insights</div>
        </div>
        <div className="text-[10px] font-black text-sky-500/60 uppercase tracking-[0.3em] mt-2 ml-8">Operational Insights</div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 bg-black/5 flex-none min-h-0 border-b border-slate-800/40">
          <div className="grid grid-cols-3 gap-3">
            {INSIGHT_REPORTS.map(report => (
              <button 
                key={report.id} 
                onClick={() => onRunReport(report)} 
                disabled={activeReportId === report.id} 
                className={`w-full aspect-square text-center transition-all flex flex-col items-center justify-center p-4 rounded-[var(--radius-panel)] border ${activeReportId === report.id ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] shadow-island-sm' : 'bg-white/[0.01] border-white/5 hover:border-[var(--color-primary)]/30 hover:bg-white/[0.03] shadow-sm'} group/card overflow-hidden`}
              >
                <div className="text-[14px] font-black uppercase tracking-tight leading-none text-[var(--color-text-tertiary)] group-hover/card:text-[var(--color-primary)] transition-colors mb-3 px-2">{report.label}</div>
                <div className="text-[11px] font-medium text-[var(--color-text-secondary)] leading-tight tracking-tight transition-opacity px-2">{report.description}</div>
                {activeReportId === report.id && <Loader2 size={16} className="text-[var(--color-primary)] animate-spin mt-2" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 border-t border-slate-800/60 flex flex-col bg-black/20 relative">
          <textarea 
            value={output} 
            onChange={(e) => setOutput(e.target.value)} 
            placeholder="Analysis output appears here..." 
            className="flex-1 w-full bg-transparent p-6 pb-20 text-[12px] font-medium text-slate-400 outline-none resize-none font-mono no-scrollbar selection:bg-sky-500/20" 
          />
          
          {/* Bottom Center Controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-[var(--radius-panel)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] shadow-island backdrop-blur-md z-[100] transition-all">
            <button onClick={handleCopy} className="p-2.5 rounded-[var(--radius-card)] hover:bg-white/5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-all border border-transparent hover:border-[var(--color-border)]" title="Copy Content"><Code size={18} /></button>
            <button onClick={handleDownload} className="p-2.5 rounded-[var(--radius-card)] hover:bg-white/5 text-[var(--color-text-tertiary)] hover:text-magenta-400 transition-all border border-transparent hover:border-[var(--color-border)]" title="Download (.txt)"><Save size={18} /></button>
            <button onClick={() => setOutput('')} className="p-2.5 rounded-[var(--radius-card)] hover:bg-white/5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-all border border-transparent hover:border-[var(--color-border)]" title="Clear Output"><RefreshCcw size={18} /></button>
            <div className="w-[1px] h-6 bg-slate-800 mx-1" />
            <button 
              onClick={onSave} 
              disabled={!output} 
              className="px-6 h-10 rounded-xl bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-sky-400 transition-all disabled:opacity-30 shadow-[0_0_20px_rgba(56,189,248,0.2)]"
            >
              Commit Report
            </button>
          </div>

          <div className="px-5 py-3 border-t border-slate-800/40 bg-black/30 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-600">
            <div className="flex items-center gap-4">
              <span>Chars: {output.length}</span>
              {activeReportId && <span className="text-sky-500 animate-pulse">Running analysis...</span>}
            </div>
            <div className="flex items-center gap-1.5 opacity-60"><div className="h-1 w-1 rounded-full bg-sky-500 animate-pulse" />Cortex Online</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Cortex = () => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [sources, setSources] = useState([]);
  const [items, setItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [providers, setProviders] = useState([]);
  const [interactionArmed, setInteractionArmed] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState('');
  const [activeModelId, setActiveModelId] = useState('');
  const [vaultItems, setVaultItems] = useState([]);
  const [output, setOutput] = useState('');
  const [activeReportId, setActiveReportId] = useState('');
  const [savedIntelligence, setSavedIntelligence] = useState([]);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [showBrandForm, setShowBrandForm] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState(null);
  const { brandConfig, resolveBrandConfig } = useBrand();

  const fetchProviders = async (profileData) => {
    try {
      const data = await getAiProviderConfigsApi();
      // Normalize: convert single model to models array
      const normalized = data.map(p => ({
        ...p,
        models: p.models || (p.model ? [p.model] : [])
      }));
      setProviders(normalized);
      
      const savedProvider = profileData?.activeProvider || normalized.find((provider) => provider.isDefault)?.providerKey;
      if (savedProvider && normalized.find(p => p.providerKey === savedProvider)) {
        setActiveProviderId(savedProvider);
        const p = normalized.find(p => p.providerKey === savedProvider);
        const savedModel = profileData?.activeModel;
        if (savedModel && p.models?.includes(savedModel)) {
          setActiveModelId(savedModel);
        } else if (p.models?.length > 0) {
          setActiveModelId(p.models[0]);
        }
      } else if (normalized.length > 0) {
        setActiveProviderId(normalized[0].providerKey);
        if (normalized[0].models?.length > 0) setActiveModelId(normalized[0].models[0]);
      }
    } catch (err) { console.error(err); }
  };

  const fetchOllamaModels = async () => {
    if (activeProviderId !== 'ollama') return;
    try {
      const models = await getOllamaModelsApi();
      setProviders(prev => prev.map(p => p.providerKey === 'ollama' ? { ...p, models } : p));
      setActiveModelId((current) => {
        if (current && models.includes(current)) {
          return current;
        }
        const configured = providers.find((provider) => provider.providerKey === 'ollama')?.model;
        if (configured && models.includes(configured)) {
          return configured;
        }
        return models[0] || '';
      });
    } catch (err) { console.error(err); }
  };

  const fetchOverview = async () => {
    try {
      const [brainData, vaultData] = await Promise.all([
        getBrainOverviewApi(),
        getVaultApi()
      ]);
      
      setProfile(brainData.profile || EMPTY_PROFILE);
      setSources(brainData.sources || []);
      setItems(brainData.items || []);
      setLinks(brainData.links || []);
      setSavedIntelligence(brainData.items || []);
      setVaultItems(Array.isArray(vaultData) ? vaultData : []);
      
      await fetchProviders(brainData.profile);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchOverview(); }, []);
  useEffect(() => { if (activeProviderId === 'ollama') fetchOllamaModels(); }, [activeProviderId]);

  if (loading) return (
    <div className="flex flex-col h-screen items-center justify-center bg-black gap-4">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-500/20 to-transparent animate-pulse rounded-full" style={{ width: 64, height: 64 }} />
        <Loader2 size={64} className="text-sky-400 animate-spin relative z-10" />
      </div>
      <div className="text-sky-400/60 text-xs font-bold uppercase tracking-[0.3em]">Starting Cortex runtime</div>
      <div className="flex gap-1 mt-2">
        <div className="w-2 h-2 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );

  const cortexWindowStyle = COMMS_WORKSPACE_SCALE < 1
    ? {
        transform: `scale(${COMMS_WORKSPACE_SCALE})`,
        transformOrigin: 'top left',
        width: `${100 / COMMS_WORKSPACE_SCALE}%`,
        height: `${100 / COMMS_WORKSPACE_SCALE}%`,
      }
    : {
        width: '100%',
        height: '100%'
      };

  return (
    <div className="h-full min-h-0 overflow-hidden bg-black flex flex-col">
      <ModuleHeader 
        title="Cortex™" 
        subtitle="Structured Knowledge // Operational DNA // CRM Synthesis"
        actions={[
          { label: 'UPLINK REFRESH', icon: RefreshCcw, onClick: fetchOverview, variant: 'secondary' }
        ]}
      />
      <div className="flex-1 relative bg-black overflow-hidden shadow-island">
        <div 
          className={`bg-slate-900/50 border border-[var(--color-border)] flex flex-col overflow-hidden transition-opacity`} 
          style={cortexWindowStyle}
        >
          <div className="flex flex-1 overflow-hidden relative min-h-0">
        <aside 
          className={`w-[300px] flex flex-col gap-[25px] p-4 border-r border-slate-800/60 ${COMMS_COLUMN_BG} z-30 h-full shadow-[20px_0_60px_rgba(0,0,0,0.5)] transition-all`}
          onClick={() => setInteractionArmed(false)}
        >
          <NeuralEngine 
            activeProviderId={activeProviderId} 
            activeModelId={activeModelId} 
            providers={providers} 
            onProviderChange={async (id) => {
              setActiveProviderId(id);
              const p = providers.find(p => p.providerKey === id);
              if (p) {
                try {
                  // Global activation
                  await upsertAiProviderConfigApi(id, { ...p, providerKey: id, isDefault: true, enabled: true });
                  // Brain specific update
                  await updateBrainProfileApi({ ...profile, activeProvider: id });
                  fetchProviders(); // Refresh to get updated is_default status
                } catch (err) { console.error(err); }
              }
            }}
            onModelChange={async (model) => {
              setActiveModelId(model);
              const p = providers.find(p => p.providerKey === activeProviderId);
              try {
                if (p) {
                  // Update default model for this provider globally
                  await upsertAiProviderConfigApi(activeProviderId, { ...p, providerKey: activeProviderId, model });
                }
                // Brain specific update
                await updateBrainProfileApi({ ...profile, activeModel: model });
                fetchProviders();
              } catch (err) { console.error(err); }
            }}
          />
          <SourceNexus 
            onIngestFile={async (f, transcribe) => { 
                try { 
                    const category = getCategoryByFile(f.name);
                    await createBrainItemApi({ 
                        title: f.name,
                        content: '', 
                        category: category,
                        status: 'ready'
                    }); 
                    fetchOverview(); 
                } catch (err) { console.error(err); } 
            }} 
            onSyncLink={async (url) => { try { await createBrainItemApi({ title: url.split('/').pop() || 'Web Link', content: '', category: 'document', status: 'ready' }); fetchOverview(); } catch (err) { console.error(err); } }} 
            onProbeMcp={async (loc) => { try { const s = await createBrainSourceApi({ sourceType: 'mcp', label: loc.split('/').pop(), location: loc, status: 'active' }); if (s) { await probeBrainMcpApi(s.id); fetchOverview(); } } catch (err) { console.error(err); } }} 
          />
          <SavedIntelligence 
            items={savedIntelligence} 
            vaultItems={vaultItems}
            onSelectCategory={setSelectedCategory} 
          />
        </aside>

        <main className="flex-1 relative flex flex-col bg-black overflow-hidden h-full">
          <BrainGraphPanel 
            profile={profile} 
            sources={sources} 
            items={items} 
            links={links} 
            interactionArmed={interactionArmed}
            setInteractionArmed={setInteractionArmed}
            onMoveNode={(n, p) => setItems(items.map(i => i.id === n.id ? { ...i, graphX: p.x, graphY: p.y } : i))} 
          />
        </main>

        <aside 
          className={`w-[540px] flex flex-col border-l border-slate-800/60 z-20 ${COMMS_COLUMN_BG} h-full shadow-[-20px_0_60px_rgba(0,0,0,0.5)] transition-all`}
          onClick={() => setInteractionArmed(false)}
        >
          <AIInsights 
            activeReportId={activeReportId} 
            onRunReport={async (r) => { 
                setActiveReportId(r.id); 
                setOutput(`[NEURAL ACTIVATION] Executing: ${r.label}...\n[SEED PROMPT] ${r.prompt}\n\n`);
                
                let usedFallback = false;
                let reportContent = '';
                
                try {
                    const analytics = await getAnalyticsSummaryApi();
                    const hasContacts = analytics?.crm?.totalContacts > 0;
                    const hasThreads = analytics?.comms?.totalThreads > 0;
                    
                    if (!analytics || (!hasContacts && !hasThreads)) {
                        throw new Error('Report generation is disabled until live CRM or Comms data is available.');
                    } else {
                        const result = await generateReportApi({
                            reportId: r.id,
                            prompt: r.prompt,
                            analytics,
                            context: {}
                        });
                        
                        if (result?.success && result?.data) {
                            reportContent = result.data;
                        } else {
                            throw new Error(result?.error || 'Report generation did not return live output.');
                        }
                    }
                    
                    setOutput(p => p + reportContent);
                    
                } catch (err) {
                    console.error('[CortexReport] ERROR', { message: err.message });
                    reportContent = '';
                    setOutput(`\n[ERROR] ${err.message}`);
                }
                
                setActiveReportId(''); 
                if (!reportContent) {
                    return;
                }
                
                const resolvedBrand = resolveBrandConfig ? resolveBrandConfig() : brandConfig;
                
                const reportMeta = {
                    reportId: r.id,
                    reportTitle: r.label,
                    reportType: r.description,
                    generatedAt: new Date().toISOString(),
                    accountName: resolvedBrand.brandName,
                    isFallback: usedFallback,
                    templateType: 'standard',
                    brandSnapshot: {
                        brandId: resolvedBrand.brandId,
                        brandName: resolvedBrand.brandName,
                        logoUrl: resolvedBrand.logoUrl,
                        primaryColor: resolvedBrand.primaryColor
                    }
                };
                
                const newItem = { 
                    title: usedFallback ? `${r.label} (Template)` : r.label, 
                    content: `[NEURAL ACTIVATION] Executing: ${r.label}...\n[SEED PROMPT] ${r.prompt}\n\n${reportContent}`, 
                    category: 'document',
                    reportMeta: JSON.stringify(reportMeta),
                    brandConfig: JSON.stringify(resolvedBrand)
                }; 
                
                try {
                    const saved = await createBrainItemApi(newItem);
                    if (saved) await fetchOverview();
                } catch (saveErr) {
                    console.error('[CortexReport] Save failed:', saveErr);
                }
            }} 
            output={output} 
            setOutput={setOutput} 
            onSave={async () => { 
                if (!output) return; 
                const report = activeReportId ? INSIGHT_REPORTS.find(r => r.id === activeReportId) : null;
                const title = report?.label || 'Manual Synthesis';
                
                const resolvedBrand = resolveBrandConfig ? resolveBrandConfig() : brandConfig;
                
                const reportMeta = {
                    reportId: activeReportId || 'manual',
                    reportTitle: title,
                    reportType: report?.description || 'Manual Synthesis',
                    generatedAt: new Date().toISOString(),
                    accountName: resolvedBrand.brandName,
                    isFallback: false,
                    templateType: 'standard',
                    brandSnapshot: {
                        brandId: resolvedBrand.brandId,
                        brandName: resolvedBrand.brandName,
                        logoUrl: resolvedBrand.logoUrl,
                        primaryColor: resolvedBrand.primaryColor
                    }
                };
                
                const newItem = { 
                  title,
                  content: output, 
                  category: 'document',
                  reportMeta: JSON.stringify(reportMeta),
                  brandConfig: JSON.stringify(resolvedBrand)
                }; 
                const saved = await createBrainItemApi(newItem);
                if (saved) await fetchOverview();
            }} 
          />
        </aside>

        <aside className={`fixed top-0 right-0 bottom-0 w-[420px] z-[100] border-l border-[var(--color-border)] bg-[var(--color-bg-primary)] transition-transform duration-500 shadow-island ${showProfileDrawer ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="h-full flex flex-col relative">
            <button onClick={() => setShowProfileDrawer(!showProfileDrawer)} className="absolute -left-8 top-[75%] -translate-y-1/2 h-16 w-8 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-l-[var(--radius-panel)] flex items-center justify-center text-[var(--color-text-tertiary)] z-50 shadow-island-sm transition"><ChevronRight size={18} className={showProfileDrawer ? '' : 'rotate-180'} /></button>
            <div className="p-5 border-b border-white/5 flex items-center gap-4"><div className="h-9 w-9 rounded-[var(--radius-card)] bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)] border border-[var(--color-primary)]/20 shadow-island-sm"><Shield size={18} /></div><div><div className="text-sm font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Business DNA Profile</div><div className="text-[10px] font-medium text-[var(--color-text-tertiary)] mt-0.5">Operational Registry</div></div></div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
              <section className="space-y-2"><div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]/80">Core Identity</div><div className="text-lg font-bold text-[var(--color-text-secondary)] leading-snug">{profile.companyName || 'Unidentified'}</div></section>
              <section className="space-y-2"><div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]/80">Mission DNA</div><div className="p-4 rounded-[var(--radius-card)] bg-white/[0.01] border border-white/5 italic text-sm text-[var(--color-text-secondary)] leading-relaxed font-medium">"{profile.mission || 'No mission statement synthesized.'}"</div></section>
              <section className="space-y-3"><div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]/80">Synthesis Details</div><div className="grid gap-3"><div className="p-3 rounded-[var(--radius-card)] bg-black/40 border border-[var(--color-border)]"><div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)] mb-1">Target Audience (ICP)</div><div className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{profile.idealCustomer || 'Not defined'}</div></div><div className="p-3 rounded-[var(--radius-card)] bg-black/40 border border-[var(--color-border)]"><div className="text-xs font-semibold uppercase tracking-wide text-magenta-400 mb-1">Voice & Tone</div><div className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{profile.brandVoice || 'Not defined'}</div></div></div></section>
            </div>
            <div className="p-6 border-t border-[var(--color-border)] bg-black/40"><button onClick={() => setShowBrandForm(true)} className={COMMS_TOOLBAR_PRIMARY + " w-full !h-12 !rounded-[var(--radius-card)] !text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2 shadow-island-sm"}><PenTool size={14} /> Update Operations DNA</button></div>
          </div>
        </aside>
      </div>

      {showBrandForm && (
        <TabbedBrainFormModal 
          initialData={profile} 
          onClose={() => setShowBrandForm(false)} 
          onSuccess={(data) => { 
            setProfile(p => ({...p, ...data})); 
            setShowBrandForm(false); 
            fetchOverview(); 
          }} 
        />
      )}
      
      {selectedCategory && (
        <CortexCategoryModal 
          category={selectedCategory} 
          items={savedIntelligence} 
          isOpen={!!selectedCategory} 
          onClose={() => setSelectedCategory(null)}
          onDelete={async (id) => { 
            try { 
              await deleteBrainItemApi(id); 
              fetchOverview(); 
            } catch (err) { console.error(err); } 
          }}
          onUpdate={async (id, updates) => { 
            try { 
              await updateBrainItemApi(id, updates); 
              fetchOverview(); 
            } catch (err) { console.error(err); } 
          }}
        />
      )}
    </div>
    </div>
    </div>
  );
};

export default Cortex;

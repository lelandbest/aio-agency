/**
 * Form Builder Header
 * Compact header with clear action hierarchy, consistent with FlowBuilder pattern
 */

import React from 'react';
import { ArrowLeft, Save, FileText, PanelRightClose, PanelRight, Layers, Copy, Search, ExternalLink } from 'lucide-react';

const FormBuilderHeader = ({
  formName = 'Untitled Form',
  status = 'Draft',
  onExit,
  onSave,
  onSaveAsNew,
  onOpenPublicLink,
  onBrowseTemplates,
  onFormUpdate,
}) => {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [tempTitle, setTempTitle] = React.useState(formName);

  React.useEffect(() => {
    setTempTitle(formName);
  }, [formName]);

  const handleTitleSubmit = () => {
    onFormUpdate?.({ name: tempTitle });
    setIsEditingTitle(false);
  };

  return (
    <div className="module-toolbar overflow-hidden transition-all duration-300">
      {/* Left: Single context-aware button */}
      <div className="flex items-center gap-2 min-w-0 h-full">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="btn-secondary h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-3 font-bold uppercase tracking-tight"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back</span>
          </button>
        )}
        
        {/* Inline Title Editor */}
        <div className="flex items-center gap-3 px-2 min-w-0 flex-1">
          {isEditingTitle ? (
            <input
              autoFocus
              className="bg-[var(--color-bg-primary)] border border-sky-500/50 rounded px-2 py-0.5 text-sm font-black text-white w-full max-w-[300px] outline-none shadow-[0_0_10px_rgba(14,165,233,0.2)]"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSubmit();
                if (e.key === 'Escape') setIsEditingTitle(false);
              }}
            />
          ) : (
            <div 
              className="flex items-center gap-2 cursor-pointer group min-w-0"
              onClick={() => setIsEditingTitle(true)}
            >
              <h1 className="text-sm font-black tracking-tight text-white/90 truncate flex-shrink-1">
                {formName || 'Untitled Form'}
              </h1>
              <div className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-bold text-white/30 uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                Edit
              </div>
            </div>
          )}
          <div className="h-4 w-[1px] bg-white/5 mx-1 hidden md:block" />
          <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest hidden md:block ${
            status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/5'
          }`}>
            {status || 'Draft'}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex flex-wrap items-center justify-end gap-1.5 h-full flex-shrink-0">
        {onBrowseTemplates && (
          <button
            type="button"
            onClick={onBrowseTemplates}
            className="btn-toolbar-lead h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-3 font-bold uppercase tracking-tight"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Templates</span>
          </button>
        )}
        
        {onOpenPublicLink && (
          <button
            type="button"
            onClick={onOpenPublicLink}
            className="btn-secondary h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-3 font-bold uppercase tracking-tight"
          >
            <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
            <span>Open Link</span>
          </button>
        )}

        {onSaveAsNew && (
          <button
            type="button"
            onClick={onSaveAsNew}
            className="btn-secondary h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-3 font-bold uppercase tracking-tight"
          >
            <Copy className="w-3.5 h-3.5 text-sky-400" />
            <span>Save As New</span>
          </button>
        )}
        
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="btn-secondary h-8 flex items-center gap-2 whitespace-nowrap text-[10px] px-3 font-bold uppercase tracking-tight"
          >
            <Save className="w-3.5 h-3.5 text-sky-400" />
            <span>Save</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default FormBuilderHeader;

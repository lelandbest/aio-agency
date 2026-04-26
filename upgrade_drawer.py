import re

def main():
    filepath = r'd:\AIOCRM\frontend\src\modules\Flows\components\NodeConfigDrawer.jsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    variable_input_component = """
const VARIABLE_SOURCES = [
  { id: 'previous', label: 'Previous Node' },
  { id: 'nodes', label: 'Nodes' },
  { id: 'run.vars', label: 'Run Variables' },
  { id: 'form', label: 'Form Data' },
  { id: 'trigger', label: 'Trigger Data' },
  { id: 'globals', label: 'Globals' },
  { id: 'contact', label: 'Contact' },
  { id: 'booking', label: 'Booking' },
];

const KNOWN_FIELDS = {
  contact: ['firstName', 'lastName', 'email', 'phone', 'company', 'title', 'department', 'status', 'leadScore', 'pipelineStage'],
  booking: ['event_id', 'start_time', 'end_time', 'status'],
  form: ['id', 'name', 'submittedAt']
};

const VariableInput = ({ type = 'text', value, onChange, placeholder, className, isTextArea = false }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [customPath, setCustomPath] = useState('');
  const inputRef = React.useRef(null);
  const containerRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInsert = (token) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const newValue = (value || '').substring(0, start) + token + (value || '').substring(end);
      onChange(newValue);
      
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      onChange((value || '') + token);
    }
    setShowPicker(false);
    setSelectedSource(null);
    setCustomPath('');
  };

  const renderPicker = () => {
    if (!showPicker) return null;
    return (
      <div className="absolute right-0 z-50 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl text-sm overflow-hidden flex flex-col">
        {!selectedSource ? (
          <div className="max-h-60 overflow-y-auto">
             <div className="p-2 border-b border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-tertiary)] bg-[var(--color-bg-secondary)] tracking-wider">SELECT SOURCE</div>
             {VARIABLE_SOURCES.map(s => (
               <button key={s.id} onClick={() => setSelectedSource(s.id)} className="w-full text-left px-3 py-2 hover:bg-[var(--color-hover)] text-[var(--color-text-primary)]">
                 {s.label} <span className="text-[var(--color-text-tertiary)] text-[10px] float-right font-mono mt-1">{s.id}</span>
               </button>
             ))}
          </div>
        ) : (
          <div className="flex flex-col max-h-60">
             <div className="p-2 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <span>{VARIABLE_SOURCES.find(s=>s.id === selectedSource)?.label}</span>
                <button onClick={() => setSelectedSource(null)} className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&larr; Back</button>
             </div>
             <div className="overflow-y-auto p-2 space-y-1">
                {(KNOWN_FIELDS[selectedSource] || []).map(f => (
                   <button key={f} onClick={() => handleInsert(`{{${selectedSource}.${f}}}`)} className="w-full text-left px-2 py-1.5 hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] text-[11px] font-mono rounded">
                     {f}
                   </button>
                ))}
                {(!KNOWN_FIELDS[selectedSource] || KNOWN_FIELDS[selectedSource].length === 0) && (
                   <div className="text-[11px] text-[var(--color-text-tertiary)] px-2 py-1">Manual path required for this source.</div>
                )}
                <div className="pt-2 border-t border-[var(--color-border)] mt-2">
                   <div className="flex items-center gap-1">
                     <span className="text-[var(--color-text-tertiary)] text-[11px] font-mono">{selectedSource}.</span>
                     <input 
                        type="text" 
                        value={customPath} 
                        onChange={e => setCustomPath(e.target.value)}
                        placeholder={selectedSource === 'nodes' ? 'nodeId.data.field' : 'path'}
                        className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[11px] text-[var(--color-text-primary)] min-w-0"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && customPath) handleInsert(`{{${selectedSource}.${customPath}}}`);
                        }}
                     />
                     <button onClick={() => customPath && handleInsert(`{{${selectedSource}.${customPath}}}`)} className="text-[var(--color-primary)] font-bold px-2 py-1 bg-[var(--color-primary)]/10 rounded">+</button>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-start relative">
        {isTextArea ? (
           <textarea
             ref={inputRef}
             value={value}
             onChange={e => onChange(e.target.value)}
             placeholder={placeholder}
             className={className}
           />
        ) : (
           <input
             ref={inputRef}
             type={type}
             value={value}
             onChange={e => onChange(e.target.value)}
             placeholder={placeholder}
             className={className}
           />
        )}
        <button 
           type="button"
           onClick={() => setShowPicker(!showPicker)}
           className="absolute right-2 top-2 p-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors shadow-sm"
           title="Insert Variable"
        >
          <span className="font-mono text-[10px] font-bold block leading-none">{'{ }'}</span>
        </button>
      </div>
      {renderPicker()}
    </div>
  );
};
"""

    # Add the component
    content = content.replace("const DEFAULT_VIDEO_TEMPLATE_ID = 'bltv_169';", variable_input_component + "\nconst DEFAULT_VIDEO_TEMPLATE_ID = 'bltv_169';")
    
    # Add activeTab state
    content = content.replace(
        "const [loadingForms, setLoadingForms] = useState(false);",
        "const [loadingForms, setLoadingForms] = useState(false);\n  const [activeTab, setActiveTab] = useState('DATA');"
    )

    # Wrap the content in tabs
    tabs_ui = """
        <div className="flex border-b border-[var(--color-border)] overflow-x-auto scrollbar-hide">
          {['DISPLAY', 'DATA', 'VALIDATION', 'CONDITIONAL', 'LOGIC'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'DATA' && renderConfigForm()}
          {activeTab === 'DISPLAY' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Node Label</label>
                <div className="px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] opacity-70">
                  {node?.data?.label || 'Unknown'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Node Description</label>
                <div className="px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] opacity-70 min-h-[60px]">
                  {node?.data?.description || 'No description provided.'}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'VALIDATION' && (
            <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-tertiary)]">
              No validation rules configured.
            </div>
          )}
          {activeTab === 'CONDITIONAL' && (
            <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-tertiary)]">
              Conditional execution rules will appear here.
            </div>
          )}
          {activeTab === 'LOGIC' && (
            <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-tertiary)]">
              Advanced node logic settings will appear here.
            </div>
          )}
        </div>
"""
    
    # Replace the old content area
    old_content_area = """        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderConfigForm()}
        </div>"""
    
    content = content.replace(old_content_area, "        {/* Content */}\n" + tabs_ui)

    # Replace <input type="text" and <textarea with VariableInput in renderConfigForm
    # We only want to replace it inside renderConfigForm.
    
    # Simple regex to replace <input type="text"
    content = re.sub(r'<input\s+type="text"', r'<VariableInput type="text"', content)
    # Simple regex to replace <textarea
    content = re.sub(r'<textarea', r'<VariableInput isTextArea', content)
    # And closing tags
    content = re.sub(r'</textarea>', r'</VariableInput>', content)
    
    # Also <input ... /> needs to become <VariableInput ... /> if it doesn't have type="text" but we know they are mostly text
    # Wait, only the text inputs. Let's make sure there are no other <input> that got missed.
    # e.g. <input value={config.topic} ... />
    # Let's replace any <input that does NOT have type="number" or type="checkbox".
    # Since I already replaced <input type="text", let's look for other <input
    # I can just write out the regex carefully or just rely on the fact that I replaced type="text".
    # Wait, the codebase might have <input type="text" with multiline attributes.
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
if __name__ == '__main__':
    main()

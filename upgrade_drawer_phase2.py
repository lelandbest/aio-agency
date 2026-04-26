import re

def main():
    flow_builder_path = r'd:\AIOCRM\frontend\src\modules\Flows\FlowBuilder.jsx'
    drawer_path = r'd:\AIOCRM\frontend\src\modules\Flows\components\NodeConfigDrawer.jsx'

    # Update FlowBuilder.jsx to pass edges
    with open(flow_builder_path, 'r', encoding='utf-8') as f:
        fb_content = f.read()
    
    fb_content = fb_content.replace(
        "nodes={nodes}",
        "nodes={nodes}\n        edges={edges}"
    )
    with open(flow_builder_path, 'w', encoding='utf-8') as f:
        f.write(fb_content)

    # Update NodeConfigDrawer.jsx
    with open(drawer_path, 'r', encoding='utf-8') as f:
        drawer_content = f.read()

    # Add import
    if "getAllNodes" not in drawer_content:
        drawer_content = drawer_content.replace(
            "import { X, Loader2 } from 'lucide-react';",
            "import { X, Loader2 } from 'lucide-react';\nimport { getAllNodes } from '../data/nodeLibrary';"
        )

    # We need to replace VariableInput component definition entirely
    # First, let's extract it or just replace the whole block using regex
    # The VariableInput component starts at `const VariableInput = ` and ends before `const DEFAULT_VIDEO_TEMPLATE_ID` 
    # wait, it might end before `const applyDefaultVideoTemplate`
    
    new_variable_input = """
const VariableInput = ({ type = 'text', value, onChange, placeholder, className, isTextArea = false, nodes = [], edges = [], currentNodeId = null }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
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
    setSelectedNodeId(null);
    setCustomPath('');
  };

  const getOutputSchema = (nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;
    const templateId = node.data?.templateId;
    if (!templateId) return null;
    const allTemplates = typeof getAllNodes === 'function' ? getAllNodes() : [];
    const template = allTemplates.find(t => t.id === templateId);
    return template?.outputSchema || null;
  };

  const renderPicker = () => {
    if (!showPicker) return null;

    if (!selectedSource) {
      return (
        <div className="absolute right-0 z-50 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl text-sm overflow-hidden flex flex-col">
          <div className="max-h-60 overflow-y-auto">
             <div className="p-2 border-b border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-tertiary)] bg-[var(--color-bg-secondary)] tracking-wider">SELECT SOURCE</div>
             {VARIABLE_SOURCES.map(s => (
               <button key={s.id} onClick={() => setSelectedSource(s.id)} className="w-full text-left px-3 py-2 hover:bg-[var(--color-hover)] text-[var(--color-text-primary)]">
                 {s.label} <span className="text-[var(--color-text-tertiary)] text-[10px] float-right font-mono mt-1">{s.id}</span>
               </button>
             ))}
          </div>
        </div>
      );
    }

    if (selectedSource === 'nodes') {
      if (!selectedNodeId) {
        return (
          <div className="absolute right-0 z-50 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl text-sm overflow-hidden flex flex-col">
            <div className="flex flex-col max-h-60">
              <div className="p-2 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <span>Nodes</span>
                <button onClick={() => setSelectedSource(null)} className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&larr; Back</button>
              </div>
              <div className="overflow-y-auto p-2 space-y-1">
                {nodes.filter(n => n.id !== currentNodeId).map(n => (
                  <button key={n.id} onClick={() => setSelectedNodeId(n.id)} className="w-full text-left px-2 py-1.5 hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] text-[11px] font-mono rounded truncate" title={n.data?.label || n.id}>
                    {n.data?.label || n.id}
                  </button>
                ))}
                {nodes.length <= 1 && (
                  <div className="text-[11px] text-[var(--color-text-tertiary)] px-2 py-1">No other nodes available.</div>
                )}
              </div>
            </div>
          </div>
        );
      } else {
        const schema = getOutputSchema(selectedNodeId);
        const fields = schema ? Object.keys(schema) : [];
        return (
          <div className="absolute right-0 z-50 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl text-sm overflow-hidden flex flex-col">
            <div className="flex flex-col max-h-60">
              <div className="p-2 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <span className="truncate max-w-[150px]">{nodes.find(n => n.id === selectedNodeId)?.data?.label || 'Node'} Fields</span>
                <button onClick={() => setSelectedNodeId(null)} className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex-shrink-0">&larr; Back</button>
              </div>
              <div className="overflow-y-auto p-2 space-y-1">
                {fields.length > 0 ? fields.map(f => (
                  <button key={f} onClick={() => handleInsert(`{{nodes.${selectedNodeId}.${f}}}`)} className="w-full text-left px-2 py-1.5 hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] text-[11px] font-mono rounded">
                    {f} <span className="text-[9px] text-[var(--color-text-tertiary)] ml-1">({schema[f]})</span>
                  </button>
                )) : (
                  <div className="text-[11px] text-[var(--color-text-tertiary)] px-2 py-1">No schema defined. Use manual path.</div>
                )}
                <div className="pt-2 border-t border-[var(--color-border)] mt-2">
                   <div className="flex items-center gap-1">
                     <span className="text-[var(--color-text-tertiary)] text-[10px] font-mono truncate max-w-[80px]" title={`nodes.${selectedNodeId}.`}>...{selectedNodeId.slice(-4)}.</span>
                     <input 
                        type="text" 
                        value={customPath} 
                        onChange={e => setCustomPath(e.target.value)}
                        placeholder="field.path"
                        className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[11px] text-[var(--color-text-primary)] min-w-0"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && customPath) handleInsert(`{{nodes.${selectedNodeId}.${customPath}}}`);
                        }}
                     />
                     <button onClick={() => customPath && handleInsert(`{{nodes.${selectedNodeId}.${customPath}}}`)} className="text-[var(--color-primary)] font-bold px-2 py-1 bg-[var(--color-primary)]/10 rounded">+</button>
                   </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
    }

    if (selectedSource === 'previous') {
      const prevEdge = edges.find(e => e.target === currentNodeId);
      const prevNodeId = prevEdge?.source;
      const schema = prevNodeId ? getOutputSchema(prevNodeId) : null;
      const fields = schema ? Object.keys(schema) : [];

      return (
        <div className="absolute right-0 z-50 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl text-sm overflow-hidden flex flex-col">
          <div className="flex flex-col max-h-60">
             <div className="p-2 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <span>Previous Node</span>
                <button onClick={() => setSelectedSource(null)} className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&larr; Back</button>
             </div>
             <div className="overflow-y-auto p-2 space-y-1">
                {fields.length > 0 ? fields.map(f => (
                   <button key={f} onClick={() => handleInsert(`{{previous.${f}}}`)} className="w-full text-left px-2 py-1.5 hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] text-[11px] font-mono rounded">
                     {f} <span className="text-[9px] text-[var(--color-text-tertiary)] ml-1">({schema[f]})</span>
                   </button>
                )) : (
                   <div className="text-[11px] text-[var(--color-text-tertiary)] px-2 py-1">No schema defined or no previous node.</div>
                )}
                <div className="pt-2 border-t border-[var(--color-border)] mt-2">
                   <div className="flex items-center gap-1">
                     <span className="text-[var(--color-text-tertiary)] text-[11px] font-mono">previous.</span>
                     <input 
                        type="text" 
                        value={customPath} 
                        onChange={e => setCustomPath(e.target.value)}
                        placeholder="field"
                        className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[11px] text-[var(--color-text-primary)] min-w-0"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && customPath) handleInsert(`{{previous.${customPath}}}`);
                        }}
                     />
                     <button onClick={() => customPath && handleInsert(`{{previous.${customPath}}}`)} className="text-[var(--color-primary)] font-bold px-2 py-1 bg-[var(--color-primary)]/10 rounded">+</button>
                   </div>
                </div>
             </div>
          </div>
        </div>
      );
    }

    // Default behavior for contact, booking, globals, run.vars, trigger, form
    return (
      <div className="absolute right-0 z-50 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl text-sm overflow-hidden flex flex-col">
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
                      placeholder="path"
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

    pattern = re.compile(r"const VariableInput = \(\{.*?\}\);", re.DOTALL)
    # Wait, the end of VariableInput is before `const DEFAULT_VIDEO_TEMPLATE_ID`.
    # Let's just slice it from `const VariableInput =` to `const DEFAULT_VIDEO_TEMPLATE_ID`
    start_idx = drawer_content.find("const VariableInput = ")
    end_idx = drawer_content.find("const DEFAULT_VIDEO_TEMPLATE_ID = ")
    
    if start_idx != -1 and end_idx != -1:
        drawer_content = drawer_content[:start_idx] + new_variable_input + "\n" + drawer_content[end_idx:]
    else:
        print("Could not find VariableInput or DEFAULT_VIDEO_TEMPLATE_ID")

    # Now, inject `nodes` and `edges` and `currentNodeId` into NodeConfigDrawer signature
    # Also pass these to `<VariableInput`
    drawer_content = drawer_content.replace(
        "const NodeConfigDrawer = ({ node, isOpen, onClose, onSave, videoTemplateOptions = [], nodes = [] }) => {",
        "const NodeConfigDrawer = ({ node, isOpen, onClose, onSave, videoTemplateOptions = [], nodes = [], edges = [] }) => {"
    )
    # replace `<VariableInput` with `<VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id}`
    # Wait, simple string replacement works because `<VariableInput` is unique
    drawer_content = drawer_content.replace(
        "<VariableInput",
        "<VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id}"
    )

    with open(drawer_path, 'w', encoding='utf-8') as f:
        f.write(drawer_content)

if __name__ == '__main__':
    main()

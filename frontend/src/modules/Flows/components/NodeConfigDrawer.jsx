/**
 * Node Config Drawer
 * Right-side drawer panel for configuring selected node
 * Slides in from right, token-first styling
 */

import React, { useState, useEffect } from 'react';
import { X, Loader2, ChevronRight } from 'lucide-react';
import { getAllNodes } from '../data/nodeLibrary';
import { getFormsApi } from '../../../services/backendApi';
import NodeOutputInspector from './NodeOutputInspector';


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


const VariableInput = ({ type = 'text', value, onChange, placeholder, className, isTextArea = false, nodes = [], edges = [], currentNodeId = null }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedUpstreamNodeId, setSelectedUpstreamNodeId] = useState(null);
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

  useEffect(() => {
    if (!showPicker) {
      setSelectedSource(null);
      setSelectedNodeId(null);
      setSelectedUpstreamNodeId(null);
      setCustomPath('');
    }
  }, [showPicker]);

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
      const upstreamEdges = edges.filter(e => e.target === currentNodeId);
      
      // Case: No upstream nodes
      if (upstreamEdges.length === 0) {
        return (
          <div className="absolute right-0 z-50 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl text-sm overflow-hidden flex flex-col">
             <div className="p-2 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <span>Previous Node</span>
                <button onClick={() => setSelectedSource(null)} className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&larr; Back</button>
             </div>
             <div className="p-4 text-[11px] text-[var(--color-text-tertiary)]">No upstream nodes found.</div>
          </div>
        );
      }

      // Case: Multiple upstream nodes and none selected yet
      if (upstreamEdges.length > 1 && !selectedUpstreamNodeId) {
        return (
          <div className="absolute right-0 z-50 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl text-sm overflow-hidden flex flex-col">
             <div className="p-2 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <span>Select Source Node</span>
                <button onClick={() => setSelectedSource(null)} className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">&larr; Back</button>
             </div>
             <div className="overflow-y-auto p-2 space-y-1 max-h-60">
                {upstreamEdges.map(edge => {
                   const node = nodes.find(n => n.id === edge.source);
                   return (
                     <button 
                       key={edge.source} 
                       onClick={() => setSelectedUpstreamNodeId(edge.source)}
                       className="w-full text-left px-2 py-1.5 hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] text-[11px] rounded flex items-center justify-between"
                     >
                       <span className="truncate pr-2">{node?.data?.label || node?.id}</span>
                       <ChevronRight size={10} className="text-[var(--color-text-tertiary)] flex-shrink-0" />
                     </button>
                   );
                })}
             </div>
          </div>
        );
      }

      // Case: Single upstream node or one selected from multiple
      const targetNodeId = upstreamEdges.length === 1 ? upstreamEdges[0].source : selectedUpstreamNodeId;
      const schema = targetNodeId ? getOutputSchema(targetNodeId) : null;
      const fields = schema ? Object.keys(schema) : [];
      const isMulti = upstreamEdges.length > 1;

      return (
        <div className="absolute right-0 z-50 mt-1 w-64 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg shadow-xl text-sm overflow-hidden flex flex-col">
          <div className="flex flex-col max-h-60">
             <div className="p-2 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
                <span className="truncate max-w-[150px]">{isMulti ? nodes.find(n => n.id === targetNodeId)?.data?.label : 'Previous Node'}</span>
                <button onClick={() => isMulti ? setSelectedUpstreamNodeId(null) : setSelectedSource(null)} className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex-shrink-0">&larr; Back</button>
             </div>
             <div className="overflow-y-auto p-2 space-y-1">
                {fields.length > 0 ? fields.map(f => (
                   <button 
                     key={f} 
                     onClick={() => handleInsert(isMulti ? `{{nodes.${targetNodeId}.${f}}}` : `{{previous.${f}}}`)} 
                     className="w-full text-left px-2 py-1.5 hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] text-[11px] font-mono rounded"
                   >
                     {f} <span className="text-[9px] text-[var(--color-text-tertiary)] ml-1">({schema[f]})</span>
                   </button>
                )) : (
                   <div className="text-[11px] text-[var(--color-text-tertiary)] px-2 py-1">No schema defined.</div>
                )}
                <div className="pt-2 border-t border-[var(--color-border)] mt-2">
                   <div className="flex items-center gap-1">
                     <span className="text-[var(--color-text-tertiary)] text-[11px] font-mono truncate max-w-[80px]">
                        {isMulti ? `...${targetNodeId.slice(-4)}.` : 'previous.'}
                     </span>
                     <input 
                        type="text" 
                        value={customPath} 
                        onChange={e => setCustomPath(e.target.value)}
                        placeholder="field"
                        className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[11px] text-[var(--color-text-primary)] min-w-0"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && customPath) handleInsert(isMulti ? `{{nodes.${targetNodeId}.${customPath}}}` : `{{previous.${customPath}}}`);
                        }}
                     />
                     <button onClick={() => customPath && handleInsert(isMulti ? `{{nodes.${targetNodeId}.${customPath}}}` : `{{previous.${customPath}}}`)} className="text-[var(--color-primary)] font-bold px-2 py-1 bg-[var(--color-primary)]/10 rounded">+</button>
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

const DEFAULT_VIDEO_TEMPLATE_ID = 'bltv_169';

const applyDefaultVideoTemplate = (nextConfig, videoTemplateOptions = []) => {
  const config = nextConfig && typeof nextConfig === 'object' ? nextConfig : {};
  if (config.actionType !== 'generate_video') {
    return config;
  }
  const selectedTemplateId = String(config.templateId || '').trim();
  const hasSelectedTemplate = videoTemplateOptions.some((option) => option.templateId === selectedTemplateId);
  if (hasSelectedTemplate) {
    return config;
  }
  const hasDefaultTemplate = videoTemplateOptions.some((option) => option.templateId === DEFAULT_VIDEO_TEMPLATE_ID);
  return {
    ...config,
    templateId: hasDefaultTemplate ? DEFAULT_VIDEO_TEMPLATE_ID : selectedTemplateId,
  };
};

const NodeConfigDrawer = ({ node, isOpen, onClose, onSave, videoTemplateOptions = [], nodes = [], edges = [], runDetail = null }) => {
  const [config, setConfig] = useState(applyDefaultVideoTemplate(node?.data?.config || {}, videoTemplateOptions));
  const [forms, setForms] = useState([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [activeTab, setActiveTab] = useState('DATA');

  useEffect(() => {
    setConfig(applyDefaultVideoTemplate(node?.data?.config || {}, videoTemplateOptions));
  }, [node, videoTemplateOptions]);

  useEffect(() => {
    if (isOpen && (
      node?.data?.id === 'form-submitted-trigger' || 
      node?.data?.id === 'user-input' ||
      node?.data?.templateId === 'user-input'
    )) {
      loadForms();
    }
  }, [isOpen, node]);

  const loadForms = async () => {
    setLoadingForms(true);
    try {
      const data = await getFormsApi();
      setForms(data?.data || []);
    } catch (err) {
      console.error('Error loading forms:', err);
    } finally {
      setLoadingForms(false);
    }
  };

  if (!node || !isOpen) return null;

  const handleSave = () => {
    onSave?.(node.id, applyDefaultVideoTemplate(config, videoTemplateOptions));
    onClose();
  };

  const handleInputChange = (field, value) => {
    setConfig((prev) => applyDefaultVideoTemplate({
      ...prev,
      [field]: value,
    }, videoTemplateOptions));
  };

  const selectedVideoTemplateId = videoTemplateOptions.some((option) => option.templateId === config.templateId)
    ? config.templateId
    : videoTemplateOptions.some((option) => option.templateId === DEFAULT_VIDEO_TEMPLATE_ID)
      ? DEFAULT_VIDEO_TEMPLATE_ID
    : '';

  // Render node-type-specific config UI
  const renderConfigForm = () => {
    const nodeType = node.type;

    if (nodeType === 'trigger') {
      const showFormSelect = config.event === 'form_submitted';
      
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Trigger Event
            </label>
            <select
              value={config.event || ''}
              onChange={(e) => handleInputChange('event', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="">Select event...</option>
              <option value="form_submitted">Form Submitted</option>
              <option value="contact_created">Contact Created</option>
              <option value="deal_updated">Deal Updated</option>
              <option value="scheduled">Scheduled Time</option>
              <option value="booking_created">Booking Created</option>
              <option value="booking_updated">Booking Updated</option>
              <option value="booking_cancelled">Booking Cancelled</option>
            </select>
          </div>

          {showFormSelect && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Select Form{config.formIds?.length > 1 ? 's' : ''}
              </label>
              {loadingForms ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
                  <Loader2 size={14} className="animate-spin" /> Loading forms...
                </div>
              ) : forms.length > 0 ? (
                <div className="space-y-1">
                  <select
                    multiple
                    value={config.formIds || (config.formId ? [config.formId] : [])}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                      handleInputChange('formIds', selected);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    size={Math.min(forms.length + 1, 6)}
                  >
                    <option value="">Any form</option>
                    {forms.map(form => (
                      <option key={form.id} value={form.id}>{form.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Hold Ctrl/Cmd to select multiple forms.
                  </p>
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-tertiary)]">
                  No forms found. Create forms in the Forms module.
                </div>
              )}
              <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                Flow will trigger on form submission. Captured data available as variables.
              </p>
            </div>
          )}

          {config.event === 'form_submitted' && (config.formIds?.length > 0 || config.formId) && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Captured Variables
              </label>
              <div className="p-3 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] font-mono text-xs space-y-1">
                <div className="text-[var(--color-text-tertiary)]">// Available after form submission:</div>
                <div className="text-cyan-400">form.id</div>
                <div className="text-cyan-400">form.name</div>
                <div className="text-cyan-400">form.submittedAt</div>
                <div className="text-cyan-400">form.fields.<span className="text-amber-400">fieldName</span></div>
                <div className="text-[var(--color-text-tertiary)] mt-2">// Example: form.fields.email</div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Description
            </label>
            <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
              value={config.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe trigger behavior..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[80px]"
            />
          </div>
        </div>
      );
    }

    if (nodeType === 'action') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Action Type
            </label>
            <select
              value={config.actionType || ''}
              onChange={(e) => handleInputChange('actionType', e.target.value)}
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
              `}
            >
              <option value="">Select action...</option>
              <option value="send_email">Send Email</option>
              <option value="send_sms">Send SMS</option>
              <option value="store_data">Store Data</option>
              <option value="create_task">Create Task</option>
              <option value="create_booking">Create Booking</option>
              <option value="update_booking">Update Booking</option>
              <option value="cancel_booking">Cancel Booking</option>
              <option value="get_booking">Get Booking</option>
              <option value="generate_script">Generate Script</option>
              <option value="generate_run_of_show">Generate Run of Show</option>
              <option value="generate_transcript_intelligence">Transcript Intelligence</option>
              <option value="generate_voice">Generate Voice</option>
              <option value="text_to_speech">Text to Speech</option>
              <option value="generate_thumbnail">Generate Thumbnail</option>
              <option value="generate_video">Generate Video</option>
              <option value="transcribe_media">Transcribe Media</option>
              <option value="ingest_meeting_artifacts">Ingest Meeting Artifacts</option>
              <option value="publish_asset">Publish Asset</option>
            </select>
          </div>

          {config.actionType === 'generate_script' && (
            <div className="grid grid-cols-1 gap-3">
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.topic || ''}
                onChange={(e) => handleInputChange('topic', e.target.value)}
                placeholder="Topic"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.tone || ''}
                onChange={(e) => handleInputChange('tone', e.target.value)}
                placeholder="Tone"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.length || config.duration || ''}
                onChange={(e) => { handleInputChange('length', e.target.value); handleInputChange('duration', e.target.value); }}
                placeholder="Length"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                value={config.context || ''}
                onChange={(e) => handleInputChange('context', e.target.value)}
                placeholder="Context"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'generate_run_of_show' && (
            <div className="grid grid-cols-1 gap-3">
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.topic || ''}
                onChange={(e) => handleInputChange('topic', e.target.value)}
                placeholder="Topic"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.duration || ''}
                onChange={(e) => handleInputChange('duration', e.target.value)}
                placeholder="Duration"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                value={config.context || ''}
                onChange={(e) => handleInputChange('context', e.target.value)}
                placeholder="Production context"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'generate_transcript_intelligence' && (
            <div className="grid grid-cols-1 gap-3">
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                value={config.transcriptText || ''}
                onChange={(e) => handleInputChange('transcriptText', e.target.value)}
                placeholder="Transcript text"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[120px]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.assetId || ''}
                onChange={(e) => handleInputChange('assetId', e.target.value)}
                placeholder="Asset ID (optional)"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.sourceUrl || ''}
                onChange={(e) => handleInputChange('sourceUrl', e.target.value)}
                placeholder="Source URL (optional)"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          )}

          {config.actionType === 'generate_voice' && (
            <div className="grid grid-cols-1 gap-3">
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.voice || ''}
                onChange={(e) => handleInputChange('voice', e.target.value)}
                placeholder="Voice"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.style || ''}
                onChange={(e) => handleInputChange('style', e.target.value)}
                placeholder="Style"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                value={config.text || config.scriptText || ''}
                onChange={(e) => handleInputChange('text', e.target.value)}
                placeholder="Text or script input"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[120px]"
              />
            </div>
          )}

          {config.actionType === 'text_to_speech' && (
            <div className="grid grid-cols-1 gap-3">
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.voice || ''}
                onChange={(e) => handleInputChange('voice', e.target.value)}
                placeholder="Voice"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.style || ''}
                onChange={(e) => handleInputChange('style', e.target.value)}
                placeholder="Style"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                value={config.text || config.scriptText || ''}
                onChange={(e) => handleInputChange('text', e.target.value)}
                placeholder="Text or script input"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[120px]"
              />
            </div>
          )}

          {config.actionType === 'generate_thumbnail' && (
            <div className="grid grid-cols-1 gap-3">
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.title || ''}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Title"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.subtitle || ''}
                onChange={(e) => handleInputChange('subtitle', e.target.value)}
                placeholder="Subtitle"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.image || ''}
                onChange={(e) => handleInputChange('image', e.target.value)}
                placeholder="Background"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                value={config.prompt || ''}
                onChange={(e) => handleInputChange('prompt', e.target.value)}
                placeholder="Prompt"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'publish_asset' && (
            <div className="grid grid-cols-1 gap-3">
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.publishTarget || ''}
                onChange={(e) => handleInputChange('publishTarget', e.target.value)}
                placeholder="Publish Target"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.assetRef || ''}
                onChange={(e) => handleInputChange('assetRef', e.target.value)}
                placeholder="Asset Ref (optional)"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          )}

          {config.actionType === 'generate_video' && (
            <div className="grid grid-cols-1 gap-3">
              <select
                value={selectedVideoTemplateId}
                onChange={(e) => handleInputChange('templateId', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {videoTemplateOptions.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.label || template.humanLabel || template.templateId}
                  </option>
                ))}
              </select>
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.outputTarget || ''}
                onChange={(e) => handleInputChange('outputTarget', e.target.value)}
                placeholder="Output Target"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                value={config.script || ''}
                onChange={(e) => handleInputChange('script', e.target.value)}
                placeholder="Script or prompt"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'transcribe_media' && (
            <div className="grid grid-cols-1 gap-3">
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.sourceType || ''}
                onChange={(e) => handleInputChange('sourceType', e.target.value)}
                placeholder="Source Type"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.sourceRef || ''}
                onChange={(e) => handleInputChange('sourceRef', e.target.value)}
                placeholder="Source Ref"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                value={config.transcriptText || ''}
                onChange={(e) => handleInputChange('transcriptText', e.target.value)}
                placeholder="Transcript text"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          {config.actionType === 'ingest_meeting_artifacts' && (
            <div className="grid grid-cols-1 gap-3">
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.meetingProvider || ''}
                onChange={(e) => handleInputChange('meetingProvider', e.target.value)}
                placeholder="Meeting Provider"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                value={config.meetingRef || ''}
                onChange={(e) => handleInputChange('meetingRef', e.target.value)}
                placeholder="Meeting Ref"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                value={config.transcriptText || ''}
                onChange={(e) => handleInputChange('transcriptText', e.target.value)}
                placeholder="Transcript text"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[100px]"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Configuration
            </label>
            <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
              value={config.configuration || ''}
              onChange={(e) => handleInputChange('configuration', e.target.value)}
              placeholder="Enter action configuration..."
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
                min-h-[100px]
              `}
            />
          </div>
        </div>
      );
    }

    if (nodeType === 'logic') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Logic Type
            </label>
            <select
              value={config.logicType || ''}
              onChange={(e) => handleInputChange('logicType', e.target.value)}
              className={`
                w-full px-3 py-2 rounded-lg
                bg-[var(--color-bg-primary)] border border-[var(--color-border)]
                text-[var(--color-text-primary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
              `}
            >
              <option value="">Select logic...</option>
              <option value="if_then">If/Then Condition</option>
              <option value="switch">Switch/Branch</option>
              <option value="filter">Filter Data</option>
            </select>
          </div>
        </div>
      );
    }

        if (nodeType === 'input') {
      const isAiBuilder = node.data.templateId === 'ai-form-builder' || node.data.id === 'ai-form-builder';
      const isManualInput = node.data.templateId === 'user-input' || node.data.id === 'user-input';
      const sourceMode = config.sourceMode || (isAiBuilder ? 'generate' : 'existing');
      
      return (
        <div className="space-y-4">
          {(isAiBuilder || isManualInput) && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Form Source
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleInputChange('sourceMode', 'existing')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${sourceMode === 'existing' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)]'}`}
                >
                  Existing Form
                </button>
                <button
                  type="button"
                  onClick={() => handleInputChange('sourceMode', 'generate')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${sourceMode === 'generate' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg-primary)] border border(--color-border)] text-[var(--color-text-primary)]'}`}
                >
                  Generate (AI)
                </button>
              </div>
            </div>
          )}

          {sourceMode === 'existing' ? (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Select Saved Form
              </label>
              {loadingForms ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
                  <Loader2 size={14} className="animate-spin" /> Loading forms...
                </div>
              ) : forms.length > 0 ? (
                <select
                  value={config.formId || config.existingFormId || ''}
                  onChange={(e) => handleInputChange('formId', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  <option value="">Select a form...</option>
                  {forms.map(form => (
                    <option key={form.id} value={form.id}>{form.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-[var(--color-text-tertiary)]">
                  No forms found. Create one in the Forms module or switch to "Generate".
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  AI Form Prompt
                </label>
                <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
                  value={config.prompt || ''}
                  onChange={(e) => handleInputChange('prompt', e.target.value)}
                  placeholder="Describe the form you want to create (e.g. 'A lead intake form with name, email, and company size')..."
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[120px]"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  Temporary Form Name
                </label>
                <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
                  value={config.formName || ''}
                  onChange={(e) => handleInputChange('formName', e.target.value)}
                  placeholder="e.g. Dynamic Intake Form"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Display Message
            </label>
            <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
              value={config.message || ''}
              onChange={(e) => handleInputChange('message', e.target.value)}
              placeholder="Please complete this form to continue."
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          
          <div className="p-3 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)]">
             <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-accent)] mb-1">
               <Zap size={12} /> Flow Behavior
             </div>
             <p className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">
               When this node is reached, the flow will pause. The user will be prompted to fill out the form. 
               Once submitted, the flow will resume automatically with the form data accessible via 
               <code className="mx-1 px-1 bg-black/20 rounded text-cyan-400">form_data</code> variable.
             </p>
          </div>
        </div>
      );
    }

    if (node.data?.isSocket) {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Workflow / Scenario ID or URL
            </label>
            <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
              value={config.workflowRef || ''}
              onChange={(e) => handleInputChange('workflowRef', e.target.value)}
              placeholder="workflow-id or https://..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Credential Reference
            </label>
            <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} type="text"
              value={config.authRef || ''}
              onChange={(e) => handleInputChange('authRef', e.target.value)}
              placeholder="authRef"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Payload Mapping (JSON)
            </label>
            <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
              value={config.payloadMap || ''}
              onChange={(e) => handleInputChange('payloadMap', e.target.value)}
              placeholder='{"inputKey": "node.output"}'
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-h-[80px] font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Timeout (ms)</label>
              <input
                type="number"
                value={config.timeout || 30000}
                onChange={(e) => handleInputChange('timeout', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Retry Count</label>
              <input
                type="number"
                value={config.retryCount || 1}
                onChange={(e) => handleInputChange('retryCount', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
          General Configuration
        </label>
        <VariableInput nodes={nodes} edges={edges} currentNodeId={node?.id} isTextArea
          value={config.general || ''}
          onChange={(e) => handleInputChange('general', e.target.value)}
          placeholder="Enter node configuration..."
          className={`
            w-full px-3 py-2 rounded-lg
            bg-[var(--color-bg-primary)] border border-[var(--color-border)]
            text-[var(--color-text-primary)]
            focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]
            min-h-[120px]
          `}
        />
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)] shadow-lg z-50 flex flex-col animate-slideIn">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Configure {node.data.label}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--color-hover)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--color-text-tertiary)]" />
          </button>
        </div>

        {/* Content */}

        <div className="flex border-b border-[var(--color-border)] overflow-x-auto scrollbar-hide">
          {['DISPLAY', 'DATA', 'VALIDATION', 'CONDITIONAL', 'LOGIC', 'OUTPUT'].map(tab => (
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
          {activeTab === 'OUTPUT' && (
            <NodeOutputInspector
              node={node}
              nodes={nodes}
              edges={edges}
              runDetail={runDetail}
            />
          )}
        </div>


        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-border)] flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] font-medium text-sm hover:bg-[var(--color-hover)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slideIn {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
};

export default NodeConfigDrawer;

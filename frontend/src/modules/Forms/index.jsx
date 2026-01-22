import React, { useState, useEffect } from 'react';
import { mockSupabase } from '../../services/mockSupabase';
import { getCMSTableData, exportCMSToCSV } from '../../services/formProcessor';
import {
  FileText, Plus, ArrowRight, User, Box, Briefcase, Mail, Phone,
  Type, AlignLeft, CheckSquare, Hash, Lock, AtSign, ChevronDown, Radio,
  EyeOff, MousePointer, Link, CalendarIcon as Calendar, DollarSign,
  UploadCloud, ShoppingCart, Image, MapPin, PenTool, ListChecks,
  Code, Columns, Layers, Table, GripVertical, Trash2, ExternalLink, Save,
  Bot, Settings, Bold, Italic, Underline, AlignCenter, AlignRight, GitMerge,
  Database, Download, Search, Filter
} from 'lucide-react';

/**
 * FormBuilderModule
 * Comprehensive form builder with drag-and-drop field management
 */
const FormBuilderModule = () => {
  const [view, setView] = useState('list');
  const [forms, setForms] = useState([]);
  const [currentForm, setCurrentForm] = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draggedField, setDraggedField] = useState(null);
  const [activeTab, setActiveTab] = useState('display');

  const FORM_TOOLS = [
    {
      category: "Common Fields",
      items: [
        { type: 'text', label: 'First Name', icon: User, defaultLabel: 'First Name' },
        { type: 'text', label: 'Last Name', icon: User, defaultLabel: 'Last Name' },
        { type: 'text', label: 'Company', icon: Box, defaultLabel: 'Company' },
        { type: 'text', label: 'Job Title', icon: Briefcase, defaultLabel: 'Job Title' },
        { type: 'email', label: 'Email', icon: Mail, defaultLabel: 'Email' },
        { type: 'tel', label: 'Phone Number', icon: Phone, defaultLabel: 'Phone Number' }
      ]
    },
    {
      category: "Basic",
      items: [
        { type: 'text', label: 'Text Field', icon: Type, defaultLabel: 'Text Field' },
        { type: 'textarea', label: 'Text Area', icon: AlignLeft, defaultLabel: 'Text Area' },
        { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, defaultLabel: 'Checkbox' },
        { type: 'number', label: 'Number', icon: Hash, defaultLabel: 'Number' },
        { type: 'password', label: 'Password', icon: Lock, defaultLabel: 'Password' },
        { type: 'email', label: 'Opt-In Email', icon: AtSign, defaultLabel: 'Opt-In Email' },
        { type: 'select', label: 'Select', icon: ChevronDown, defaultLabel: 'Select' },
        { type: 'radio', label: 'Radio', icon: Radio, defaultLabel: 'Radio' },
        { type: 'hidden', label: 'Hidden', icon: EyeOff, defaultLabel: 'Hidden' },
        { type: 'button', label: 'Button', icon: MousePointer, defaultLabel: 'Submit' }
      ]
    },
    {
      category: "Advanced",
      items: [
        { type: 'url', label: 'Url', icon: Link, defaultLabel: 'Website' },
        { type: 'datetime', label: 'Date/Time', icon: Calendar, defaultLabel: 'Date/Time' },
        { type: 'currency', label: '$ Currency', icon: DollarSign, defaultLabel: 'Amount' },
        { type: 'file', label: 'File', icon: UploadCloud, defaultLabel: 'File Upload' },
        { type: 'purchase', label: 'Purchase', icon: ShoppingCart, defaultLabel: 'Product' },
        { type: 'image', label: 'Image', icon: Image, defaultLabel: 'Image' },
        { type: 'address', label: 'Address', icon: MapPin, defaultLabel: 'Address' },
        { type: 'signature', label: 'Signature', icon: PenTool, defaultLabel: 'Signature' },
        { type: 'survey', label: 'Survey', icon: ListChecks, defaultLabel: 'Survey' }
      ]
    },
    {
      category: "Layout",
      items: [
        { type: 'html', label: 'HTML Element', icon: Code, defaultLabel: 'HTML Block' },
        { type: 'content', label: 'Content', icon: Type, defaultLabel: 'Rich Text' },
        { type: 'columns', label: 'Columns', icon: Columns, defaultLabel: 'Columns' },
        { type: 'fieldset', label: 'Field Set', icon: Layers, defaultLabel: 'Field Set' },
        { type: 'panel', label: 'Panel', icon: Box, defaultLabel: 'Panel' },
        { type: 'table', label: 'Table', icon: Table, defaultLabel: 'Table' },
        { type: 'tabs', label: 'Tabs', icon: Layers, defaultLabel: 'Tabs' },
      ]
    }
  ];

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    setLoading(true);
    const { data } = await mockSupabase.from('forms').select();
    if (data) setForms(data);
    setLoading(false);
  };

  const createNewForm = async () => {
    const newForm = {
      title: "New Untitled Form",
      status: "Draft",
      responses: 0,
      last_active: "Just now",
      schema: []
    };
    const { data } = await mockSupabase.from('forms').insert([newForm]);
    if (data) {
      setForms(prev => [...prev, ...data]);
      setCurrentForm(data[0]);
      setView('editor');
    }
  };

  const handleAddField = (tool) => {
    if (!currentForm) return;
    const newField = {
      id: `field_${Date.now()}`,
      type: tool.type,
      label: tool.defaultLabel,
      placeholder: '',
      required: false,
      options: tool.type === 'select' || tool.type === 'radio' ? ['Option 1', 'Option 2'] : undefined,
      prefix: '',
      suffix: '',
      mask: '',
      customClass: '',
      tabIndex: 0,
      labelPosition: 'Top',
      hidden: false,
      hideLabel: false,
      showWordCounter: false,
      content: tool.type === 'content' ? '<b>Welcome to my Form</b>' : ''
    };
    
    const updatedForm = {
      ...currentForm,
      schema: [...(currentForm.schema || []), newField]
    };
    setCurrentForm(updatedForm);
    setSelectedField(newField);
    setActiveTab('display');
  };

  const updateFieldProperty = (fieldId, key, value) => {
    if (!currentForm) return;
    const updatedSchema = currentForm.schema.map(f => {
      if (f.id === fieldId) {
        const updated = { ...f, [key]: value };
        if (key === 'options' && typeof value === 'string') {
          updated.options = value.split(',').map(o => o.trim());
        }
        if (selectedField?.id === fieldId) setSelectedField(updated);
        return updated;
      }
      return f;
    });
    setCurrentForm({ ...currentForm, schema: updatedSchema });
  };

  const deleteField = (fieldId) => {
    if (!currentForm) return;
    const updatedSchema = currentForm.schema.filter(f => f.id !== fieldId);
    setCurrentForm({ ...currentForm, schema: updatedSchema });
    if (selectedField?.id === fieldId) setSelectedField(null);
  };

  const handleSaveForm = async () => {
    if (!currentForm) return;
    await mockSupabase.from('forms').update({ schema: currentForm.schema, title: currentForm.title }).eq('id', currentForm.id);
    fetchForms();
  };

  const handleDragStart = (e, index) => {
    setDraggedField(index);
    e.dataTransfer.effectAllowed = "move";
    e.target.style.opacity = '0.5';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedField === null || draggedField === index || !currentForm) return;
    
    const newSchema = [...currentForm.schema];
    const item = newSchema[draggedField];
    newSchema.splice(draggedField, 1);
    newSchema.splice(index, 0, item);
    
    setCurrentForm({ ...currentForm, schema: newSchema });
    setDraggedField(index);
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedField(null);
  };

  if (view === 'list') {
    return (
      <div className="h-full bg-[#0F0F11] rounded-xl border border-[#27272A] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[#27272A] bg-[#050505] flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-purple-500" />
            Forms
          </h2>
          <button
            onClick={createNewForm}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2"
          >
            <Plus size={16} /> New Form
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {forms.map(form => (
              <div
                key={form.id}
                onClick={() => {
                  setCurrentForm(form);
                  setView('editor');
                }}
                className="bg-[#18181B] border border-[#27272A] hover:border-purple-500/50 p-6 rounded-xl cursor-pointer group transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 bg-purple-900/20 rounded-lg flex items-center justify-center text-purple-400">
                    <FileText size={20} />
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${
                      form.status === 'Active' ? 'bg-green-900/20 text-green-400' : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {form.status}
                  </span>
                </div>
                <h3 className="text-white font-bold mb-1 truncate">{form.title}</h3>
                <p className="text-gray-500 text-xs">{form.responses} responses • {form.last_active}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[#0F0F11] rounded-xl border border-[#27272A] overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-64 border-r border-[#27272A] bg-[#050505] flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-[#27272A] flex items-center gap-2 sticky top-0 bg-[#050505] z-10">
          <button onClick={() => setView('list')} className="text-gray-500 hover:text-white">
            <ArrowRight size={16} className="rotate-180" />
          </button>
          <span className="text-sm font-bold text-white">Back</span>
        </div>
        <div className="p-2 space-y-6">
          {FORM_TOOLS.map((category, idx) => (
            <div key={idx} className="px-2">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 px-2">
                {category.category}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {category.items.map((tool, tIdx) => (
                  <button
                    key={tIdx}
                    onClick={() => handleAddField(tool)}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-[#18181B] border border-[#27272A] hover:border-purple-500 rounded-lg text-xs text-gray-400 hover:text-white transition group h-20"
                  >
                    <tool.icon size={20} className="group-hover:scale-110 transition-transform" />
                    <span className="text-center leading-tight">{tool.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col bg-[#0F0F11]">
        <div className="h-14 border-b border-[#27272A] flex items-center justify-between px-6 bg-[#050505]">
          <input
            value={currentForm?.title || ''}
            onChange={(e) => setCurrentForm({ ...currentForm, title: e.target.value })}
            className="bg-transparent text-white font-bold focus:outline-none focus:border-b border-purple-500"
          />
          <div className="flex gap-2">
            <button className="text-gray-500 hover:text-white p-2">
              <ExternalLink size={16} />
            </button>
            <button
              onClick={handleSaveForm}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2"
            >
              <Save size={14} /> Save
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-3xl mx-auto space-y-4 pb-20">
            {currentForm?.schema?.length === 0 && (
              <div className="text-center text-gray-600 py-20 border-2 border-dashed border-[#27272A] rounded-xl flex flex-col items-center justify-center">
                <Box size={48} className="mb-4 opacity-20" />
                <p>Welcome to my Form</p>
                <p className="text-xs mt-2">Add fields from the left menu to start building!</p>
              </div>
            )}
            {currentForm?.schema?.map((field, index) => (
              <div
                key={field.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => setSelectedField(field)}
                className={`bg-[#18181B] border rounded-lg p-4 cursor-pointer transition relative group ${
                  selectedField?.id === field.id ? 'border-purple-500 ring-1 ring-purple-500/20' : 'border-[#27272A] hover:border-gray-600'
                }`}
              >
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 cursor-grab opacity-0 group-hover:opacity-100 z-10">
                  <GripVertical size={16} />
                </div>
                <div className="pl-6 pointer-events-none">
                  {!field.hideLabel && field.type !== 'content' && (
                    <label className={`block text-sm font-medium text-gray-300 mb-1`}>
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                  )}
                  <div className="flex items-center gap-2">
                    {['text', 'email', 'tel', 'url', 'password', 'number', 'currency'].includes(field.type) ? (
                      <input disabled type={field.type} placeholder={field.placeholder} className="flex-1 w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-sm text-gray-500" />
                    ) : field.type === 'textarea' ? (
                      <textarea disabled placeholder={field.placeholder} className="flex-1 w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-sm text-gray-500 h-24" />
                    ) : field.type === 'select' ? (
                      <select disabled className="flex-1 w-full bg-[#0F0F11] border border-[#27272A] rounded px-3 py-2 text-sm text-gray-500">
                        <option>Select an option...</option>
                        {field.options?.map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <div className="p-3 border border-[#27272A] rounded bg-[#0F0F11] text-gray-500 text-sm italic w-full text-center">
                        {field.type} preview
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteField(field.id);
                  }}
                  className="absolute right-2 top-2 p-1.5 text-gray-600 hover:text-red-500 rounded hover:bg-[#27272A] opacity-0 group-hover:opacity-100 transition z-10"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 border-l border-[#27272A] bg-[#050505] flex flex-col">
        {selectedField ? (
          <>
            <div className="border-b border-[#27272A] flex bg-[#0A0A0A]">
              {['Display', 'Data', 'Validation'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase())}
                  className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition ${
                    activeTab === tab.toLowerCase()
                      ? 'text-purple-500 border-b-2 border-purple-500 bg-[#18181B]'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === 'display' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Label</label>
                    <input value={selectedField.label} onChange={(e) => updateFieldProperty(selectedField.id, 'label', e.target.value)} className="w-full bg-[#18181B] border border-[#27272A] rounded px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedField.required} onChange={(e) => updateFieldProperty(selectedField.id, 'required', e.target.checked)} className="w-4 h-4 rounded bg-[#18181B] border-gray-600 text-purple-600" />
                    <label className="text-sm text-gray-300">Required</label>
                  </div>
                </div>
              )}
              {activeTab === 'data' && (
                <div className="text-center py-6 text-sm text-gray-500">Data binding coming soon</div>
              )}
              {activeTab === 'validation' && (
                <div className="text-center py-6 text-sm text-gray-500">Validation rules coming soon</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center">
            <Settings size={48} className="mb-4 opacity-20" />
            <p className="text-sm">Select a field to configure</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormBuilderModule;

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { mockSupabase } from '../../services/mockSupabase';
import { getCMSTableData, exportCMSToCSV } from '../../services/formProcessor';
import LoadingSpinner from '../../components/LoadingSpinner';
import FolderTable from '../../components/FolderTable';
import {
  FileText, Plus, ArrowRight, User, Box, Briefcase, Mail, Phone,
  Type, AlignLeft, CheckSquare, Hash, Lock, AtSign, ChevronDown, Radio,
  EyeOff, MousePointer, Link, CalendarIcon as Calendar, DollarSign,
  UploadCloud, ShoppingCart, Image, MapPin, PenTool, ListChecks,
  Code, Columns, Layers, Table, GripVertical, Trash2, ExternalLink, Save,
  Bot, Settings, Bold, Italic, Underline, AlignCenter, AlignRight, GitMerge,
  Database, Download, Search, Filter, Edit2, Folder, FolderOpen, ChevronRight,
  Eye
} from 'lucide-react';
import CMSView from '../../components/CMS/CMSView';
import FormEntryModal from '../../components/Modals/FormEntryModal';
import AIAssistButton from '../../components/AIAssistButton';

/**
 * FormBuilderModule
 * Comprehensive form builder with folder organization and drag-and-drop field management
 */
const FormBuilderModule = () => {
  const [view, setView] = useState('list');
  const [forms, setForms] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentForm, setCurrentForm] = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draggedField, setDraggedField] = useState(null);
  const [activeTab, setActiveTab] = useState('display');
  const [selectedForms, setSelectedForms] = useState([]);

  // CMS Data Tab State
  const [showFormEntry, setShowFormEntry] = useState(false);
  const [entryForm, setEntryForm] = useState(null);

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
    fetchFolders();
    fetchCmsTables();
  }, []);

  const fetchFolders = async () => {
    const { data } = await mockSupabase.from('form_folders').select();
    if (data) setFolders(data);
  };

  const fetchCmsTables = async () => {
    const { data } = await mockSupabase.from('cms_tables').select();
    if (data) setCmsTables(data);
  };

  const loadCmsTableData = async (table) => {
    setSelectedCmsTable(table);
    setCmsDataLoading(true);
    try {
      const data = await getCMSTableData(table.slug);
      setCmsTableData(data);
    } catch (error) {
      console.error('Error loading CMS data:', error);
    }
    setCmsDataLoading(false);
  };

  const handleExportCMS = async (table) => {
    await exportCMSToCSV(table.slug, table.name);
  };

  const fetchForms = async () => {
    setLoading(true);
    const { data } = await mockSupabase.from('forms').select();
    if (data) setForms(data);
    setLoading(false);
  };

  const createNewForm = async () => {
    const newForm = {
      name: "New Untitled Form",
      folder_id: folders[0]?.id || null,
      status: "Draft",
      is_active: false,
      responses_count: 0,
      last_active: "Just now",
      last_modified_by: "AIO Flow™",
      last_modified_at: new Date().toISOString(),
      creator: "AIO Flow™",
      triggers: null,
      automation: null,
      schema: []
    };
    const { data } = await mockSupabase.from('forms').insert([newForm]);
    if (data) {
      setForms(prev => [...prev, ...data]);
      setCurrentForm(data[0]);
      setView('editor');
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt("Enter folder name:", "New Folder");
    if (name) {
      const newFolder = {
        name: name,
        user_id: 1, // Mock user ID
        created_at: new Date().toISOString(),
        expanded: true
      };
      const { data } = await mockSupabase.from('form_folders').insert([newFolder]);
      if (data) {
        setFolders(prev => [...prev, ...data]);
      }
    }
  };

  const handleRenameFolder = async (folderId, newName) => {
    // Mock rename functionality
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName } : f));
  };

  const handleOpenFormEntry = (form) => {
    setEntryForm(form);
    setShowFormEntry(true);
  };

  const handleOpenPublicLink = (form) => {
    // In a real app this opens the public URL
    window.open(`/forms/public/${form.id}`, '_blank');
  };

  const toggleFolder = (folderId) => {
    setFolders(prev => prev.map(f =>
      f.id === folderId ? { ...f, expanded: !f.expanded } : f
    ));
  };

  const toggleFormSelection = (formId) => {
    setSelectedForms(prev =>
      prev.includes(formId)
        ? prev.filter(id => id !== formId)
        : [...prev, formId]
    );
  };

  const deleteForm = async (formId) => {
    if (confirm('Are you sure you want to delete this form?')) {
      await mockSupabase.from('forms').delete().eq('id', formId);
      fetchForms();
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
      content: tool.type === 'content' ? '<b>Welcome to my Form</b>' : '',
      // Validation fields
      minLength: '',
      maxLength: '',
      pattern: '',
      customValidation: '',
      errorMessage: ''
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
    await mockSupabase.from('forms').update({
      schema: currentForm.schema,
      name: currentForm.name,
      last_modified_at: new Date().toISOString()
    }).eq('id', currentForm.id);
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
    const tableColumns = [
      {
        header: "Form Name",
        key: "name",
        render: (form) => (
          <span className="text-sm text-[var(--color-text-primary)] font-medium">
            {form.name}
          </span>
        )
      },
      { header: "Triggers", key: "triggers" },
      {
        header: "Automation",
        key: "automation",
        render: (form) => (
          <div className={`w-10 h-5 rounded-full relative transition-colors ${form.automation
            ? 'bg-[var(--color-primary)]'
            : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]'
            }`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${form.automation ? 'left-5.5' : 'left-0.5'
              }`} />
          </div>
        )
      },
      {
        header: "Status",
        key: "status",
        render: (form) => (
          <span className={`px-2 py-1 rounded text-xs font-medium ${form.is_active
            ? 'bg-green-500/20 text-green-400'
            : 'bg-gray-500/20 text-[var(--color-text-tertiary)]'
            }`}>
            {form.status}
          </span>
        )
      },
      { header: "Last Modified By", key: "last_modified_by" },
      {
        header: "Last Modified At",
        key: "last_modified_at",
        render: (form) => new Date(form.last_modified_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
        })
      },
      { header: "Creator", key: "creator" },
      {
        header: "Action",
        key: "actions",
        render: (form) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenPublicLink(form)}
              className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
              title="Open Public Link"
            >
              <ExternalLink size={16} />
            </button>
            <button
              onClick={() => handleOpenFormEntry(form)}
              className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              title="Fill Form (Data Entry)"
            >
              <FileText size={16} />
            </button>
            <button
              onClick={() => {
                setCurrentForm(form);
                setView('editor');
              }}
              className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              title="Edit"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => deleteForm(form.id)}
              className="p-1 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-red-400"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )
      }
    ];

    const actions = (
      <button
        onClick={() => setView('cms')}
        className="bg-[var(--color-hover)] hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] px-4 py-2 rounded text-sm font-medium flex items-center gap-2"
      >
        <Database size={16} /> CMS Data
      </button>
    );

    return (
      <>
        <FolderTable
          title="CUSTOM FORMS"
          description="Design professional looking Forms to collect leads, contact information, registrations, payments, and more."
          folders={folders}
          items={forms}
          columns={tableColumns}
          onFolderToggle={toggleFolder}
          onFolderCreate={handleCreateFolder}
          onFolderRename={handleRenameFolder}
          onItemSelect={() => { }} // Disable row selection action if not needed
          selectedItems={selectedForms}
          onCreateItem={createNewForm}
          createItemLabel="Create Form"
          actions={actions}
        />
        {
          showFormEntry && entryForm && (
            <FormEntryModal
              form={entryForm}
              onClose={() => setShowFormEntry(false)}
              onSuccess={() => {
                // Optional: refresh CMS data if visible
                // alert('Form submitted successfully!');
              }}
            />
          )
        }
      </>
    );
  }

  // CMS Data View
  if (view === 'cms') {
    return <CMSView onBack={() => setView('list')} />;
  }

  // Editor View
  return (
    <div className="h-full flex bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] overflow-hidden">
      {/* Left Sidebar - Field Tools */}
      <div className="w-64 border-r border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center gap-2 sticky top-0 bg-[var(--color-bg-tertiary)] z-10">
          <button onClick={() => setView('list')} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
            <ArrowRight size={16} className="rotate-180" />
          </button>
          <span className="text-sm font-bold text-[var(--color-text-primary)]">Back to List</span>
        </div>
        <div className="p-2 space-y-6">
          {FORM_TOOLS.map((category, idx) => (
            <div key={idx} className="px-2">
              <h3 className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2 px-2">
                {category.category}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {category.items.map((tool, tIdx) => (
                  <button
                    key={tIdx}
                    onClick={() => handleAddField(tool)}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-[var(--color-primary)] rounded-lg text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition group h-20"
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
      <div className="flex-1 flex flex-col bg-[var(--color-bg-secondary)]">
        {/* Editor Header */}
        <div className="h-16 border-b border-[var(--color-border)] flex items-center justify-between px-6 bg-[var(--color-bg-tertiary)]">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-secondary)] uppercase font-bold">Form Name:</span>
            <div className="relative group">
              <input
                value={currentForm?.name || ''}
                onChange={(e) => setCurrentForm({ ...currentForm, name: e.target.value })}
                className="bg-transparent text-[var(--color-text-primary)] text-lg font-bold focus:outline-none focus:border-b-2 border-[var(--color-primary)] pb-1 w-64 md:w-96 transition-all focus:bg-[var(--color-bg-primary)]/50 px-2 rounded-t"
                placeholder="Enter form name..."
              />
              <Edit2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] pointer-events-none group-hover:text-[var(--color-primary)] transition-colors" />
            </div>
          </div>
          <div className="flex gap-2">
            <AIAssistButton
              onAssist={() => console.log('AI Assist: Forms')}
              tooltip="AI Assist"
              iconType="crosshair"
            />
            <button className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-2">
              <ExternalLink size={16} />
            </button>
            <button
              onClick={handleSaveForm}
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-on-primary)] px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2"
            >
              <Save size={14} /> Save
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-3xl mx-auto space-y-4 pb-20">
            {currentForm?.schema?.length === 0 && (
              <div className="text-center text-[var(--color-text-tertiary)] py-20 border-2 border-dashed border-[var(--color-border)] rounded-xl flex flex-col items-center justify-center">
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
                className={`bg-[var(--color-bg-primary)] border rounded-lg p-4 cursor-pointer transition relative group ${selectedField?.id === field.id ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/20' : 'border-[var(--color-border)] hover:border-gray-600'
                  }`}
              >
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] cursor-grab opacity-0 group-hover:opacity-100 z-10">
                  <GripVertical size={16} />
                </div>
                <div className="pl-6 pointer-events-none">
                  {!field.hideLabel && field.type !== 'content' && (
                    <label className={`block text-sm font-medium text-[var(--color-text-secondary)] mb-1`}>
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                  )}
                  <div className="flex items-center gap-2">
                    {['text', 'email', 'tel', 'url', 'password', 'number', 'currency'].includes(field.type) ? (
                      <input disabled type={field.type} placeholder={field.placeholder} className="flex-1 w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-tertiary)]" />
                    ) : field.type === 'textarea' ? (
                      <textarea disabled placeholder={field.placeholder} className="flex-1 w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-tertiary)] h-24" />
                    ) : field.type === 'select' ? (
                      <select disabled className="flex-1 w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-tertiary)]">
                        <option>Select an option...</option>
                        {field.options?.map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <div className="p-3 border border-[var(--color-border)] rounded bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] text-sm italic w-full text-center">
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
                  className="absolute right-2 top-2 p-1.5 text-[var(--color-text-tertiary)] hover:text-red-500 rounded hover:bg-[var(--color-hover)] opacity-0 group-hover:opacity-100 transition z-10"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Field Configuration */}
      <div className="w-80 border-l border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex flex-col">
        {selectedField ? (
          <>
            <div className="border-b border-[var(--color-border)] flex bg-[var(--color-bg-primary)]">
              {['Display', 'Data', 'Validation'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase())}
                  className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition ${activeTab === tab.toLowerCase()
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] bg-[var(--color-bg-primary)]'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
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
                    <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Label</label>
                    <input value={selectedField.label} onChange={(e) => updateFieldProperty(selectedField.id, 'label', e.target.value)} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Placeholder</label>
                    <input value={selectedField.placeholder || ''} onChange={(e) => updateFieldProperty(selectedField.id, 'placeholder', e.target.value)} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedField.required} onChange={(e) => updateFieldProperty(selectedField.id, 'required', e.target.checked)} className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]" />
                    <label className="text-sm text-[var(--color-text-secondary)]">Required</label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedField.hideLabel || false} onChange={(e) => updateFieldProperty(selectedField.id, 'hideLabel', e.target.checked)} className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]" />
                    <label className="text-sm text-[var(--color-text-secondary)]">Hide Label</label>
                  </div>
                </div>
              )}
              {activeTab === 'data' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Default Value</label>
                    <input
                      value={selectedField.defaultValue || ''}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'defaultValue', e.target.value)}
                      className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                      placeholder="Enter default value"
                    />
                  </div>
                  {(selectedField.type === 'select' || selectedField.type === 'radio') && (
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Options (comma-separated)</label>
                      <input
                        value={selectedField.options?.join(', ') || ''}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'options', e.target.value)}
                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                        placeholder="Option 1, Option 2, Option 3"
                      />
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'validation' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedField.required} onChange={(e) => updateFieldProperty(selectedField.id, 'required', e.target.checked)} className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]" />
                    <label className="text-sm text-[var(--color-text-secondary)]">Required Field</label>
                  </div>
                  {['text', 'textarea', 'email'].includes(selectedField.type) && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Min Length</label>
                        <input
                          type="number"
                          value={selectedField.minLength || ''}
                          onChange={(e) => updateFieldProperty(selectedField.id, 'minLength', e.target.value)}
                          className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                          placeholder="Minimum characters"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Max Length</label>
                        <input
                          type="number"
                          value={selectedField.maxLength || ''}
                          onChange={(e) => updateFieldProperty(selectedField.id, 'maxLength', e.target.value)}
                          className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                          placeholder="Maximum characters"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Pattern (Regex)</label>
                        <input
                          value={selectedField.pattern || ''}
                          onChange={(e) => updateFieldProperty(selectedField.id, 'pattern', e.target.value)}
                          className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none font-mono"
                          placeholder="^[A-Za-z]+$"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase mb-2">Error Message</label>
                    <textarea
                      value={selectedField.errorMessage || ''}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'errorMessage', e.target.value)}
                      className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none h-20"
                      placeholder="Custom error message"
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)] p-8 text-center">
            <Settings size={48} className="mb-4 opacity-20" />
            <p className="text-sm">Select a field to configure</p>
          </div>
        )}
      </div>
    </div>
  );
};

FormBuilderModule.propTypes = {
  // No props currently, but ready for future additions
};

export default FormBuilderModule;

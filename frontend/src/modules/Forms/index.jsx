import React, { useState, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  createFormApi,
  createFormFolderApi,
  deleteFormApi,
  bulkDeleteFormsApi,
  getCmsTablesApi,
  getFormFoldersApi,
  getFormsApi,
  getVaultApi,
  uploadMediaFileApi,
  updateFormApi,
  updateFormFolderApi
} from '../../services/backendApi';
import { requestAiSuggestion } from '../../services/aiAssist';
import { getCMSTableData, exportCMSToCSV } from '../../services/formProcessor';
import LoadingSpinner from '../../components/LoadingSpinner';
import FolderTable from '../../components/FolderTable';
import ModuleHeader from '../../components/ModuleHeader';
import {
  FileText, Plus, ArrowRight, User, Box, Briefcase, Mail, Phone,
  Type, AlignLeft, CheckSquare, Hash, Lock, AtSign, ChevronDown, Radio,
  EyeOff, MousePointer, Link, CalendarIcon as Calendar, DollarSign,
  UploadCloud, ShoppingCart, Image, MapPin, PenTool, ListChecks,
  Code, Columns, Layers, Table, GripVertical, Trash2, ExternalLink, Save,
  Bot, Settings, Bold, Italic, Underline, AlignCenter, AlignRight, GitMerge,
  Database, Download, Search, Filter, Folder, FolderOpen, ChevronRight,
  Eye, ArrowLeft, Tag
} from 'lucide-react';
import { useSystemConfirm } from '../../hooks/useSystemConfirm';
import { useTransientSaveFeedback, saveButtonClassName } from '../../hooks/useTransientSaveFeedback';
import SystemConfirmModal from '../../components/Modals/SystemConfirmModal';
import CMSView from '../../components/CMS/CMSView';
import FormEntryModal from '../../components/Modals/FormEntryModal';
import ShareFormModal from '../../components/Modals/ShareFormModal';
import AIAssistButton from '../../components/AIAssistButton';
import FormTemplateGallery from './FormTemplateGallery';
import { useAIAssist } from '../../contexts/AIAssistContext';

const contentFieldTypes = new Set(['textarea', 'content', 'html']);

const isContentFieldType = (fieldType = '') => contentFieldTypes.has((fieldType || '').toString().trim().toLowerCase());

const createFieldName = (label, fallback = 'field') => {
  const fallbackKey = (fallback || 'field').toString().trim().replace(/[^A-Za-z0-9]+/g, '') || 'field';
  const normalized = (label || fallbackKey)
    .toString()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();

  const parts = normalized.split(/\s+/).filter(Boolean).map((part) => part.toLowerCase());
  if (!parts.length) {
    return fallbackKey.charAt(0).toLowerCase() + fallbackKey.slice(1);
  }

  let base = parts[0] + parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  if (/^\d/.test(base)) {
    base = `${fallbackKey.charAt(0).toLowerCase() + fallbackKey.slice(1)}${base.charAt(0).toUpperCase()}${base.slice(1)}`;
  }
  return base;
};

const buildUniqueFieldName = (baseName, existingFields = [], excludedFieldId = null) => {
  const normalizedBase = createFieldName(baseName, 'field');
  const existingNames = new Set(
    (existingFields || [])
      .filter((field) => field?.id !== excludedFieldId)
      .map((field) => field?.name)
      .filter(Boolean)
  );

  if (!existingNames.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  let candidate = `${normalizedBase}${suffix}`;
  while (existingNames.has(candidate)) {
    suffix += 1;
    candidate = `${normalizedBase}${suffix}`;
  }
  return candidate;
};

const normalizeFormField = (field, index = 0) => ({
  ...field,
  id: field?.id || `field-${Date.now()}-${index}`,
  name: typeof field?.name === 'string' ? field.name : '',
  type: field?.type || 'text',
  label: field?.label || defaultLabelForType(field),
  placeholder: field?.placeholder || '',
  required: Boolean(field?.required),
  options: Array.isArray(field?.options) ? [...field.options] : field?.options,
  isContent: typeof field?.isContent === 'boolean' ? field.isContent : isContentFieldType(field?.type),
  mapToContact: field?.mapToContact || null,
  isIdentifier: Boolean(field?.isIdentifier),
});

const normalizeFormSchema = (schema = []) => (
  Array.isArray(schema) ? schema.map((field, index) => normalizeFormField(field, index)) : []
);

const defaultLabelForType = (field) => {
  const fieldType = field?.type || 'text';
  const byType = {
    text: 'Full Name',
    email: 'Email Address',
    tel: 'Phone Number',
    textarea: 'How can we help?',
    select: 'Select an option',
    radio: 'Choose one option',
    number: 'How many seats?',
    address: 'Business Address',
    signature: 'Signature',
    url: 'Website URL',
    currency: 'Budget Range',
  };
  return byType[fieldType] || field?.label || 'Field Label';
};

const buildTemplateField = (field, index, existingFields = []) => normalizeFormField({
  ...field,
  id: `field-${Date.now()}-${index}`,
  name: buildUniqueFieldName(field.name || field.label || field.type, existingFields),
  type: field.type,
  label: field.label,
  placeholder: field.placeholder || '',
  required: Boolean(field.required),
  options: Array.isArray(field.options) ? [...field.options] : undefined,
  prefix: field.prefix || '',
  suffix: field.suffix || '',
  mask: field.mask || '',
  customClass: field.customClass || '',
  tabIndex: index,
  labelPosition: field.labelPosition || 'Top',
  hidden: Boolean(field.hidden),
  hideLabel: Boolean(field.hideLabel),
  showWordCounter: Boolean(field.showWordCounter),
  content: field.type === 'content' ? (field.content || '') : '',
  minLength: field.minLength || '',
  maxLength: field.maxLength || '',
  pattern: field.pattern || '',
  customValidation: field.customValidation || '',
  errorMessage: field.errorMessage || '',
  mapToContact: field.mapToContact || null,
  isIdentifier: Boolean(field.isIdentifier),
  isContent: typeof field.isContent === 'boolean' ? field.isContent : isContentFieldType(field.type),
});

const buildTemplateSchema = (templateFields = []) => {
  const builtFields = [];
  templateFields.forEach((field, index) => {
    builtFields.push(buildTemplateField(field, index, builtFields));
  });
  return builtFields;
};

const defaultFormSettings = {
  createContact: true,
  updateContact: true,
  webhookUrl: '',
  notificationEmail: '',
  redirectUrl: '',
  thankYouMessage: 'Thanks, we received your submission.',
  headerImage: '',
};

const normalizeFormSettings = (settings = {}) => ({
  ...defaultFormSettings,
  ...(settings || {}),
  headerImage: settings?.headerImage || '',
});

const normalizeFormRecord = (form) => (
  form
    ? {
        ...form,
        schema: normalizeFormSchema(form.schema),
        settings: normalizeFormSettings(form.settings),
      }
    : form
);

const resolveFormHeaderImage = (form) => normalizeFormSettings(form?.settings).headerImage;

/**
 * FormBuilderModule
 * Comprehensive form builder with folder organization and drag-and-drop field management
 */
const FormBuilderModule = () => {
  const { openAIAssist } = useAIAssist();
  const [view, setView] = useState('list');
  const [forms, setForms] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentForm, setCurrentForm] = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draggedField, setDraggedField] = useState(null);
  const [activeTab, setActiveTab] = useState('display');
  const [selectedForms, setSelectedForms] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [assistTarget, setAssistTarget] = useState('');
  const [assistError, setAssistError] = useState('');

  // CMS Data Tab State
  const [showFormEntry, setShowFormEntry] = useState(false);
  const [entryForm, setEntryForm] = useState(null);
  const [cmsTables, setCmsTables] = useState([]);
  const [selectedCmsTable, setSelectedCmsTable] = useState(null);
  const [cmsTableData, setCmsTableData] = useState([]);
  const [cmsDataLoading, setCmsDataLoading] = useState(false);

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareForm, setShareForm] = useState(null);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const { confirm: systemConfirm, modalState, setPromptValue } = useSystemConfirm();
  const [saveAction, triggerSaveAction] = useTransientSaveFeedback(2000);
  const [isSaving, setIsSaving] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [headerImageAssets, setHeaderImageAssets] = useState([]);
  const [headerImageLoading, setHeaderImageLoading] = useState(false);
  const [headerImageUploading, setHeaderImageUploading] = useState(false);
  const headerImageInputRef = useRef(null);
  const selectedFieldSupportsAssist = Boolean(selectedField?.isContent);
  
  // Alert message state for error display
  const [alertMessage, setAlertMessage] = useState(null);
  
  // Prompt modal state for folder name input
  const [promptModal, setPromptModal] = useState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null, promptValue: '' });

  // Sidebar Category State
  const [expandedCategories, setExpandedCategories] = useState({ 0: true });

  const toggleCategory = (idx) => {
    setExpandedCategories(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

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

  useEffect(() => {
    if (view !== 'editor' || !currentForm) {
      return;
    }
    let active = true;
    const loadHeaderImageAssets = async () => {
      setHeaderImageLoading(true);
      try {
        const media = await getVaultApi();
        if (!active) {
          return;
        }
        setHeaderImageAssets((media || []).filter((asset) => asset?.mediaType === 'image' && asset?.sourceUrl));
      } catch (error) {
        console.error('Error loading header image assets:', error);
        if (active) {
          setHeaderImageAssets([]);
        }
      } finally {
        if (active) {
          setHeaderImageLoading(false);
        }
      }
    };
    loadHeaderImageAssets();
    return () => {
      active = false;
    };
  }, [view, currentForm?.id]);

  const fetchFolders = async () => {
    try {
      const data = await getFormFoldersApi();
      setFolders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading form folders:', error);
      setFolders([]);
    }
  };

  const fetchCmsTables = async () => {
    try {
      const data = await getCmsTablesApi();
      setCmsTables(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading CMS tables:', error);
      setCmsTables([]);
    }
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
    try {
      const data = await getFormsApi();
      setForms(Array.isArray(data) ? data.map(normalizeFormRecord) : []);
    } catch (error) {
      console.error('Error loading forms:', error);
      setForms([]);
    }
    setLoading(false);
  };

  const buildFormAssistText = (kind, field = selectedField) => {
    if (kind === 'form-name') {
      const existingName = (currentForm?.name || '').trim();
      if (existingName && existingName !== 'New Untitled Form') {
        return existingName.includes('Form') ? existingName : `${existingName} Form`;
      }
      const firstSignals = (currentForm?.schema || []).slice(0, 3).map((item) => item.label).filter(Boolean);
      if (firstSignals.length) {
        return `${firstSignals[0]} Intake Form`;
      }
      return 'Lead Intake Form';
    }

    const label = field?.label || defaultLabelForType(field);
    const normalizedName = createFieldName(label, 'field');
    switch (kind) {
      case 'label':
        return defaultLabelForType(field);
      case 'placeholder':
        if ((field?.type || '') === 'email') return 'name@company.com';
        if ((field?.type || '') === 'tel') return '(555) 555-5555';
        if ((field?.type || '') === 'textarea') return 'Share the details so AIO can route this properly...';
        if ((field?.type || '') === 'url') return 'https://example.com';
        return `Enter ${label.toLowerCase()}...`;
      case 'defaultValue':
        return field?.type === 'select' ? '' : `Sample ${label}`;
      case 'options':
        return field?.type === 'radio' ? 'Yes, No, Need More Info' : 'Option 1, Option 2, Option 3';
      case 'errorMessage':
        return `${label} is required before this form can continue.`;
      case 'fieldName':
        return normalizedName;
      default:
        return '';
    }
  };

  const applyFieldAssist = (kind) => {
    if (!selectedField) return;
    const value = buildFormAssistText(kind, selectedField);
    const propertyMap = {
      label: 'label',
      placeholder: 'placeholder',
      defaultValue: 'defaultValue',
      options: 'options',
      errorMessage: 'errorMessage',
      fieldName: 'name',
    };
    const property = propertyMap[kind];
    if (!property) return;
    updateFieldProperty(selectedField.id, property, value);
  };

  const runFormAssist = async (kind, field = selectedField) => {
    const propertyMap = {
      label: 'label',
      placeholder: 'placeholder',
      defaultValue: 'defaultValue',
      options: 'options',
      errorMessage: 'errorMessage',
      fieldName: 'name',
    };
    const property = propertyMap[kind];
    if (kind !== 'form-name' && (!field || !property)) return;

    setAssistError('');
    const key = kind === 'form-name' ? 'form-name' : `${field.id}:${kind}`;
    setAssistTarget(key);
    try {
      const suggestion = await requestAiSuggestion({
        module: 'forms',
        surface: kind === 'form-name' ? 'form-meta' : 'field-config',
        field: kind,
        currentValue:
          kind === 'form-name'
            ? currentForm?.name || ''
            : property === 'options'
              ? field?.options?.join(', ') || ''
              : field?.[property] || '',
        context: {
          formName: currentForm?.name || '',
          schemaLabels: (currentForm?.schema || []).map((item) => item.label).filter(Boolean),
          label: field?.label || '',
          type: field?.type || '',
          required: Boolean(field?.required),
        },
        fallback: () => buildFormAssistText(kind, field),
      });

      if (!suggestion) return;
      if (kind === 'form-name') {
        setCurrentForm((prev) => prev ? { ...prev, name: suggestion } : prev);
      } else {
        updateFieldProperty(field.id, property, suggestion);
      }
    } catch (error) {
      setAssistError(error.message || 'Unable to generate AI copy right now.');
    } finally {
      setAssistTarget('');
    }
  };

  const createNewForm = async () => {
      const newForm = {
      name: "New Untitled Form",
      folderId: folders[0]?.id || null,
      status: "Draft",
      isActive: false,
      responsesCount: 0,
      lastActive: "Just now",
      lastModifiedBy: "AIO Flow™",
      lastModifiedAt: new Date().toISOString(),
      creator: "AIO Flow™",
      triggers: null,
      automation: null,
      settings: { ...defaultFormSettings },
      slug: `form-${Date.now()}`,
      schema: []
    };
    try {
      const data = await createFormApi(newForm);
      if (data) {
        const normalized = normalizeFormRecord(data);
        setForms(prev => [normalized, ...prev]);
        setCurrentForm(normalized);
        setView('editor');
      }
    } catch (error) {
      console.error('Error creating form:', error);
    }
  };

  const createFormFromTemplate = async (template) => {
    const timestamp = Date.now();
    const newForm = {
      name: template?.name || "New Untitled Form",
      folderId: folders[0]?.id || null,
      status: "Draft",
      isActive: false,
      responsesCount: 0,
      lastActive: "Just now",
      lastModifiedBy: "AIO Flow™",
      lastModifiedAt: new Date().toISOString(),
      creator: "AIO Flow™",
      triggers: null,
      automation: null,
      settings: {
        ...defaultFormSettings,
        templateSourceId: template?.id || null,
        templateSourceName: template?.name || null,
      },
      slug: `form-${timestamp}`,
      schema: buildTemplateSchema(template?.fields || []),
    };

    const created = await createFormApi(newForm);
    if (created) {
      const normalized = normalizeFormRecord(created);
      setForms(prev => [normalized, ...prev]);
      setCurrentForm(normalized);
      setSelectedField(null);
      setShowTemplateGallery(false);
      setView('editor');
    }
  };

  const updateCurrentFormSettings = (partialSettings) => {
    if (!currentForm) {
      return;
    }
    setCurrentForm({
      ...currentForm,
      settings: {
        ...normalizeFormSettings(currentForm.settings),
        ...partialSettings,
      },
    });
  };

  const handleHeaderImageUpload = async (file) => {
    if (!file) {
      return;
    }
    try {
      setHeaderImageUploading(true);
      const uploaded = await uploadMediaFileApi(file);
      const asset = uploaded?.asset || null;
      if (asset?.sourceUrl) {
        updateCurrentFormSettings({ headerImage: asset.sourceUrl });
        setHeaderImageAssets((previous) => {
          const next = previous.filter((item) => item.assetId !== asset.assetId);
          return [asset, ...next];
        });
      }
    } catch (error) {
      console.error('Error uploading form header image:', error);
      setAlertMessage(`Failed to upload header image: ${error.message}`);
      setTimeout(() => setAlertMessage(null), 3000);
    } finally {
      setHeaderImageUploading(false);
      if (headerImageInputRef.current) {
        headerImageInputRef.current.value = '';
      }
    }
  };

  const handleCreateFolder = async () => {
    setPromptModal({
      isOpen: true,
      title: 'Create Folder',
      message: 'Enter a name for the new folder:',
      defaultValue: 'New Folder',
      onConfirm: async (name) => {
        if (name) {
          try {
            const data = await createFormFolderApi({
              name,
              userId: '1',
              createdAt: new Date().toISOString(),
              expanded: true
            });
            if (data) {
              setFolders(prev => [...prev, data]);
            }
          } catch (error) {
            console.error('Error creating folder:', error);
            setAlertMessage('Failed to create folder: ' + error.message);
            setTimeout(() => setAlertMessage(null), 3000);
          }
        }
      }
    });
  };

  const handleRenameFolder = async (folderId, newName) => {
    try {
      await updateFormFolderApi(folderId, { name: newName });
      await fetchFolders();
    } catch (error) {
      setAlertMessage('Failed to rename folder: ' + error.message);
      setTimeout(() => setAlertMessage(null), 3000);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    const isConfirmed = await systemConfirm({
      title: 'Delete Folder',
      message: 'Delete this folder? This will NOT delete forms inside it; they will become Uncategorized.',
      confirmText: 'Delete Folder',
      variant: 'danger'
    });

    if (isConfirmed) {
      try {
        await deleteFormFolderApi(folderId);
        await fetchFolders();
        await fetchForms();
      } catch (error) {
        setAlertMessage('Failed to delete folder: ' + error.message);
        setTimeout(() => setAlertMessage(null), 3000);
      }
    }
  };

  const handleCopyFolder = async (folder) => {
    try {
      await createFormFolderApi({ name: `${folder.name} (Copy)` });
      await fetchFolders();
    } catch (error) {
      setAlertMessage('Failed to copy folder: ' + error.message);
      setTimeout(() => setAlertMessage(null), 3000);
    }
  };

  const bulkDeleteSelectedForms = async () => {
    const totalSelected = selectedForms.length + selectedFolders.length;
    if (totalSelected === 0) return;
    const isConfirmed = await systemConfirm({
      title: 'Delete Selected',
      message: `Are you sure you want to delete ${totalSelected} selected item${totalSelected > 1 ? 's' : ''}? This action is irreversible.`,
      confirmText: `Delete ${totalSelected} Item${totalSelected > 1 ? 's' : ''}`,
      variant: 'danger'
    });
    if (isConfirmed) {
      try {
        setLoading(true);
        if (selectedForms.length > 0) {
          await bulkDeleteFormsApi(selectedForms);
        }
        for (const folderId of selectedFolders) {
          await deleteFormFolderApi(folderId).catch(() => {});
        }
        setSelectedForms([]);
        setSelectedFolders([]);
        await fetchForms();
      } catch (error) {
        setAlertMessage('Failed to delete: ' + error.message);
        setTimeout(() => setAlertMessage(null), 3000);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleOpenFormEntry = (form) => {
    setEntryForm(form);
    setShowFormEntry(true);
  };

  const handleOpenPublicLink = (form) => {
    // In a real app this opens the public URL
    window.open(`/form/${form.slug || form.id}`, '_blank');
  };

  const toggleFolder = (folderId) => {
    setFolders(prev => prev.map(f =>
      f.id === folderId ? { ...f, expanded: !f.expanded } : f
    ));
    const currentFolder = folders.find((folder) => folder.id === folderId);
    updateFormFolderApi(folderId, { expanded: !(currentFolder?.expanded) }).catch((error) => {
      console.error('Error updating folder visibility:', error);
    });
  };

  const toggleFormSelection = (formId) => {
    setSelectedForms(prev =>
      prev.includes(formId)
        ? prev.filter(id => id !== formId)
        : [...prev, formId]
    );
  };

  const toggleSelectAllForms = () => {
    if (selectedForms.length === forms.length && selectedFolders.length === folders.length) {
      setSelectedForms([]);
      setSelectedFolders([]);
    } else {
      setSelectedForms(forms.map(f => f.id));
      setSelectedFolders(folders.map(f => f.id));
    }
  };

  const toggleFolderSelection = (folderId) => {
    setSelectedFolders(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };


  const deleteForm = async (formId) => {
    const isConfirmed = await systemConfirm({
      title: 'Delete Form',
      message: 'Are you sure you want to delete this form? All data associated with it will be removed.',
      confirmText: 'Delete Form',
      variant: 'danger'
    });
    if (isConfirmed) {
      try {
        await deleteFormApi(formId);
        fetchForms();
        fetchCmsTables();
      } catch (error) {
        console.error('Error deleting form:', error);
      }
    }
  };

  const handleAddField = (tool) => {
    if (!currentForm) return;
    const newField = normalizeFormField({
      id: `field-${Date.now()}`,
      name: buildUniqueFieldName(tool.defaultLabel || tool.type, currentForm.schema || []),
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
      content: tool.type === 'content' ? '<b>Add a section title</b>' : '',
      // Validation fields
      minLength: '',
      maxLength: '',
      pattern: '',
      customValidation: '',
      errorMessage: '',
      mapToContact: tool.type === 'email' ? 'email' : tool.type === 'tel' ? 'phone' : null,
      isIdentifier: tool.type === 'email',
      isContent: isContentFieldType(tool.type),
    });

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
        if (key === 'label' && !f.name) {
          updated.name = buildUniqueFieldName(value, currentForm.schema, fieldId);
        }
        if (key === 'name') {
          updated.name = buildUniqueFieldName(value, currentForm.schema, fieldId);
        }
        if (key === 'options' && typeof value === 'string') {
          updated.options = value.split(',').map(o => o.trim());
        }
        if (key === 'type') {
          updated.isContent = isContentFieldType(value);
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
    try {
      setIsSaving(true);
      const normalizedSchema = [];
      for (const field of currentForm.schema || []) {
        const normalizedField = normalizeFormField({
          ...field,
          name: field.name || buildUniqueFieldName(field.label || field.type, normalizedSchema),
          isContent: typeof field.isContent === 'boolean' ? field.isContent : isContentFieldType(field.type),
        });
        normalizedSchema.push(normalizedField);
      }
      const savedForm = await updateFormApi(currentForm.id, {
        schema: normalizedSchema,
        name: currentForm.name,
        folderId: currentForm.folderId,
      slug: currentForm.slug || `form-${Date.now()}`,
        settings: currentForm.settings,
        status: currentForm.status,
        isActive: currentForm.isActive
      });
      if (savedForm) {
        setCurrentForm(normalizeFormRecord(savedForm));
      }
      triggerSaveAction('form-saved');
      fetchForms();
      fetchCmsTables();
    } catch (error) {
      console.error('Error saving form:', error);
      setAlertMessage('Failed to save form: ' + error.message);
      setTimeout(() => setAlertMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
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
    const recentForms = [...forms]
      .sort((left, right) => {
        const leftTime = Date.parse(left?.lastModifiedAt || left?.updatedAt || left?.createdAt || '');
        const rightTime = Date.parse(right?.lastModifiedAt || right?.updatedAt || right?.createdAt || '');
        return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
      })
      .slice(0, 6);

    const tableColumns = [
      {
        header: "",
        key: "share",
        width: "40px",
        render: (form) => (
          <button
            onClick={() => { setShareForm(form); setShowShareModal(true); }}
            className="p-1.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-hover)]"
            title="Share Form"
          >
            <Link size={16} />
          </button>
        )
      },
      {
        header: "Form Name",
        key: "name",
        render: (form) => (
          <button
            onClick={() => { setCurrentForm(normalizeFormRecord(form)); setView('editor'); }}
            className="text-sm text-[var(--color-text-primary)] font-medium hover:text-[var(--color-primary)] text-left"
          >
            {form.name}
          </button>
        )
      },
      {
        header: "Source",
        key: "source",
        width: "180px",
        render: (form) => {
          const templateName = form.templateSourceName || form.metadata?.sourceTemplateName;
          if (templateName) {
            return (
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  <Tag size={11} />
                  Template
                </span>
                <div className="text-xs text-[var(--color-text-secondary)]">{templateName}</div>
              </div>
            );
          }
          return (
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                Custom
              </span>
              <div className="text-xs text-[var(--color-text-tertiary)]">Blank / Custom</div>
            </div>
          );
        }
      },
      {
        header: "Automation",
        key: "automation",
        width: "100px",
        render: (form) => {
          const flowCount = form.flowIds?.length || 0;
          return (
            <span className="text-xs text-[var(--color-text-secondary)]">
              {flowCount} {flowCount === 1 ? 'flow' : 'flows'}
            </span>
          );
        }
      },
      {
        header: "Status",
        key: "status",
        width: "100px",
        render: (form) => (
          <button
            onClick={() => {
              const newActive = !form.isActive;
              const newStatus = newActive ? 'Live' : 'Draft';
              setForms(prev => prev.map(f => f.id === form.id ? { ...f, isActive: newActive, status: newStatus } : f));
              updateFormApi(form.id, { status: newStatus, isActive: newActive }).then(() => {
                fetchForms();
              }).catch((err) => {
                console.error('Toggle failed, reverting:', err);
                setForms(prev => prev.map(f => f.id === form.id ? { ...f, isActive: !newActive, status: !newActive ? 'Live' : 'Draft' } : f));
              });
            }}
            className={`w-12 h-6 rounded-full relative transition-colors ${
              form.isActive
                ? 'bg-green-500'
                : 'bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                form.isActive ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        )
      },
      {
        header: "Last Modified",
        key: "lastModifiedAt",
        width: "160px",
        render: (form) => (
          <div className="text-xs text-[var(--color-text-secondary)]">
            <div>By {form.lastModifiedBy || '-'}</div>
            <div className="text-[var(--color-text-tertiary)]">
              {form.lastModifiedAt ? new Date(form.lastModifiedAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
              }) : '-'}
            </div>
          </div>
        )
      },
      {
        header: "",
        key: "actions",
        width: "220px",
        render: (form) => (
          <div className="flex items-center gap-1">
            <button
              onClick={() => deleteForm(form.id)}
              className="p-1.5 rounded text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-[var(--color-hover)] transition"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => {
                const newName = prompt('Rename form:', form.name);
                if (newName && newName.trim()) {
                  updateFormApi(form.id, { name: newName.trim() }).then(() => fetchForms());
                }
              }}
              className="px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-hover)] rounded transition"
              title="Rename"
            >
              Rename
            </button>
            <button
              onClick={() => {
                setCurrentForm(normalizeFormRecord(form));
                setView('editor');
              }}
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition"
              title="Open"
            >
              Open
            </button>
          </div>
        )
      }
    ];

    return (
      <>
        <div className="module-root-standard">
          <ModuleHeader
            title="Forms"
            showTitle={false}
            onModuleAi={() => toggleAIAssist?.({ mode: 'help', context: { module: 'forms', surface: 'library', formsCount: forms.length } })}
            leftActions={[
              {
                label: 'Create Form',
                icon: Plus,
                onClick: createNewForm,
                variant: 'secondary'
              },
              {
                label: 'New Folder',
                icon: Folder,
                onClick: handleCreateFolder,
                variant: 'secondary'
              }
            ]}
            toolbarCenterSlot={(
              <div className="relative w-full max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                  placeholder="Search forms"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-2 pl-10 pr-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            )}
            toolbarRightSlot={(
              <div className="flex items-center gap-2 font-bold">
                <button
                  type="button"
                  onClick={() => setView('cms')}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-hover)] hover:border-[var(--color-primary)]/40 h-8"
                >
                  <Database size={14} />
                  <span className="uppercase text-[10px] font-bold tracking-widest">CMS Data</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTemplateGallery(true)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:bg-[var(--color-hover)] hover:border-[var(--color-primary)]/40 h-8"
                >
                  <Layers size={14} />
                  <span className="uppercase text-[10px] font-bold tracking-widest">Browse Gallery</span>
                </button>
              </div>
            )}
          />

          <div className="module-surface-shell px-1.5 py-1.5">
            <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
              <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto no-scrollbar">
                <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Recent Forms</div>
                {recentForms.length > 0 ? (
                  recentForms.map((form) => (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => {
                        setCurrentForm(normalizeFormRecord(form));
                        setView('editor');
                      }}
                      className="inline-flex shrink-0 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2.5 text-left text-xs text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-hover)]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-accent)]">
                        <FileText size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{form.name}</div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                          {(form.schema || []).length} field{(form.schema || []).length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="shrink-0 text-sm text-[var(--color-text-secondary)]">Create a form or browse templates to populate this workspace.</div>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <FolderTable
              title="Saved Forms"
              description="Browse folders, search forms, and open the full builder."
              folders={folders}
              items={forms}
              columns={tableColumns}
              onFolderToggle={toggleFolder}
              onFolderRename={handleRenameFolder}
              onFolderDelete={handleDeleteFolder}
              onFolderCopy={handleCopyFolder}
              onItemSelect={toggleFormSelection}
              onSelectAll={toggleSelectAllForms}
              selectedItems={selectedForms}
              selectedFolders={selectedFolders}
              onFolderSelect={toggleFolderSelection}
              actions={
                (selectedForms.length + selectedFolders.length) > 0 && (
                  <button
                    onClick={bulkDeleteSelectedForms}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded border border-red-500/30 transition shadow-sm"
                  >
                    <Trash2 size={14} />
                    <span>DELETE SELECTED ({selectedForms.length + selectedFolders.length})</span>
                  </button>
                )
              }
              showHeader={false}
              searchQuery={tableSearch}
              onSearchQueryChange={setTableSearch}
            />
          </div>
        </div>
        <FormTemplateGallery
          isOpen={showTemplateGallery}
          onClose={() => setShowTemplateGallery(false)}
          onSelectTemplate={createFormFromTemplate}
        />
        <SystemConfirmModal
          isOpen={modalState.isOpen}
          onClose={modalState.onClose}
          onConfirm={() => modalState.onConfirm(modalState.promptValue)}
          title={modalState.title}
          message={modalState.message}
          variant={modalState.variant}
          confirmText={modalState.confirmText}
          cancelText={modalState.cancelText}
          showPrompt={modalState.showPrompt}
          promptValue={modalState.promptValue}
          onPromptChange={setPromptValue}
        />
        {saveAction === 'form-saved' && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-5 duration-300">
            <div className="bg-[var(--color-bg-primary)]/90 backdrop-blur-md border border-green-500/30 text-green-400 px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest ring-1 ring-green-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>System Synchronized</span>
            </div>
          </div>
        )}
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
        {showShareModal && shareForm && (
          <ShareFormModal
            form={shareForm}
            onClose={() => {
              setShowShareModal(false);
              setShareForm(null);
            }}
          />
        )}
      </>
    );
  }

  // CMS Data View
  if (view === 'cms') {
    return <CMSView onBack={() => setView('list')} />;
  }

  // Editor View
  return (
      <div className="module-root-standard bg-transparent">
      <ModuleHeader
        title="Forms"
        showTitle={false}
        onModuleAi={() => toggleAIAssist?.({
          mode: 'help',
          context: {
            module: 'forms',
            surface: 'builder',
            formId: currentForm?.id,
            formName: currentForm?.name,
            selectedFieldId: selectedField?.id || null,
            selectedFieldName: selectedField?.name || null,
          }
        })}
        leftActions={[
          {
            label: 'Back to List',
            icon: ArrowLeft,
            onClick: () => {
              setCurrentForm(null);
              setSelectedField(null);
              setView('list');
            },
            variant: 'secondary'
          }
        ]}
        toolbarCenterSlot={(
          <div className="w-full max-w-md">
            <input
              value={currentForm?.name || ''}
              onChange={(e) => setCurrentForm({ ...currentForm, name: e.target.value })}
              className="h-9 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-sm font-semibold text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-primary)]"
              placeholder="Enter form name..."
            />
          </div>
        )}
        toolbarRightSlot={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenPublicLink(currentForm)}
              className="btn-secondary inline-flex h-8 shrink-0 items-center justify-center gap-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em]"
              title="Open public form"
            >
              <ExternalLink size={12} />
              <span>Open</span>
            </button>
            <button
              type="button"
              onClick={handleSaveForm}
              disabled={isSaving}
              className={`btn-secondary inline-flex h-8 shrink-0 items-center justify-center gap-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] ${saveAction === 'form-saved' ? 'border-green-500/40 text-green-300' : ''}`}
            >
              <Save size={12} />
              <span>{isSaving ? 'Saving' : saveAction === 'form-saved' ? 'Saved' : 'Save Form'}</span>
            </button>
          </div>
        )}
      />
      {alertMessage && (
        <div className="fixed top-4 right-4 z-50 bg-red-500/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg shadow-xl">
          {alertMessage}
        </div>
      )}
      
      <SystemConfirmModal
        isOpen={promptModal.isOpen}
        onClose={() => setPromptModal({ ...promptModal, isOpen: false })}
        onConfirm={() => {
          if (promptModal.onConfirm) promptModal.onConfirm(promptModal.promptValue);
          setPromptModal({ ...promptModal, isOpen: false });
        }}
        title={promptModal.title}
        message={promptModal.message}
        confirmText="Create"
        cancelText="Cancel"
        showPrompt={true}
        promptValue={promptModal.promptValue || ''}
        onPromptChange={(val) => setPromptModal({ ...promptModal, promptValue: val })}
        promptPlaceholder={promptModal.defaultValue || 'Enter name...'}
        variant="info"
      />
      <div className="module-content-stage flex bg-transparent gap-1.5">
      {/* Left Sidebar - Field Tools */}
      <div className="w-56 min-h-0 shrink-0 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-tertiary)] flex flex-col overflow-y-auto no-scrollbar">
        <div className="p-1.5 space-y-0.5">
          {FORM_TOOLS.map((category, idx) => (
            <div key={idx}>
              <button
                onClick={() => toggleCategory(idx)}
                className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider hover:text-[var(--color-text-secondary)]"
              >
                {category.category}
                <ChevronDown size={12} className={`transition-transform ${expandedCategories[idx] ? 'rotate-180' : ''}`} />
              </button>
              {expandedCategories[idx] && (
                <div className="flex flex-col gap-0.5 px-1 pb-1">
                  {category.items.map((tool, tIdx) => (
                    <button
                      key={tIdx}
                      onClick={() => handleAddField(tool)}
                      className="w-full flex justify-start items-center gap-1.5 px-2 py-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-[var(--color-primary)] rounded text-[10px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
                      title={tool.label}
                    >
                      <tool.icon size={12} />
                      <span>{tool.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-8 relative">
            <div className="max-w-3xl mx-auto space-y-4 pb-20">
              {resolveFormHeaderImage(currentForm) ? (
                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                  <img
                    src={resolveFormHeaderImage(currentForm)}
                    alt={`${currentForm?.name || 'Form'} header`}
                    className="h-44 w-full object-cover"
                  />
                </div>
              ) : null}
              {currentForm?.schema?.length === 0 && (
              <div className="text-center text-[var(--color-text-tertiary)] py-20 border-2 border-dashed border-[var(--color-border)] rounded-xl flex flex-col items-center justify-center">
                <Box size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-medium text-[var(--color-text-primary)]">Start with a field.</p>
                <p className="text-xs mt-2">Choose a field from the left to begin.</p>
              </div>
            )}
            {assistError ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {assistError}
              </div>
            ) : null}
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

      {/* Right Sidebar - Field Configuration */}
      <div className="w-80 min-h-0 shrink-0 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-tertiary)] flex flex-col overflow-hidden">
        {selectedField ? (
          <>
            <div className="border-b border-[var(--color-border)] flex bg-[var(--color-bg-primary)]">
              {['Display', 'Data', 'Validation', ...(selectedField.type === 'purchase' ? ['Purchase'] : [])].map(tab => (
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
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              {activeTab === 'display' && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase">Label</label>
                      {selectedFieldSupportsAssist ? (
                        <AIAssistButton variant="inline" onAssist={() => runFormAssist('label')} loading={assistTarget === `${selectedField.id}:label`} tooltip="Draft field label" />
                      ) : null}
                    </div>
                    <input value={selectedField.label} onChange={(e) => updateFieldProperty(selectedField.id, 'label', e.target.value)} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase">Placeholder</label>
                      {selectedFieldSupportsAssist ? (
                        <AIAssistButton variant="inline" onAssist={() => runFormAssist('placeholder')} loading={assistTarget === `${selectedField.id}:placeholder`} tooltip="Draft placeholder copy" />
                      ) : null}
                    </div>
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
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase">Default Value</label>
                      {selectedFieldSupportsAssist ? (
                        <AIAssistButton variant="inline" onAssist={() => runFormAssist('defaultValue')} loading={assistTarget === `${selectedField.id}:defaultValue`} tooltip="Draft default value" />
                      ) : null}
                    </div>
                    <input
                      value={selectedField.defaultValue || ''}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'defaultValue', e.target.value)}
                      className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                      placeholder="Enter default value"
                    />
                  </div>
                  {(selectedField.type === 'select' || selectedField.type === 'radio') && (
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase">Options (comma-separated)</label>
                        {selectedFieldSupportsAssist ? (
                          <AIAssistButton variant="inline" onAssist={() => runFormAssist('options')} loading={assistTarget === `${selectedField.id}:options`} tooltip="Draft field options" />
                        ) : null}
                      </div>
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
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label className="block text-xs font-bold text-[var(--color-text-tertiary)] uppercase">Error Message</label>
                          {selectedFieldSupportsAssist ? (
                            <AIAssistButton variant="inline" onAssist={() => runFormAssist('errorMessage')} loading={assistTarget === `${selectedField.id}:errorMessage`} tooltip="Draft validation message" />
                          ) : null}
                        </div>
                        <textarea
                      value={selectedField.errorMessage || ''}
                      onChange={(e) => updateFieldProperty(selectedField.id, 'errorMessage', e.target.value)}
                      className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none h-20"
                      placeholder="Custom error message"
                    />
                  </div>
                </div>
              )}
              {activeTab === 'purchase' && selectedField.type === 'purchase' && (
                <div className="space-y-4">
                  <div className="border-b border-[var(--color-border)] pb-4">
                    <h4 className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Products</h4>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={selectedField.allowMultipleProducts || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'allowMultipleProducts', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Allow Multiple Products
                    </label>
                  </div>

                  <div className="border-b border-[var(--color-border)] pb-4">
                    <h4 className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Pricing</h4>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)] mb-2">
                      <input
                        type="checkbox"
                        checked={selectedField.showProductPrices !== false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'showProductPrices', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Show Product Prices
                    </label>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={selectedField.showTotalPrice || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'showTotalPrice', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Show Total Price
                    </label>
                  </div>

                  <div className="border-b border-[var(--color-border)] pb-4">
                    <h4 className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Payment</h4>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)] mb-2">
                      <input
                        type="checkbox"
                        checked={selectedField.showCouponCode || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'showCouponCode', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Show Coupon Code
                    </label>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)] mb-2">
                      <input
                        type="checkbox"
                        checked={selectedField.showCreditCardInput || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'showCreditCardInput', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Show Credit Card Input
                    </label>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)] mb-2">
                      <input
                        type="checkbox"
                        checked={selectedField.collectCardHolderName || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'collectCardHolderName', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Collect Cardholder Name
                    </label>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={selectedField.showCvv || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'showCvv', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Show CVV
                    </label>
                  </div>

                  <div className="border-b border-[var(--color-border)] pb-4">
                    <h4 className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Customer Info</h4>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)] mb-2">
                      <input
                        type="checkbox"
                        checked={selectedField.collectEmail || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'collectEmail', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Collect Email
                    </label>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)] mb-2">
                      <input
                        type="checkbox"
                        checked={selectedField.collectPhone || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'collectPhone', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Collect Phone
                    </label>
                    <div>
                      <label className="block text-xs text-[var(--color-text-tertiary)] uppercase mb-2">Billing Address</label>
                      <select
                        value={selectedField.collectBillingAddress || 'none'}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'collectBillingAddress', e.target.value)}
                        className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      >
                        <option value="none">None</option>
                        <option value="zip">Zip Only</option>
                        <option value="full">Full Address</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-b border-[var(--color-border)] pb-4">
                    <h4 className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Confirmation</h4>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)] mb-3">
                      <input
                        type="checkbox"
                        checked={selectedField.addBillingConfirmation || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'addBillingConfirmation', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Add Billing Confirmation
                    </label>
                    {selectedField.addBillingConfirmation && (
                      <div>
                        <label className="block text-xs text-[var(--color-text-tertiary)] uppercase mb-2">Confirmation Text</label>
                        <textarea
                          value={selectedField.billingConfirmationText || 'I agree to {offerPrice} starting today until cancelled online.'}
                          onChange={(e) => updateFieldProperty(selectedField.id, 'billingConfirmationText', e.target.value)}
                          className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] resize-none h-20"
                          placeholder="Use {offerPrice} as a token"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Notifications</h4>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)] mb-2">
                      <input
                        type="checkbox"
                        checked={selectedField.disableDefaultWelcomeEmail || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'disableDefaultWelcomeEmail', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Disable Welcome Email
                    </label>
                    <label className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={selectedField.disableDefaultPaymentConfirmation || false}
                        onChange={(e) => updateFieldProperty(selectedField.id, 'disableDefaultPaymentConfirmation', e.target.checked)}
                        className="w-4 h-4 rounded bg-[var(--color-bg-primary)] border-gray-600 text-[var(--color-primary)]"
                      />
                      Disable Payment Confirmation
                    </label>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col overflow-y-auto p-5">
            <div className="mb-4 flex items-center gap-3 border-b border-[var(--color-border)] pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)]">
                <Settings size={18} />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Form Settings</div>
                <div className="text-sm text-[var(--color-text-secondary)]">Top-level metadata and branding.</div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Header Image</label>
                <input
                  value={resolveFormHeaderImage(currentForm)}
                  onChange={(e) => updateCurrentFormSettings({ headerImage: e.target.value })}
                  placeholder="Paste image URL or media source URL"
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-[var(--color-text-tertiary)]">Use Existing Image</label>
                <select
                  value={resolveFormHeaderImage(currentForm)}
                  onChange={(e) => updateCurrentFormSettings({ headerImage: e.target.value })}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="">{headerImageLoading ? 'Loading images...' : 'Select image asset'}</option>
                  {headerImageAssets.map((asset) => (
                    <option key={asset.assetId || asset.sourceUrl} value={asset.sourceUrl}>
                      {asset.title || asset.assetId || asset.sourceUrl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={headerImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleHeaderImageUpload(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => headerImageInputRef.current?.click()}
                  disabled={headerImageUploading}
                  className="inline-flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-primary)] transition hover:border-[var(--color-primary)] disabled:opacity-60"
                >
                  <UploadCloud size={14} />
                  {headerImageUploading ? 'Uploading...' : 'Upload Image'}
                </button>
                {resolveFormHeaderImage(currentForm) ? (
                  <button
                    type="button"
                    onClick={() => updateCurrentFormSettings({ headerImage: '' })}
                    className="inline-flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
                  >
                    <Trash2 size={14} />
                    Clear
                  </button>
                ) : null}
              </div>
              {resolveFormHeaderImage(currentForm) ? (
                <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                  <img
                    src={resolveFormHeaderImage(currentForm)}
                    alt={`${currentForm?.name || 'Form'} header preview`}
                    className="h-28 w-full object-cover"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-text-tertiary)]">
                  Select a field to configure, or add a header image here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

FormBuilderModule.propTypes = {
  // No props currently, but ready for future additions
};

export default FormBuilderModule;

import React, { useState, useEffect, useRef } from 'react';
import { Key, Settings, Save, User, Mail, Shield, Smartphone, Globe, Clock, PenTool, CreditCard, Box, Lock, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Edit2, Plus, Palette, Cog, Package, Inbox, FileCode, Layers, Search, Monitor, LogOut, Sparkles } from 'lucide-react';
import ModuleHeader from '../../components/ModuleHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useBrand } from '../../contexts/BrandContext';
import { clearStoredSessionToken } from '../../services/authStorage';
import {
  addWorkspaceMemberApi,
  armOmegaApi,
  cancelOmegaApi,
  changePasswordApi,
  createWorkspaceApi,
  deleteGlobalVariableApi,
  executeOmegaApi,
  getAuthSessionsApi,
  getCanonicalSettingsApi,
  getOmegaStatusApi,
  getProfileApi,
  getWorkspaceMembershipsApi,
  logoutOtherSessionsApi,
  removeWorkspaceMemberApi,
  revokeAuthSessionApi,
  updateCanonicalTenantSettingsApi,
  updateProfileApi,
  updateSystemEmailTemplateApi,
  updateWorkspaceApi,
  updateWorkspaceMemberApi,
  upsertGlobalVariableApi
} from '../../services/backendApi';

const useTransientSaveFeedback = (duration = 1400) => {
  const [savedKey, setSavedKey] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
  }, []);

  const triggerSaved = (key) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    setSavedKey(key);
    timeoutRef.current = window.setTimeout(() => {
      setSavedKey('');
      timeoutRef.current = null;
    }, duration);
  };

  return [savedKey, triggerSaved];
};

const saveButtonClassName = (baseClassName, isSaved) => `${baseClassName} save-feedback-btn${isSaved ? ' is-saved' : ''}`;

const loadCanonicalTenantSettings = async () => {
  const bundle = await getCanonicalSettingsApi();
  return bundle?.tenantSettings || {};
};

const mapCanonicalGlobalVariables = (tenantSettings = {}) => {
  const variables = tenantSettings?.globalVariables || {};
  return Object.entries(variables).map(([key, details]) => ({
    id: details?.id || key,
    key,
    value: details?.value || '',
    label: details?.label || key,
    category: details?.category || 'custom',
    editableByClient: Boolean(details?.editableByClient),
    description: details?.description || '',
    is_secret: Boolean(details?.isSecret),
    is_system: Boolean(details?.isSystem),
  }));
};

const mapCanonicalSystemEmailTemplates = (tenantSettings = {}, search = '') => {
  const templates = tenantSettings?.comms?.systemEmailTemplates || {};
  const rows = Object.values(templates).filter((template) => template && typeof template === 'object');
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? rows.filter((template) => [template.emailType, template.subject, template.sendTo].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))
    : rows;
  return filtered
    .map((template) => ({
      id: template.id,
      template_key: template.templateKey,
      email_type: template.emailType,
      subject: template.subject || '',
      send_to: template.sendTo || '',
      enabled: Boolean(template.enabled),
      body_html: template.bodyHtml,
      body_text: template.bodyText,
      edited_by_name: template.editedByName || template.edited_by_name,
      edited_at: template.editedAt || template.edited_at,
      config: template.config || {},
      updated_at: template.updatedAt || template.updated_at,
    }))
    .sort((left, right) => String(left.email_type || '').localeCompare(String(right.email_type || '')));
};

const formatOmegaCountdown = (executeAt, nowTick) => {
  if (!executeAt) {
    return 'Not armed';
  }
  const remainingMs = new Date(executeAt).getTime() - nowTick;
  if (remainingMs <= 0) {
    return 'Ready to execute';
  }
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} remaining`;
};

// ============ GLOBAL VARIABLES MANAGER ============
const GlobalVarsManager = () => {
  const [vars, setVars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [error, setError] = useState('');
  const [isSystem, setIsSystem] = useState(false);
  const [status, setStatus] = useState('');
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();

  useEffect(() => { fetchVars(); }, []);

  const fetchVars = async () => {
    setLoading(true);
    setError('');
    try {
      const tenantSettings = await loadCanonicalTenantSettings();
      setVars(mapCanonicalGlobalVariables(tenantSettings));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load variables.');
    } finally {
      setLoading(false);
    }
  };

  const addVar = async () => {
    setError('');
    setStatus('');
    let finalKey = newKey.trim();
    if (!finalKey || !newValue) {
      setError("Key and Value are required.");
      return;
    }
    const isValidSystemKey = /^[A-Z0-9_]+$/.test(finalKey);
    const isTemplateKey = finalKey.startsWith('{{') && finalKey.endsWith('}}');

    if (!isValidSystemKey && !isTemplateKey) {
      finalKey = `{{${finalKey}}}`;
    }

    try {
      await upsertGlobalVariableApi({
        key: finalKey,
        value: newValue,
        description: newDesc,
        is_secret: isSecret,
        is_system: isSystem || isValidSystemKey
      });
      setNewKey('');
      setNewValue('');
      setNewDesc('');
      setIsSecret(false);
      setIsSystem(false);
      setStatus('Variable saved.');
      triggerSavedAction('add-variable');
      await fetchVars();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save variable.');
    }
  };

  const deleteVar = async (id) => {
    setError('');
    setStatus('');
    try {
      await deleteGlobalVariableApi(id);
      setVars(current => current.filter(item => item.id !== id));
      setStatus('Variable removed.');
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to remove variable.');
    }
  };

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-[var(--radius-outer)] border border-[var(--color-border)] flex flex-col overflow-hidden shadow-island">
      <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Key size={20} className="text-[var(--color-primary)]" /> Global Variables</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">Manage {'{{userVariables}}'} and system keys.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[var(--color-bg-primary)]">
        <div className="bg-[var(--color-bg-secondary)] p-4 rounded-lg border border-[var(--color-border)] space-y-4">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3"><input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Key (e.g. userEmail)" className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" /></div>
            <div className="col-span-4"><input value={newValue} onChange={e => setNewValue(e.target.value)} type={isSecret ? "password" : "text"} placeholder="Value" className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" /></div>
            <div className="col-span-3"><input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description" className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none" /></div>
            <div className="col-span-2 flex gap-2">
              <button onClick={() => setIsSecret(!isSecret)} className={`p-2 rounded-[var(--radius-card)] ${isSecret ? 'bg-yellow-500/20 text-yellow-500' : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'}`} title="Secret"><Lock size={16} /></button>
              <button onClick={() => setIsSystem(!isSystem)} className={`p-2 rounded-[var(--radius-card)] ${isSystem ? 'bg-blue-500/20 text-blue-300' : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'}`} title="System Variable"><Cog size={16} /></button>
              <button onClick={addVar} className={saveButtonClassName("flex-1 btn-primary-skeuo text-sm font-medium py-2 rounded-[var(--radius-card)]", savedAction === 'add-variable')}>{savedAction === 'add-variable' ? 'Saved' : 'Add'}</button>
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {status && <p className="text-xs text-emerald-400">{status}</p>}
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-12 px-4 text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider"><div className="col-span-3">Key</div><div className="col-span-4">Value</div><div className="col-span-4">Description</div><div className="col-span-1 text-right">Action</div></div>
          <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)]">{vars.map(v => (<div key={v.id} className="grid grid-cols-12 px-4 py-3 items-center text-sm"><div className="col-span-3 font-mono text-[var(--color-primary)]/70">{v.key}</div><div className="col-span-4 text-[var(--color-text-primary)] truncate font-mono">{v.is_secret ? '••••••••' : v.value}</div><div className="col-span-4 text-[var(--color-text-secondary)] text-xs">{v.description || '-'}</div><div className="col-span-1 text-right"><button onClick={() => deleteVar(v.id)} className="text-[var(--color-text-secondary)] hover:text-red-500"><Trash2 size={14} /></button></div></div>))}</div>
        </div>
      </div>
    </div>
  );
};

// ============ WHITE LABEL SETTINGS ============
const WhiteLabelSettings = ({ menuStructure, onMenuUpdate }) => {
  const [activeTab, setActiveTab] = useState('branding');
  const [expandedCategory, setExpandedCategory] = useState('Main');
  const [menuItems, setMenuItems] = useState([]);
  const [menuDraftDirty, setMenuDraftDirty] = useState(false);
  const { tenant, refreshSession } = useAuth();
  const { setBrandConfig } = useBrand();
  const tenantSettings = tenant?.tenant_settings || tenant?.settings || {};
  const persistedMenuStructure = Array.isArray(tenantSettings?.navigation?.menuStructure)
    ? tenantSettings.navigation.menuStructure
    : Array.isArray(tenantSettings?.menu_structure)
    ? tenantSettings.menu_structure
    : null;
  const draftMenuStructure = Array.isArray(persistedMenuStructure)
    ? persistedMenuStructure
    : Array.isArray(menuStructure)
    ? menuStructure
    : [];
  const cloneMenuStructure = (value) => JSON.parse(JSON.stringify(Array.isArray(value) ? value : []));

  const buildDefaultBrandingData = () => ({
    menuBackgroundColor: 'var(--color-bg-primary)',
    menuTextColor: 'var(--color-text-primary)',
    layout: 'sidebar-left',
    theme: 'auto',
    companyLogo: '',
    companyName: 'AIO CRM',
    brandName: 'AIO CRM',
    logoUrl: '/aio-button-192px.png',
    primaryColor: '#3b82f6',
    secondaryColor: '#1e40af',
    accentColor: '#8b5cf6',
    footerText: 'Generated by Cortex',
    disclaimer: 'Confidential - Internal Use Only',
    contactInfo: '',
    reportHeaderLabel: 'Cortex Intelligence Report'
  });

  // Branding State
  const [brandingData, setBrandingData] = useState(() => ({
    ...buildDefaultBrandingData(),
    ...(tenantSettings?.branding || {})
  }));

  useEffect(() => {
    setMenuItems(cloneMenuStructure(draftMenuStructure));
    setMenuDraftDirty(false);
  }, [tenant?.id, persistedMenuStructure, menuStructure]);

  useEffect(() => {
    setBrandingData({
      ...buildDefaultBrandingData(),
      ...(tenantSettings?.branding || {}),
    });
  }, [tenant?.id, tenantSettings]);

  const persistWhiteLabel = async (nextBranding = brandingData, nextMenu = menuItems) => {
    if (!tenant?.id) {
      return;
    }
    const nextMenuToPersist = menuDraftDirty ? nextMenu : persistedMenuStructure;
    const updatedTenantSettings = await updateCanonicalTenantSettingsApi({
      branding: nextBranding,
      navigation: {
        ...(tenantSettings?.navigation || {}),
        menuStructure: nextMenuToPersist,
      },
    });
    let refreshedTenantSettings = null;
    try {
      const refreshed = await refreshSession?.();
      refreshedTenantSettings = refreshed?.tenant?.tenant_settings || null;
    } catch (error) {
      console.warn('Failed to refresh session after white-label save; using canonical save response.', error);
    }
    // Canonical save response is applied immediately so shell state does not silently diverge on refresh failures.
    const resolvedTenantSettings = refreshedTenantSettings || updatedTenantSettings || {};
    const refreshedBranding = resolvedTenantSettings?.branding || nextBranding;
    const refreshedMenu = resolvedTenantSettings?.navigation?.menuStructure;
    setBrandConfig(refreshedBranding);
    if (Array.isArray(refreshedMenu) && refreshedMenu.length > 0) {
      onMenuUpdate?.(refreshedMenu);
    }
    setMenuDraftDirty(false);
  };

  const handleResetWhiteLabel = async () => {
    const nextBranding = buildDefaultBrandingData();
    setBrandingData(nextBranding);
    setMenuItems(cloneMenuStructure(draftMenuStructure));
    setMenuDraftDirty(false);
    await persistWhiteLabel(nextBranding, persistedMenuStructure);
  };

  const handleSaveWhiteLabel = async () => {
    await persistWhiteLabel(brandingData, menuItems);
  };

  // Custom Menu Items State
  const [customMenuItems, setCustomMenuItems] = useState([
    { id: 1, title: 'Terms of Service', url: 'https://policy.omcoxed.co/terms-of-service', icon: '📋' },
    { id: 2, title: 'Privacy Policy', url: 'https://policy.omcoxed.co/privacy-policy', icon: '🔐' },
    { id: 3, title: 'Acceptable Use Policy', url: 'https://policy.omcoxed.co/acceptable-use-policy', icon: '📍' }
  ]);

  const [newCustomItem, setNewCustomItem] = useState({ title: '', url: '' });

  // Advanced Settings State
  const [advancedData, setAdvancedData] = useState({
    javascriptHtml: '',
    conditionalJavascript: '',
    language: 'English',
    country: 'United States',
    currency: 'USD',
    planCancelUrl: ''
  });

  // Modal State for Menu Item Editing
  const [showMenuModal, setShowMenuModal] = useState({ open: false, editIdx: null, catIdx: null });
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [modalFormData, setModalFormData] = useState({
    title: '',
    link: '',
    icon: 'Box',
    iconColor: 'var(--color-text-tertiary)',
    backgroundColor: 'var(--color-bg-secondary)',
    enableIframe: false
  });

  // Available Lucide Icons for menu items
  const availableIcons = [
    'LayoutDashboard', 'Users', 'Bot', 'Workflow', 'Radio', 'CalendarIcon',
    'MessageSquare', 'PenTool', 'GitMerge', 'FileText', 'ShoppingCart', 'Globe',
    'Phone', 'Settings', 'Video', 'CreditCard', 'Zap', 'Shield', 'Tag', 'Layout',
    'EyeOff', 'Activity', 'Crosshair', 'Box', 'CheckSquare', 'Key', 'Lock',
    'Briefcase', 'FileInput', 'Webhook', 'Link', 'Power', 'Download', 'Package', 'Clock',
    'Server', 'Chrome', 'PhoneCall', 'Paperclip', 'CheckCircle', 'AlertCircle', 'Play',
    'User', 'Bell', 'Smartphone', 'MapPin', 'Receipt', 'Cpu', 'Target', 'ShieldCheck',
    'AlertOctagon', 'Bookmark', 'Flag', 'TrendingUp', 'DollarSign', 'Type', 'ListChecks'
  ];

  const filteredIcons = availableIcons.filter(icon =>
    icon.toLowerCase().includes(iconSearch.toLowerCase())
  );

  const toggleItemVisibility = (categoryIdx, itemIdx) => {
    const updated = cloneMenuStructure(menuItems);
    updated[categoryIdx].items[itemIdx].visible = !updated[categoryIdx].items[itemIdx].visible;
    setMenuItems(updated);
    setMenuDraftDirty(true);
  };

  const updateItemLabel = (categoryIdx, itemIdx, newLabel) => {
    const updated = cloneMenuStructure(menuItems);
    updated[categoryIdx].items[itemIdx].label = newLabel;
    setMenuItems(updated);
    setMenuDraftDirty(true);
  };

  const updateItemUrl = (categoryIdx, itemIdx, newUrl) => {
    const updated = cloneMenuStructure(menuItems);
    updated[categoryIdx].items[itemIdx].url = newUrl;
    setMenuItems(updated);
    setMenuDraftDirty(true);
  };

  const updateItemIcon = (categoryIdx, itemIdx, showIcon) => {
    const updated = cloneMenuStructure(menuItems);
    updated[categoryIdx].items[itemIdx].showIcon = showIcon;
    setMenuItems(updated);
    setMenuDraftDirty(true);
  };

  const deleteMenuItem = (categoryIdx, itemIdx) => {
    const updated = cloneMenuStructure(menuItems);
    updated[categoryIdx].items.splice(itemIdx, 1);
    setMenuItems(updated);
    setMenuDraftDirty(true);
  };

  const addCustomMenuItem = () => {
    if (newCustomItem.title && newCustomItem.url) {
      setCustomMenuItems([
        ...customMenuItems,
        { id: Date.now(), title: newCustomItem.title, url: newCustomItem.url, icon: '🔗' }
      ]);
      setNewCustomItem({ title: '', url: '' });
    }
  };

  const deleteCustomMenuItem = (id) => {
    setCustomMenuItems(customMenuItems.filter(item => item.id !== id));
  };

  const updateBrandingColor = (colorType, value) => {
    setBrandingData({ ...brandingData, [colorType]: value });
  };

  const updateBrandingTheme = (newTheme) => {
    setBrandingData({ ...brandingData, theme: newTheme });
  };

  const updateBrandingLayout = (layout) => {
    setBrandingData({ ...brandingData, layout });
  };

  // Modal handlers
  const openMenuModal = (catIdx = null, itemIdx = null) => {
    if (itemIdx !== null && catIdx !== null) {
      const item = menuItems[catIdx].items[itemIdx];
      setModalFormData({
        title: item.label,
        link: item.url || '',
        icon: item.icon || 'Box',
        iconColor: item.iconColor || 'var(--color-text-tertiary)',
        backgroundColor: item.backgroundColor || 'var(--color-bg-secondary)',
        enableIframe: item.type === 'iframe'
      });
    } else {
      setModalFormData({
        title: '',
        link: '',
        icon: 'Box',
        iconColor: 'var(--color-text-tertiary)',
        backgroundColor: 'var(--color-bg-secondary)',
        enableIframe: false
      });
    }
    setShowMenuModal({ open: true, editIdx: itemIdx, catIdx });
    setIconSearch('');
    setShowIconPicker(false);
  };

  const closeMenuModal = () => {
    setShowMenuModal({ open: false, editIdx: null, catIdx: null });
    setModalFormData({
      title: '',
      link: '',
      icon: 'Box',
      iconColor: 'var(--color-text-tertiary)',
      backgroundColor: 'var(--color-bg-secondary)',
      enableIframe: false
    });
    setShowIconPicker(false);
    setIconSearch('');
  };

  const saveMenuItemChanges = () => {
    const updated = cloneMenuStructure(menuItems);

    if (showMenuModal.editIdx !== null && showMenuModal.catIdx !== null) {
      // Update existing item
      updated[showMenuModal.catIdx].items[showMenuModal.editIdx] = {
        ...updated[showMenuModal.catIdx].items[showMenuModal.editIdx],
        label: modalFormData.title,
        url: modalFormData.link,
        icon: modalFormData.icon,
        iconColor: modalFormData.iconColor,
        backgroundColor: modalFormData.backgroundColor,
        type: modalFormData.enableIframe ? 'iframe' : 'internal'
      };
    } else {
      // Add new item to first category (Main)
      const newItem = {
        id: `custom-${Date.now()}`,
        label: modalFormData.title,
        url: modalFormData.link,
        icon: modalFormData.icon,
        iconColor: modalFormData.iconColor,
        backgroundColor: modalFormData.backgroundColor,
        type: modalFormData.enableIframe ? 'iframe' : 'internal',
        visible: true
      };
      if (updated.length > 0) {
        updated[0].items.push(newItem);
      }
    }

    setMenuItems(updated);
    setMenuDraftDirty(true);
    closeMenuModal();
  };

  const isIframeBlocked = (url) => {
    const blockedDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'youtube.com', 'linkedin.com'];
    try {
      const urlObj = new URL(url);
      return blockedDomains.some(domain => urlObj.hostname.includes(domain));
    } catch {
      return false;
    }
  };

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-[var(--radius-outer)] border border-[var(--color-border)] flex flex-col overflow-hidden shadow-island">
      <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded flex items-center justify-center">
              <Globe size={16} className="text-[var(--color-text-primary)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">White Label</h2>
              <p className="text-xs text-[var(--color-text-secondary)]">Customize your branding and menu system</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleResetWhiteLabel} className="text-xs bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-card)] transition">Reset</button>
            <button onClick={handleSaveWhiteLabel} className="text-xs btn-primary-skeuo px-3 py-1.5 rounded-[var(--radius-card)] transition font-medium">Save</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <div className="flex overflow-x-auto">
          {[
            { id: 'branding', label: 'Branding', icon: Palette },
            { id: 'advanced', label: 'Advanced', icon: Cog },
            { id: 'mobile', label: 'Mobile App', icon: Smartphone },
            { id: 'ui', label: 'UI', icon: Layers },
            { id: 'styles', label: 'Styles', icon: PenTool },
            { id: 'package', label: 'Package', icon: Package },
            { id: 'emails', label: 'System Emails', icon: Inbox },
            { id: 'blueprints', label: 'Blueprints', icon: FileCode }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap flex items-center gap-2 ${activeTab === tab.id
                  ? 'text-[var(--color-text-primary)] border-blue-500'
                  : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text-primary)]'
                  }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[var(--color-bg-primary)]">
        {/* BRANDING TAB */}
        {activeTab === 'branding' && (
          <div className="space-y-6">
            {/* Theme Selection */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">Theme</h3>
              <div className="flex gap-3">
                <button
                  onClick={() => updateBrandingTheme('light')}
                  className={`px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition flex items-center gap-2 ${brandingData.theme === 'light'
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                    : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                >
                  <Palette size={16} /> Light
                </button>
                <button
                  onClick={() => updateBrandingTheme('dark')}
                  className={`px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition flex items-center gap-2 ${brandingData.theme === 'dark'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                >
                  <Palette size={16} /> Dark
                </button>
              </div>
            </div>

            {/* Color Settings */}
            <div className="grid grid-cols-2 gap-4">
              {/* Menu Background Color */}
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-3">Menu Background Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandingData.menuBackgroundColor}
                    onChange={(e) => updateBrandingColor('menuBackgroundColor', e.target.value)}
                    className="w-12 h-12 rounded cursor-pointer border border-[var(--color-border)]"
                  />
                  <input
                    type="text"
                    value={brandingData.menuBackgroundColor}
                    onChange={(e) => updateBrandingColor('menuBackgroundColor', e.target.value)}
                    className="flex-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono"
                  />
                </div>
                <div
                  className="mt-4 h-16 rounded border border-[var(--color-border)]"
                  style={{ backgroundColor: brandingData.menuBackgroundColor }}
                />
              </div>

              {/* Menu Text Color */}
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-3">Menu Text Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandingData.menuTextColor}
                    onChange={(e) => updateBrandingColor('menuTextColor', e.target.value)}
                    className="w-12 h-12 rounded cursor-pointer border border-[var(--color-border)]"
                  />
                  <input
                    type="text"
                    value={brandingData.menuTextColor}
                    onChange={(e) => updateBrandingColor('menuTextColor', e.target.value)}
                    className="flex-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono"
                  />
                </div>
                <div
                  className="mt-4 h-16 rounded border border-[var(--color-border)] flex items-center justify-center text-sm font-medium"
                  style={{ backgroundColor: brandingData.menuBackgroundColor, color: brandingData.menuTextColor }}
                >
                  Sample Text
                </div>
              </div>
            </div>

            {/* Layout Selection */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">Layout</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updateBrandingLayout('sidebar-left')}
                  className={`p-3 rounded text-xs font-medium transition border text-left ${brandingData.layout === 'sidebar-left'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                >
                  <div className="font-bold mb-1">📍 Sidebar Left</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Classic layout</div>
                </button>
                <button
                  onClick={() => updateBrandingLayout('sidebar-right')}
                  className={`p-3 rounded text-xs font-medium transition border text-left ${brandingData.layout === 'sidebar-right'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                >
                  <div className="font-bold mb-1">📍 Sidebar Right</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Mirrored layout</div>
                </button>
              </div>
            </div>

            {/* Report Branding */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Report Branding</h3>
              
              {/* Brand Name */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Brand Name</label>
                <input
                  type="text"
                  value={brandingData.brandName || 'AIO CRM'}
                  onChange={(e) => {
                    const updated = { ...brandingData, brandName: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="Your Brand Name"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Logo URL</label>
                <input
                  type="text"
                  value={brandingData.logoUrl || '/aio-button-192px.png'}
                  onChange={(e) => {
                    const updated = { ...brandingData, logoUrl: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="/aio-button-192px.png"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandingData.primaryColor || '#3b82f6'}
                    onChange={(e) => {
                      const updated = { ...brandingData, primaryColor: e.target.value };
                      setBrandingData(updated);
                    }}
                    className="w-12 h-10 rounded cursor-pointer border border-[var(--color-border)]"
                  />
                  <input
                    type="text"
                    value={brandingData.primaryColor || '#3b82f6'}
                    onChange={(e) => {
                      const updated = { ...brandingData, primaryColor: e.target.value };
                      setBrandingData(updated);
                    }}
                    className="flex-1 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono"
                  />
                </div>
              </div>

              {/* Report Header Label */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Report Header Label</label>
                <input
                  type="text"
                  value={brandingData.reportHeaderLabel || 'Cortex Intelligence Report'}
                  onChange={(e) => {
                    const updated = { ...brandingData, reportHeaderLabel: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="Cortex Intelligence Report"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Footer Text */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Footer Text</label>
                <input
                  type="text"
                  value={brandingData.footerText || 'Generated by Cortex'}
                  onChange={(e) => {
                    const updated = { ...brandingData, footerText: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="Generated by Cortex"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Disclaimer */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Disclaimer</label>
                <input
                  type="text"
                  value={brandingData.disclaimer || 'Confidential - Internal Use Only'}
                  onChange={(e) => {
                    const updated = { ...brandingData, disclaimer: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="Confidential - Internal Use Only"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>

              {/* Contact Info */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Contact Info</label>
                <input
                  type="text"
                  value={brandingData.contactInfo || ''}
                  onChange={(e) => {
                    const updated = { ...brandingData, contactInfo: e.target.value };
                    setBrandingData(updated);
                  }}
                  placeholder="contact@yourcompany.com"
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* ADVANCED TAB - Custom Code & Localization */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            {/* Warning Alert */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex gap-3">
              <div className="text-2xl">⚠️</div>
              <div>
                <p className="text-sm font-medium text-yellow-600">Attention!</p>
                <p className="text-xs text-yellow-600 mt-1">These settings apply only to YOUR customers and NOT your account. Custom code from your parent account will show on your account</p>
              </div>
            </div>

            {/* JavaScript/HTML Code Blocks */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-3">JavaScript/HTML (Pixels, Analytics, Chat)</label>
                <textarea
                  value={advancedData.javascriptHtml}
                  onChange={(e) => setAdvancedData({ ...advancedData, javascriptHtml: e.target.value })}
                  placeholder="Enter JavaScript or HTML code..."
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono min-h-[120px] focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-3">Conditional JavaScript/HTML (only when customer enabled Support Access)</label>
                <textarea
                  value={advancedData.conditionalJavascript}
                  onChange={(e) => setAdvancedData({ ...advancedData, conditionalJavascript: e.target.value })}
                  placeholder="Enter conditional JavaScript or HTML code..."
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] font-mono min-h-[120px] focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Localization Settings */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">Localization</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Language</label>
                  <select
                    value={advancedData.language}
                    onChange={(e) => setAdvancedData({ ...advancedData, language: e.target.value })}
                    className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                  >
                    <option>English</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                    <option>Italian</option>
                    <option>Portuguese</option>
                    <option>Chinese</option>
                    <option>Japanese</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Country</label>
                  <select
                    value={advancedData.country}
                    onChange={(e) => setAdvancedData({ ...advancedData, country: e.target.value })}
                    className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                  >
                    <option>United States</option>
                    <option>Canada</option>
                    <option>United Kingdom</option>
                    <option>Australia</option>
                    <option>Germany</option>
                    <option>France</option>
                    <option>Spain</option>
                    <option>Mexico</option>
                    <option>Brazil</option>
                    <option>India</option>
                    <option>Japan</option>
                    <option>China</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Currency</label>
                  <select
                    value={advancedData.currency}
                    onChange={(e) => setAdvancedData({ ...advancedData, currency: e.target.value })}
                    className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                  >
                    <option>USD</option>
                    <option>EUR</option>
                    <option>GBP</option>
                    <option>CAD</option>
                    <option>AUD</option>
                    <option>JPY</option>
                    <option>CNY</option>
                    <option>INR</option>
                    <option>MXN</option>
                    <option>BRL</option>
                  </select>
                </div>
              </div>

              {/* Plan Cancel URL */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Plan Cancel URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/cancel"
                  value={advancedData.planCancelUrl}
                  onChange={(e) => setAdvancedData({ ...advancedData, planCancelUrl: e.target.value })}
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* CUSTOM MENU NAVIGATION ITEMS */}
        {activeTab === 'mobile' && (
          <div className="space-y-6">
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Custom Menu Navigation Items</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">Show on mobile app Footer</p>
                </div>
                <button className="text-xl hover:scale-110 transition">➕</button>
              </div>

              {/* Add New Custom Item */}
              <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Title"
                    value={newCustomItem.title}
                    onChange={(e) => setNewCustomItem({ ...newCustomItem, title: e.target.value })}
                    className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="https://example.com"
                      value={newCustomItem.url}
                      onChange={(e) => setNewCustomItem({ ...newCustomItem, url: e.target.value })}
                      className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={addCustomMenuItem}
                      className="bg-blue-600 hover:bg-blue-700 text-[var(--color-text-primary)] px-4 py-2 rounded text-sm font-medium transition"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Custom Items List */}
              <div className="divide-y divide-[var(--color-border)]">
                {customMenuItems.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-[var(--color-bg-primary)] transition">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{item.icon}</div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">{item.title}</div>
                        <div className="text-xs text-blue-400 underline cursor-pointer">{item.url}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">✏️</button>
                        <button
                          onClick={() => deleteCustomMenuItem(item.id)}
                          className="p-2 hover:bg-red-900/30 rounded transition text-[var(--color-text-secondary)] hover:text-red-400"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* UI TAB - System Menu Navigation Icons */}
        {activeTab === 'ui' && (
          <div className="space-y-6">
            {/* Icon Legend */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
              <h4 className="text-xs font-bold text-[var(--color-text-primary)] uppercase mb-3">Icon Key</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👁️</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Show/Hide</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚫</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Reset Icon</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔗</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Copy Link</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">☑️</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Show in PDA</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">✏️</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">Edit</span>
                </div>
              </div>
            </div>

            {/* Menu Items List */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-primary)]">System Menu Navigation Icons</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">Show on left navigation menu</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setModalFormData({
                        title: '',
                        link: '',
                        icon: 'Link',
                        iconColor: 'var(--color-text-tertiary)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        enableIframe: true
                      });
                      setShowMenuModal({ open: true, editIdx: null, catIdx: null });
                    }}
                    className="text-sm px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded transition border border-blue-500/30"
                    title="Add iframe link"
                  >
                    🔗 Add iframe Link
                  </button>
                  <button
                    onClick={() => setShowMenuModal({ open: true, editIdx: null, catIdx: null })}
                    className="text-2xl hover:scale-110 transition"
                    title="Add new menu item"
                  >
                    ➕
                  </button>
                </div>
              </div>

              {/* Items Container */}
              <div className="divide-y divide-[var(--color-border)] p-4 space-y-4">
                {menuItems.map((category, catIdx) =>
                  category.items.map((item, itemIdx) => (
                    <div
                      key={`${catIdx}-${itemIdx}`}
                      className="p-3 hover:bg-[var(--color-bg-primary)] transition rounded flex items-center gap-4 group cursor-move"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('itemData', JSON.stringify({ catIdx, itemIdx }));
                      }}
                    >
                      {/* Icon Circle */}
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl"
                        style={{ backgroundColor: item.backgroundColor || 'var(--color-border)', color: item.iconColor || 'var(--color-text-tertiary)' }}
                      >
                        {item.icon === 'Bot' ? '🤖' : item.icon === 'LayoutDashboard' ? '📊' : item.icon === 'Settings' ? '⚙️' : item.icon === 'Link' ? '🔗' : item.icon === 'Activity' ? '📈' : item.icon === 'Zap' ? '⚡' : item.icon === 'Workflow' ? '🔄' : item.icon === 'CalendarIcon' ? '📅' : item.icon === 'MessageSquare' ? '💬' : item.icon === 'PenTool' ? '🎨' : item.icon === 'GitMerge' ? '🔀' : item.icon === 'FileText' ? '📋' : '📌'}
                      </div>

                      {/* Label and Type */}
                      <div className="flex-1">
                        <div className="text-sm font-bold text-[var(--color-text-primary)]">{item.label}</div>
                        {item.url && <div className="text-xs text-blue-400">{item.url}</div>}
                        <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                          {item.type === 'iframe' ? 'iframe menu item' : 'internal menu item'}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-1 flex-shrink-0">
                        {/* Furthest Left: Show in PDA */}
                        <button
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          title="Show in PDA"
                        >
                          ☐
                        </button>

                        {/* Left: Show/Hide */}
                        <button
                          onClick={() => toggleItemVisibility(catIdx, itemIdx)}
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-blue-400"
                          title={item.visible ? 'Hide item' : 'Show item'}
                        >
                          {item.visible ? '👁️' : '🚫'}
                        </button>

                        {/* Center: Reset Icon */}
                        <button
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-red-400"
                          title="Reset icon to default"
                        >
                          🚫
                        </button>

                        {/* Left-Center: Edit */}
                        <button
                          onClick={() => setShowMenuModal({ open: true, editIdx: itemIdx, catIdx: catIdx })}
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          title="Edit menu item"
                        >
                          ✏️
                        </button>

                        {/* Furthest Right: Copy Link */}
                        <button
                          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-text-secondary)] hover:text-blue-400"
                          title="Copy link"
                        >
                          🔗
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'emails' && <SystemEmailsSettings />}

        {/* OTHER TABS - Placeholder */}
        {['styles', 'package', 'blueprints'].includes(activeTab) && (
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-8 text-center">
            <p className="text-[var(--color-text-secondary)] text-sm">This section is under development</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-2">Check back soon for more customization options</p>
          </div>
        )}
      </div>

      {/* MENU ITEM EDIT MODAL */}
      {showMenuModal.open && (
        <>
          {/* Modal Overlay */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeMenuModal}
          />

          {/* Modal Panel */}
          <div className="fixed right-0 top-0 bottom-0 w-96 bg-[var(--color-bg-primary)] border-l border-[var(--color-border)] shadow-xl z-50 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Add Navigation Icon</h2>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">Customize menu item appearance and behavior</p>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Icon and Color Pickers Section */}
              <div className="grid grid-cols-3 gap-4">
                {/* Icon Picker */}
                <div className="flex flex-col items-center gap-2 relative">
                  <div className="text-xs text-[var(--color-text-secondary)] font-medium uppercase">Icon</div>
                  <button
                    onClick={() => setShowIconPicker(!showIconPicker)}
                    className="w-16 h-16 rounded-full cursor-pointer border-2 border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-center text-2xl hover:border-blue-500 transition"
                  >
                    {modalFormData.icon === 'Bot' ? '🤖' : modalFormData.icon === 'LayoutDashboard' ? '📊' : modalFormData.icon === 'Settings' ? '⚙️' : '📦'}
                  </button>

                  {/* Icon Picker Dropdown */}
                  {showIconPicker && (
                    <div className="absolute top-20 left-0 right-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-3 z-50 w-80 max-h-64 flex flex-col">
                      <input
                        type="text"
                        placeholder="Search icons..."
                        value={iconSearch}
                        onChange={(e) => setIconSearch(e.target.value)}
                        className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-2 py-1 text-sm text-[var(--color-text-primary)] mb-2 focus:border-blue-500 focus:outline-none"
                      />
                      <div className="overflow-y-auto grid grid-cols-4 gap-2">
                        {filteredIcons.map(icon => (
                          <button
                            key={icon}
                            onClick={() => {
                              setModalFormData({ ...modalFormData, icon });
                              setShowIconPicker(false);
                            }}
                            className={`p-2 rounded text-center text-xs font-medium transition ${modalFormData.icon === icon
                              ? 'bg-blue-600/30 border border-blue-500 text-blue-400'
                              : 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-gray-500'
                              }`}
                            title={icon}
                          >
                            {icon.substring(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Icon Color */}
                <div className="flex flex-col items-center gap-2">
                  <div className="text-xs text-[var(--color-text-secondary)] font-medium uppercase">Icon Color</div>
                  <input
                    type="color"
                    value={modalFormData.iconColor}
                    onChange={(e) => setModalFormData({ ...modalFormData, iconColor: e.target.value })}
                    className="w-16 h-16 rounded-full cursor-pointer border-2 border-[var(--color-border)]"
                  />
                </div>

                {/* Background Color */}
                <div className="flex flex-col items-center gap-2">
                  <div className="text-xs text-[var(--color-text-secondary)] font-medium uppercase">Background Color</div>
                  <input
                    type="color"
                    value={modalFormData.backgroundColor}
                    onChange={(e) => setModalFormData({ ...modalFormData, backgroundColor: e.target.value })}
                    className="w-16 h-16 rounded-full cursor-pointer border-2 border-[var(--color-border)]"
                  />
                </div>
              </div>

              {/* Title Field */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Title</label>
                <input
                  type="text"
                  placeholder="AIO H.I.D.E.™"
                  value={modalFormData.title}
                  onChange={(e) => setModalFormData({ ...modalFormData, title: e.target.value })}
                  className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Link Field */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Link</label>
                <input
                  type="url"
                  placeholder="https://data.maverickcrm.net"
                  value={modalFormData.link}
                  onChange={(e) => setModalFormData({ ...modalFormData, link: e.target.value })}
                  className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Iframe Toggle */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="enableIframe"
                    checked={modalFormData.enableIframe}
                    onChange={(e) => setModalFormData({ ...modalFormData, enableIframe: e.target.checked })}
                    className="w-4 h-4 rounded cursor-pointer accent-blue-600"
                  />
                  <label htmlFor="enableIframe" className="text-sm text-[var(--color-text-primary)] cursor-pointer">
                    When clicked open link embedded in the application
                  </label>
                </div>

                {/* Iframe Warning */}
                {modalFormData.enableIframe && modalFormData.link && isIframeBlocked(modalFormData.link) && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded p-3 flex gap-2">
                    <div className="text-red-500 text-lg">⚠️</div>
                    <div>
                      <p className="text-xs font-medium text-red-500">Embedding Blocked</p>
                      <p className="text-xs text-red-400 mt-1">This website has restrictions that prevent embedding into menu items. Please use a direct link instead.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-6 flex gap-3 justify-end">
              <button
                onClick={closeMenuModal}
                className="px-4 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] transition"
              >
                Cancel
              </button>
              <button
                onClick={saveMenuItemChanges}
                disabled={!modalFormData.title || !modalFormData.link}
                className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-[var(--color-text-primary)] hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const SystemEmailsSettings = () => {
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ subject: '', send_to: '', enabled: true, body_text: '' });
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();

  const loadTemplates = async (nextSearch = search) => {
    setLoading(true);
    setError('');
    try {
      const tenantSettings = await loadCanonicalTenantSettings();
      setTemplates(mapCanonicalSystemEmailTemplates(tenantSettings, nextSearch));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load system email templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates('');
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadTemplates(search);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const handleToggle = async (template) => {
    setError('');
    setStatus('');
    try {
      const updated = await updateSystemEmailTemplateApi(template.id, { enabled: !template.enabled });
      await loadTemplates(search);
      setStatus(`${updated.email_type} updated.`);
    } catch (toggleError) {
      setError(toggleError.message || 'Unable to update template state.');
    }
  };

  const openEditor = (template) => {
    setEditing(template);
    setDraft({
      subject: template.subject || '',
      send_to: template.send_to || '',
      enabled: !!template.enabled,
      body_text: template.body_text || ''
    });
  };

  const handleSaveTemplate = async () => {
    if (!editing) {
      return;
    }
    setError('');
    setStatus('');
    try {
      const updated = await updateSystemEmailTemplateApi(editing.id, draft);
      await loadTemplates(search);
      setEditing(null);
      setStatus(`${updated.email_type} saved.`);
      triggerSavedAction('save-template');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save system email template.');
    }
  };

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {status && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{status}</div>}
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute left-3 top-2.5 text-[var(--color-text-secondary)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg pl-10 pr-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div className="text-xs text-[var(--color-text-secondary)]">Tenant-scoped system notices and workflow emails.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] uppercase text-xs tracking-wide">
              <tr>
                <th className="text-left px-5 py-4">Email Type</th>
                <th className="text-left px-5 py-4">Subject</th>
                <th className="text-left px-5 py-4">Send To</th>
                <th className="text-left px-5 py-4">Enabled</th>
                <th className="text-left px-5 py-4">Edited By</th>
                <th className="text-left px-5 py-4">Edited At</th>
                <th className="text-left px-5 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && (
                <tr>
                  <td colSpan="7" className="px-5 py-8 text-center text-[var(--color-text-secondary)]">Loading templates...</td>
                </tr>
              )}
              {!loading && templates.map(template => (
                <tr key={template.id} className="bg-[var(--color-bg-secondary)]">
                  <td className="px-5 py-4 text-[var(--color-text-primary)] font-medium">{template.email_type}</td>
                  <td className="px-5 py-4 text-[var(--color-text-primary)] max-w-[260px] truncate">{template.subject}</td>
                  <td className="px-5 py-4 text-[var(--color-text-primary)]">{template.send_to}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => handleToggle(template)} className={`w-12 h-6 rounded-full border transition relative ${template.enabled ? 'bg-[var(--color-primary)]/25 border-[var(--color-primary)]/40' : 'bg-[var(--color-bg-primary)] border-[var(--color-border)]'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${template.enabled ? 'left-6' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-5 py-4 text-[var(--color-text-primary)]">{template.edited_by_name || 'AIO Flow\u2122'}</td>
                  <td className="px-5 py-4 text-[var(--color-text-secondary)]">{template.edited_at || template.updated_at}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => openEditor(template)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary)] text-[var(--color-text-primary)]">
                      <Edit2 size={14} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && templates.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-5 py-8 text-center text-[var(--color-text-secondary)]">No system emails matched that search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setEditing(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-[520px] bg-[var(--color-bg-primary)] border-l border-[var(--color-border)] shadow-xl z-50 flex flex-col">
            <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <div className="flex items-center gap-3">
                <Inbox size={18} className="text-[var(--color-primary)]" />
                <div>
                  <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{editing.email_type}</h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">Edit recipient target, subject, and default message copy.</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Subject</label>
                <input value={draft.subject} onChange={(event) => setDraft(current => ({ ...current, subject: event.target.value }))} className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Send To</label>
                <input value={draft.send_to} onChange={(event) => setDraft(current => ({ ...current, send_to: event.target.value }))} className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">Template Enabled</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Disable the notice without deleting its content.</div>
                </div>
                <button onClick={() => setDraft(current => ({ ...current, enabled: !current.enabled }))} className={`w-12 h-6 rounded-full border transition relative ${draft.enabled ? 'bg-[var(--color-primary)]/25 border-[var(--color-primary)]/40' : 'bg-[var(--color-bg-primary)] border-[var(--color-border)]'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${draft.enabled ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Default Message Copy</label>
                <textarea value={draft.body_text} onChange={(event) => setDraft(current => ({ ...current, body_text: event.target.value }))} className="w-full min-h-[220px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
            </div>
            <div className="p-6 border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Close</button>
              <button onClick={handleSaveTemplate} className={saveButtonClassName("px-4 py-2 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-primary)] font-medium", savedAction === 'save-template')}>{savedAction === 'save-template' ? 'Saved' : 'Save Template'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ============ PERSONAL SETTINGS ============
const PersonalSettings = () => {
  const { user, refreshSession } = useAuth();
  const [form, setForm] = useState({
    display_name: '',
    email: '',
    phone: '',
    locale: 'en-US',
    timezone: 'America/New_York',
    email_signature: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const profile = await getProfileApi();
        setForm({
          display_name: profile?.name || '',
          email: profile?.email || '',
          phone: profile?.phone || '',
          locale: profile?.locale || 'en-US',
          timezone: profile?.timezone || 'America/New_York',
          email_signature: profile?.email_signature || ''
        });
      } catch (loadError) {
        setError(loadError.message || 'Unable to load your profile.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const initials = (form.display_name || user?.name || 'A').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'A';

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      await updateProfileApi({
        display_name: form.display_name,
        phone: form.phone,
        locale: form.locale,
        timezone: form.timezone,
        email_signature: form.email_signature
      });
      await refreshSession?.();
      setStatus('Profile updated.');
      triggerSavedAction('save-profile');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full bg-[var(--color-bg-primary)] rounded-[var(--radius-outer)] border border-[var(--color-border)] flex flex-col overflow-hidden shadow-island">
      <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2"><User size={20} className="text-[var(--color-primary)]" /> Personal Profile</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">Manage your account information, locale defaults, and signature.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        {status && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{status}</div>}
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 flex flex-col md:flex-row gap-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-cyan-500 flex items-center justify-center text-3xl font-bold text-[var(--color-text-primary)] border-4 border-[var(--color-border)] shadow-lg">
              {initials}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">Avatar uploads are staged for a later pass.</div>
          </div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Display Name</label>
              <input value={form.display_name} onChange={(event) => setForm(current => ({ ...current, display_name: event.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Phone</label>
              <div className="relative">
                <Smartphone size={16} className="absolute left-3 top-2.5 text-[var(--color-text-secondary)]" />
                <input value={form.phone} onChange={(event) => setForm(current => ({ ...current, phone: event.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] pl-10 pr-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-2.5 text-[var(--color-text-secondary)]" />
                <input value={form.email} disabled className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] pl-10 pr-20 py-2 text-sm text-[var(--color-text-primary)] opacity-80" />
                <span className="absolute right-3 top-2.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 rounded-[var(--radius-card)]">Verified</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Language / Locale</label>
              <select value={form.locale} onChange={(event) => setForm(current => ({ ...current, locale: event.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                <option value="en-US">English (US)</option>
                <option value="es-US">Spanish (US)</option>
                <option value="fr-FR">French</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Timezone</label>
              <div className="relative">
                <Clock size={16} className="absolute left-3 top-2.5 text-[var(--color-text-secondary)]" />
                <select value={form.timezone} onChange={(event) => setForm(current => ({ ...current, timezone: event.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] pl-10 pr-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><PenTool size={16} className="text-[var(--color-primary)]" /> Email Signature</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4">
            <textarea
              className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg p-4 text-sm text-[var(--color-text-primary)] min-h-[140px] focus:outline-none focus:border-[var(--color-primary)]"
              value={form.email_signature}
              onChange={(event) => setForm(current => ({ ...current, email_signature: event.target.value }))}
              placeholder={`Best regards,\n\n${form.display_name || user?.name || 'AIO CRM Operator'}`}
            />
            <div className="flex justify-end mt-4">
              <button onClick={handleSave} disabled={saving || loading} className={saveButtonClassName("bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed text-[var(--color-text-primary)] px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2", savedAction === 'save-profile')}><Save size={16} /> {saving ? 'Saving...' : savedAction === 'save-profile' ? 'Saved' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ BILLING SETTINGS ============
const BillingSettings = () => {
  const [billing, setBilling] = useState({
    plan: 'Pro',
    status: 'Active',
    nextBillingDate: '2026-02-10',
    amount: '$99.99'
  });

  return (
    <div className="h-full bg-[var(--color-bg-primary)] rounded-[var(--radius-outer)] border border-[var(--color-border)] flex flex-col overflow-hidden shadow-island">
      <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2"><CreditCard size={20} className="text-yellow-500" /> Billing Settings</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">Manage your subscription and payment methods.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Current Plan Card */}
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">Current Subscription</h3>
          <div className="flex justify-between items-center pb-3 border-b border-[var(--color-border)]">
            <span className="text-[var(--color-text-secondary)]">Plan</span>
            <span className="text-[var(--color-text-primary)] font-bold">{billing.plan}</span>
          </div>
          <div className="flex justify-between items-center pb-3 border-b border-[var(--color-border)]">
            <span className="text-[var(--color-text-secondary)]">Billing Status</span>
            <span className="px-3 py-1 rounded text-xs bg-green-900/30 text-green-400 font-medium">{billing.status}</span>
          </div>
          <div className="flex justify-between items-center pb-3 border-b border-[var(--color-border)]">
            <span className="text-[var(--color-text-secondary)]">Next Billing Date</span>
            <span className="text-[var(--color-text-primary)]">{billing.nextBillingDate}</span>
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="text-[var(--color-text-secondary)] font-medium">Monthly Charge</span>
            <span className="text-[var(--color-text-primary)] font-bold text-lg">{billing.amount}</span>
          </div>
        </div>

        {/* Payment Method */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Payment Method</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-blue-600 rounded-[var(--radius-card)] flex items-center justify-center text-[var(--color-text-primary)] text-xs font-bold">VISA</div>
                <div>
                  <div className="text-[var(--color-text-primary)] font-medium">•••• •••• •••• 4242</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Expires 12/26</div>
                </div>
              </div>
              <button className="text-xs bg-[var(--color-bg-tertiary)] hover:bg-white hover:text-black text-[var(--color-text-primary)] px-3 py-1.5 rounded-[var(--radius-card)] transition">Update</button>
            </div>
          </div>
        </div>

        {/* Billing History */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Billing History</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="grid grid-cols-4 p-4 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-text-secondary)] uppercase">
              <div>Date</div>
              <div>Amount</div>
              <div>Status</div>
              <div className="text-right">Invoice</div>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              <div className="grid grid-cols-4 p-4 text-sm items-center"><span className="text-[var(--color-text-primary)]">Jan 10, 2026</span><span className="text-[var(--color-text-primary)]">$99.99</span><span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-400 w-fit">Paid</span><button className="text-[var(--color-accent)] hover:text-[var(--color-text-primary)] text-right">Download</button></div>
              <div className="grid grid-cols-4 p-4 text-sm items-center"><span className="text-[var(--color-text-primary)]">Dec 10, 2025</span><span className="text-[var(--color-text-primary)]">$99.99</span><span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-400 w-fit">Paid</span><button className="text-[var(--color-accent)] hover:text-[var(--color-text-primary)] text-right">Download</button></div>
              <div className="grid grid-cols-4 p-4 text-sm items-center"><span className="text-[var(--color-text-primary)]">Nov 10, 2025</span><span className="text-[var(--color-text-primary)]">$99.99</span><span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-400 w-fit">Paid</span><button className="text-[var(--color-accent)] hover:text-[var(--color-text-primary)] text-right">Download</button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ SECURITY SETTINGS ============
const SecuritySettings = () => {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();

  const loadSessions = async () => {
    setLoadingSessions(true);
    setError('');
    try {
      const data = await getAuthSessionsApi();
      setSessions(data);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load active sessions.');
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleChangePassword = async () => {
    setError('');
    setStatus('');
    try {
      await changePasswordApi(passwordForm);
      setPasswordForm({ current_password: '', new_password: '' });
      setStatus('Password updated.');
      triggerSavedAction('update-password');
    } catch (passwordError) {
      setError(passwordError.message || 'Unable to update password.');
    }
  };

  const handleRevokeSession = async (sessionId) => {
    setError('');
    setStatus('');
    try {
      await revokeAuthSessionApi(sessionId);
      setSessions(current => current.filter(item => item.id !== sessionId));
      setStatus('Session revoked.');
    } catch (revokeError) {
      setError(revokeError.message || 'Unable to revoke session.');
    }
  };

  const handleLogoutOthers = async () => {
    setError('');
    setStatus('');
    try {
      await logoutOtherSessionsApi();
      await loadSessions();
      setStatus('All other sessions were logged out.');
    } catch (logoutError) {
      setError(logoutError.message || 'Unable to log out other sessions.');
    }
  };

  return (
    <div className="h-full bg-[var(--color-bg-primary)] rounded-[var(--radius-outer)] border border-[var(--color-border)] flex flex-col overflow-hidden shadow-island">
      <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Shield size={20} className="text-red-500" /> Security Settings</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">Manage your account security and access permissions.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        {status && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{status}</div>}
        {/* Password Management */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Password</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Current Password</label>
                <input type="password" value={passwordForm.current_password} onChange={(event) => setPasswordForm(current => ({ ...current, current_password: event.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">New Password</label>
                <input type="password" value={passwordForm.new_password} onChange={(event) => setPasswordForm(current => ({ ...current, new_password: event.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleChangePassword} className={saveButtonClassName("text-xs bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-primary)] px-3 py-1.5 rounded-[var(--radius-card)] transition", savedAction === 'update-password')}>{savedAction === 'update-password' ? 'Saved' : 'Update Password'}</button>
            </div>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Two-Factor Authentication</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[var(--color-text-primary)] font-medium">Enable 2FA</div>
                <div className="text-xs text-[var(--color-text-secondary)]">Add an extra layer of security to your account</div>
              </div>
              <div className={`w-12 h-6 rounded-[var(--radius-card)] transition cursor-pointer ${twoFactorEnabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'}`} onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}></div>
            </div>
            {twoFactorEnabled && (
              <div className="p-3 bg-[var(--color-bg-primary)] border border-[var(--color-primary)]/30 rounded-[var(--radius-card)] text-sm text-[var(--color-text-primary)]">
                Authenticator app enrollment is staged for the post-beta security pass.
              </div>
            )}
          </div>
        </div>

        {/* Active Sessions */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Active Sessions</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] overflow-hidden">
            <div className="divide-y divide-[var(--color-border)]">
              {loadingSessions && <div className="p-4 text-sm text-[var(--color-text-secondary)]">Loading sessions...</div>}
              {!loadingSessions && sessions.map(session => (
                <div key={session.id} className="p-4 flex justify-between items-center">
                  <div>
                    <div className="text-[var(--color-text-primary)] font-medium flex items-center gap-2">
                      <Monitor size={14} className="text-[var(--color-text-secondary)]" />
                      {session.label}
                      {session.is_current && <span className="text-[10px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-full">Current</span>}
                    </div>
                    <div className="text-xs text-[var(--color-text-secondary)]">Last active: {session.last_seen_at}</div>
                  </div>
                  {!session.is_current && <button onClick={() => handleRevokeSession(session.id)} className="text-xs text-[var(--color-text-secondary)] hover:text-red-400">Revoke</button>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={handleLogoutOthers} className="w-full px-4 py-2 rounded-[var(--radius-card)] font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition text-sm flex items-center justify-center gap-2"><LogOut size={14} /> Logout All Other Sessions</button>
        </div>

        {/* Data & Privacy */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Data & Privacy</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
            <button onClick={() => setStatus('Data export will be packaged during the tenancy/commercial pass.')} className="w-full text-left px-4 py-2 rounded-[var(--radius-card)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-blue-500/50 text-blue-400 text-sm font-medium transition">
              Download Your Data
            </button>
            <button className="w-full text-left px-4 py-2 rounded-[var(--radius-card)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-red-500/50 text-red-400 text-sm font-medium transition">
              Delete Account (Staged)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const OmegaSettings = () => {
  const { tenant, user } = useAuth();
  const currentRole = (tenant?.role || user?.role || 'viewer').toLowerCase();
  const isOwner = currentRole === 'owner';
  const [protocol, setProtocol] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [armCode, setArmCode] = useState('');
  const [cancelCode, setCancelCode] = useState('');
  const [executeCode, setExecuteCode] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const loadOmega = async () => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getOmegaStatusApi();
      setProtocol(data?.protocol || null);
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Omega status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOmega();
  }, [isOwner, tenant?.id]);

  useEffect(() => {
    if ((protocol?.status || 'idle') !== 'armed') {
      return undefined;
    }
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [protocol?.status, protocol?.execute_at]);

  const handleArm = async () => {
    setError('');
    setStatus('');
    try {
      const data = await armOmegaApi({
        confirmation_code: armCode,
        cancel_code: cancelCode
      });
      setProtocol(data?.protocol || null);
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setStatus('Omega armed. Five-minute countdown started.');
      setExecuteCode(armCode);
      setArmCode('');
      setCancelCode('');
      setNowTick(Date.now());
    } catch (armError) {
      setError(armError.message || 'Unable to arm Omega.');
    }
  };

  const handleCancel = async () => {
    setError('');
    setStatus('');
    try {
      const data = await cancelOmegaApi({ cancel_code: cancelCode });
      setProtocol(data?.protocol || null);
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setStatus('Omega sequence cancelled.');
      setCancelCode('');
      setExecuteCode('');
    } catch (cancelError) {
      setError(cancelError.message || 'Unable to cancel Omega.');
    }
  };

  const handleExecute = async () => {
    setError('');
    setStatus('');
    try {
      await executeOmegaApi({ confirmation_code: executeCode });
      clearStoredSessionToken();
      setStatus('Omega executed. Local app data was purged. Reloading...');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (executeError) {
      setError(executeError.message || 'Unable to execute Omega.');
    }
  };

  if (!isOwner) {
    return (
      <div className="p-8">
        <div className="rounded-[var(--radius-panel)] border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
          Omega governance is owner-only and does not appear for non-owner workspace roles.
        </div>
      </div>
    );
  }

  const omegaStatus = protocol?.status || 'idle';
  const readyToExecute = omegaStatus === 'armed' && protocol?.execute_at && new Date(protocol.execute_at).getTime() <= nowTick;

  return (
    <div className="p-6 space-y-6 bg-[var(--color-bg-primary)]">
      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="space-y-6">
          <div className="rounded-[var(--radius-panel)] border border-red-500/30 bg-red-500/10 p-6 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">Emergency Governance</div>
            <h3 className="text-xl font-semibold text-[var(--color-text-primary)]">OMEGA Kill Switch</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              This surface only affects local app data and credentials/config within AIO CRM. It does not delete remote provider data.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Status</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{omegaStatus}</div>
              </div>
              <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Countdown</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{formatOmegaCountdown(protocol?.execute_at, nowTick)}</div>
              </div>
              <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">Scope</div>
                <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">Local app data only</div>
              </div>
            </div>
          </div>

          {(error || status) && (
            <div className={`rounded-[var(--radius-panel)] border px-4 py-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
              {error || status}
            </div>
          )}

          <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Arm Sequence</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">Two separate codes are required. Arming starts a fixed 5-minute countdown.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Confirmation Code</label>
                <input
                  type="password"
                  value={armCode}
                  onChange={(event) => setArmCode(event.target.value)}
                  placeholder="Enter arm code"
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-red-400 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Cancel Code</label>
                <input
                  type="password"
                  value={cancelCode}
                  onChange={(event) => setCancelCode(event.target.value)}
                  placeholder="Enter separate cancel code"
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleArm}
                disabled={loading || omegaStatus === 'armed'}
                className="px-4 py-2 rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/15 text-red-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Arm Omega
              </button>
              <button
                onClick={handleCancel}
                disabled={loading || omegaStatus !== 'armed' || !cancelCode.trim()}
                className="px-4 py-2 rounded-[var(--radius-card)] border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel Omega
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Execute Purge</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Execution only unlocks after the countdown completes. This clears local app data and forces a clean bootstrap state.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <input
                type="password"
                value={executeCode}
                onChange={(event) => setExecuteCode(event.target.value)}
                placeholder="Re-enter confirmation code"
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-red-400 focus:outline-none"
              />
              <button
                onClick={handleExecute}
                disabled={!readyToExecute || !executeCode.trim()}
                className="px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/20 text-red-100 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Execute Omega
              </button>
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              {readyToExecute ? 'Countdown complete. Execution is armed and awaiting the confirmation code.' : 'Execution stays locked until the countdown completes.'}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Protocol Notes</div>
            <div className="text-sm text-[var(--color-text-primary)]">`OMEGA` is hidden from normal agent routing and only lives in this owner-level control plane.</div>
            <div className="text-xs text-[var(--color-text-secondary)]">Remote mailbox, calendar, and third-party systems are not touched by v1 execution.</div>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">Omega Activity</div>
              <div className="text-xs text-[var(--color-text-secondary)]">Owner-only arming and cancellation events.</div>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {loading && <div className="px-5 py-4 text-sm text-[var(--color-text-secondary)]">Loading...</div>}
              {!loading && events.map((event) => (
                <div key={event.id} className="px-5 py-4 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{event.event_type}</div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{new Date(event.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-sm text-[var(--color-text-primary)]">{event.detail || 'No detail recorded.'}</div>
                </div>
              ))}
              {!loading && events.length === 0 && (
                <div className="px-5 py-6 text-sm text-[var(--color-text-secondary)]">No Omega activity recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const WorkspaceSettings = () => {
  const { tenant, tenants = [], switchTenant, refreshSession, user } = useAuth();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(tenant?.id || '');
  const [memberships, setMemberships] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(tenant?.name || '');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('staff');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();

  useEffect(() => {
    setSelectedWorkspaceId(tenant?.id || '');
    setWorkspaceName(tenant?.name || '');
  }, [tenant?.id, tenant?.name]);

  useEffect(() => {
    const loadMemberships = async () => {
      if (!selectedWorkspaceId) {
        setMemberships([]);
        return;
      }
      setLoadingMembers(true);
      setError('');
      try {
        const rows = await getWorkspaceMembershipsApi(selectedWorkspaceId);
        setMemberships(rows);
      } catch (loadError) {
        setError(loadError.message || 'Unable to load workspace members.');
      } finally {
        setLoadingMembers(false);
      }
    };

    loadMemberships();
  }, [selectedWorkspaceId]);

  const selectedWorkspace = tenants.find(item => item.id === selectedWorkspaceId) || tenant;
  const currentMembership = memberships.find(item => item.user_email === user?.email);
  const currentRole = (currentMembership?.role || selectedWorkspace?.role || tenant?.role || 'viewer').toLowerCase();
  const canManageWorkspace = ['owner', 'admin'].includes(currentRole);
  const canCreateWorkspace = ['owner', 'admin'].includes(currentRole);
  const availableRoleOptions = currentRole === 'owner'
    ? ['owner', 'admin', 'staff', 'viewer']
    : ['admin', 'staff', 'viewer'];

  const handleWorkspaceSelect = async (workspaceId) => {
    setSelectedWorkspaceId(workspaceId);
    if (workspaceId && workspaceId !== tenant?.id && switchTenant) {
      await switchTenant(workspaceId);
    }
  };

  const handleRenameWorkspace = async () => {
    if (!selectedWorkspaceId) return;
    setError('');
    setStatusMessage('');
    try {
      await updateWorkspaceApi(selectedWorkspaceId, { name: workspaceName.trim() });
      await refreshSession?.();
      setStatusMessage('Workspace updated.');
      triggerSavedAction('save-workspace-name');
    } catch (renameError) {
      setError(renameError.message || 'Unable to update workspace.');
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setError('');
    setStatusMessage('');
    try {
      await createWorkspaceApi({ name: newWorkspaceName.trim() });
      const session = await refreshSession?.();
      const nextWorkspaceId = session?.tenant?.id;
      setNewWorkspaceName('');
      if (nextWorkspaceId) {
        setSelectedWorkspaceId(nextWorkspaceId);
      }
      setStatusMessage('Workspace created and selected.');
      triggerSavedAction('create-workspace');
    } catch (createError) {
      setError(createError.message || 'Unable to create workspace.');
    }
  };

  const handleAddMember = async () => {
    if (!selectedWorkspaceId || !newMemberEmail.trim()) return;
    setError('');
    setStatusMessage('');
    try {
      const response = await addWorkspaceMemberApi(selectedWorkspaceId, {
        email: newMemberEmail.trim(),
        role: newMemberRole
      });
      setMemberships(response.memberships || []);
      setNewMemberEmail('');
      setNewMemberRole('staff');
      setStatusMessage('Workspace member saved.');
      triggerSavedAction('add-member');
    } catch (memberError) {
      setError(memberError.message || 'Unable to add workspace member.');
    }
  };

  const handleRoleChange = async (membershipId, role) => {
    if (!selectedWorkspaceId) return;
    setError('');
    try {
      const response = await updateWorkspaceMemberApi(selectedWorkspaceId, membershipId, { role });
      setMemberships(response.memberships || []);
      setStatusMessage('Member role updated.');
    } catch (memberError) {
      setError(memberError.message || 'Unable to update member role.');
    }
  };

  const handleRemoveMember = async (membershipId) => {
    if (!selectedWorkspaceId) return;
    setError('');
    try {
      const response = await removeWorkspaceMemberApi(selectedWorkspaceId, membershipId);
      setMemberships(response.memberships || []);
      setStatusMessage('Member removed.');
      await refreshSession?.();
    } catch (memberError) {
      setError(memberError.message || 'Unable to remove member.');
    }
  };

  return (
    <div className="p-6 space-y-6 bg-[var(--color-bg-primary)]">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Workspace Control</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">Manage the workspace shown in the top-right switcher and keep ownership clean as Phase 9 hardens.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Current Workspace</label>
                <select
                  value={selectedWorkspaceId}
                  onChange={(event) => handleWorkspaceSelect(event.target.value)}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  {(tenants || []).map(workspace => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name} ({workspace.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Your Role</label>
                <div className="px-3 py-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-sm text-[var(--color-text-primary)]">
                  {selectedWorkspace?.role || 'viewer'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <input
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Workspace name"
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
              />
              <button
                onClick={handleRenameWorkspace}
                disabled={!canManageWorkspace}
                className={saveButtonClassName("px-4 py-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--color-text-primary)] text-sm font-medium transition", savedAction === 'save-workspace-name')}
              >
                {savedAction === 'save-workspace-name' ? 'Saved' : 'Save Name'}
              </button>
            </div>
          </div>

          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Create Workspace</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">Spin up a new workspace and move into it immediately. This is the first real admin surface for multi-tenant operation.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="New workspace name"
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
              />
              <button
                onClick={handleCreateWorkspace}
                disabled={!canCreateWorkspace}
                className={saveButtonClassName("px-4 py-2 rounded-[var(--radius-card)] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed", savedAction === 'create-workspace')}
              >
                {savedAction === 'create-workspace' ? 'Created' : 'Create Workspace'}
              </button>
            </div>
            {!canCreateWorkspace && (
              <div className="text-xs text-[var(--color-text-secondary)]">
                Workspace creation is limited to owners and admins.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-5 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">Phase 9</div>
            <div className="text-sm text-[var(--color-text-primary)]">Workspace switching in the shell now reflects real session membership, not placeholders.</div>
            <div className="text-xs text-[var(--color-text-secondary)]">Current workspace: {tenant?.name || 'Unassigned'}</div>
            <div className="text-xs text-[var(--color-text-secondary)]">Accessible workspaces: {(tenants || []).length}</div>
          </div>
          {(statusMessage || error) && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
              {error || statusMessage}
            </div>
          )}
        </div>
      </div>

      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Workspace Members</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">Add existing app users by email and keep roles explicit while RBAC is being hardened.</p>
          </div>
          {loadingMembers && <div className="text-xs text-[var(--color-text-secondary)]">Loading...</div>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
          <input
            value={newMemberEmail}
            onChange={(event) => setNewMemberEmail(event.target.value)}
            placeholder="existing.user@example.com"
            className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
          />
          <select
            value={newMemberRole}
            onChange={(event) => setNewMemberRole(event.target.value)}
            disabled={!canManageWorkspace}
            className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
          >
            {availableRoleOptions.filter(role => role !== 'owner').map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <button
            onClick={handleAddMember}
            disabled={!canManageWorkspace}
            className={saveButtonClassName("px-4 py-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--color-text-primary)] text-sm font-medium transition", savedAction === 'add-member')}
          >
            {savedAction === 'add-member' ? 'Added' : 'Add Member'}
          </button>
        </div>

        <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-[var(--radius-panel)] overflow-hidden">
          {memberships.map(member => (
            <div key={member.id} className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_180px_auto] gap-3 items-center px-4 py-4 bg-[var(--color-bg-secondary)]">
              <div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">{member.user_name}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">{member.user_email}</div>
              </div>
              <div className="text-xs text-[var(--color-text-secondary)]">{member.provider}</div>
              <select
                value={member.role}
                disabled={!canManageWorkspace}
                onChange={(event) => handleRoleChange(member.id, event.target.value)}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-[var(--radius-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
              >
                {availableRoleOptions.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <button
                onClick={() => handleRemoveMember(member.id)}
                disabled={!canManageWorkspace || member.user_email === user?.email}
                className="px-3 py-2 rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/10 text-red-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Remove
              </button>
            </div>
          ))}
          {memberships.length === 0 && !loadingMembers && (
            <div className="px-4 py-6 text-sm text-[var(--color-text-secondary)]">No members found for this workspace yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ MAIN SETTINGS MODULE ============
const SettingsModule = ({ menuStructure, onMenuUpdate, activeSettingsTab }) => {
  const { tenant, user } = useAuth();
  const [activeTab, setActiveTab] = useState(activeSettingsTab || 'personal');
  const isOwner = ((tenant?.role || user?.role || 'viewer').toLowerCase() === 'owner');

  useEffect(() => {
    if (activeSettingsTab) setActiveTab(activeSettingsTab);
  }, [activeSettingsTab]);

  const tabs = [
    { id: 'personal', label: 'Personal', icon: User },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'workspace', label: 'Workspace', icon: Layers },
    { id: 'whitelabel', label: 'White Label', icon: Globe },
    { id: 'variables', label: 'Variables', icon: Key },
    ...(isOwner ? [{ id: 'omega', label: 'Omega', icon: Lock }] : [])
  ];

  const tabMeta = {
    personal: { eyebrow: 'Account', description: 'Identity, contact defaults, and operator-level preferences.', status: 'Live' },
    billing: { eyebrow: 'Commerce', description: 'Billing and package surfaces stay visible for the later tenancy/commercial pass.', status: 'Staged' },
    security: { eyebrow: 'Access', description: 'Password, session, and security posture for the active app user.', status: 'Mixed' },
    workspace: { eyebrow: 'Workspace', description: 'Switch, rename, and manage members for the active workspace.', status: 'Live' },
    whitelabel: { eyebrow: 'Branding', description: 'Brand, menu, and presentation controls that shape the app shell.', status: 'Mixed' },
    variables: { eyebrow: 'Automation', description: 'Global variables and tokens available to builders and workflows.', status: 'Legacy' },
    omega: { eyebrow: 'Governance', description: 'Owner-only emergency protocol for app-local purge control.', status: 'Restricted' }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'personal': return <PersonalSettings />;
      case 'billing': return <BillingSettings />;
      case 'security': return <SecuritySettings />;
      case 'workspace': return <WorkspaceSettings />;
      case 'whitelabel': return <WhiteLabelSettings menuStructure={menuStructure} onMenuUpdate={onMenuUpdate} />;
      case 'variables': return <GlobalVarsManager />;
      case 'omega': return <OmegaSettings />;
      default: return <PersonalSettings />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-primary)]">
      <ModuleHeader title="Settings" titleIcon={Settings} showTitle={false} showActions={false} />
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">{tabMeta[activeTab]?.eyebrow || 'Settings'}</div>
            <div className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{tabs.find((tab) => tab.id === activeTab)?.label || 'Settings'}</div>
            <div className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)]">{tabMeta[activeTab]?.description}</div>
          </div>
          <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">{tabMeta[activeTab]?.status || 'Live'}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 flex items-center gap-2 text-sm font-medium rounded-[var(--radius-panel)] border transition whitespace-nowrap ${activeTab === tab.id
                  ? 'text-[var(--color-text-primary)] border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                  : 'text-[var(--color-text-secondary)] border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/30'
                  }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
};

export { GlobalVarsManager, WhiteLabelSettings, PersonalSettings, BillingSettings, SecuritySettings, WorkspaceSettings, OmegaSettings };
export default SettingsModule;


import React, { useState, useEffect, useRef } from 'react';
import { Key, Settings, Save, User, Mail, Shield, Smartphone, Globe, Clock, PenTool, CreditCard, Box, Lock, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Edit2, Plus, Palette, Cog, Package, Inbox, FileCode, Layers, Search, Monitor, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBrand } from '../../contexts/BrandContext';
import { useAIAssist } from '../../contexts/AIAssistContext';
import { BrainIcon, Crosshair } from '../../components/ui/icons';
import { clearStoredSessionToken } from '../../services/authStorage';
import {
  addWorkspaceMemberApi,
  armOmegaApi,
  cancelOmegaApi,
  changePasswordApi,
  createWorkspaceApi,
  deleteWorkspaceApi,
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
  upsertGlobalVariableApi,
  uploadAvatarApi,
  deleteAvatarApi
} from '../../services/backendApi';
import { useTransientSaveFeedback, saveButtonClassName } from '../../hooks/useTransientSaveFeedback';

const loadCanonicalTenantSettings = async () => {
  const bundle = await getCanonicalSettingsApi();
  return bundle?.tenantSettings || {};
};

const normalizeTranscriptionProviderSetting = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
  if (normalized === 'elevenlabs' || normalized === 'eleven_labs' || normalized === 'elevenlabs_scribe') {
    return 'elevenlabs_scribe';
  }
  if (normalized === 'disabled' || normalized === 'off' || normalized === 'none') {
    return 'disabled';
  }
  return 'ffmpeg_transcribe';
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
    isSecret: Boolean(details?.isSecret),
    isSystem: Boolean(details?.isSystem),
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
      templateKey: template.templateKey,
      emailType: template.emailType,
      subject: template.subject || '',
      sendTo: template.sendTo || '',
      enabled: Boolean(template.enabled),
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
      editedByName: template.editedByName || template.edited_by_name,
      editedAt: template.editedAt || template.edited_at,
      config: template.config || {},
      updatedAt: template.updatedAt || template.updatedAt,
    }))
    .sort((left, right) => String(left.emailType || '').localeCompare(String(right.emailType || '')));
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
      setError(loadError?.message || loadError?.detail || String(loadError) || 'Unable to load variables.');
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
        isSecret: isSecret,
        isSystem: isSystem || isValidSystemKey
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
      setError(saveError?.message || saveError?.detail || String(saveError) || 'Unable to save variable.');
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
      setError(deleteError?.message || deleteError?.detail || String(deleteError) || 'Unable to remove variable.');
    }
  };

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-[var(--radius-outer)] border border-[var(--color-border)] flex flex-col overflow-hidden shadow-island">
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
          <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)]">{vars.map(v => (<div key={v.id} className="grid grid-cols-12 px-4 py-3 items-center text-sm"><div className="col-span-3 font-mono text-[var(--color-primary)]/70">{v.key}</div><div className="col-span-4 text-[var(--color-text-primary)] truncate font-mono">{v.isSecret ? '••••••••' : v.value}</div><div className="col-span-4 text-[var(--color-text-secondary)] text-xs">{v.description || '-'}</div><div className="col-span-1 text-right"><button onClick={() => deleteVar(v.id)} className="text-[var(--color-text-secondary)] hover:text-red-500"><Trash2 size={14} /></button></div></div>))}</div>
        </div>
      </div>
    </div>
  );
};

// ============ WHITE LABEL SETTINGS ============
const WhiteLabelSettings = ({ menuStructure, onMenuUpdate, handlersRef }) => {
  const [activeTab, setActiveTab] = useState('branding');
  const [expandedCategory, setExpandedCategory] = useState('Main');
  const [menuItems, setMenuItems] = useState([]);
  const [menuDraftDirty, setMenuDraftDirty] = useState(false);
  const { tenant, refreshSession } = useAuth();
  const { setBrandConfig } = useBrand();
  const tenantSettings = tenant?.tenantSettings || tenant?.settings || {};
  const persistedMenuStructure = Array.isArray(tenantSettings?.navigation?.menuStructure)
    ? tenantSettings.navigation.menuStructure
    : Array.isArray(tenantSettings?.menuStructure)
    ? tenantSettings.menuStructure
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
      refreshedTenantSettings = refreshed?.tenant?.tenantSettings || null;
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

  useEffect(() => {
    if (handlersRef) {
      handlersRef.reset = handleResetWhiteLabel;
      handlersRef.save = handleSaveWhiteLabel;
    }
  });

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
                onClick={() => handleTabChange(tab.id)}
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

const SystemEmailsSettings = ({ search = '', onSearchChange }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ subject: '', sendTo: '', enabled: true, bodyText: '' });
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
      setStatus(`${updated.emailType} updated.`);
    } catch (toggleError) {
      setError(toggleError.message || 'Unable to update template state.');
    }
  };

  const openEditor = (template) => {
    setEditing(template);
    setDraft({
      subject: template.subject || '',
      sendTo: template.sendTo || '',
      enabled: !!template.enabled,
      bodyText: template.bodyText || ''
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
      setStatus(`${updated.emailType} saved.`);
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
                  <td className="px-5 py-4 text-[var(--color-text-primary)] font-medium">{template.emailType}</td>
                  <td className="px-5 py-4 text-[var(--color-text-primary)] max-w-[260px] truncate">{template.subject}</td>
                  <td className="px-5 py-4 text-[var(--color-text-primary)]">{template.sendTo}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => handleToggle(template)} className={`w-12 h-6 rounded-full border transition relative ${template.enabled ? 'bg-[var(--color-primary)]/25 border-[var(--color-primary)]/40' : 'bg-[var(--color-bg-primary)] border-[var(--color-border)]'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${template.enabled ? 'left-6' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-5 py-4 text-[var(--color-text-primary)]">{template.editedByName || 'AIO Flow\u2122'}</td>
                  <td className="px-5 py-4 text-[var(--color-text-secondary)]">{template.editedAt || template.updatedAt}</td>
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
                  <h3 className="text-lg font-bold text-[var(--color-text-primary)]">{editing.emailType}</h3>
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
                <input value={draft.send_to} onChange={(event) => setDraft(current => ({ ...current, sendTo: event.target.value }))} className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
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
                <textarea value={draft.body_text} onChange={(event) => setDraft(current => ({ ...current, bodyText: event.target.value }))} className="w-full min-h-[220px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
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

// ============ PROFILE SETTINGS (Personal + Security merged) ============
const ProfileSettings = () => {
  const { user, refreshSession } = useAuth();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    phone: '',
    locale: 'en-US',
    timezone: 'America/New_York',
    emailSignature: ''
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [hasLocalPassword, setHasLocalPassword] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const profile = await getProfileApi();
        setForm({
          displayName: profile?.name || '',
          email: profile?.email || '',
          phone: profile?.phone || '',
          locale: profile?.locale || 'en-US',
          timezone: profile?.timezone || 'America/New_York',
          emailSignature: profile?.emailSignature || ''
        });
        setAvatarUrl(profile?.avatarUrl || '');
        setHasLocalPassword(profile?.provider !== 'google-oauth' && profile?.provider !== 'github-oauth' && profile?.provider !== 'microsoft-oauth');
      } catch (loadError) {
        setError(loadError?.message || loadError?.detail || String(loadError) || 'Unable to load your profile.');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  useEffect(() => {
    const loadSessions = async () => {
      setLoadingSessions(true);
      try {
        const data = await getAuthSessionsApi();
        setSessions(data || []);
      } catch {}
      setLoadingSessions(false);
    };
    loadSessions();
  }, []);

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be smaller than 2MB.');
      return;
    }
    setAvatarUploading(true);
    setError('');
    try {
      const result = await uploadAvatarApi(file);
      setAvatarUrl(result.data?.avatarUrl || '');
      await refreshSession?.();
      setStatus('Avatar updated.');
    } catch (err) {
      setError(err?.message || err?.detail || String(err) || 'Failed to upload avatar.');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    setAvatarUploading(true);
    setError('');
    try {
      await deleteAvatarApi();
      setAvatarUrl('');
      await refreshSession?.();
      setStatus('Avatar removed.');
    } catch (err) {
      setError(err?.message || err?.detail || String(err) || 'Failed to remove avatar.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      await updateProfileApi({
        displayName: form.displayName,
        phone: form.phone,
        locale: form.locale,
        timezone: form.timezone,
        emailSignature: form.emailSignature
      });
      await refreshSession?.();
      setStatus('Profile updated.');
      triggerSavedAction('save-profile');
    } catch (saveError) {
      setError(saveError?.message || saveError?.detail || String(saveError) || 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setError('');
    setStatus('');
    try {
      await changePasswordApi(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setStatus('Password updated.');
      triggerSavedAction('update-password');
    } catch (passwordError) {
      setError(passwordError?.message || passwordError?.detail || String(passwordError) || 'Unable to update password.');
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
      setError(revokeError?.message || revokeError?.detail || String(revokeError) || 'Unable to revoke session.');
    }
  };

  const handleLogoutOthers = async () => {
    setError('');
    setStatus('');
    try {
      await logoutOtherSessionsApi();
      const loadSessions = async () => {
        setLoadingSessions(true);
        try {
          const data = await getAuthSessionsApi();
          setSessions(data || []);
        } catch {}
        setLoadingSessions(false);
      };
      await loadSessions();
      setStatus('All other sessions were logged out.');
    } catch (logoutError) {
      setError(logoutError?.message || logoutError?.detail || String(logoutError) || 'Unable to log out other sessions.');
    }
  };

  const initials = (form.displayName || user?.name || 'A').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'A';

  return (
    <div className="h-full bg-[var(--color-bg-primary)] rounded-[var(--radius-outer)] border border-[var(--color-border)] flex flex-col overflow-hidden shadow-island">
      <div className="flex-1 overflow-y-auto p-6">
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 mb-4">{error}</div>}
        {status && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 mb-4">{status}</div>}

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN - Personal */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Personal</h3>
            
            {/* Profile Card */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4">
              <div className="grid grid-cols-[auto_1fr] gap-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="relative">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-[var(--color-border)]" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-cyan-500 flex items-center justify-center text-2xl font-bold text-[var(--color-text-primary)] border-2 border-[var(--color-border)]">
                        {initials}
                      </div>
                    )}
                    {avatarUploading && (
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleAvatarChange} className="hidden" id="avatar-upload" />
                  <label htmlFor="avatar-upload" className="cursor-pointer text-[10px] text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
                    {avatarUploading ? 'Uploading...' : 'Upload Photo'}
                  </label>
                  {avatarUrl && (
                    <button onClick={handleDeleteAvatar} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 content-start">
                  <div className="col-span-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Display Name</label>
                      <input autoComplete="off" value={form.displayName} onChange={(e) => setForm(c => ({ ...c, displayName: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Email</label>
                      <input autoComplete="off" type="email" value={form.email} disabled className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] opacity-80" />
                    </div>
                  </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Phone</label>
                      <input id="phone-field" name="telephone-number" type="tel" value={form.phone} onChange={(e) => setForm(c => ({ ...c, phone: e.target.value }))} autoComplete="off" inputMode="tel" className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                    </div>
                  <div className="col-span-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Language</label>
                      <select value={form.locale} onChange={(e) => setForm(c => ({ ...c, locale: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                        <option value="en-US">English (US)</option>
                        <option value="en-GB">English (UK)</option>
                        <option value="es-ES">Español</option>
                        <option value="es-MX">Español MX</option>
                        <option value="fr-FR">Français</option>
                        <option value="de-DE">Deutsch</option>
                        <option value="pt-BR">Português</option>
                        <option value="it-IT">Italiano</option>
                        <option value="ja-JP">日本語</option>
                        <option value="zh-CN">中文</option>
                        <option value="ko-KR">한국어</option>
                        <option value="ar-SA">العربية</option>
                        <option value="hi-IN">हिन्दी</option>
                        <option value="nl-NL">Nederlands</option>
                        <option value="pl-PL">Polski</option>
                        <option value="ru-RU">Русский</option>
                        <option value="tr-TR">Türkçe</option>
                        <option value="vi-VN">Tiếng Việt</option>
                        <option value="th-TH">ไทย</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Timezone</label>
                      <select value={form.timezone} onChange={(e) => setForm(c => ({ ...c, timezone: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                        <option value="America/New_York">America/New_York</option>
                        <option value="America/Chicago">America/Chicago</option>
                        <option value="America/Denver">America/Denver</option>
                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                        <option value="America/Anchorage">America/Anchorage</option>
                        <option value="Pacific/Honolulu">Pacific/Honolulu</option>
                        <option value="Europe/London">Europe/London</option>
                        <option value="Europe/Paris">Europe/Paris</option>
                        <option value="Europe/Berlin">Europe/Berlin</option>
                        <option value="Europe/Madrid">Europe/Madrid</option>
                        <option value="Europe/Rome">Europe/Rome</option>
                        <option value="Europe/Amsterdam">Europe/Amsterdam</option>
                        <option value="Europe/Moscow">Europe/Moscow</option>
                        <option value="Asia/Dubai">Asia/Dubai</option>
                        <option value="Asia/Kolkata">Asia/Kolkata</option>
                        <option value="Asia/Bangkok">Asia/Bangkok</option>
                        <option value="Asia/Singapore">Asia/Singapore</option>
                        <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
                        <option value="Asia/Shanghai">Asia/Shanghai</option>
                        <option value="Asia/Tokyo">Asia/Tokyo</option>
                        <option value="Asia/Seoul">Asia/Seoul</option>
                        <option value="Australia/Sydney">Australia/Sydney</option>
                        <option value="Pacific/Auckland">Pacific/Auckland</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={handleSave} disabled={saving || loading} className={saveButtonClassName("bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-60 text-[var(--color-text-primary)] px-4 py-1.5 rounded-lg text-xs font-bold", savedAction === 'save-profile')}>
                  {saving ? 'Saving...' : savedAction === 'save-profile' ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>

            {/* Password */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase">Change Password</h4>
              {hasLocalPassword ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">Current Password</label>
                      <input id="current-pw" name="current-password-field" type="password" autoComplete="off" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm(c => ({ ...c, currentPassword: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">New Password</label>
                      <input id="new-pw" name="new-password-field" type="password" autoComplete="off" value={passwordForm.newPassword} onChange={(e) => setPasswordForm(c => ({ ...c, newPassword: e.target.value }))} className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={handleChangePassword} className={saveButtonClassName("bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-primary)] px-4 py-1.5 rounded-lg text-xs font-bold", savedAction === 'update-password')}>
                      {savedAction === 'update-password' ? 'Saved' : 'Update Password'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-[var(--color-text-secondary)] py-2">
                  Password managed via OAuth provider. Set a local password to enable email/password login.
                </div>
              )}
            </div>

            {/* Email Signature */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase">Email Signature</h4>
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-3">
                <textarea
                  className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg p-3 text-sm text-[var(--color-text-primary)] min-h-[80px] focus:outline-none focus:border-[var(--color-primary)]"
                  value={form.emailSignature}
                  onChange={(e) => setForm(c => ({ ...c, emailSignature: e.target.value }))}
                  placeholder={`Best regards,\n\n${form.displayName || user?.name || 'AIO CRM'}`}
                />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - Security */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Security</h3>

            {/* Active Sessions */}
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              <div className="p-3 border-b border-[var(--color-border)]">
                <h4 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase">Active Sessions ({sessions.length})</h4>
              </div>
              <div className="divide-y divide-[var(--color-border)] max-h-[420px] overflow-y-auto">
                {loadingSessions && <div className="p-3 text-xs text-[var(--color-text-secondary)]">Loading...</div>}
                {!loadingSessions && sessions.slice(0, 7).map(session => (
                  <div key={session.id} className="p-3 flex justify-between items-center">
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--color-text-primary)] font-medium flex items-center gap-2">
                        <Monitor size={11} className="text-[var(--color-text-secondary)] flex-shrink-0" />
                        <span className="truncate">{session.label}</span>
                        {session.isCurrent && <span className="text-[9px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded-full flex-shrink-0">Current</span>}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-secondary)]">Last: {session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString() : 'Unknown'}</div>
                    </div>
                    {!session.isCurrent && <button onClick={() => handleRevokeSession(session.id)} className="text-[10px] text-red-400 hover:text-red-300 flex-shrink-0 ml-2">Revoke</button>}
                  </div>
                ))}
              </div>
              {sessions.length > 1 && (
                <div className="p-2 border-t border-[var(--color-border)]">
                  <button onClick={handleLogoutOthers} className="w-full px-3 py-1.5 rounded-lg font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition text-[10px]">
                    Logout All Others
                  </button>
                </div>
              )}
            </div>

            {/* Data & Privacy + 2FA side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-3 space-y-2">
                <div className="text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Data & Privacy</div>
                <div className="flex gap-2">
                  <button onClick={() => setStatus('Data export staged for later pass.')} className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-blue-500/50 text-blue-400 text-[10px] font-medium transition">
                    Download
                  </button>
                  <button className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-red-400 text-[10px] font-medium opacity-50 cursor-not-allowed">
                    Delete
                  </button>
                </div>
              </div>
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-3">
                <div className="text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">2FA -FUTURE</div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--color-text-secondary)]">Extra security layer</span>
                  <div className="relative opacity-40 cursor-not-allowed">
                    <div className="w-9 h-5 rounded-full border bg-[var(--color-bg-primary)] border-[var(--color-border)]">
                      <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white" />
                    </div>
                  </div>
                </div>
              </div>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Current Plan Card */}
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">Current Subscription</h3>
          <div className="flex justify-between items-center pb-3 border-b border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-secondary)]">Plan</span>
            <span className="text-xs text-[var(--color-text-primary)] font-bold">{billing.plan}</span>
          </div>
          <div className="flex justify-between items-center pb-3 border-b border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-secondary)]">Billing Status</span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-green-900/30 text-green-400 font-medium">{billing.status}</span>
          </div>
          <div className="flex justify-between items-center pb-3 border-b border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-secondary)]">Next Billing Date</span>
            <span className="text-xs text-[var(--color-text-primary)]">{billing.nextBillingDate}</span>
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-[var(--color-text-secondary)] font-medium">Monthly Charge</span>
            <span className="text-sm text-[var(--color-text-primary)] font-bold">{billing.amount}</span>
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
        confirmationCode: armCode,
        cancelCode: cancelCode
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
      const data = await cancelOmegaApi({ cancelCode });
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
      await executeOmegaApi({ confirmationCode: executeCode });
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
                  autoComplete="off"
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
                  autoComplete="off"
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
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{event.eventType}</div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">{new Date(event.createdAt).toLocaleString()}</div>
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
  const tenantSettings = tenant?.tenantSettings || tenant?.settings || {};
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(tenant?.id || '');
  const [memberships, setMemberships] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(tenant?.name || '');
  const [transcriptionProvider, setTranscriptionProvider] = useState(() => normalizeTranscriptionProviderSetting(tenantSettings?.media?.transcriptionProvider));
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('staff');
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archivingWorkspace, setArchivingWorkspace] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [savedAction, triggerSavedAction] = useTransientSaveFeedback();

  useEffect(() => {
    setSelectedWorkspaceId(tenant?.id || '');
    setWorkspaceName(tenant?.name || '');
    setTranscriptionProvider(normalizeTranscriptionProviderSetting(tenantSettings?.media?.transcriptionProvider));
    setShowArchiveConfirm(false);
  }, [tenant?.id, tenant?.name, tenantSettings?.media?.transcriptionProvider]);

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
  const canArchiveWorkspace = currentRole === 'owner';
  const alternateWorkspace = (tenants || []).find((workspace) => workspace.id !== selectedWorkspaceId) || null;
  const archiveBlockedReason = !canArchiveWorkspace
    ? 'Only workspace owners can archive a workspace.'
    : !alternateWorkspace
    ? 'You cannot archive your only remaining accessible workspace.'
    : '';
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

  const handleTranscriptionProviderChange = async (nextProvider) => {
    const normalized = normalizeTranscriptionProviderSetting(nextProvider);
    if (!canManageWorkspace || normalized === transcriptionProvider) {
      return;
    }
    setError('');
    setStatusMessage('');
    try {
      await updateCanonicalTenantSettingsApi({
        media: {
          ...(tenantSettings?.media || {}),
          transcriptionProvider: normalized,
        },
      });
      await refreshSession?.();
      setTranscriptionProvider(normalized);
      setStatusMessage('Transcription provider updated.');
      triggerSavedAction('save-transcription-provider');
    } catch (providerError) {
      setError(providerError.message || 'Unable to update transcription provider.');
    }
  };

  const handleArchiveWorkspace = async () => {
    if (!selectedWorkspaceId || archiveBlockedReason) {
      return;
    }
    setArchivingWorkspace(true);
    setError('');
    setStatusMessage('');
    try {
      const response = await deleteWorkspaceApi(selectedWorkspaceId);
      const refreshed = await refreshSession?.();
      const nextWorkspaceId = refreshed?.tenant?.id || response?.fallback_workspace_id || alternateWorkspace?.id || '';
      setSelectedWorkspaceId(nextWorkspaceId);
      setWorkspaceName(refreshed?.tenant?.name || '');
      setShowArchiveConfirm(false);
      setStatusMessage(`Workspace '${response?.workspace?.name || selectedWorkspace?.name || 'Workspace'}' archived.`);
    } catch (archiveError) {
      setError(archiveError.message || 'Unable to archive workspace.');
    } finally {
      setArchivingWorkspace(false);
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

          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[var(--radius-panel)] p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Transcription Provider</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">Locks transcription to one provider. No fallback.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'ffmpeg_transcribe', label: 'FFMPEG' },
                { value: 'elevenlabs_scribe', label: 'ELEVENLABS' },
                { value: 'disabled', label: 'DISABLED' },
              ].map((option) => {
                const active = transcriptionProvider === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleTranscriptionProviderChange(option.value)}
                    disabled={!canManageWorkspace}
                    className={`px-4 py-2 rounded-[var(--radius-card)] border text-xs font-semibold tracking-[0.16em] transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      active
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/12 text-[var(--color-text-primary)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/30'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {!canManageWorkspace && (
              <div className="text-xs text-[var(--color-text-secondary)]">
                Workspace admins control the locked transcription provider.
              </div>
            )}
            {savedAction === 'save-transcription-provider' && (
              <div className="text-xs text-emerald-300">Provider lock saved.</div>
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

        {canArchiveWorkspace && (
          <div className="rounded-[var(--radius-panel)] border border-red-500/25 bg-red-500/8 p-6 space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-red-300">Danger Zone</div>
              <div className="mt-1 text-sm text-[var(--color-text-primary)]">Archive workspace '{selectedWorkspace?.name || 'Workspace'}'?</div>
              <div className="mt-1 text-xs text-[var(--color-text-secondary)]">This removes the workspace from normal access and selection, but does not permanently delete its data.</div>
            </div>
            {showArchiveConfirm ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleArchiveWorkspace}
                  disabled={Boolean(archiveBlockedReason) || archivingWorkspace}
                  className="px-4 py-2 rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/15 text-red-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {archivingWorkspace ? 'Archiving...' : 'Confirm Archive'}
                </button>
                <button
                  onClick={() => setShowArchiveConfirm(false)}
                  disabled={archivingWorkspace}
                  className="px-4 py-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                disabled={Boolean(archiveBlockedReason)}
                className="px-4 py-2 rounded-[var(--radius-card)] border border-red-500/35 bg-red-500/10 text-red-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Archive Workspace
              </button>
            )}
            {archiveBlockedReason && (
              <div className="text-xs text-[var(--color-text-secondary)]">{archiveBlockedReason}</div>
            )}
            {!archiveBlockedReason && alternateWorkspace && (
              <div className="text-xs text-[var(--color-text-secondary)]">After archive, the session will switch to '{alternateWorkspace.name}'.</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

// ============ MAIN SETTINGS MODULE ============
const SETTINGS_TAB_KEY = 'aio-settings-active-tab';

const SettingsModule = ({ menuStructure, onMenuUpdate, activeSettingsTab }) => {
  const { tenant, user } = useAuth();
  const { openAIAssist } = useAIAssist();
  const [activeTab, setActiveTab] = useState(() => {
    if (activeSettingsTab) return activeSettingsTab;
    try {
      const saved = localStorage.getItem(SETTINGS_TAB_KEY);
      if (saved && ['account', 'billing', 'workspace', 'whitelabel', 'variables', 'omega'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'account';
  });
  const isOwner = ((tenant?.role || user?.role || 'viewer').toLowerCase() === 'owner');
  const wlHandlers = useRef({ reset: null, save: null });

  useEffect(() => {
    if (activeSettingsTab) {
      setActiveTab(activeSettingsTab);
    }
  }, [activeSettingsTab]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    try {
      localStorage.setItem(SETTINGS_TAB_KEY, tabId);
    } catch {}
  };

  const mainTabs = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'variables', label: 'Variables', icon: Key },
    { id: 'whitelabel', label: 'White Label', icon: Globe },
    { id: 'workspace', label: 'Workspace', icon: Layers },
  ];
  const tabs = isOwner ? [...mainTabs, { id: 'omega', label: 'Omega', icon: Lock }] : mainTabs;

  const tabMeta = {
    account: { description: 'Identity, preferences, password, and active sessions.', status: 'Live' },
    billing: { description: 'Subscription, payment methods, and billing history.', status: 'Staged' },
    workspace: { description: 'Switch, rename, and manage members.', status: 'Live' },
    whitelabel: { description: 'Brand, menu, and presentation controls.' },
    variables: { description: 'Global variables and tokens for builders and workflows.', status: 'Legacy' },
    omega: { eyebrow: 'Governance', description: 'Owner-only emergency protocol for app-local purge control.', status: 'Restricted' }
  };

  const activeTabData = tabs.find(tab => tab.id === activeTab);
  const ActiveIcon = activeTabData?.icon;
  const activeMeta = tabMeta[activeTab] || {};
  const isWhiteLabel = activeTab === 'whitelabel';

  const renderContent = () => {
    switch (activeTab) {
      case 'account': return <ProfileSettings />;
      case 'billing': return <BillingSettings />;
      case 'workspace': return <WorkspaceSettings />;
      case 'whitelabel': return <WhiteLabelSettings menuStructure={menuStructure} onMenuUpdate={onMenuUpdate} handlersRef={wlHandlers.current} />;
      case 'variables': return <GlobalVarsManager />;
      case 'omega': return <OmegaSettings />;
      default: return <ProfileSettings />;
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      {/* Toolbar */}
      <div className="shrink-0 h-12 flex items-center justify-between gap-3 px-4 border border-[var(--color-border)]/50 bg-[var(--color-bg-tertiary)]/90 backdrop-blur-sm rounded-xl shadow-island-sm">
        {/* Left: Icon + Title */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {ActiveIcon && <ActiveIcon size={14} className="text-[var(--color-primary)] flex-shrink-0" />}
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">{activeTabData?.label || 'Settings'}</span>
        </div>

        {/* Left: Tab Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {mainTabs.map(tab => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-2.5 py-1 flex items-center gap-1 text-[10px] font-medium rounded-md border transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-[var(--color-text-primary)] border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10'
                    : 'text-[var(--color-text-secondary)] border-transparent bg-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                }`}
              >
                <TabIcon size={11} />
                {tab.label}
              </button>
            );
          })}
          {isOwner && (
            <>
              <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
              <button
                onClick={() => handleTabChange('omega')}
                className={`px-2.5 py-1 flex items-center gap-1 text-[10px] font-medium rounded-md border transition whitespace-nowrap ${
                  activeTab === 'omega'
                    ? 'text-red-300 border-red-500/40 bg-red-500/10'
                    : 'text-red-300/60 border-transparent bg-transparent hover:text-red-300 hover:bg-red-500/10'
                }`}
              >
                <Lock size={11} />
                Omega
              </button>
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1.5 px-1.5 py-1 bg-black/30 rounded-lg border border-white/10">
            <button onClick={() => openAIAssist({ context: { module: 'settings', tab: activeTab } })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"><BrainIcon size={14} /></button>
            <button onClick={() => openAIAssist({ context: { module: 'settings', tab: activeTab } })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 transition-all"><Crosshair size={14} /></button>
          </div>
          {isWhiteLabel && (
            <div className="flex items-center gap-2 ml-2">
              <button onClick={() => wlHandlers.current.reset?.()} className="text-[10px] py-1 px-2 h-6 flex items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/30 transition whitespace-nowrap">Reset</button>
              <button onClick={() => wlHandlers.current.save?.()} className="text-[10px] py-1 px-2 h-6 flex items-center justify-center rounded border border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/20 transition font-medium whitespace-nowrap">Save</button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 rounded-[var(--radius-outer)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-island overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export { GlobalVarsManager, WhiteLabelSettings, ProfileSettings, BillingSettings, WorkspaceSettings, OmegaSettings };
export default SettingsModule;


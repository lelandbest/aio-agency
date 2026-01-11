import React, { useState, useEffect } from 'react';
import { Key, Settings, Save, User, Mail, Shield, Smartphone, Globe, Clock, PenTool, CreditCard, Box, Lock, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Edit2, Plus } from 'lucide-react';
import { mockSupabase } from '../../services/mockSupabase';

// ============ GLOBAL VARIABLES MANAGER ============
const GlobalVarsManager = () => {
  const [vars, setVars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchVars(); }, []);

  const fetchVars = async () => {
    const { data } = await mockSupabase.from('global_variables').select('*');
    if (data) setVars(data);
    setLoading(false);
  };

  const addVar = async () => {
    setError('');
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
    
    const { error } = await mockSupabase.from('global_variables').insert([{
      key: finalKey, 
      value: newValue, 
      description: newDesc, 
      is_secret: isSecret, 
      is_system: isValidSystemKey
    }]);
    if (error) setError(error.message);
    else { setNewKey(''); setNewValue(''); setNewDesc(''); setIsSecret(false); fetchVars(); }
  };

  const deleteVar = async (id) => { await mockSupabase.from('global_variables').delete().eq('id', id); fetchVars(); };

  return (
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
      <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Key size={20} className="text-purple-500" /> Global Variables</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">Manage {'{{userVariables}}'} and system keys.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[var(--color-bg-primary)]">
        <div className="bg-[var(--color-bg-secondary)] p-4 rounded-lg border border-[var(--color-border)] space-y-4">
          <div className="grid grid-cols-12 gap-4">
             <div className="col-span-3"><input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Key (e.g. userEmail)" className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-purple-500 focus:outline-none" /></div>
             <div className="col-span-4"><input value={newValue} onChange={e => setNewValue(e.target.value)} type={isSecret ? "password" : "text"} placeholder="Value" className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-purple-500 focus:outline-none" /></div>
             <div className="col-span-3"><input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description" className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-purple-500 focus:outline-none" /></div>
             <div className="col-span-2 flex gap-2"><button onClick={() => setIsSecret(!isSecret)} className={`p-2 rounded ${isSecret ? 'bg-yellow-500/20 text-yellow-500' : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'}`}><Lock size={16}/></button><button onClick={addVar} className="flex-1 bg-purple-600 hover:bg-purple-700 text-[var(--color-text-primary)] text-sm font-medium py-2 rounded">Add</button></div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="space-y-2">
           <div className="grid grid-cols-12 px-4 text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider"><div className="col-span-3">Key</div><div className="col-span-4">Value</div><div className="col-span-4">Description</div><div className="col-span-1 text-right">Action</div></div>
           <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)]">{vars.map(v => (<div key={v.id} className="grid grid-cols-12 px-4 py-3 items-center text-sm"><div className="col-span-3 font-mono text-purple-300">{v.key}</div><div className="col-span-4 text-[var(--color-text-primary)] truncate font-mono">{v.is_secret ? '••••••••' : v.value}</div><div className="col-span-4 text-[var(--color-text-secondary)] text-xs">{v.description || '-'}</div><div className="col-span-1 text-right"><button onClick={() => deleteVar(v.id)} className="text-[var(--color-text-secondary)] hover:text-red-500"><Trash2 size={14} /></button></div></div>))}</div>
        </div>
      </div>
    </div>
  );
};

// ============ WHITE LABEL SETTINGS ============
const WhiteLabelSettings = ({ menuStructure, onMenuUpdate }) => {
  const [activeTab, setActiveTab] = useState('branding');
  const [expandedCategory, setExpandedCategory] = useState('Main');
  const [menuItems, setMenuItems] = useState(menuStructure || []);
  
  // Branding State
  const [brandingData, setBrandingData] = useState({
    menuBackgroundColor: '#2a2a2e',
    menuTextColor: '#ffffff',
    layout: 'sidebar-left',
    theme: 'dark',
    companyLogo: '',
    companyName: 'AIO Agency'
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
    iconColor: '#9ca3af',
    backgroundColor: '#18181B',
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
    const updated = JSON.parse(JSON.stringify(menuItems));
    updated[categoryIdx].items[itemIdx].visible = !updated[categoryIdx].items[itemIdx].visible;
    setMenuItems(updated);
    onMenuUpdate?.(updated);
  };

  const updateItemLabel = (categoryIdx, itemIdx, newLabel) => {
    const updated = JSON.parse(JSON.stringify(menuItems));
    updated[categoryIdx].items[itemIdx].label = newLabel;
    setMenuItems(updated);
    onMenuUpdate?.(updated);
  };

  const updateItemUrl = (categoryIdx, itemIdx, newUrl) => {
    const updated = JSON.parse(JSON.stringify(menuItems));
    updated[categoryIdx].items[itemIdx].url = newUrl;
    setMenuItems(updated);
    onMenuUpdate?.(updated);
  };

  const updateItemIcon = (categoryIdx, itemIdx, showIcon) => {
    const updated = JSON.parse(JSON.stringify(menuItems));
    updated[categoryIdx].items[itemIdx].showIcon = showIcon;
    setMenuItems(updated);
    onMenuUpdate?.(updated);
  };

  const deleteMenuItem = (categoryIdx, itemIdx) => {
    const updated = JSON.parse(JSON.stringify(menuItems));
    updated[categoryIdx].items.splice(itemIdx, 1);
    setMenuItems(updated);
    onMenuUpdate?.(updated);
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

  const updateBrandingTheme = (theme) => {
    setBrandingData({ ...brandingData, theme });
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
        iconColor: item.iconColor || '#9ca3af',
        backgroundColor: item.backgroundColor || '#18181B',
        enableIframe: item.type === 'iframe'
      });
    } else {
      setModalFormData({
        title: '',
        link: '',
        icon: 'Box',
        iconColor: '#9ca3af',
        backgroundColor: '#18181B',
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
      iconColor: '#9ca3af',
      backgroundColor: '#18181B',
      enableIframe: false
    });
    setShowIconPicker(false);
    setIconSearch('');
  };

  const saveMenuItemChanges = () => {
    const updated = JSON.parse(JSON.stringify(menuItems));
    
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
    onMenuUpdate?.(updated);
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
    <div className="h-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
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
            <button className="text-xs bg-gray-600 hover:bg-gray-500 text-[var(--color-text-primary)] px-3 py-1.5 rounded transition">Reset</button>
            <button className="text-xs bg-blue-600 hover:bg-blue-700 text-[var(--color-text-primary)] px-3 py-1.5 rounded transition font-medium">Save</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <div className="flex overflow-x-auto">
          {[
            { id: 'branding', label: 'Branding', icon: '🎨' },
            { id: 'advanced', label: 'Advanced', icon: '⚙️' },
            { id: 'mobile', label: 'Mobile App', icon: '📱' },
            { id: 'ui', label: 'UI', icon: '🎯' },
            { id: 'styles', label: 'Styles', icon: '✏️' },
            { id: 'package', label: 'Package', icon: '📦' },
            { id: 'emails', label: 'System Emails', icon: '✉️' },
            { id: 'blueprints', label: 'Blueprints', icon: '📋' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-[var(--color-text-primary)] border-blue-500'
                  : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
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
                  className={`px-4 py-2 rounded text-sm font-medium transition ${
                    brandingData.theme === 'light'
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                      : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  ☀️ Light
                </button>
                <button
                  onClick={() => updateBrandingTheme('dark')}
                  className={`px-4 py-2 rounded text-sm font-medium transition ${
                    brandingData.theme === 'dark'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                      : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  🌙 Dark
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
                  className={`p-3 rounded text-xs font-medium transition border text-left ${
                    brandingData.layout === 'sidebar-left'
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                      : 'bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <div className="font-bold mb-1">📍 Sidebar Left</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Classic layout</div>
                </button>
                <button
                  onClick={() => updateBrandingLayout('sidebar-right')}
                  className={`p-3 rounded text-xs font-medium transition border text-left ${
                    brandingData.layout === 'sidebar-right'
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                      : 'bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <div className="font-bold mb-1">📍 Sidebar Right</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Mirrored layout</div>
                </button>
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
                        iconColor: '#9ca3af',
                        backgroundColor: '#18181B',
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
                        style={{ backgroundColor: item.backgroundColor || '#27272A', color: item.iconColor || '#9ca3af' }}
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

        {/* OTHER TABS - Placeholder */}
        {['styles', 'package', 'emails', 'blueprints'].includes(activeTab) && (
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
                            className={`p-2 rounded text-center text-xs font-medium transition ${
                              modalFormData.icon === icon
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
                className="px-4 py-2 rounded text-sm font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[#3f3f47] transition"
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

// ============ PERSONAL SETTINGS ============
const PersonalSettings = () => {
  return (
    <div className="h-full bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
      <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2"><User size={20} className="text-purple-500" /> Personal Profile</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">Manage your account information and preferences.</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        
        {/* Profile Card */}
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6 flex flex-col md:flex-row gap-8">
           <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-4xl font-bold text-[var(--color-text-primary)] border-4 border-[var(--color-border)] shadow-lg">
                 A
              </div>
              <button className="text-xs text-purple-400 hover:text-[var(--color-text-primary)] underline">Change Avatar</button>
           </div>
           
           <div className="flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">First Name</label>
                    <input type="text" defaultValue="Aaron" className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-purple-500" />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Last Name</label>
                    <input type="text" defaultValue="Riggs" className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-purple-500" />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Email</label>
                    <div className="relative">
                       <Mail size={16} className="absolute left-3 top-2.5 text-[var(--color-text-secondary)]" />
                       <input type="email" defaultValue="aaron@aioflow.com" className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded pl-10 pr-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-purple-500" />
                       <span className="absolute right-3 top-2.5 text-[10px] bg-green-500/10 text-green-500 border border-green-500/20 px-1.5 rounded">Verified</span>
                    </div>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Phone</label>
                    <div className="relative">
                       <Smartphone size={16} className="absolute left-3 top-2.5 text-[var(--color-text-secondary)]" />
                       <input type="tel" defaultValue="+1 (555) 123-4567" className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded pl-10 pr-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-purple-500" />
                    </div>
                 </div>
              </div>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Security Settings */}
           <div className="space-y-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Shield size={16} className="text-blue-500"/> Security</h3>
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                 <div className="flex justify-between items-center">
                    <div>
                       <div className="text-sm font-medium text-[var(--color-text-primary)]">Password</div>
                       <div className="text-xs text-[var(--color-text-secondary)]">Last changed 3 months ago</div>
                    </div>
                    <button className="text-xs bg-[var(--color-bg-tertiary)] hover:bg-white hover:text-black text-[var(--color-text-primary)] px-3 py-1.5 rounded transition">Update</button>
                 </div>
                 <div className="w-full h-px bg-[var(--color-bg-tertiary)]"></div>
                 <div className="flex justify-between items-center">
                    <div>
                       <div className="text-sm font-medium text-[var(--color-text-primary)]">Two-Factor Auth</div>
                       <div className="text-xs text-[var(--color-text-secondary)]">Secure your account with 2FA</div>
                    </div>
                    <div className="w-10 h-5 bg-[var(--color-bg-tertiary)] rounded-full relative cursor-pointer"><div className="w-3 h-3 bg-gray-500 rounded-full absolute left-1 top-1"></div></div>
                 </div>
              </div>
           </div>

           {/* Preferences */}
           <div className="space-y-4">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Globe size={16} className="text-green-500"/> Preferences</h3>
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Language</label>
                    <select className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-purple-500">
                       <option>English (US)</option>
                       <option>Spanish</option>
                       <option>French</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">Timezone</label>
                    <div className="relative">
                       <Clock size={16} className="absolute left-3 top-2.5 text-[var(--color-text-secondary)]" />
                       <select className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded pl-10 pr-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-purple-500">
                          <option>(GMT-05:00) Eastern Time</option>
                          <option>(GMT-08:00) Pacific Time</option>
                          <option>(GMT+00:00) UTC</option>
                       </select>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Email Signature */}
        <div className="space-y-4">
           <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><PenTool size={16} className="text-orange-500"/> Email Signature</h3>
           <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4">
              <textarea 
                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg p-4 text-sm text-[var(--color-text-primary)] min-h-[120px] focus:outline-none focus:border-purple-500 font-mono"
                defaultValue={`Best regards,\n\nAaron Riggs\nOwner | AIO Flow\n(555) 123-4567 | aaron@aioflow.com`}
              />
              <div className="flex justify-end mt-4">
                 <button className="bg-purple-600 hover:bg-purple-700 text-[var(--color-text-primary)] px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><Save size={16}/> Save Changes</button>
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
    <div className="h-full bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
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
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-blue-600 rounded flex items-center justify-center text-[var(--color-text-primary)] text-xs font-bold">VISA</div>
                <div>
                  <div className="text-[var(--color-text-primary)] font-medium">•••• •••• •••• 4242</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Expires 12/26</div>
                </div>
              </div>
              <button className="text-xs bg-[var(--color-bg-tertiary)] hover:bg-white hover:text-black text-[var(--color-text-primary)] px-3 py-1.5 rounded transition">Update</button>
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
              <div className="grid grid-cols-4 p-4 text-sm items-center"><span className="text-[var(--color-text-primary)]">Jan 10, 2026</span><span className="text-[var(--color-text-primary)]">$99.99</span><span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-400 w-fit">Paid</span><button className="text-purple-400 hover:text-[var(--color-text-primary)] text-right">Download</button></div>
              <div className="grid grid-cols-4 p-4 text-sm items-center"><span className="text-[var(--color-text-primary)]">Dec 10, 2025</span><span className="text-[var(--color-text-primary)]">$99.99</span><span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-400 w-fit">Paid</span><button className="text-purple-400 hover:text-[var(--color-text-primary)] text-right">Download</button></div>
              <div className="grid grid-cols-4 p-4 text-sm items-center"><span className="text-[var(--color-text-primary)]">Nov 10, 2025</span><span className="text-[var(--color-text-primary)]">$99.99</span><span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-400 w-fit">Paid</span><button className="text-purple-400 hover:text-[var(--color-text-primary)] text-right">Download</button></div>
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
  const [passwordLastChanged, setPasswordLastChanged] = useState('2025-12-15');

  return (
    <div className="h-full bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden">
      <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Shield size={20} className="text-red-500" /> Security Settings</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">Manage your account security and access permissions.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Password Management */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Password</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium text-[var(--color-text-primary)]">Change Password</div>
                <div className="text-xs text-[var(--color-text-secondary)]">Last changed {passwordLastChanged}</div>
              </div>
              <button className="text-xs bg-purple-600 hover:bg-purple-700 text-[var(--color-text-primary)] px-3 py-1.5 rounded transition">Update</button>
            </div>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Two-Factor Authentication</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[var(--color-text-primary)] font-medium">Enable 2FA</div>
                <div className="text-xs text-[var(--color-text-secondary)]">Add an extra layer of security to your account</div>
              </div>
              <div className={`w-12 h-6 rounded-full transition cursor-pointer ${twoFactorEnabled ? 'bg-purple-600' : 'bg-[var(--color-bg-tertiary)]'}`} onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}></div>
            </div>
            {twoFactorEnabled && (
              <div className="p-3 bg-[var(--color-bg-primary)] border border-purple-500/30 rounded text-sm text-[var(--color-text-primary)]">
                Authenticator App: Synced ✓
              </div>
            )}
          </div>
        </div>

        {/* Active Sessions */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Active Sessions</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="divide-y divide-[var(--color-border)]">
              <div className="p-4 flex justify-between items-center">
                <div>
                  <div className="text-[var(--color-text-primary)] font-medium">Chrome on macOS</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Last active: Today at 2:30 PM</div>
                </div>
                <button className="text-xs text-[var(--color-text-secondary)] hover:text-red-400">Revoke</button>
              </div>
              <div className="p-4 flex justify-between items-center">
                <div>
                  <div className="text-[var(--color-text-primary)] font-medium">Safari on iPhone</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Last active: Yesterday at 10:15 AM</div>
                </div>
                <button className="text-xs text-[var(--color-text-secondary)] hover:text-red-400">Revoke</button>
              </div>
            </div>
          </div>
          <button className="w-full px-4 py-2 rounded font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition text-sm">Logout All Other Sessions</button>
        </div>

        {/* Data & Privacy */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Data & Privacy</h3>
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
            <button className="w-full text-left px-4 py-2 rounded bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-blue-500/50 text-blue-400 text-sm font-medium transition">
              Download Your Data
            </button>
            <button className="w-full text-left px-4 py-2 rounded bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-red-500/50 text-red-400 text-sm font-medium transition">
              Delete Account (Permanent)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ MAIN SETTINGS MODULE ============
const SettingsModule = ({ menuStructure, onMenuUpdate, activeSettingsTab }) => {
  const [activeTab, setActiveTab] = useState(activeSettingsTab || 'personal');

  useEffect(() => {
    if (activeSettingsTab) setActiveTab(activeSettingsTab);
  }, [activeSettingsTab]);

  const tabs = [
    { id: 'personal', label: 'Personal', icon: User },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'whitelabel', label: 'White Label', icon: Globe },
    { id: 'variables', label: 'Variables', icon: Key }
  ];

  const renderContent = () => {
    switch(activeTab) {
      case 'personal': return <PersonalSettings />;
      case 'billing': return <BillingSettings />;
      case 'security': return <SecuritySettings />;
      case 'whitelabel': return <WhiteLabelSettings menuStructure={menuStructure} onMenuUpdate={onMenuUpdate} />;
      case 'variables': return <GlobalVarsManager />;
      default: return <PersonalSettings />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-primary)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <div className="flex overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 flex items-center gap-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-[var(--color-text-primary)] border-purple-500'
                    : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text-primary)]'
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

export { GlobalVarsManager, WhiteLabelSettings, PersonalSettings, BillingSettings, SecuritySettings };
export default SettingsModule;


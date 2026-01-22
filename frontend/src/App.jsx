import React, { useState, useEffect, createContext, useContext } from 'react';
import { mockSupabase } from './services/mockSupabase';
import { ThemeProvider, useTheme } from './lib/ThemeContext';
import AuthScreen from './components/AuthScreen';
import DashboardModule from './modules/Dashboard';
import CRMModule from './modules/CRM';
import FormBuilderModule from './modules/Forms';
import PipelineModule from './modules/Pipeline';
import CalendarModule from './modules/Calendar';
import OrdersModule from './modules/Orders';
import AIOAgentsModule from './modules/Agents';
import DesignModule from './modules/Design';
import IntegrationsManager from './modules/Integrations';
import SettingsModule from './modules/Settings';
import TermsPage from './pages/Terms';
import PrivacyPage from './pages/Privacy';
import AcceptableUsePage from './pages/AcceptableUse';
import PublicForm from './pages/PublicForm';
import { INITIAL_MENU_STRUCTURE, ICON_LIBRARY } from './data/initialDb';
import {
  LayoutDashboard, Users, Bot, Workflow, Radio, Calendar as CalendarIcon,
  MessageSquare, PenTool, GitMerge, FileText, ShoppingCart, Globe,
  Phone, Settings, ChevronDown, ChevronRight, Search, Plus, Video,
  LogOut, Menu, X, ExternalLink, Crosshair, EyeOff, Activity, Zap, Rocket, HelpCircle
} from 'lucide-react';

// ============ CONTEXT SETUP ============

/**
 * Database Context
 * Provides access to mock database throughout the app
 * Will be swapped to real Supabase later
 */
const DbContext = createContext();
export const useDb = () => useContext(DbContext);

/**
 * Auth Context
 * Manages authentication state
 */
const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

// ============ MENU STRUCTURE ============
const MENU_STRUCTURE = INITIAL_MENU_STRUCTURE;

// ============ ICON MAP ============
const ICON_MAP = {
  ...ICON_LIBRARY,
  LayoutDashboard,
  Users,
  Bot,
  Workflow,
  Radio,
  CalendarIcon,
  MessageSquare,
  PenTool,
  GitMerge,
  FileText,
  ShoppingCart,
  Globe,
  Phone,
  Settings,
  Video,
  Crosshair,
  EyeOff,
  Activity,
  Zap,
  Rocket,
};

// ============ TOP BAR COMPONENT ============
const TopBar = ({ onLogout, onNavigate }) => {
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { theme, setTheme } = useTheme();
  const [notifications] = useState([
    { id: 1, message: 'New message from John', time: '5m ago', type: 'chat' },
    { id: 2, message: 'System update available', time: '1h ago', type: 'system' },
    { id: 3, message: 'Your report is ready', time: '2h ago', type: 'system' }
  ]);

  const currentUser = {
    email: 'mail@aioflow.com',
    name: 'User',
    role: 'Admin'
  };

  const tenants = [
    { id: 1, name: 'Admin Account', role: 'Administrator', selected: true },
    { id: 2, name: 'Manager Account', role: 'Manager', selected: false },
    { id: 3, name: 'Team Lead', role: 'Team Lead', selected: false }
  ];

  return (
    <div className="h-16 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center justify-end px-6 gap-4">
      {/* Theme Toggle */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition text-yellow-500 hover:text-yellow-600"
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      {/* Phone Icon - VoIP */}
      <button
        className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition text-green-500 hover:text-green-600"
        title="VoIP Phone"
      >
        📞
      </button>

      {/* Bell Icon - Notifications */}
      <div className="relative">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition text-yellow-500 hover:text-yellow-600 relative"
          title="Notifications"
        >
          🔔
          {notifications.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          )}
        </button>

        {/* Notifications Dropdown */}
        {showNotifications && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
            <div className="absolute right-0 top-12 w-80 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-xl z-50">
              <div className="p-4 border-b border-[var(--color-border)]">
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Notifications</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map(notif => (
                    <div key={notif.id} className="p-4 border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition cursor-pointer">
                      <p className="text-sm text-[var(--color-text-primary)]">{notif.message}</p>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1">{notif.time}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-[var(--color-text-secondary)] text-sm">No notifications</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Contacts Icon - Multi-tenant */}
      <div className="relative">
        <button
          onClick={() => setShowTenantDropdown(!showTenantDropdown)}
          className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition text-blue-500 hover:text-blue-600"
          title="Switch Account"
        >
          👥
        </button>

        {/* Tenant Dropdown */}
        {showTenantDropdown && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowTenantDropdown(false)} />
            <div className="absolute right-0 top-12 w-72 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-xl z-50">
              <div className="p-4 border-b border-[var(--color-border)]">
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Switch Account</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">Select a role or account</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {tenants.map(tenant => (
                  <button
                    key={tenant.id}
                    className={`w-full text-left p-4 border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition ${
                      tenant.selected ? 'bg-purple-600/20 border-l-2 border-l-purple-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">{tenant.name}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{tenant.role}</p>
                      </div>
                      {tenant.selected && <span className="text-purple-400">✓</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Profile Icon - User Menu */}
      <div className="relative">
        <button
          onClick={() => setShowProfileDropdown(!showProfileDropdown)}
          className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition"
          title="User Menu"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center text-white font-bold text-sm">
            👤
          </div>
        </button>

        {/* Profile Dropdown */}
        {showProfileDropdown && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />
            <div className="absolute right-0 top-12 w-72 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-xl z-50">
              <div className="p-4 border-b border-[var(--color-border)]">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{currentUser.email}</p>
              </div>

              <div className="divide-y divide-[var(--color-border)]">
                <button 
                  onClick={() => {
                    setShowProfileDropdown(false);
                    // Will navigate to personal settings
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition flex items-center gap-3"
                >
                  <span>👤</span> My Account
                </button>
                <button 
                  onClick={() => {
                    setShowProfileDropdown(false);
                    onNavigate('terms');
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition flex items-center gap-3"
                >
                  <span>📄</span> Terms of Service
                </button>
                <button 
                  onClick={() => {
                    setShowProfileDropdown(false);
                    onNavigate('privacy');
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition flex items-center gap-3"
                >
                  <span>📋</span> Privacy Policy
                </button>
                <button 
                  onClick={() => {
                    setShowProfileDropdown(false);
                    onNavigate('acceptable-use');
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition flex items-center gap-3"
                >
                  <span>🚀</span> Acceptable Use Policy
                </button>
              </div>

              <div className="p-3 border-t border-[var(--color-border)]">
                <button
                  onClick={() => {
                    setShowProfileDropdown(false);
                    onLogout();
                  }}
                  className="w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium rounded transition border border-red-600/30"
                >
                  Logout
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ============ SIDEBAR COMPONENT ============
const Sidebar = ({ activeModule, onSelectModule, onLogout, isMobileOpen, setIsMobileOpen }) => {
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 bg-[var(--color-bg-primary)] border-r border-[var(--color-border)] 
        flex flex-col overflow-hidden z-50 transform transition-all lg:transform-none
        ${isCollapsed ? 'w-20' : 'w-64'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 border-b border-[var(--color-border)] flex items-center justify-between px-4 flex-shrink-0">
          <div className={`flex items-center gap-3 ${isCollapsed ? 'hidden' : ''}`}>
            <img 
              src="/aio-button-192px.png" 
              alt="AIO Agency" 
              className="w-8 h-8 rounded-lg"
            />
            <span className="font-bold text-[var(--color-text-primary)] text-sm">AIO Agency</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
              title={isCollapsed ? 'Expand menu' : 'Collapse menu'}
            >
              <Menu size={16} />
            </button>
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-2 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">
          {MENU_STRUCTURE.map((category, idx) => (
            <div key={idx} className="mb-6">
              {!isCollapsed && (
                <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider px-3 mb-3">
                  {category.category}
                </h3>
              )}
              <div className="space-y-1">
                {category.items.map(item => {
                  if (item.type === 'group') {
                    return (
                      <div key={item.id}>
                        <button
                          onClick={() => setExpandedGroup(expandedGroup === item.id ? null : item.id)}
                          className={`w-full flex items-center justify-between rounded transition font-bold ${
                            isCollapsed 
                              ? 'px-2 py-2 justify-center' 
                              : 'px-3 py-2 text-sm'
                          } text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]`}
                          title={isCollapsed ? item.label : ''}
                        >
                          <span className={`flex items-center ${isCollapsed ? '' : 'gap-2'}`}>
                            {ICON_MAP[item.icon] && React.createElement(ICON_MAP[item.icon], { size: 16 })}
                            {!isCollapsed && item.label}
                          </span>
                          {!isCollapsed && (
                            <ChevronRight
                              size={14}
                              className={`transform transition-transform ${expandedGroup === item.id ? 'rotate-90' : ''}`}
                            />
                          )}
                        </button>
                        {!isCollapsed && expandedGroup === item.id && (
                          <div className="ml-4 mt-1 space-y-1 bg-[var(--color-bg-secondary)] rounded p-1">
                            {item.children?.map(child => {
                              // Handle iframe links - embed in app
                              if (child.type === 'iframe' && child.url) {
                                return (
                                  <button
                                    key={child.id}
                                    onClick={() => {
                                      onSelectModule(child.id);
                                      setIsMobileOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-xs rounded transition ${
                                      activeModule === child.id
                                        ? 'bg-purple-600/20 text-purple-400 border-l-2 border-purple-600'
                                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                                    }`}
                                  >
                                    {child.label}
                                  </button>
                                );
                              }
                              
                              // Handle external links
                              if (child.type === 'external' && child.url) {
                                return (
                                  <a
                                    key={child.id}
                                    href={child.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full text-left px-3 py-2 text-xs rounded transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] flex items-center justify-between group"
                                  >
                                    <span>{child.label}</span>
                                    <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition" />
                                  </a>
                                );
                              }
                              
                              // Handle internal links
                              return (
                                <button
                                  key={child.id}
                                  onClick={() => {
                                    onSelectModule(child.id);
                                    setIsMobileOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-xs rounded transition ${
                                    activeModule === child.id
                                      ? 'bg-purple-600/20 text-purple-400 border-l-2 border-purple-600'
                                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                                  }`}
                                >
                                  {child.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Handle external links
                  if (item.type === 'external' && item.url) {
                    return (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-full flex items-center rounded transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] ${
                          isCollapsed 
                            ? 'px-2 py-2 justify-center' 
                            : 'px-3 py-2 text-sm gap-2'
                        }`}
                        title={isCollapsed ? item.label : ''}
                      >
                        {ICON_MAP[item.icon] && React.createElement(ICON_MAP[item.icon], { size: 16 })}
                        {!isCollapsed && (
                          <>
                            {item.label}
                            <ExternalLink size={12} className="ml-auto text-gray-600" />
                          </>
                        )}
                      </a>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectModule(item.id);
                        setIsMobileOpen(false);
                      }}
                      className={`w-full flex items-center rounded transition font-bold ${
                        isCollapsed 
                          ? 'px-2 py-2 justify-center' 
                          : 'px-3 py-2 text-sm gap-2'
                      } ${
                        activeModule === item.id
                          ? 'bg-purple-600 text-white'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                      }`}
                      title={isCollapsed ? item.label : ''}
                    >
                      {ICON_MAP[item.icon] && React.createElement(ICON_MAP[item.icon], { size: 16 })}
                      {!isCollapsed && item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Help Docs Link */}
        <div className={`border-t border-[var(--color-border)] flex-shrink-0 flex items-center justify-between ${isCollapsed ? 'p-2' : 'p-4'}`}>
          {!isCollapsed && <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase">Resources</span>}
          <a
            href="https://help.aioflow.com"
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 text-[var(--color-text-secondary)] hover:text-blue-400 hover:bg-[var(--color-hover)] rounded transition flex items-center gap-2 ${isCollapsed ? 'w-full flex justify-center' : ''}`}
            title="Help Documentation"
          >
            <HelpCircle size={16} />
            {!isCollapsed && <span className="text-xs">Help Docs</span>}
          </a>
        </div>
      </div>
    </>
  );
};

// ============ ERROR BOUNDARY ============
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          color: 'red', 
          backgroundColor: '#000',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          <h1>🔴 React Error Caught</h1>
          <p>{this.state.error?.toString()}</p>
          <p>{this.state.error?.stack}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============ MAIN APP COMPONENT ============
const App = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [db, setDb] = useState(null);
  const [currentPage, setCurrentPage] = useState('app'); // 'app', 'terms', 'privacy', 'acceptable-use'

  useEffect(() => {
    // Simulate checking for existing session
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, []);

  const handleLogin = (session) => {
    setSession(session);
  };

  const handleLogout = async () => {
    await mockSupabase.auth.signOut();
    setSession(null);
    setActiveModule('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="text-[var(--color-text-primary)] text-xl">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  // Handle page navigation for policy pages
  if (currentPage === 'terms') {
    return <TermsPage />;
  }
  if (currentPage === 'privacy') {
    return <PrivacyPage />;
  }
  if (currentPage === 'acceptable-use') {
    return <AcceptableUsePage />;
  }

  // Placeholder component for modules not yet extracted
  const PlaceholderModule = ({ name }) => (
    <div className="h-full bg-[var(--color-bg-tertiary)] rounded-xl border border-[var(--color-border)] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-[var(--color-bg-secondary)] rounded-full flex items-center justify-center mx-auto mb-4 border border-[var(--color-border)]">
          <Bot size={32} className="text-[var(--color-text-secondary)]" />
        </div>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">{name} Module</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">Coming soon...</p>
      </div>
    </div>
  );

  // Get iframe URL for external links
  const getIframeUrl = (moduleId) => {
    for (const category of MENU_STRUCTURE) {
      for (const item of category.items) {
        if (item.id === moduleId && item.type === 'iframe') {
          return item.url;
        }
      }
    }
    return null;
  };

  // Map settings IDs to tab IDs
  const getSettingsTabFromModuleId = (moduleId) => {
    const settingsTabMap = {
      'set-personal': 'personal',
      'set-billing': 'billing',
      'set-security': 'security',
      'set-whitelabel': 'whitelabel',
      'set-integrations': 'variables',
      'set-vars': 'variables'
    };
    return settingsTabMap[moduleId];
  };

  // Module router - conditionally render modules
  const renderModule = () => {
    // Check if this is an iframe module
    const iframeUrl = getIframeUrl(activeModule);
    if (iframeUrl) {
      return (
        <div className="h-full w-full bg-[#0F0F11] rounded-xl border border-[#27272A] overflow-hidden">
          <iframe
            src={iframeUrl}
            title={activeModule}
            className="w-full h-full border-none"
            allow="camera; microphone; clipboard-read; clipboard-write"
          />
        </div>
      );
    }

    // Check if this is a settings tab
    const settingsTabs = ['set-personal', 'set-billing', 'set-integrations', 'set-whitelabel', 'set-security', 'set-vars'];
    if (settingsTabs.includes(activeModule)) {
      const activeSettingsTab = getSettingsTabFromModuleId(activeModule);
      return <SettingsModule menuStructure={MENU_STRUCTURE} activeSettingsTab={activeSettingsTab} />;
    }

    switch (activeModule) {
      case 'dashboard':
        return <DashboardModule />;
      case 'crm':
        return <CRMModule />;
      case 'forms':
        return <FormBuilderModule />;
      case 'pipelines':
        return <PipelineModule />;
      case 'calendar':
        return <CalendarModule />;
      case 'aio-agents':
        return <AIOAgentsModule />;
      case 'orders':
        return <OrdersModule />;
      case 'design':
        return <DesignModule />;
      case 'integrations':
        return <IntegrationsManager />;
      case 'chat':
        return <PlaceholderModule name="Chat" />;
      case 'flows':
        return <PlaceholderModule name="Flows" />;
      case 'marketplace':
        return <PlaceholderModule name="Marketplace" />;
      case 'sms-voip':
        return <PlaceholderModule name="SMS/VoIP" />;
      case 'settings':
        return <SettingsModule menuStructure={MENU_STRUCTURE} />;
      default:
        return <PlaceholderModule name="Module" />;
    }
  };

  return (
    <ThemeProvider>
      <AuthContext.Provider value={{ session, user: session?.user }}>
        <DbContext.Provider value={{ db, setDb }}>
          <div className="h-screen flex bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans">
          {/* Sidebar */}
          <Sidebar
            activeModule={activeModule}
            onSelectModule={setActiveModule}
            onLogout={handleLogout}
            isMobileOpen={isMobileOpen}
            setIsMobileOpen={setIsMobileOpen}
          />

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Bar with User Icons */}
            <TopBar onLogout={handleLogout} onNavigate={setCurrentPage} />

            {/* Module Header */}
            <div className="h-16 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsMobileOpen(!isMobileOpen)}
                  className="lg:hidden p-2 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)]"
                >
                  <Menu size={20} />
                </button>
                <h1 className="text-lg font-bold text-[var(--color-text-primary)]">
                  {MENU_STRUCTURE
                    .flatMap(cat => cat.items)
                    .find(item => item.id === activeModule)?.label || 'AIO Agency'}
                </h1>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg">
                  <Search size={16} className="text-[var(--color-text-secondary)]" />
                  <input
                    type="text"
                    placeholder="Search..."
                    className="bg-transparent outline-none text-sm text-[var(--color-text-secondary)] placeholder-[var(--color-text-tertiary)] w-48"
                  />
                </div>
              </div>
            </div>

            {/* Module Content */}
            <div className="flex-1 overflow-auto p-6 bg-[var(--color-bg-primary)]">
              {renderModule()}
            </div>
          </div>
          </div>
        </DbContext.Provider>
      </AuthContext.Provider>
    </ThemeProvider>
  );
};

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { ThemeProvider } from './lib/ThemeContext';
import AuthContext from './contexts/AuthContext';
import DbContext from './contexts/DbContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LoadingSpinner from './components/LoadingSpinner';
import AuthScreen from './components/AuthScreen';
import { clearStoredSessionToken, getStoredSessionToken } from './services/authStorage';
import { getCurrentSessionApi, logoutApi, switchTenantSessionApi } from './services/backendApi';

// Lazy load modules for code splitting
const SignalsModule = lazy(() => import('./modules/Signals'));
const BrainModule = lazy(() => import('./modules/Brain'));
const CRMModule = lazy(() => import('./modules/CRM'));
const FormBuilderModule = lazy(() => import('./modules/Forms'));
const PipelineModule = lazy(() => import('./modules/Pipeline'));
const CalendarModule = lazy(() => import('./modules/Calendar'));
const OrdersModule = lazy(() => import('./modules/Orders'));
const AIOAgentsModule = lazy(() => import('./modules/Agents'));
const DesignModule = lazy(() => import('./modules/Design'));
const IntegrationsManager = lazy(() => import('./modules/Integrations'));
const SettingsModule = lazy(() => import('./modules/Settings'));
const FlowsModule = lazy(() => import('./modules/Flows'));
const CommsModule = lazy(() => import('./modules/Comms'));
const CannedResponsesModule = lazy(() => import('./modules/CannedResponses'));
const SmsVoipModule = lazy(() => import('./modules/SmsVoip'));
const SystemsModule = lazy(() => import('./modules/Systems'));
const HelpModule = lazy(() => import('./modules/Help'));

// Lazy load policy pages
const TermsPage = lazy(() => import('./pages/Terms'));
const PrivacyPage = lazy(() => import('./pages/Privacy'));
const AcceptableUsePage = lazy(() => import('./pages/AcceptableUse'));
const PublicForm = lazy(() => import('./pages/PublicForm'));

import { INITIAL_MENU_STRUCTURE, ICON_LIBRARY } from './data/initialDb';
import {
  LayoutDashboard, Users, Bot, Workflow, Radio, Calendar as CalendarIcon,
  MessageSquare, PenTool, GitMerge, FileText, ShoppingCart, Globe,
  Phone, Settings, Video, Crosshair, EyeOff, Activity, Zap, Rocket, GraduationCap
} from 'lucide-react';

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
  GraduationCap,
};

const MODULE_SUBTITLE_MAP = {
  chat: 'Thread-first Comms with AI-guided actions and report logging.'
};

// ============ MAIN APP COMPONENT ============
const App = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState('aio-brain');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [db, setDb] = useState(null);
  const [currentPage, setCurrentPage] = useState('app'); // 'app', 'terms', 'privacy', 'acceptable-use', 'form'
  const [formSlug, setFormSlug] = useState(null);
  const [lastNonFullscreen, setLastNonFullscreen] = useState('aio-brain');
  const [flowId, setFlowId] = useState(null);
  const [commsThreadId, setCommsThreadId] = useState(null);
  const [integrationCategory, setIntegrationCategory] = useState('automation');
  const [crmContactId, setCrmContactId] = useState(null);

  const fullscreenModules = ['flows'];
  const isFullscreen = fullscreenModules.includes(activeModule);

  const findMenuItemById = (items, targetId, parent = null) => {
    for (const item of items) {
      if (item.id === targetId) {
        return { item, parent };
      }

      if (item.children) {
        const found = findMenuItemById(item.children, targetId, item);
        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  const currentModuleMeta = (() => {
    const found = findMenuItemById(MENU_STRUCTURE.flatMap(category => category.items), activeModule);
    const item = found?.item;
    const parent = found?.parent;
    const label = item?.label || parent?.label || 'AIO CRM';

    return {
      label,
      icon: item?.icon || parent?.icon || null,
      subtitle: item?.description || MODULE_SUBTITLE_MAP[item?.id] || '',
      type: item?.type || 'internal',
      searchPlaceholder: item?.searchPlaceholder || `Search ${label}...`,
    };
  })();

  const systemsLauncherIds = ['aio-bots', 'aio-flows', 'aio-livebots', 'aio-sniper', 'aio-market', 'aio-academy'];
  const systemsLauncherItems = MENU_STRUCTURE
    .flatMap(category => category.items)
    .filter(item => systemsLauncherIds.includes(item.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  useEffect(() => {
    if (!isFullscreen) {
      setLastNonFullscreen(activeModule);
    }
  }, [activeModule, isFullscreen]);

  useEffect(() => {
    let cancelled = false;

    const initializeApp = async () => {
      const path = window.location.pathname;
      if (path.startsWith('/form/')) {
        const slug = path.replace('/form/', '');
        setFormSlug(slug);
        setCurrentPage('form');
      }

      const sessionToken = getStoredSessionToken();
      if (!sessionToken) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      try {
        const restoredSession = await getCurrentSessionApi();
        if (!cancelled) {
          setSession(restoredSession);
        }
      } catch {
        clearStoredSessionToken();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initializeApp();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleNavigate = (event) => {
      const detail = event.detail || {};
      if (detail.module) {
        setActiveModule(detail.module);
      }
      if (detail.flowId !== undefined) {
        setFlowId(detail.flowId);
      }
      if (detail.threadId !== undefined) {
        setCommsThreadId(detail.threadId);
      }
      if (detail.contactId !== undefined) {
        setCrmContactId(detail.contactId);
      }
      if (detail.integrationCategory !== undefined) {
        setIntegrationCategory(detail.integrationCategory);
      }
    };
    window.addEventListener('aio:navigate', handleNavigate);
    return () => window.removeEventListener('aio:navigate', handleNavigate);
  }, []);

  const handleLogin = (session) => {
    setSession(session);
  };

  const refreshSession = async () => {
    const refreshed = await getCurrentSessionApi();
    setSession(refreshed);
    return refreshed;
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch {}
    clearStoredSessionToken();
    setSession(null);
    setActiveModule('aio-brain');
  };

  const handleSwitchTenant = async (tenantId) => {
    if (!tenantId || session?.tenant?.id === tenantId) {
      return session;
    }
    const nextSession = await switchTenantSessionApi(tenantId);
    setSession(nextSession);
    return nextSession;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="text-[var(--color-text-primary)] text-xl">Loading...</div>
      </div>
    );
  }

  // Handle public form pages (no auth required)
  if (currentPage === 'form' && formSlug) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
          <LoadingSpinner size="lg" message="Loading form..." />
        </div>
      }>
        <PublicForm formSlug={formSlug} />
      </Suspense>
    );
  }

  if (!session) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  // Handle page navigation for policy pages
  if (currentPage === 'terms') {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
          <LoadingSpinner size="lg" message="Loading..." />
        </div>
      }>
        <TermsPage />
      </Suspense>
    );
  }
  if (currentPage === 'privacy') {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
          <LoadingSpinner size="lg" message="Loading..." />
        </div>
      }>
        <PrivacyPage />
      </Suspense>
    );
  }
  if (currentPage === 'acceptable-use') {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
          <LoadingSpinner size="lg" message="Loading..." />
        </div>
      }>
        <AcceptableUsePage />
      </Suspense>
    );
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
      'set-workspace': 'workspace',
      'set-whitelabel': 'whitelabel',
      'set-vars': 'variables'
    };
    return settingsTabMap[moduleId] || 'personal';
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
    const settingsTabs = ['set-personal', 'set-billing', 'set-security', 'set-workspace', 'set-whitelabel', 'set-vars'];
    if (settingsTabs.includes(activeModule)) {
      const activeSettingsTab = getSettingsTabFromModuleId(activeModule);
      return <SettingsModule menuStructure={MENU_STRUCTURE} activeSettingsTab={activeSettingsTab} />;
    }

    switch (activeModule) {
      case 'dashboard':
        return <SignalsModule />;
      case 'aio-brain':
        return <BrainModule />;
      case 'aio-systems':
        return (
          <SystemsModule
            systems={systemsLauncherItems}
            iconMap={ICON_MAP}
            onOpenSystem={setActiveModule}
          />
        );
      case 'crm':
        return <CRMModule initialContactId={crmContactId} />;
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
        return <IntegrationsManager initialCategory={integrationCategory} />;
      case 'flows':
        return <FlowsModule flowId={flowId} onExit={() => setActiveModule(lastNonFullscreen || 'dashboard')} />;
      case 'chat':
        return <CommsModule initialChannel="all" initialThreadId={commsThreadId} onNavigate={setActiveModule} />;
      case 'marketplace':
        return <PlaceholderModule name="Marketplace" />;
      case 'sms-voip':
        return <SmsVoipModule />;
      case 'canned-responses':
        return <CannedResponsesModule onNavigate={setActiveModule} />;
      case 'settings':
        return <SettingsModule menuStructure={MENU_STRUCTURE} />;
      case 'aio-help':
        return <HelpModule />;
      default:
        return <PlaceholderModule name="Module" />;
    }
  };

  return (
    <ThemeProvider>
        <AuthContext.Provider value={{ session, user: session?.user, token: session?.token, tenant: session?.tenant, tenants: session?.tenants || [], logout: handleLogout, switchTenant: handleSwitchTenant, refreshSession }}>
        <DbContext.Provider value={{ db, setDb }}>
          <div className="h-screen flex bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans">
            {/* Sidebar */}
            {!isFullscreen && (
              <Sidebar
                activeModule={activeModule}
                onSelectModule={(moduleId) => {
                  setActiveModule(moduleId);
                  if (moduleId !== 'crm') {
                    setCrmContactId(null);
                  }
                }}
                onLogout={handleLogout}
                isMobileOpen={isMobileOpen}
                setIsMobileOpen={setIsMobileOpen}
                menuStructure={MENU_STRUCTURE}
                iconMap={ICON_MAP}
              />
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {!isFullscreen && (
                <TopBar
                  onLogout={handleLogout}
                  onNavigate={setCurrentPage}
                  title={currentModuleMeta.label}
                  subtitle={currentModuleMeta.subtitle}
                  titleIcon={currentModuleMeta.icon ? ICON_MAP[currentModuleMeta.icon] : null}
                  searchPlaceholder={currentModuleMeta.searchPlaceholder}
                  showSearch={currentModuleMeta.type !== 'iframe'}
                  onToggleMobileMenu={() => setIsMobileOpen(true)}
                />
              )}

              {/* Module Content */}
              <div className={`flex-1 bg-[var(--color-bg-primary)] ${isFullscreen ? 'overflow-hidden p-0' : 'overflow-auto p-6'}`}>
                <Suspense key={activeModule} fallback={
                  <div className="h-full flex items-center justify-center">
                    <LoadingSpinner size="lg" message="Loading module..." />
                  </div>
                }>
                  {renderModule()}
                </Suspense>
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







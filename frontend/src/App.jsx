import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { ThemeProvider } from './lib/ThemeContext';
import AuthContext, { isClientRole, isOperatorRole, normalizeUserRole } from './contexts/AuthContext';
import DbContext from './contexts/DbContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import OperatorAssistDock from './components/OperatorAssistDock';
import LoadingSpinner from './components/LoadingSpinner';
import AuthScreen from './components/AuthScreen';
import { clearStoredSessionToken, getStoredSessionToken } from './services/authStorage';
import { getCurrentSessionApi, logoutApi, switchTenantSessionApi } from './services/backendApi';
import { OrchestrationProvider } from './orchestration';
import { BrandProvider } from './contexts/BrandContext';

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
const MediaModule = lazy(() => import('./modules/Media'));
const IntegrationsManager = lazy(() => import('./modules/Integrations'));
const SettingsModule = lazy(() => import('./modules/Settings'));
const FlowsModule = lazy(() => import('./modules/Flows'));
const CommsModule = lazy(() => import('./modules/Comms'));
const CannedResponsesModule = lazy(() => import('./modules/CannedResponses'));
const SmsVoipModule = lazy(() => import('./modules/SmsVoip'));
const SystemsModule = lazy(() => import('./modules/Systems'));
const HelpModule = lazy(() => import('./modules/Help'));
const SystemHealthModule = lazy(() => import('./modules/SystemHealth'));

// Lazy load policy pages
const TermsPage = lazy(() => import('./pages/Terms'));
const PrivacyPage = lazy(() => import('./pages/Privacy'));
const AcceptableUsePage = lazy(() => import('./pages/AcceptableUse'));
const PublicForm = lazy(() => import('./pages/PublicForm'));

import { INITIAL_MENU_STRUCTURE, ICON_LIBRARY } from './data/initialDb';

const DEFAULT_ACTIVE_MODULE = 'aio-brain';
const DEFAULT_CLIENT_MODULE = 'chat';
const DEFAULT_INTEGRATION_CATEGORY = 'automation';
const CLIENT_ALLOWED_MODULES = new Set(['chat', 'calendar']);

const normalizeNavigationValue = (value) => {
  if (typeof value !== 'string') {
    return value ?? null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readNavigationStateFromUrl = () => {
  if (typeof window === 'undefined') {
    return {
      activeModule: DEFAULT_ACTIVE_MODULE,
      flowId: null,
      flowAction: null,
      flowIntent: null,
      commsThreadId: null,
      integrationCategory: DEFAULT_INTEGRATION_CATEGORY,
      crmContactId: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    activeModule: normalizeNavigationValue(params.get('module')) || DEFAULT_ACTIVE_MODULE,
    flowId: normalizeNavigationValue(params.get('flowId')),
    flowAction: normalizeNavigationValue(params.get('action')),
    flowIntent: normalizeNavigationValue(params.get('intent')),
    commsThreadId: normalizeNavigationValue(params.get('threadId')),
    integrationCategory: normalizeNavigationValue(params.get('integrationCategory')) || DEFAULT_INTEGRATION_CATEGORY,
    crmContactId: normalizeNavigationValue(params.get('contactId')),
  };
};
import {
  LayoutDashboard, Users, Bot, Workflow, Radio, Calendar as CalendarIcon,
  MessageSquare, PenTool, GitMerge, FileText, ShoppingCart, Globe,
  Phone, Settings, Video, Crosshair, EyeOff, Activity, Zap, Rocket, GraduationCap
} from 'lucide-react';

// ============ MENU STRUCTURE ============
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
  'aio-brain': 'Direct the Cortex layer for reasoning, planning, and system-level AI coordination.',
  dashboard: 'Operator feed for bookings, comms, pipeline, and automation heuristics.',
  'aio-agents': 'Coordinate specialist agents, live command runs, and system execution posture.',
  calendar: 'Coordinate sources, booking types, and scheduled meetings from one workspace.',
  crm: 'Search, segment, and operate on contact records from one workspace.',
  flows: 'Manage and launch your automation flows.',
  forms: 'Create, organize, and deploy workspace forms.',
  chat: 'Thread-first Comms for triage, actions, and audit logs.',
  integrations: 'Admin control plane for mailbox accounts, calendar sources, and every other external system connected to AIO CRM.',
  media: 'Operate scripts, voice, renders, transcripts, and ingest workflows from one workspace.',
  orders: 'Review order records, payment state, and fulfillment posture from one workspace.',
  pipelines: 'Operate deal stages, next moves, and relationship records from one workspace.',
  settings: 'Manage account, workspace, security, branding, and automation settings.',
  'system-health': 'Operator-only visibility into current failures, degradation, and deployment risk.'
};

const SPECIAL_MODULE_META = {
  media: {
    label: 'Media',
    icon: 'Video',
    subtitle: MODULE_SUBTITLE_MAP.media,
    type: 'internal',
    searchPlaceholder: 'Search media jobs, assets, and artifacts...',
  },
  'system-health': {
    label: 'System Health',
    icon: 'Activity',
    subtitle: MODULE_SUBTITLE_MAP['system-health'],
    type: 'internal',
    searchPlaceholder: 'Search system health...',
  },
};

const isValidMenuItem = (item) => (
  item
  && typeof item === 'object'
  && typeof item.id === 'string'
  && typeof item.label === 'string'
  && typeof item.icon === 'string'
);

const isValidMenuCategory = (category) => (
  category
  && typeof category === 'object'
  && typeof category.category === 'string'
  && Array.isArray(category.items)
  && category.items.every(isValidMenuItem)
);

const isUsableMenuStructure = (value) => (
  Array.isArray(value)
  && value.length > 0
  && value.every(isValidMenuCategory)
);

const MEDIA_MENU_ITEM = {
  id: 'media',
  label: 'Media',
  icon: 'Video',
  type: 'internal',
  visible: true,
  iconColor: '#9ca3af',
  description: MODULE_SUBTITLE_MAP.media,
};

const ensureMediaMenuItem = (structure = []) => {
  if (!Array.isArray(structure) || structure.length === 0) {
    return structure;
  }
  const hasMediaItem = structure.some((category) =>
    Array.isArray(category?.items) && category.items.some((item) => item?.id === 'media')
  );
  if (hasMediaItem) {
    return structure;
  }
  return structure.map((category) => {
    if (category?.category !== 'Operations' || !Array.isArray(category.items)) {
      return category;
    }
    const nextItems = [...category.items];
    const designIndex = nextItems.findIndex((item) => item?.id === 'design');
    const insertIndex = designIndex >= 0 ? designIndex + 1 : nextItems.length;
    nextItems.splice(insertIndex, 0, MEDIA_MENU_ITEM);
    return {
      ...category,
      items: nextItems,
    };
  });
};

const filterMenuForClient = (structure = []) => {
  const filtered = (Array.isArray(structure) ? structure : []).map((category) => ({
    ...category,
    items: (Array.isArray(category?.items) ? category.items : []).filter((item) => CLIENT_ALLOWED_MODULES.has(item.id)),
  })).filter((category) => category.items.length > 0);
  return filtered.length > 0
    ? filtered
    : INITIAL_MENU_STRUCTURE.map((category) => ({
        ...category,
        items: (Array.isArray(category?.items) ? category.items : []).filter((item) => CLIENT_ALLOWED_MODULES.has(item.id)),
      })).filter((category) => category.items.length > 0);
};

// ============ MAIN APP COMPONENT ============
const App = () => {
  const initialNavigation = useRef(readNavigationStateFromUrl()).current;
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState(initialNavigation.activeModule);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [db, setDb] = useState(null);
  const [currentPage, setCurrentPage] = useState('app'); // 'app', 'terms', 'privacy', 'acceptable-use', 'form'
  const [formSlug, setFormSlug] = useState(null);
  const [lastNonFullscreen, setLastNonFullscreen] = useState('aio-brain');
  const [flowId, setFlowId] = useState(initialNavigation.flowId);
  const [flowAction, setFlowAction] = useState(initialNavigation.flowAction);
  const [flowIntent, setFlowIntent] = useState(initialNavigation.flowIntent);
  const [commsThreadId, setCommsThreadId] = useState(initialNavigation.commsThreadId);
  const [integrationCategory, setIntegrationCategory] = useState(initialNavigation.integrationCategory);
  const [crmContactId, setCrmContactId] = useState(initialNavigation.crmContactId);
  const [menuStructure, setMenuStructure] = useState(INITIAL_MENU_STRUCTURE);
  const activeTenantSettings = session?.tenant?.tenant_settings || session?.tenant?.settings || {};
  const preferredTenantTheme = activeTenantSettings?.branding?.theme || null;
  const userRole = normalizeUserRole(session?.user?.role);
  const clientMode = isClientRole(userRole);
  const operatorMode = isOperatorRole(userRole);
  const renderedMenuStructure = clientMode ? filterMenuForClient(menuStructure) : menuStructure;
  const effectiveActiveModule = clientMode && !CLIENT_ALLOWED_MODULES.has(activeModule) ? DEFAULT_CLIENT_MODULE : activeModule;
  const canonicalMenu = activeTenantSettings?.navigation?.menuStructure;
  const legacyMenu = activeTenantSettings?.menu_structure;

  const fullscreenModules = [];
  const isFullscreen = fullscreenModules.includes(effectiveActiveModule);

  useEffect(() => {
    let nextMenu = INITIAL_MENU_STRUCTURE;

    if (isUsableMenuStructure(canonicalMenu)) {
      nextMenu = canonicalMenu;
    } else if (isUsableMenuStructure(legacyMenu)) {
      nextMenu = legacyMenu;
    }

    // Canonical tenant navigation is authoritative only when it contains a usable persisted menu.
    // Empty canonical/legacy arrays mean "not configured yet" and must not blank the sidebar.
    setMenuStructure(ensureMediaMenuItem(nextMenu));
  }, [session?.tenant?.id, canonicalMenu, legacyMenu]);

  useEffect(() => {
    if (!clientMode || CLIENT_ALLOWED_MODULES.has(activeModule)) {
      return;
    }
    setActiveModule(DEFAULT_CLIENT_MODULE);
    setFlowId(null);
    setFlowAction(null);
    setFlowIntent(null);
    setCrmContactId(null);
  }, [activeModule, clientMode]);

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
    if (SPECIAL_MODULE_META[effectiveActiveModule]) {
      return SPECIAL_MODULE_META[effectiveActiveModule];
    }
    const found = findMenuItemById(renderedMenuStructure.flatMap(category => category.items), effectiveActiveModule);
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
  const systemsLauncherItems = renderedMenuStructure
    .flatMap(category => category.items)
    .filter(item => systemsLauncherIds.includes(item.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  useEffect(() => {
    if (!isFullscreen) {
      setLastNonFullscreen(effectiveActiveModule);
    }
  }, [effectiveActiveModule, isFullscreen]);

  useEffect(() => {
    if (typeof window === 'undefined' || currentPage !== 'app' || window.location.pathname.startsWith('/form/')) {
      return;
    }

    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const setParam = (key, value) => {
      const normalized = normalizeNavigationValue(value);
      if (normalized) {
        params.set(key, normalized);
      } else {
        params.delete(key);
      }
    };

    setParam('module', effectiveActiveModule || DEFAULT_ACTIVE_MODULE);

    if (effectiveActiveModule === 'flows') {
      setParam('flowId', flowId);
      setParam('action', flowAction);
      setParam('intent', flowIntent);
    } else {
      params.delete('flowId');
      params.delete('action');
      params.delete('intent');
    }

    if (effectiveActiveModule === 'chat') {
      setParam('threadId', commsThreadId);
    } else {
      params.delete('threadId');
    }

    if (effectiveActiveModule === 'crm') {
      setParam('contactId', crmContactId);
    } else {
      params.delete('contactId');
    }

    if (effectiveActiveModule === 'integrations') {
      setParam('integrationCategory', integrationCategory);
    } else {
      params.delete('integrationCategory');
    }

    const nextSearch = params.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
    const currentUrl = `${url.pathname}${url.search}${url.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState({}, '', nextUrl);
    }
  }, [currentPage, effectiveActiveModule, flowId, flowAction, flowIntent, commsThreadId, crmContactId, integrationCategory]);

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
        setActiveModule(clientMode && !CLIENT_ALLOWED_MODULES.has(detail.module) ? DEFAULT_CLIENT_MODULE : detail.module);
      }
      if (detail.flowId !== undefined) {
        setFlowId(detail.flowId);
      }
      if (detail.action !== undefined) {
        setFlowAction(detail.action);
      }
      if (detail.intent !== undefined) {
        setFlowIntent(detail.intent);
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
  }, [clientMode]);

  const handleLogin = (session) => {
    setSession(session);
    if (isClientRole(session?.user?.role)) {
      setActiveModule(DEFAULT_CLIENT_MODULE);
    }
  };

  const handleFlowContextChange = useCallback((next = {}) => {
    if (Object.prototype.hasOwnProperty.call(next, 'flowId')) {
      setFlowId(next.flowId ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'action')) {
      setFlowAction(next.action ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'intent')) {
      setFlowIntent(next.intent ?? null);
    }
  }, []);

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
    if (isClientRole(nextSession?.user?.role) && !CLIENT_ALLOWED_MODULES.has(activeModule)) {
      setActiveModule(DEFAULT_CLIENT_MODULE);
    }
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
    for (const category of renderedMenuStructure) {
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
    const iframeUrl = getIframeUrl(effectiveActiveModule);
    if (iframeUrl) {
      return (
        <div className="surface-elevated h-full w-full rounded-[var(--radius-panel)] overflow-hidden">
          <iframe
            src={iframeUrl}
            title={effectiveActiveModule}
            className="w-full h-full border-none"
            allow="camera; microphone; clipboard-read; clipboard-write"
          />
        </div>
      );
    }

    // Check if this is a settings tab
    const settingsTabs = ['set-personal', 'set-billing', 'set-security', 'set-workspace', 'set-whitelabel', 'set-vars'];
    if (settingsTabs.includes(effectiveActiveModule)) {
      const activeSettingsTab = getSettingsTabFromModuleId(effectiveActiveModule);
      return <SettingsModule menuStructure={menuStructure} onMenuUpdate={setMenuStructure} activeSettingsTab={activeSettingsTab} />;
    }

    switch (effectiveActiveModule) {
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
        return <CalendarModule clientMode={clientMode} />;
      case 'aio-agents':
        return <AIOAgentsModule />;
      case 'orders':
        return <OrdersModule />;
      case 'design':
        return <DesignModule />;
      case 'media':
        return <MediaModule />;
      case 'integrations':
        return <IntegrationsManager initialCategory={integrationCategory} />;
      case 'flows':
        return <FlowsModule flowId={flowId} action={flowAction} intent={flowIntent} onFlowContextChange={handleFlowContextChange} onExit={() => setActiveModule('aio-brain')} />;
      case 'chat':
        return <CommsModule initialChannel="all" initialThreadId={commsThreadId} onNavigate={setActiveModule} clientMode={clientMode} />;
      case 'marketplace':
        return <PlaceholderModule name="Marketplace" />;
      case 'sms-voip':
        return <SmsVoipModule />;
      case 'canned-responses':
        return <CannedResponsesModule onNavigate={setActiveModule} />;
      case 'settings':
        return <SettingsModule menuStructure={menuStructure} onMenuUpdate={setMenuStructure} />;
      case 'aio-help':
        return <HelpModule activeModule={activeModule} />;
      case 'system-health':
        return <SystemHealthModule />;
      default:
        return <PlaceholderModule name="Module" />;
    }
  };

  return (
    <ThemeProvider preferredTheme={preferredTenantTheme}>
      <BrandProvider initialConfig={activeTenantSettings?.branding || {}}>
        <OrchestrationProvider>
          <AuthContext.Provider value={{ session, user: session?.user, token: session?.token, tenant: session?.tenant, tenants: session?.tenants || [], role: userRole, isOperator: () => operatorMode, isClient: () => clientMode, logout: handleLogout, switchTenant: handleSwitchTenant, refreshSession }}>
          <DbContext.Provider value={{ db, setDb }}>
            <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans">
              <div className="flex min-h-0 flex-1 overflow-hidden">
                {/* Sidebar */}
                {!isFullscreen && (
                  <Sidebar
                    activeModule={effectiveActiveModule}
                    onSelectModule={(moduleId) => {
                      if (clientMode && !CLIENT_ALLOWED_MODULES.has(moduleId)) {
                        setActiveModule(DEFAULT_CLIENT_MODULE);
                        return;
                      }
                      setActiveModule(moduleId);
                      if (moduleId === 'flows') {
                        handleFlowContextChange({ flowId: null, action: null, intent: null });
                      }
                      if (moduleId !== 'crm') {
                        setCrmContactId(null);
                      }
                    }}
                    onLogout={handleLogout}
                    isMobileOpen={isMobileOpen}
                    setIsMobileOpen={setIsMobileOpen}
                    menuStructure={renderedMenuStructure}
                    iconMap={ICON_MAP}
                    showHelp={!clientMode}
                  />
                )}

                {/* Main Content */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {!isFullscreen && (
                    <TopBar
                      onLogout={handleLogout}
                      onNavigate={setCurrentPage}
                      onOpenSystemHealth={() => setActiveModule('system-health')}
                      title={currentModuleMeta.label}
                      subtitle={currentModuleMeta.subtitle}
                      titleIcon={currentModuleMeta.icon ? ICON_MAP[currentModuleMeta.icon] : null}
                      searchPlaceholder={currentModuleMeta.searchPlaceholder}
                      showSearch={!clientMode && currentModuleMeta.type !== 'iframe' && effectiveActiveModule !== 'system-health'}
                      onToggleMobileMenu={() => setIsMobileOpen(true)}
                    />
                  )}

                  {/* Module Content */}
                  <div
                    className={`flex-1 min-h-0 overflow-hidden bg-[var(--color-bg-primary)] ${
                      effectiveActiveModule === 'flows'
                        ? 'p-0'
                        : effectiveActiveModule === 'aio-agents'
                        ? 'p-4'
                        : 'p-6'
                    }`}
                  >
                    <Suspense key={effectiveActiveModule} fallback={
                      <div className="h-full flex items-center justify-center">
                        <LoadingSpinner size="lg" message="Loading module..." />
                      </div>
                    }>
                      {renderModule()}
                    </Suspense>
                  </div>
                </div>
                <OperatorAssistDock
                  activeModule={effectiveActiveModule}
                  activeModuleLabel={currentModuleMeta.label}
                />
              </div>
            </div>
        </DbContext.Provider>
        </AuthContext.Provider>
      </OrchestrationProvider>
      </BrandProvider>
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







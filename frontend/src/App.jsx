import React, { useState, useEffect, lazy, Suspense } from 'react';
import { mockSupabase } from './services/mockSupabase';
import { ThemeProvider } from './lib/ThemeContext';
import AuthContext from './contexts/AuthContext';
import DbContext from './contexts/DbContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LoadingSpinner from './components/LoadingSpinner';
import AuthScreen from './components/AuthScreen';

// Lazy load modules for code splitting
const DashboardModule = lazy(() => import('./modules/Dashboard'));
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

// Lazy load policy pages
const TermsPage = lazy(() => import('./pages/Terms'));
const PrivacyPage = lazy(() => import('./pages/Privacy'));
const AcceptableUsePage = lazy(() => import('./pages/AcceptableUse'));
const PublicForm = lazy(() => import('./pages/PublicForm'));

import { INITIAL_MENU_STRUCTURE, ICON_LIBRARY } from './data/initialDb';
import {
  LayoutDashboard, Users, Bot, Workflow, Radio, Calendar as CalendarIcon,
  MessageSquare, PenTool, GitMerge, FileText, ShoppingCart, Globe,
  Phone, Settings, Search, Menu, Video, Crosshair, EyeOff, Activity, Zap, Rocket
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
};

// ============ MAIN APP COMPONENT ============
const App = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [db, setDb] = useState(null);
  const [currentPage, setCurrentPage] = useState('app'); // 'app', 'terms', 'privacy', 'acceptable-use', 'form'
  const [formSlug, setFormSlug] = useState(null);
  const [lastNonFullscreen, setLastNonFullscreen] = useState('dashboard');
  const [flowId, setFlowId] = useState(null);

  const fullscreenModules = ['flows'];
  const isFullscreen = fullscreenModules.includes(activeModule);

  useEffect(() => {
    if (!isFullscreen) {
      setLastNonFullscreen(activeModule);
    }
  }, [activeModule, isFullscreen]);

  useEffect(() => {
    // Check if URL is a public form link
    const path = window.location.pathname;
    if (path.startsWith('/form/')) {
      const slug = path.replace('/form/', '');
      setFormSlug(slug);
      setCurrentPage('form');
    }

    // Simulate checking for existing session
    setTimeout(() => {
      setLoading(false);
    }, 500);
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
    };
    window.addEventListener('aio:navigate', handleNavigate);
    return () => window.removeEventListener('aio:navigate', handleNavigate);
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
    const settingsTabs = ['set-personal', 'set-billing', 'set-security', 'set-whitelabel', 'set-vars'];
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
      case 'flows':
        return <FlowsModule flowId={flowId} onExit={() => setActiveModule(lastNonFullscreen || 'dashboard')} />;
      case 'chat':
        return <PlaceholderModule name="Chat" />;
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
            {!isFullscreen && (
              <Sidebar
                activeModule={activeModule}
                onSelectModule={setActiveModule}
                onLogout={handleLogout}
                isMobileOpen={isMobileOpen}
                setIsMobileOpen={setIsMobileOpen}
                menuStructure={MENU_STRUCTURE}
                iconMap={ICON_MAP}
              />
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Top Bar with User Icons */}
              {!isFullscreen && <TopBar onLogout={handleLogout} onNavigate={setCurrentPage} />}

              {/* Module Header */}
              {!isFullscreen && (
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
              )}

              {/* Module Content */}
              <div className={`flex-1 bg-[var(--color-bg-primary)] ${isFullscreen ? 'overflow-hidden p-0' : 'overflow-auto p-6'}`}>
                <Suspense fallback={
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


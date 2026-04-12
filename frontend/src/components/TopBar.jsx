import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { useTheme } from '../lib/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useBrand, DEFAULT_BRAND_CONFIG } from '../contexts/BrandContext';
import { Sun, Moon, Phone, Bell, Users, User, FileText, Lock, Rocket, Search, Menu, ChevronDown, AlertOctagon, AlertTriangle, CheckCircle2, PhoneCall, PhoneOff, X, AlertCircle } from 'lucide-react';
import { normalizeDisplayText } from '../utils/text';
import { getNotificationsApi, markNotificationReadApi, markAllNotificationsReadApi, updateCanonicalTenantSettingsApi, getSystemHealthApi, getPhoneNumbersApi, getContactsWithPhoneApi, startOutboundCallApi, endCallSessionApi, getCommsRoutesApi } from '../services/backendApi';

import { playDigitTone, playDialTone, playBusySignal, playRinger, stopAudio } from '../services/audioService';

const playTone = (type, digitOrStyle = '1', style = 'military') => {
  if (type === 'button') {
    playDigitTone(digitOrStyle, style);
  } else if (type === 'dial') {
    playDialTone();
  } else if (type === 'ring') {
    playRinger();
  } else if (type === 'busy') {
    playBusySignal();
  } else if (type === 'stop') {
    stopAudio();
  }
};

const DialerModal = ({ onClose, toneStyle = 'military', onToneStyleChange, fromNumber, onFromNumberChange, extensionId, onExtensionIdChange }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callState, setCallState] = useState('idle');
  const [outgoingRoutes, setOutgoingRoutes] = useState({ phoneNumbers: [], extensions: [] });
  const [contacts, setContacts] = useState([]);
  const [activeCall, setActiveCall] = useState(null);
  
  const toneStyles = [
    { value: 'military', label: 'Military' },
    { value: 'morse', label: 'Morse' },
    { value: 'click', label: 'Click' },
    { value: 'retro', label: 'Retro' },
    { value: 'soft', label: 'Soft' },
  ];
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      const [numbersData, contactsData, routesData] = await Promise.all([
        getPhoneNumbersApi(),
        getContactsWithPhoneApi(),
        getCommsRoutesApi()
      ]);
      setContacts(contactsData);
      setOutgoingRoutes(routesData || { phoneNumbers: [], extensions: [] });
      
      const enabled = (numbersData || []).filter(n => n.callsEnabled);
      if (enabled.length && !fromNumber) onFromNumberChange(enabled[0].number);
    } catch (e) { console.error('Load error:', e); }
  };
  
  const handleDigit = (d) => {
    playTone('button', d, toneStyle);
    setPhoneNumber(phoneNumber + d);
  };
  
  const handleBackspace = () => {
    playTone('button', '1', toneStyle);
    setPhoneNumber(phoneNumber.slice(0, -1));
  };
  
  const handleClear = () => {
    playTone('button', '1', toneStyle);
    setPhoneNumber('');
  };
  
  const handleDial = async () => {
    if (!phoneNumber || callState !== 'idle') return;
    playTone('dial');
    setCallState('simulated_ringing');
    try {
      const result = await startOutboundCallApi({ phoneNumber, fromNumber, extensionId });
      setActiveCall(result);
      setTimeout(() => { playTone('ring'); setCallState('simulated_connected'); }, 2000);
    } catch (e) {
      playTone('busy');
      setCallState('failed_stub');
    }
  };
  
  const handleEnd = async () => {
    if (activeCall) {
      try {
        await endCallSessionApi(activeCall.id, { disposition: callState === 'simulated_connected' ? 'completed' : 'no_answer', durationSeconds: 30 });
      } catch (e) {}
    }
    playTone('stop');
    playTone('button', '1', 'retro');
    setCallState('ended');
    setTimeout(() => { setCallState('idle'); setActiveCall(null); }, 1000);
  };
  
  const dialPad = ['1','2','3','4','5','6','7','8','9','*','0','#'];
  
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">Dialer</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-hover)]"><X size={12} /></button>
      </div>
      
      <div className="flex items-center gap-1">
        <input
          value={phoneNumber}
          readOnly
          className="flex-1 px-2 py-1.5 text-center text-sm font-mono rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
          placeholder="Number"
        />
        {phoneNumber.length > 0 && (
          <button onClick={handleBackspace} className="p-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-hover)]">
            <span className="text-xs">⌫</span>
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-3 gap-1">
        {dialPad.map(d => (
          <button key={d} onClick={() => handleDigit(d)} disabled={callState !== 'idle'}
            className="py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] text-xs font-mono hover:bg-[var(--color-hover)] disabled:opacity-50">
            {d}
          </button>
        ))}
      </div>
      
      <div className="flex items-center gap-1">
        {callState === 'idle' ? (
          <button onClick={handleDial} disabled={!phoneNumber}
            className={`flex-1 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1 ${phoneNumber ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]'}`}>
            <PhoneCall size={12} /> Call
          </button>
        ) : (
          <button onClick={handleEnd}
            className="flex-1 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1 bg-red-500/20 text-red-300 border border-red-500/30">
            <PhoneOff size={12} /> End
          </button>
        )}
        
        <select 
          value={toneStyle} 
          onChange={(e) => onToneStyleChange(e.target.value)}
          className="px-1 py-1 text-[10px] rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] outline-none"
        >
          {toneStyles.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-1.5 pt-1">
        <div className="space-y-1">
          <label className="text-[8px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold ml-1">From Line</label>
          <select 
            value={fromNumber} 
            onChange={(e) => onFromNumberChange(e.target.value)}
            className="w-full px-1 py-1 text-[10px] rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] outline-none"
          >
            <option value="">No Line</option>
            {(outgoingRoutes.phoneNumbers || []).map(n => (
              <option key={n.id} value={n.number}>{n.number}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[8px] uppercase tracking-widest text-[var(--color-text-tertiary)] font-bold ml-1">Extension</label>
          <select 
            value={extensionId} 
            onChange={(e) => onExtensionIdChange(e.target.value)}
            className="w-full px-1 py-1 text-[10px] rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] outline-none"
          >
            <option value="">Direct</option>
            {(outgoingRoutes.extensions || []).map(ext => (
              <option key={ext.id} value={ext.id}>{ext.extensionNumber}</option>
            ))}
          </select>
        </div>
      </div>
      
      {callState !== 'idle' && (
        <div className="text-[10px] text-center text-amber-300">
          {callState === 'simulated_ringing' ? 'Ringing...' : callState === 'simulated_connected' ? 'Connected' : 'Failed'}
        </div>
      )}
    </div>
  );
};

const HEALTH_META = {
    healthy: {
        label: 'Healthy',
        icon: CheckCircle2,
        buttonClass: 'border-emerald-500/25 bg-emerald-500/10 text-[var(--color-text-primary)] hover:bg-emerald-500/14 shadow-[var(--shadow-base)]',
    },
    warning: {
        label: 'Warning',
        icon: AlertTriangle,
        buttonClass: 'border-amber-500/25 bg-amber-500/10 text-[var(--color-text-primary)] hover:bg-amber-500/14 shadow-[var(--shadow-base)]',
    },
    critical: {
        label: 'Critical',
        icon: AlertOctagon,
        buttonClass: 'border-rose-500/25 bg-rose-500/10 text-[var(--color-text-primary)] hover:bg-rose-500/14 shadow-[var(--shadow-base)]',
    },
    unknown: {
        label: 'Unknown',
        icon: AlertCircle,
        buttonClass: 'border-slate-500/25 bg-slate-500/10 text-[var(--color-text-tertiary)] hover:bg-slate-500/14 shadow-[var(--shadow-base)]',
    },
};

// Helper: get fixed portal position aligned to a button ref (right-aligned, below)
const getPortalPos = (ref) => {
    if (!ref?.current) return { top: 60, right: 16 };
    const rect = ref.current.getBoundingClientRect();
    return {
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
    };
};

const TopBar = ({ onLogout, onNavigate, onOpenSystemHealth, title, subtitle = '', titleIcon: TitleIcon, searchPlaceholder = 'Search...', showSearch = true, onToggleMobileMenu, onToggleDialer, buttonToneStyle, onButtonToneStyleChange, fromNumber, onFromNumberChange, extensionId, onExtensionIdChange }) => {
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showTenantDropdown, setShowTenantDropdown] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showDialer, setShowDialer] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [themeSaving, setThemeSaving] = useState(false);
    const [health, setHealth] = useState(null);
    const { theme, setTheme } = useTheme();
    const { user, tenant, tenants = [], switchTenant, refreshSession, isClient } = useAuth();
    const { brandConfig } = useBrand();
    const fallbackBrandName = brandConfig?.brandName || DEFAULT_BRAND_CONFIG.brandName;
    const clientMode = isClient?.() ?? false;

    // Refs for portal anchor positioning
    const dialerBtnRef = useRef(null);
    const notifBtnRef = useRef(null);
    const tenantBtnRef = useRef(null);
    const profileBtnRef = useRef(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const result = await getNotificationsApi(50, false);
            setNotifications(result.data);
            setUnreadCount(result.unread_count);
        } catch (error) {
            console.warn('Failed to fetch notifications:', error);
        }
    }, []);

    useEffect(() => {
        if (showNotifications) {
            fetchNotifications();
        }
    }, [showNotifications, fetchNotifications]);

    useEffect(() => {
        const handleNotification = () => {
            fetchNotifications();
        };
        window.addEventListener('aio:notification', handleNotification);
        return () => window.removeEventListener('aio:notification', handleNotification);
    }, [fetchNotifications]);

    useEffect(() => {
        if (clientMode) {
            setHealth(null);
            return undefined;
        }

        let cancelled = false;
        const fetchHealth = async () => {
            try {
                const next = await getSystemHealthApi();
                if (!cancelled) {
                    setHealth(next || null);
                }
            } catch {
                if (!cancelled) {
                    setHealth(null);
                }
            }
        };

        fetchHealth();
        const intervalId = window.setInterval(fetchHealth, 60000);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [clientMode, tenant?.id]);

    const handleMarkAllRead = async () => {
        try {
            await markAllNotificationsReadApi();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.warn('Failed to mark all notifications as read:', error);
        }
    };

    const handleNotificationClick = async (notification) => {
        if (!notification.read) {
            try {
                await markNotificationReadApi(notification.id);
                setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (error) {
                console.warn('Failed to mark notification as read:', error);
            }
        }
        if (notification.link) {
            onNavigate(notification.link);
        }
        setShowNotifications(false);
    };

    const currentUser = useMemo(() => ({
        email: user?.email || 'local@aiocrm',
        name: user?.name || 'Operator',
        role: user?.role || 'Owner'
    }), [user]);

    const healthStatus = health?.status ? String(health.status).toLowerCase() : 'unknown';
    const healthMeta = HEALTH_META[healthStatus] || HEALTH_META.unknown;
    const HealthIcon = healthMeta.icon;
    const healthAlertCount = Array.isArray(health?.alerts)
        ? health.alerts.filter((alert) => ['warning', 'critical'].includes(String(alert?.severity || '').toLowerCase())).length
        : 0;

    const tenantOptions = tenants.length > 0
        ? tenants
        : tenant
            ? [{ ...tenant, selected: true }]
            : [];
    // Portal panel class - used with createPortal at document.body level to escape backdrop-filter stacking context
    const panelCls = 'overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)]';

    const handleThemeToggle = async () => {
        if (!tenant?.id || themeSaving) {
            return;
        }
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        try {
            setThemeSaving(true);
            await updateCanonicalTenantSettingsApi({
                branding: {
                    ...(tenant?.tenant_settings?.branding || {}),
                    theme: nextTheme,
                },
            });
            setTheme(nextTheme);
            await refreshSession?.();
        } catch (error) {
            console.warn('Failed to persist theme:', error);
        } finally {
            setThemeSaving(false);
        }
    };

    return (
        <div className="chrome-surface" style={{ position: "relative", zIndex: 40 }}>
            <div className="flex items-center gap-3 min-w-0">
                <button
                    onClick={onToggleMobileMenu}
                    className="lg:hidden p-2 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] text-[var(--color-text-secondary)]"
                    aria-label="Open navigation menu"
                >
                    <Menu size={18} />
                </button>
                {TitleIcon && (
                    <div className="w-10 h-10 rounded-[var(--radius-card)] bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
                        <TitleIcon size={20} className="text-[var(--color-primary)]" />
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="text-lg font-bold text-[var(--color-text-primary)] truncate">
                        {normalizeDisplayText(title)}
                    </h1>
                    {subtitle ? (
                        <div className="mt-0.5 text-xs text-[var(--color-text-secondary)] truncate">
                            {subtitle}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 ml-auto">
                {showSearch && (
                    <div className="surface-tertiary hidden xl:flex items-center gap-2 min-w-[200px] max-w-[200px] px-3 py-2 rounded-[var(--radius-pill)]">
                        <Search size={16} className="text-[var(--color-text-tertiary)]" />
                        <input
                            type="search"
                            name="global-search"
                            placeholder={searchPlaceholder}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck="false"
                            inputMode="search"
                            className="w-full bg-transparent outline-none text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]"
                            form="nope"
                        />
                    </div>
                )}

                {!clientMode && onOpenSystemHealth ? (
                    <button
                        type="button"
                        onClick={onOpenSystemHealth}
                        className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${healthMeta.buttonClass}`}
                        title="Open system health"
                        aria-label="Open system health"
                    >
                        <HealthIcon size={14} />
                        <span className="hidden xl:inline">{healthMeta.label}</span>
                        {healthAlertCount > 0 ? (
                            <span className="rounded-full border border-current/10 bg-[var(--color-bg-primary)]/60 px-1.5 py-0.5 text-[10px] font-black">
                                {healthAlertCount}
                            </span>
                        ) : null}
                    </button>
                ) : null}

                {!clientMode ? (
                    <button
                        onClick={handleThemeToggle}
                        disabled={themeSaving}
                        className="p-2 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] transition text-yellow-500 hover:text-yellow-600"
                        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                ) : null}

                <div className="relative">
                    <button
                        ref={dialerBtnRef}
                        className="p-2 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] transition text-green-500 hover:text-green-600"
                        title="VoIP Phone"
                        aria-label="Open VoIP phone"
                        onClick={() => { setShowDialer(!showDialer); if (onToggleDialer) onToggleDialer(!showDialer); }}
                    >
                        <Phone size={18} />
                    </button>

                    {showDialer && createPortal(
                        <>
                            <div className="fixed inset-0 z-[100000]" onClick={() => { setShowDialer(false); if (onToggleDialer) onToggleDialer(false); }} />
                            <div
                                className="fixed w-72 z-[100001]"
                                style={{ top: getPortalPos(dialerBtnRef).top, right: getPortalPos(dialerBtnRef).right, pointerEvents: 'auto' }}
                                onMouseDown={(e) => {
                                    const modal = e.currentTarget;
                                    const rect = modal.getBoundingClientRect();
                                    const offsetX = e.clientX - rect.left;
                                    const offsetY = e.clientY - rect.top;
                                    const onMouseMove = (moveEvent) => {
                                        modal.style.left = `${moveEvent.clientX - offsetX}px`;
                                        modal.style.top = `${moveEvent.clientY - offsetY}px`;
                                        modal.style.right = 'auto';
                                    };
                                    const onMouseUp = () => {
                                        document.removeEventListener('mousemove', onMouseMove);
                                        document.removeEventListener('mouseup', onMouseUp);
                                    };
                                    document.addEventListener('mousemove', onMouseMove);
                                    document.addEventListener('mouseup', onMouseUp);
                                }}
                            >
                                <div className={panelCls}>
                                    <DialerModal 
                                      onClose={() => { setShowDialer(false); if (onToggleDialer) onToggleDialer(false); }} 
                                      toneStyle={buttonToneStyle} 
                                      onToneStyleChange={onButtonToneStyleChange} 
                                      fromNumber={fromNumber}
                                      onFromNumberChange={onFromNumberChange}
                                      extensionId={extensionId}
                                      onExtensionIdChange={onExtensionIdChange}
                                    />
                                </div>
                            </div>
                        </>
                    , document.body)}
                </div>

                <div className="relative">
                    <button
                        ref={notifBtnRef}
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="p-2 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] transition text-yellow-500 hover:text-yellow-600 relative"
                        title="Notifications"
                        aria-label="Open notifications"
                        aria-expanded={showNotifications}
                        aria-haspopup="true"
                    >
                        <Bell size={18} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1" aria-label={`${unreadCount} unread notifications`}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {showNotifications && createPortal(
                        <>
                            <div className="fixed inset-0 z-[100000]" onClick={() => setShowNotifications(false)} />
                            <div className={`${panelCls} fixed w-80 z-[100001]`} style={{ top: getPortalPos(notifBtnRef).top, right: getPortalPos(notifBtnRef).right, pointerEvents: 'auto' }}>
                                <div className="p-3 border-b border-[var(--color-border)] flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Notifications</h3>
                                    {unreadCount > 0 && (
                                        <button 
                                            onClick={handleMarkAllRead}
                                            className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-96 overflow-y-auto">
                                    {notifications.length > 0 ? (
                                        notifications.map(notif => (
                                            <div 
                                                key={notif.id} 
                                                onClick={() => handleNotificationClick(notif)}
                                                className={`p-3 border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition cursor-pointer ${!notif.read ? 'bg-[var(--color-primary)]/5' : ''}`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    {!notif.read && <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] mt-1.5 shrink-0" />}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-[var(--color-text-primary)]">{notif.title}</p>
                                                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{notif.message}</p>
                                                        <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">{new Date(notif.created_at).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-6 text-center text-[var(--color-text-secondary)] text-sm">No notifications</div>
                                    )}
                                </div>
                            </div>
                        </>
                    , document.body)}
                </div>

                <div className="relative">
                        <button
                            ref={tenantBtnRef}
                            onClick={() => setShowTenantDropdown(!showTenantDropdown)}
                            className="surface-tertiary flex items-center gap-3 px-3 py-2 rounded-[var(--radius-card)] text-blue-500 hover:text-blue-400 min-w-0 transition"
                        title="Switch Workspace"
                        aria-label="Switch workspace"
                        aria-expanded={showTenantDropdown}
                        aria-haspopup="true"
                    >
                        <div className="w-8 h-8 rounded-[var(--radius-card)] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                            <Users size={16} className="text-blue-400" />
                        </div>
                        <div className="hidden lg:block text-left min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                                Workspace
                            </div>
                            <div className="text-sm font-semibold text-[var(--color-text-primary)] truncate max-w-[180px]">
                                {tenant?.name || fallbackBrandName}
                            </div>
                        </div>
                        <ChevronDown size={14} className="hidden lg:block text-[var(--color-text-secondary)] flex-shrink-0" />
                    </button>

                    {showTenantDropdown && createPortal(
                        <>
                            <div className="fixed inset-0 z-[100000]" onClick={() => setShowTenantDropdown(false)} />
                            <div className={`${panelCls} fixed w-72 z-[100001]`} style={{ top: getPortalPos(tenantBtnRef).top, right: getPortalPos(tenantBtnRef).right, pointerEvents: 'auto' }}>
                                <div className="p-4 border-b border-[var(--color-border)]">
                                    <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Switch Workspace</h3>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{tenant ? `Current: ${tenant.name}` : 'Select an available workspace'}</p>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {tenantOptions.map(workspace => (
                                        <button
                                            key={workspace.id}
                                            onClick={async () => {
                                                if (workspace.id !== tenant?.id && switchTenant) {
                                                    await switchTenant(workspace.id);
                                                }
                                                setShowTenantDropdown(false);
                                            }}
                                            className={`w-full text-left p-4 border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition ${workspace.selected ? 'bg-[var(--color-primary)]/10 border-l-2 border-l-[var(--color-primary)]' : ''}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{workspace.name}</p>
                                                    <p className="text-xs text-[var(--color-text-secondary)]">{workspace.role}</p>
                                                </div>
                                                {workspace.selected && <span className="text-[var(--color-primary)]">{'\u2713'}</span>}
                                            </div>
                                        </button>
                                    ))}
                                    {tenantOptions.length === 0 && (
                                        <div className="p-4 text-center text-[var(--color-text-secondary)] text-sm">No additional workspaces available yet.</div>
                                    )}
                                </div>
                            </div>
                        </>
                    , document.body)}
                </div>

                <div className="relative">
                        <button
                            ref={profileBtnRef}
                            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                            className="surface-tertiary p-2 rounded-[var(--radius-card)] transition"
                        title="User Menu"
                        aria-label="User menu"
                        aria-expanded={showProfileDropdown}
                        aria-haspopup="true"
                    >
                        {user?.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.name || 'User'} className="w-8 h-8 rounded-[var(--radius-card)] object-cover" />
                        ) : (
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-[var(--radius-card)] flex items-center justify-center text-white">
                                <User size={18} />
                            </div>
                        )}
                    </button>

                    {showProfileDropdown && createPortal(
                        <>
                            <div className="fixed inset-0 z-[100000]" onClick={() => setShowProfileDropdown(false)} />
                            <div className={`${panelCls} fixed w-72 z-[100001]`} style={{ top: getPortalPos(profileBtnRef).top, right: getPortalPos(profileBtnRef).right, pointerEvents: 'auto' }}>
                                <div className="p-4 border-b border-[var(--color-border)]">
                                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{currentUser?.email || 'System Admin'}</p>
                                </div>

                                <div className="divide-y divide-[var(--color-border)]">
                                    <button
                                        onClick={() => {
                                            setShowProfileDropdown(false);
                                        }}
                                        className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] transition flex items-center gap-3"
                                    >
                                        <User size={16} /> My Account
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowProfileDropdown(false);
                                            onNavigate('terms');
                                        }}
                                        className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] transition flex items-center gap-3"
                                    >
                                        <FileText size={16} /> Terms of Service
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowProfileDropdown(false);
                                            onNavigate('privacy');
                                        }}
                                        className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] transition flex items-center gap-3"
                                    >
                                        <Lock size={16} /> Privacy Policy
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowProfileDropdown(false);
                                            onNavigate('acceptable-use');
                                        }}
                                        className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] transition flex items-center gap-3"
                                    >
                                        <Rocket size={16} /> Acceptable Use Policy
                                    </button>
                                </div>

                                <div className="p-3 border-t border-[var(--color-border)]">
                                    <button
                                        onClick={() => {
                                            setShowProfileDropdown(false);
                                            onLogout();
                                        }}
                                        className="w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium rounded-[var(--radius-card)] transition border border-red-600/30 shadow-island-sm"
                                    >
                                        Logout
                                    </button>
                                </div>
                            </div>
                        </>
                    , document.body)}
                </div>
            </div>
        </div>
    );
};

TopBar.propTypes = {
    onLogout: PropTypes.func.isRequired,
    onNavigate: PropTypes.func.isRequired,
    onOpenSystemHealth: PropTypes.func,
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    titleIcon: PropTypes.elementType,
    searchPlaceholder: PropTypes.string,
    showSearch: PropTypes.bool,
    onToggleMobileMenu: PropTypes.func,
    onToggleDialer: PropTypes.func,
};

export default TopBar;

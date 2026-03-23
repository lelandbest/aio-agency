import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTheme } from '../lib/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Sun, Moon, Phone, Bell, Users, User, FileText, Lock, Rocket, Search, Menu, ChevronDown } from 'lucide-react';
import { normalizeDisplayText } from '../utils/text';

const TopBar = ({ onLogout, onNavigate, title, subtitle = '', titleIcon: TitleIcon, searchPlaceholder = 'Search...', showSearch = true, onToggleMobileMenu }) => {
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showTenantDropdown, setShowTenantDropdown] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const { theme, setTheme } = useTheme();
    const { user, tenant, tenants = [], switchTenant } = useAuth();
    const [notifications] = useState([
        { id: 1, message: 'New message from John', time: '5m ago', type: 'chat' },
        { id: 2, message: 'System update available', time: '1h ago', type: 'system' },
        { id: 3, message: 'Your report is ready', time: '2h ago', type: 'system' }
    ]);

    const currentUser = useMemo(() => ({
        email: user?.email || 'local@aiocrm',
        name: user?.name || 'Operator',
        role: user?.role || 'Owner'
    }), [user]);

    const tenantOptions = tenants.length > 0
        ? tenants
        : tenant
            ? [{ ...tenant, selected: true }]
            : [];

    return (
        <div className="min-h-20 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center justify-between gap-6 px-6">
            <div className="flex items-center gap-3 min-w-0">
                <button
                    onClick={onToggleMobileMenu}
                    className="lg:hidden p-2 hover:bg-[var(--color-hover)] rounded-lg text-[var(--color-text-secondary)]"
                    aria-label="Open navigation menu"
                >
                    <Menu size={18} />
                </button>
                {TitleIcon && (
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
                        <TitleIcon size={20} className="text-sky-400" />
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

            <div className="flex items-center gap-4 ml-auto">
                {showSearch && (
                    <div className="hidden xl:flex items-center gap-2 min-w-[320px] px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                        <Search size={16} className="text-[var(--color-text-secondary)]" />
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            className="w-full bg-transparent outline-none text-sm text-[var(--color-text-secondary)] placeholder-[var(--color-text-tertiary)]"
                        />
                    </div>
                )}

                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition text-yellow-500 hover:text-yellow-600"
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                <button
                    className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition text-green-500 hover:text-green-600"
                    title="VoIP Phone"
                    aria-label="Open VoIP phone"
                >
                    <Phone size={18} />
                </button>

                <div className="relative">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition text-yellow-500 hover:text-yellow-600 relative"
                        title="Notifications"
                        aria-label="Open notifications"
                        aria-expanded={showNotifications}
                        aria-haspopup="true"
                    >
                        <Bell size={18} />
                        {notifications.length > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" aria-label={`${notifications.length} unread notifications`}></span>
                        )}
                    </button>

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

                <div className="relative">
                    <button
                        onClick={() => setShowTenantDropdown(!showTenantDropdown)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-hover)] rounded-xl transition border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-blue-500 hover:text-blue-400 min-w-0"
                        title="Switch Workspace"
                        aria-label="Switch workspace"
                        aria-expanded={showTenantDropdown}
                        aria-haspopup="true"
                    >
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                            <Users size={16} className="text-blue-400" />
                        </div>
                        <div className="hidden lg:block text-left min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                                Workspace
                            </div>
                            <div className="text-sm font-semibold text-[var(--color-text-primary)] truncate max-w-[180px]">
                                {tenant?.name || 'AIO CRM'}
                            </div>
                        </div>
                        <ChevronDown size={14} className="hidden lg:block text-[var(--color-text-secondary)] flex-shrink-0" />
                    </button>

                    {showTenantDropdown && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowTenantDropdown(false)} />
                            <div className="absolute right-0 top-12 w-72 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-xl z-50">
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
                                            className={`w-full text-left p-4 border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition ${workspace.selected ? 'bg-purple-600/20 border-l-2 border-l-purple-600' : ''}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{workspace.name}</p>
                                                    <p className="text-xs text-[var(--color-text-secondary)]">{workspace.role}</p>
                                                </div>
                                                {workspace.selected && <span className="text-purple-400">{'\u2713'}</span>}
                                            </div>
                                        </button>
                                    ))}
                                    {tenantOptions.length === 0 && (
                                        <div className="p-4 text-center text-[var(--color-text-secondary)] text-sm">No additional workspaces available yet.</div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                        className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition"
                        title="User Menu"
                        aria-label="User menu"
                        aria-expanded={showProfileDropdown}
                        aria-haspopup="true"
                    >
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center text-white">
                            <User size={18} />
                        </div>
                    </button>

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
                                        }}
                                        className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition flex items-center gap-3"
                                    >
                                        <User size={16} /> My Account
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowProfileDropdown(false);
                                            onNavigate('terms');
                                        }}
                                        className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition flex items-center gap-3"
                                    >
                                        <FileText size={16} /> Terms of Service
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowProfileDropdown(false);
                                            onNavigate('privacy');
                                        }}
                                        className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition flex items-center gap-3"
                                    >
                                        <Lock size={16} /> Privacy Policy
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowProfileDropdown(false);
                                            onNavigate('acceptable-use');
                                        }}
                                        className="w-full text-left px-4 py-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition flex items-center gap-3"
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
        </div>
    );
};

TopBar.propTypes = {
    onLogout: PropTypes.func.isRequired,
    onNavigate: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    titleIcon: PropTypes.elementType,
    searchPlaceholder: PropTypes.string,
    showSearch: PropTypes.bool,
    onToggleMobileMenu: PropTypes.func,
};

export default TopBar;

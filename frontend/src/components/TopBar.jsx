import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useTheme } from '../lib/ThemeContext';
import { Sun, Moon, Phone, Bell, Users, User, FileText, Lock, Rocket, LogOut } from 'lucide-react';

/**
 * TopBar Component
 * Top navigation bar with theme toggle, notifications, tenant switcher, and user menu
 */
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
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Phone Icon - VoIP */}
            <button
                className="p-2 hover:bg-[var(--color-hover)] rounded-lg transition text-green-500 hover:text-green-600"
                title="VoIP Phone"
                aria-label="Open VoIP phone"
            >
                <Phone size={18} />
            </button>

            {/* Bell Icon - Notifications */}
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
                    aria-label="Switch account"
                    aria-expanded={showTenantDropdown}
                    aria-haspopup="true"
                >
                    <Users size={18} />
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
                                        className={`w-full text-left p-4 border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition ${tenant.selected ? 'bg-purple-600/20 border-l-2 border-l-purple-600' : ''
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
                    aria-label="User menu"
                    aria-expanded={showProfileDropdown}
                    aria-haspopup="true"
                >
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center text-white">
                        <User size={18} />
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
    );
};

TopBar.propTypes = {
    onLogout: PropTypes.func.isRequired,
    onNavigate: PropTypes.func.isRequired,
};

export default TopBar;


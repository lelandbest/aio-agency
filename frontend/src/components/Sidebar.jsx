import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTheme } from '../lib/ThemeContext';
import {
    Menu, X, ChevronRight, ExternalLink, HelpCircle, PenTool
} from 'lucide-react';
import { normalizeDisplayText } from '../utils/text';
import { useBrand, DEFAULT_BRAND_CONFIG } from '../contexts/BrandContext';

/**
 * Sidebar Component
 * Collapsible navigation sidebar with menu structure
 */
const Sidebar = ({ activeModule, onSelectModule, onLogout, isMobileOpen, setIsMobileOpen, menuStructure, iconMap, showHelp = true }) => {
    const [expandedGroup, setExpandedGroup] = useState(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { brandConfig } = useBrand();
    const displayBrandName = brandConfig?.brandName || DEFAULT_BRAND_CONFIG.brandName;
    const displayLogoUrl = brandConfig?.logoUrl || DEFAULT_BRAND_CONFIG.logoUrl;
    
    const systemsLauncherIds = ['aio-bots', 'aio-flows', 'aio-livebots', 'aio-sniper', 'aio-market'];
    const sortByLabel = (items = []) => [...items].sort((a, b) =>
        normalizeDisplayText(a.label || '').localeCompare(normalizeDisplayText(b.label || ''))
    );

    useEffect(() => {
        if (Array.isArray(menuStructure) && menuStructure.length === 0) {
            console.warn('[Sidebar] menuStructure is empty. Navigation data is not available for sidebar rendering.');
        }
    }, [menuStructure]);

    return (
        <>
            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="overlay-scrim fixed inset-0 z-40 lg:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`
        fixed lg:static inset-y-0 left-0 border-r border-[var(--color-border)] shadow-[var(--shadow-elevated)] lg:shadow-none
        flex flex-col overflow-hidden z-50 transform transition-all lg:transform-none
        ${isCollapsed ? 'w-18' : 'w-52'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ backgroundColor: 'var(--color-sidebar-bg, var(--color-bg-secondary, #E3E7ED))', color: 'var(--color-sidebar-text, var(--color-text-primary, #0B1220))' }}>
                {/* Logo */}
                <div className="h-14 border-b border-[var(--color-border)] flex items-center justify-between px-3 flex-shrink-0">
                    <div className={`flex items-center gap-2.5 ${isCollapsed ? 'hidden' : ''}`}>
                        <img
                            src={displayLogoUrl}
                            alt={displayBrandName}
                            className="w-7 h-7 rounded-[var(--radius-card)]"
                            onError={(e) => { e.target.src = '/aio-button-192px.png'; }}
                        />
                        <span className="font-bold text-[var(--color-text-primary)] text-sm">{displayBrandName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="p-1.5 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition"
                            title={isCollapsed ? 'Expand menu' : 'Collapse menu'}
                            aria-label={isCollapsed ? 'Expand sidebar menu' : 'Collapse sidebar menu'}
                            aria-expanded={!isCollapsed}
                        >
                            <Menu size={16} />
                        </button>
                        <button
                            onClick={() => setIsMobileOpen(false)}
                            className="lg:hidden p-1.5 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)]"
                            aria-label="Close mobile menu"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Menu Items */}
                <nav className="flex-1 overflow-y-auto no-scrollbar px-1.5 py-2">
                    {menuStructure.map((category, idx) => {
                        const visibleItems = category.category === 'Systems'
                            ? []
                            : category.items.filter(item => item.visible !== false);
                        const orderedItems = category.category === 'Main'
                            ? visibleItems
                            : sortByLabel(visibleItems);

                        if (!visibleItems.length) {
                            return null;
                        }

                        return (
                        <div key={idx} className="mb-4">
                            {!isCollapsed && category.category !== 'Main' && (
                                <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider px-2.5 mb-2">
                                    {category.category}
                                </h3>
                            )}
                            <div className="space-y-1">
                                {orderedItems.map(item => {
                                    const isSystemsLauncher = item.id === 'aio-systems';
                                    const isItemActive = activeModule === item.id || (isSystemsLauncher && systemsLauncherIds.includes(activeModule));
                                    if (item.type === 'group') {
                                        return (
                                            <div key={item.id}>
                                                <button
                                                    onClick={() => setExpandedGroup(expandedGroup === item.id ? null : item.id)}
                                                    className={`w-full flex items-center justify-between rounded-[var(--radius-card)] transition font-bold ${isCollapsed
                                                        ? 'px-2 py-1.5 justify-center'
                                                        : 'px-2.5 py-1.5 text-sm'
                                                        } text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]`}
                                                    title={isCollapsed ? item.label : ''}
                                                >
                                                    <span className={`flex items-center ${isCollapsed ? '' : 'gap-2'}`}>
                                                        <span className="relative">
                                                            {iconMap[item.icon] && React.createElement(iconMap[item.icon], { size: 16, className: item.id === 'aio-agents' ? 'drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]' : '' })}
                                                            {item.id === 'aio-agents' && (
                                                                <span className="absolute -inset-1 rounded-full blur-sm bg-cyan-400/30" />
                                                            )}
                                                        </span>
                                                        {!isCollapsed && normalizeDisplayText(item.label)}
                                                    </span>
                                                    {!isCollapsed && (
                                                        <ChevronRight
                                                            size={14}
                                                            className={`transform transition-transform ${expandedGroup === item.id ? 'rotate-90' : ''}`}
                                                        />
                                                    )}
                                                </button>
                                                {!isCollapsed && expandedGroup === item.id && (
                                                    <div className="ml-3 mt-1 space-y-1 bg-[var(--color-bg-secondary)] rounded-[var(--radius-card)] p-1 shadow-island-sm">
                                                        {sortByLabel(item.children).map(child => {
                                                            // Handle iframe links - embed in app
                                                            if (child.type === 'iframe' && child.url) {
                                                                return (
                                                                    <button
                                                                        key={child.id}
                                                                        onClick={() => {
                                                                            onSelectModule(child.id);
                                                                            setIsMobileOpen(false);
                                                                        }}
                                                                        className={`w-full text-left px-2.5 py-1.5 text-xs rounded-[var(--radius-card)] transition ${activeModule === child.id
                                                                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-accent)] border-l-2 border-[var(--color-primary)]'
                                                                            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                                                                            }`}
                                                                    >
                                                                        {normalizeDisplayText(child.label)}
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
                                                                        className="w-full text-left px-2.5 py-1.5 text-xs rounded-[var(--radius-card)] transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] flex items-center justify-between group"
                                                                    >
                                                                        <span>{normalizeDisplayText(child.label)}</span>
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
                                                                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded-[var(--radius-card)] transition ${activeModule === child.id
                                                                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-accent)] border-l-2 border-[var(--color-primary)]'
                                                                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                                                                        }`}
                                                                >
                                                                    {normalizeDisplayText(child.label)}
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
                                                className={`w-full flex items-center rounded-[var(--radius-card)] transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] ${isCollapsed
                                                    ? 'px-2 py-1.5 justify-center'
                                                    : 'px-2.5 py-1.5 text-sm gap-2'
                                                    }`}
                                                title={isCollapsed ? item.label : ''}
                                            >
                                                {iconMap[item.icon] && React.createElement(iconMap[item.icon], { size: 16 })}
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
                                            className={`w-full flex items-center rounded-[var(--radius-card)] transition font-bold ${isCollapsed
                                                ? 'px-2 py-1.5 justify-center'
                                                : 'px-2.5 py-1.5 text-sm gap-2'
                                                } ${isItemActive
                                                    ? 'bg-[var(--color-primary)] text-white shadow-island-sm'
                                                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                                                }`}
                                            title={isCollapsed ? item.label : ''}
                                        >
                                            {iconMap[item.icon] && React.createElement(iconMap[item.icon], { size: 16 })}
                                            {!isCollapsed && normalizeDisplayText(item.label)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )})}
                </nav>

                {/* Help Docs Link */}
                {showHelp ? (
                    <div className={`border-t border-[var(--color-border)] flex-shrink-0 flex items-center justify-between ${isCollapsed ? 'p-2' : 'p-3'}`}>
                        {!isCollapsed && <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase">Resources</span>}
                        <div className="flex flex-col gap-1 w-full">
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('aio:open-ticket'))}
                                className={`p-1.5 text-[var(--color-text-secondary)] hover:text-emerald-400 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] transition flex items-center gap-2 ${isCollapsed ? 'w-full flex justify-center' : ''}`}
                                title="Submit Support Ticket"
                            >
                                <PenTool size={16} />
                                {!isCollapsed && <span className="text-xs">Submit Ticket</span>}
                            </button>
                            <button
                                onClick={() => onSelectModule('aio-help')}
                                className={`p-1.5 text-[var(--color-text-secondary)] hover:text-blue-400 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] transition flex items-center gap-2 ${isCollapsed ? 'w-full flex justify-center' : ''}`}
                                title="Help Documentation"
                            >
                                <HelpCircle size={16} />
                                {!isCollapsed && <span className="text-xs">Help Docs</span>}
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </>
    );
};

Sidebar.propTypes = {
    activeModule: PropTypes.string.isRequired,
    onSelectModule: PropTypes.func.isRequired,
    onLogout: PropTypes.func.isRequired,
    isMobileOpen: PropTypes.bool.isRequired,
    setIsMobileOpen: PropTypes.func.isRequired,
    menuStructure: PropTypes.arrayOf(PropTypes.shape({
        category: PropTypes.string.isRequired,
        items: PropTypes.arrayOf(PropTypes.object).isRequired,
    })).isRequired,
    iconMap: PropTypes.object.isRequired,
    showHelp: PropTypes.bool,
};

export default Sidebar;


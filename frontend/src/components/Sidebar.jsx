import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useTheme } from '../lib/ThemeContext';
import {
    Menu, X, ChevronRight, ExternalLink, HelpCircle
} from 'lucide-react';

/**
 * Sidebar Component
 * Collapsible navigation sidebar with menu structure
 */
const Sidebar = ({ activeModule, onSelectModule, onLogout, isMobileOpen, setIsMobileOpen, menuStructure, iconMap }) => {
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
        fixed lg:static inset-y-0 left-0 bg-[var(--color-sidebar-bg)] border-r border-[var(--color-border)] 
        flex flex-col overflow-hidden z-50 transform transition-all lg:transform-none
        ${isCollapsed ? 'w-20' : 'w-64'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ color: 'var(--color-sidebar-text)' }}>
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
                            aria-label={isCollapsed ? 'Expand sidebar menu' : 'Collapse sidebar menu'}
                            aria-expanded={!isCollapsed}
                        >
                            <Menu size={16} />
                        </button>
                        <button
                            onClick={() => setIsMobileOpen(false)}
                            className="lg:hidden p-2 hover:bg-[var(--color-hover)] rounded text-[var(--color-text-secondary)]"
                            aria-label="Close mobile menu"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Menu Items */}
                <nav className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">
                    {menuStructure.map((category, idx) => (
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
                                                    className={`w-full flex items-center justify-between rounded transition font-bold ${isCollapsed
                                                        ? 'px-2 py-2 justify-center'
                                                        : 'px-3 py-2 text-sm'
                                                        } text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]`}
                                                    title={isCollapsed ? item.label : ''}
                                                >
                                                    <span className={`flex items-center ${isCollapsed ? '' : 'gap-2'}`}>
                                                        {iconMap[item.icon] && React.createElement(iconMap[item.icon], { size: 16 })}
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
                                                                        className={`w-full text-left px-3 py-2 text-xs rounded transition ${activeModule === child.id
                                                                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-accent)] border-l-2 border-[var(--color-primary)]'
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
                                                                    className={`w-full text-left px-3 py-2 text-xs rounded transition ${activeModule === child.id
                                                                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-accent)] border-l-2 border-[var(--color-primary)]'
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
                                                className={`w-full flex items-center rounded transition text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] ${isCollapsed
                                                    ? 'px-2 py-2 justify-center'
                                                    : 'px-3 py-2 text-sm gap-2'
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
                                            className={`w-full flex items-center rounded transition font-bold ${isCollapsed
                                                ? 'px-2 py-2 justify-center'
                                                : 'px-3 py-2 text-sm gap-2'
                                                } ${activeModule === item.id
                                                    ? 'bg-[var(--color-primary)] text-white'
                                                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                                                }`}
                                            title={isCollapsed ? item.label : ''}
                                        >
                                            {iconMap[item.icon] && React.createElement(iconMap[item.icon], { size: 16 })}
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
};

export default Sidebar;


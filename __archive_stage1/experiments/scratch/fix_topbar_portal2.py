"""
Phase 2: Convert all four TopBar popups to use createPortal + ref-based positioning.
This escapes the backdrop-filter stacking context of .chrome-surface entirely.
"""

path = r'd:\AIOCRM\frontend\src\components\TopBar.jsx'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# Shared panel class - fixed position, strong smoke glass
PANEL_STYLE = "position: 'fixed', zIndex: 9999"
PANEL_CLS = "overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)]"

# ── 1. floatingPanelClass is now unused - remove it ─────────────────────────
src = src.replace(
    "    const floatingPanelClass = 'absolute right-0 top-full mt-1.5 z-[60] overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]';",
    "    // Portal panel class - used with createPortal at document.body level to escape backdrop-filter stacking context\n    const panelCls = 'overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)]';",
    1
)

# ── 2. Dialer button: add ref ────────────────────────────────────────────────
src = src.replace(
    '''                <div className="relative">
                    <button
                        className="p-2 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] transition text-green-500 hover:text-green-600"
                        title="VoIP Phone"
                        aria-label="Open VoIP phone"
                        onClick={() => { setShowDialer(!showDialer); if (onToggleDialer) onToggleDialer(!showDialer); }}
                    >
                        <Phone size={18} />
                    </button>

                    {showDialer && (
                        <>
                            <div className="fixed inset-0 z-[55]" onClick={() => { setShowDialer(false); if (onToggleDialer) onToggleDialer(false); }} />
                            <div
                                className="absolute right-0 top-full mt-1.5 z-[60] w-72"
                                style={{ cursor: 'move' }}''',
    '''                <div className="relative">
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
                            <div className="fixed inset-0 z-[9998]" onClick={() => { setShowDialer(false); if (onToggleDialer) onToggleDialer(false); }} />
                            <div
                                className="fixed w-72 z-[9999]"
                                style={{ top: getPortalPos(dialerBtnRef).top, right: getPortalPos(dialerBtnRef).right, cursor: 'move' }}''',
    1
)

# Close the dialer portal
src = src.replace(
    '''                    )}
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}''',
    '''                    , document.body)}
                </div>

                <div className="relative">
                    <button
                        ref={notifBtnRef}
                        onClick={() => setShowNotifications(!showNotifications)}''',
    1
)

# Fix dialer inner panel class
src = src.replace(
    '                                <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.55)]">',
    '                                <div className={panelCls}>',
    1
)

# ── 3. Notifications portal ──────────────────────────────────────────────────
src = src.replace(
    '''                    {showNotifications && (
                        <>
                            <div className="fixed inset-0 z-[55]" onClick={() => setShowNotifications(false)} />
                            <div className={`${floatingPanelClass} w-80`}>''',
    '''                    {showNotifications && createPortal(
                        <>
                            <div className="fixed inset-0 z-[9998]" onClick={() => setShowNotifications(false)} />
                            <div className={`${panelCls} fixed w-80`} style={{ top: getPortalPos(notifBtnRef).top, right: getPortalPos(notifBtnRef).right }}>''',
    1
)

# Close notifications portal
src = src.replace(
    '''                            </div>
                        </>
                    )}
                </div>

                <div className="relative">
                        <button
                            onClick={() => setShowTenantDropdown(!showTenantDropdown)}''',
    '''                            </div>
                        </>
                    , document.body)}
                </div>

                <div className="relative">
                        <button
                            ref={tenantBtnRef}
                            onClick={() => setShowTenantDropdown(!showTenantDropdown)}''',
    1
)

# ── 4. Tenant/workspace portal ───────────────────────────────────────────────
src = src.replace(
    '''                    {showTenantDropdown && (
                        <>
                            <div className="fixed inset-0 z-[55]" onClick={() => setShowTenantDropdown(false)} />
                            <div className={`${floatingPanelClass} w-72`}>''',
    '''                    {showTenantDropdown && createPortal(
                        <>
                            <div className="fixed inset-0 z-[9998]" onClick={() => setShowTenantDropdown(false)} />
                            <div className={`${panelCls} fixed w-72`} style={{ top: getPortalPos(tenantBtnRef).top, right: getPortalPos(tenantBtnRef).right }}>''',
    1
)

# Close tenant portal
src = src.replace(
    '''                            </div>
                        </>
                    )}
                </div>

                <div className="relative">
                        <button
                            onClick={() => setShowProfileDropdown(!showProfileDropdown)}''',
    '''                            </div>
                        </>
                    , document.body)}
                </div>

                <div className="relative">
                        <button
                            ref={profileBtnRef}
                            onClick={() => setShowProfileDropdown(!showProfileDropdown)}''',
    1
)

# ── 5. Profile portal ────────────────────────────────────────────────────────
src = src.replace(
    '''                    {showProfileDropdown && (
                        <>
                            <div className="fixed inset-0 z-[55]" onClick={() => setShowProfileDropdown(false)} />
                            <div className={`${floatingPanelClass} w-72`}>''',
    '''                    {showProfileDropdown && createPortal(
                        <>
                            <div className="fixed inset-0 z-[9998]" onClick={() => setShowProfileDropdown(false)} />
                            <div className={`${panelCls} fixed w-72`} style={{ top: getPortalPos(profileBtnRef).top, right: getPortalPos(profileBtnRef).right }}>''',
    1
)

# Close profile portal
src = src.replace(
    '''                    )}
                </div>
            </div>
        </div>
    );
};''',
    '''                    , document.body)}
                </div>
            </div>
        </div>
    );
};''',
    1
)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(src)

# Verify
checks = [
    ('createPortal used for dialer', 'showDialer && createPortal' in src),
    ('createPortal used for notifs', 'showNotifications && createPortal' in src),
    ('createPortal used for tenant', 'showTenantDropdown && createPortal' in src),
    ('createPortal used for profile', 'showProfileDropdown && createPortal' in src),
    ('document.body portals', src.count('document.body)}') >= 4),
    ('z-9999 used', 'z-[9999]' in src),
    ('no old floatingPanelClass ref', 'floatingPanelClass' not in src),
    ('dialerBtnRef wired', 'ref={dialerBtnRef}' in src),
    ('notifBtnRef wired', 'ref={notifBtnRef}' in src),
    ('tenantBtnRef wired', 'ref={tenantBtnRef}' in src),
    ('profileBtnRef wired', 'ref={profileBtnRef}' in src),
]
for label, ok in checks:
    print(f"{'OK' if ok else 'FAIL'} {label}")

"""
Fix TopBar popup stacking, z-index layering and backdrop issues.
- chrome-surface gets overflow:visible so popups aren't clipped
- Dialer wrapped in its own relative container with z-[60] backdrop
- All backdrop overlays bumped to z-[55] (panel at z-[60])
- Notifications/tenant/profile backdrops use z-[55]
"""
import re

path = r'd:\AIOCRM\frontend\src\components\TopBar.jsx'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src  # keep for diff check

# ── 1. chrome-surface: add overflow:visible ──────────────────────────────────
src = src.replace(
    '<div className="chrome-surface">',
    '<div className="chrome-surface" style={{ overflow: "visible", position: "relative" }}>',
    1
)

# ── 2. Dialer: move into its own relative wrapper + add backdrop dismiss ──────
old_dialer = '''\
                <button
                    className="p-2 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] transition text-green-500 hover:text-green-600"
                    title="VoIP Phone"
                    aria-label="Open VoIP phone"
                    onClick={() => { setShowDialer(!showDialer); if (onToggleDialer) onToggleDialer(!showDialer); }}
                >
                    <Phone size={18} />
                </button>

                {showDialer && (
                    <div 
                      className="absolute right-2 top-12 z-50 w-64"
                      style={{ cursor: 'move' }}
                      onMouseDown={(e) => {
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const modal = e.currentTarget;
                        const rect = modal.getBoundingClientRect();
                        const offsetX = startX - rect.left;
                        const offsetY = startY - rect.top;
                        
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
                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-lg">
                            <DialerModal onClose={() => { setShowDialer(false); if (onToggleDialer) onToggleDialer(false); }} />
                        </div>
                    </div>
                )}'''

new_dialer = '''\
                <div className="relative">
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
                                style={{ cursor: 'move' }}
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
                                <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
                                    <DialerModal onClose={() => { setShowDialer(false); if (onToggleDialer) onToggleDialer(false); }} />
                                </div>
                            </div>
                        </>
                    )}
                </div>'''

src = src.replace(old_dialer, new_dialer, 1)

# ── 3. Notification backdrop z-40 → z-[55] ───────────────────────────────────
src = src.replace(
    '<div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />',
    '<div className="fixed inset-0 z-[55]" onClick={() => setShowNotifications(false)} />',
    1
)

# ── 4. Tenant dropdown backdrop z-40 → z-[55] ────────────────────────────────
src = src.replace(
    '<div className="fixed inset-0 z-40" onClick={() => setShowTenantDropdown(false)} />',
    '<div className="fixed inset-0 z-[55]" onClick={() => setShowTenantDropdown(false)} />',
    1
)

# ── 5. Profile dropdown backdrop z-40 → z-[55] ───────────────────────────────
src = src.replace(
    '<div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />',
    '<div className="fixed inset-0 z-[55]" onClick={() => setShowProfileDropdown(false)} />',
    1
)

# ── 6. Profile panel: remove stale glass-panel class (floatingPanelClass now handles it) ──
src = src.replace(
    '`${floatingPanelClass} w-72 glass-panel`',
    '`${floatingPanelClass} w-72`',
    1
)

changed = src != orig
with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(src)

print(f"Done. Changes applied: {changed}")
# Quick sanity checks
checks = [
    ('chrome-surface overflow:visible', 'overflow: "visible"' in src),
    ('dialer in relative wrapper', 'relative">\n                    <button\n                        className="p-2 hover:bg-[var(--color-hover)] rounded-[var(--radius-card)] transition text-green-500' in src),
    ('dialer backdrop z-[55]', '"fixed inset-0 z-[55]"' in src),
    ('notifications z-[55]', src.count('"fixed inset-0 z-[55]"') >= 1),
    ('no z-40 backdrops remain', '"fixed inset-0 z-40"' not in src),
]
for label, result in checks:
    print(f"  {'✓' if result else '✗'} {label}")

import { AlertTriangle, Contrast, Zap } from 'lucide-preact';
import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useAccessibility } from '../../lib/accessibility';
import { useCrisisMode } from '../../lib/crisisMode';

export function EmergencySettingsMenu() {
    const { crisisMode } = useCrisisMode();
    const { highContrast, limitedMotion, toggleHighContrast, toggleLimitedMotion } =
        useAccessibility();

    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                open &&
                menuRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                btnRef.current &&
                !btnRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    if (!crisisMode) {
        return null;
    }

    return (
        <div style="position:relative;display:inline-flex;">
            <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                class="btn-icon"
                aria-label="Emergency settings"
                title="Emergency settings"
                style="color:var(--danger);"
                onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.color = '#ff3333';
                }}
                onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.color = 'var(--danger)';
                }}
            >
                <AlertTriangle size={16} />
            </button>

            {open && (
                <EmergencyMenu
                    menuRef={menuRef}
                    btnRef={btnRef}
                    highContrast={highContrast}
                    limitedMotion={limitedMotion}
                    toggleHighContrast={toggleHighContrast}
                    toggleLimitedMotion={toggleLimitedMotion}
                />
            )}
        </div>
    );
}

function EmergencyMenu({
    menuRef,
    btnRef,
    highContrast,
    limitedMotion,
    toggleHighContrast,
    toggleLimitedMotion,
}: {
    menuRef: RefObject<HTMLDivElement>;
    btnRef: RefObject<HTMLButtonElement>;
    highContrast: boolean;
    limitedMotion: boolean;
    toggleHighContrast: () => void;
    toggleLimitedMotion: () => void;
}) {
    const rect = btnRef.current?.getBoundingClientRect();
    const menuWidth = 240;
    const top = (rect?.bottom ?? 0) + 8;
    const left = Math.max(8, (rect?.right ?? 0) - menuWidth);

    return (
        <div
            ref={menuRef}
            style={`position:fixed;top:${top}px;left:${left}px;width:240px;z-index:110;background:var(--surface-raised);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-lg);overflow:hidden;`}
            role="menu"
        >
            <div style="padding:12px 14px 8px;border-bottom:1px solid var(--border);">
                <span style="font-size:11px;font-weight:700;color:var(--danger);letter-spacing:0.02em;text-transform:uppercase;display:flex;align-items:center;gap:6px;">
                    <AlertTriangle size={12} />
                    Emergency Settings
                </span>
            </div>
            <div style="padding:8px 14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <Contrast size={13} style="color:var(--text-tertiary);flex-shrink:0;" />
                        <span style="font-size:13px;color:var(--text-secondary);">
                            High contrast
                        </span>
                    </div>
                    <label class="toggle-switch">
                        <input
                            type="checkbox"
                            checked={highContrast}
                            onChange={toggleHighContrast}
                        />
                        <span class="toggle-switch-track" />
                    </label>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <Zap size={13} style="color:var(--text-tertiary);flex-shrink:0;" />
                        <span style="font-size:13px;color:var(--text-secondary);">
                            Reduce motion
                        </span>
                    </div>
                    <label class="toggle-switch">
                        <input
                            type="checkbox"
                            checked={limitedMotion}
                            onChange={toggleLimitedMotion}
                        />
                        <span class="toggle-switch-track" />
                    </label>
                </div>
            </div>
            <div style="padding:8px 14px 10px;border-top:1px solid var(--border);">
                <span style="font-size:11px;color:var(--text-tertiary);">
                    Crisis mode is active
                </span>
            </div>
        </div>
    );
}

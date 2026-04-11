import { Moon, Sun } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useTheme } from '../../lib/theme';
import { BottomNav } from './BottomNav';

interface Props {
    children: ComponentChildren;
    title?: string;
    headerRight?: ComponentChildren;
    showNav?: boolean;
}

export function AppLayout({ children, title, headerRight, showNav = true }: Props) {
    const { theme, toggle } = useTheme();

    return (
        <div style="min-height:100dvh;display:flex;flex-direction:column;">
            {/* Header */}
            {title && (
                <header
                    class="header-bar"
                    style="position:sticky;top:0;z-index:40;height:var(--header-h);display:flex;align-items:center;justify-content:space-between;padding:0 16px;"
                >
                    <h1 style="font-size:15px;font-weight:700;color:var(--text);letter-spacing:-0.02em;margin:0;">
                        {title}
                    </h1>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                        {headerRight}
                        <button
                            type="button"
                            id="theme-toggle"
                            onClick={toggle}
                            class="btn-icon"
                            aria-label={
                                theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
                            }
                            style="color:var(--text-secondary);"
                            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                            onMouseEnter={(e) => {(e.target as HTMLElement).style.filter = 'var(--hover-brightness)';
                                (e.target as HTMLElement).style.background = 'var(--bg-muted)';
                                }}
                            onMouseLeave={(e) => {(e.target as HTMLElement).style.filter = 'none';
                                (e.target as HTMLElement).style.background = 'transparent';
                            }}
                        >
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                    </div>
                </header>
            )}

            {/* Content with max-width */}
            <main style="flex:1;overflow-y:auto;padding-bottom:var(--nav-h);">
                <div class="app-container">{children}</div>
            </main>

            {showNav && <BottomNav />}

            {/* Version indicator */}
            <div
                style={`position:fixed;bottom:${showNav ? 'calc(var(--nav-h) + 4px)' : '8px'};right:8px;z-index:60;pointer-events:none;`}
            >
                <span style="font-size:9px;color:var(--text-tertiary);letter-spacing:0.02em;opacity:0.8;">
                    {__COMMIT_HASH__}
                </span>
            </div>
        </div>
    );
}

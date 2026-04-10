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
                    <div style="display:flex;align-items:center;gap:6px;">
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
        </div>
    );
}

import { Moon, Sun } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useCrisisMode } from '../../lib/crisisMode';
import { useTheme } from '../../lib/theme';
import { EmergencySettingsMenu } from '../ui/EmergencySettingsMenu';
import { HoverButton } from '../ui/HoverButton';
import { BottomNav } from './BottomNav';

interface Props {
    id?: string;
    children: ComponentChildren;
    title?: string;
    headerRight?: ComponentChildren;
    showNav?: boolean;
}

export function AppLayout({ id, children, title, headerRight, showNav = true }: Props) {
    const { theme, toggle } = useTheme();
    const { crisisMode } = useCrisisMode();
    const commitHash = typeof __COMMIT_HASH__ === 'string' ? __COMMIT_HASH__ : 'dev';

    return (
        <div id={id ?? 'app-layout'} style="min-height:100dvh;display:flex;flex-direction:column;">
            {title && (
                <header
                    class="header-bar"
                    style="position:sticky;top:0;z-index:40;height:var(--header-h);display:flex;align-items:center;justify-content:space-between;padding:0 16px;"
                >
                    <h1 style="font-size:15px;font-weight:700;color:var(--text);letter-spacing:-0.02em;margin:0;display:flex;align-items:center;gap:8px;">
                        {title}
                        {crisisMode && (
                            <span style="font-size:15px;font-weight:700;letter-spacing:-0.02em;text-transform:none;color:#dc2626;">
                                Crisis Mode
                            </span>
                        )}
                    </h1>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                        {headerRight}
                        <EmergencySettingsMenu />
                        {theme !== 'high-contrast' && (
                            <HoverButton
                                type="button"
                                id="theme-toggle"
                                onClick={toggle}
                                class="btn-icon"
                                aria-label={
                                    theme === 'dark'
                                        ? 'Switch to light mode'
                                        : 'Switch to dark mode'
                                }
                                style="color:var(--text-secondary);"
                                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                                onMouseEnter={(e) => {
                                    (e.target as HTMLElement).style.filter =
                                        'var(--hover-brightness)';
                                    (e.target as HTMLElement).style.background = 'var(--bg-muted)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.target as HTMLElement).style.filter = 'none';
                                    (e.target as HTMLElement).style.background = 'transparent';
                                }}
                            >
                                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                            </HoverButton>
                        )}
                    </div>
                </header>
            )}

            <main style="flex:1;overflow-y:auto;padding-bottom:var(--nav-h);">
                <div class="app-container">{children}</div>
            </main>

            {showNav && <BottomNav />}

            <div
                style={`position:fixed;bottom:${showNav ? 'calc(var(--nav-h) + 4px)' : '8px'};right:8px;z-index:60;pointer-events:none;`}
            >
                <span style="font-size:9px;color:var(--text-tertiary);letter-spacing:0.02em;opacity:0.8;">
                    {commitHash}
                </span>
            </div>
        </div>
    );
}

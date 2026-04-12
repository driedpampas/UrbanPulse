import {
    BookOpen,
    ClipboardList,
    Home,
    MessageCircle,
    MoreHorizontal,
    ShieldCheck,
    User,
} from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { useAuth } from '../../lib/auth';
import { useUnreadChatCount } from '../../lib/chatNotifications';
import { HoverButton } from '../ui/HoverButton';

const tabs = [
    { path: '/', icon: Home, label: 'Feed' },
    { path: '/library', icon: BookOpen, label: 'Library' },
    { path: '/messages', icon: MessageCircle, label: 'Chat' },
    { path: '/requests', icon: ClipboardList, label: 'Requests' },
    { path: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
    const [location, setLocation] = useLocation();
    const { session } = useAuth();
    const unreadChatCount = useUnreadChatCount();
    const role = session?.user.role?.toLowerCase();
    const isAdmin = role === 'admin' || role === 'mod';

    const [windowWidth, setWindowWidth] = useState(
        typeof window !== 'undefined' ? window.innerWidth : 1000
    );
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                showMoreMenu &&
                menuRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                btnRef.current &&
                !btnRef.current.contains(e.target as Node)
            ) {
                setShowMoreMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMoreMenu]);

    const visibleTabsSource = isAdmin
        ? [...tabs, { path: '/admin', icon: ShieldCheck, label: 'Admin' }]
        : tabs;

    const navPadding = 8;
    const tabWidth = 60;
    const availableWidth = windowWidth - navPadding;

    let visibleCount = visibleTabsSource.length;
    let overflowTabs: typeof visibleTabsSource = [];

    if (availableWidth < visibleTabsSource.length * tabWidth) {
        visibleCount = Math.max(1, Math.floor(availableWidth / tabWidth) - 1);
        overflowTabs = visibleTabsSource.slice(visibleCount);
    }

    const visibleTabs = visibleTabsSource.slice(0, visibleCount);
    const hasOverflow = overflowTabs.length > 0;

    return (
        <nav
            class="nav-bar"
            style="position:fixed;bottom:0;left:0;right:0;z-index:50;height:var(--nav-h);"
        >
            <div
                class="app-container"
                style="height:100%;display:flex;align-items:center;justify-content:space-around;padding:0 4px;"
            >
                {visibleTabs.map((tab) => {
                    const active =
                        location === tab.path ||
                        (tab.path !== '/' && location.startsWith(tab.path));
                    const Icon = tab.icon;
                    const showUnreadBadge = tab.path === '/messages' && unreadChatCount > 0;
                    return (
                        <HoverButton
                            type="button"
                            key={tab.path}
                            id={`nav-${tab.label.toLowerCase()}`}
                            onClick={() => setLocation(tab.path)}
                            style={`
                                display:flex;flex-direction:column;align-items:center;gap:3px;
                                padding:6px 12px;border-radius:8px;border:none;cursor:pointer;
                                background:${active ? 'var(--accent-subtle)' : 'transparent'};
                                color:${active ? 'var(--accent)' : 'var(--text-tertiary)'};
                                transition:background 0.15s,color 0.15s;
                                min-width:52px;
                            `}
                            aria-current={active ? 'page' : undefined}
                            onMouseEnter={(e) => {
                                (e.target as HTMLElement).style.filter = 'var(--hover-brightness)';
                                (e.target as HTMLElement).style.background = 'var(--bg-muted)';
                            }}
                            onMouseLeave={(e) => {
                                (e.target as HTMLElement).style.filter = 'none';
                                (e.target as HTMLElement).style.background = 'transparent';
                            }}
                        >
                            <span style="position:relative;display:inline-flex;align-items:center;justify-content:center;">
                                <Icon size={18} strokeWidth={active ? 2.2 : 1.7} />
                                {showUnreadBadge && (
                                    <span style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;border-radius:999px;background:var(--accent);box-shadow:0 0 0 2px var(--surface);" />
                                )}
                            </span>
                            <span
                                style={`font-size:10px;font-weight:${active ? '600' : '500'};letter-spacing:0.01em;`}
                            >
                                {tab.label}
                            </span>
                        </HoverButton>
                    );
                })}

                {hasOverflow && (
                    <div style="position:relative;">
                        <HoverButton
                            type="button"
                            ref={btnRef}
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                            style={`
                                display:flex;flex-direction:column;align-items:center;gap:3px;
                                padding:6px 12px;border-radius:8px;border:none;cursor:pointer;
                                background:${showMoreMenu ? 'var(--accent-subtle)' : 'transparent'};
                                color:${showMoreMenu ? 'var(--accent)' : 'var(--text-tertiary)'};
                                transition:background 0.15s,color 0.15s;
                                min-width:52px;
                            `}
                        >
                            <MoreHorizontal size={18} strokeWidth={showMoreMenu ? 2.2 : 1.7} />
                            <span
                                style={`font-size:10px;font-weight:${showMoreMenu ? '600' : '500'};letter-spacing:0.01em;`}
                            >
                                More
                            </span>
                        </HoverButton>

                        {showMoreMenu && (
                            <div
                                ref={menuRef}
                                class="absolute z-[50] bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden min-w-[160px]"
                                style="bottom:calc(100% + 8px);right:0;"
                                role="menu"
                            >
                                {overflowTabs.map((tab) => {
                                    const active =
                                        location === tab.path ||
                                        (tab.path !== '/' && location.startsWith(tab.path));
                                    const Icon = tab.icon;
                                    const showUnreadBadge =
                                        tab.path === '/messages' && unreadChatCount > 0;
                                    return (
                                        <HoverButton
                                            type="button"
                                            key={tab.path}
                                            onClick={() => {
                                                setLocation(tab.path);
                                                setShowMoreMenu(false);
                                            }}
                                            role="menuitem"
                                            class={`w-full px-3 py-2.5 border-none bg-none cursor-pointer text-[13px] stack-h gap-sm text-left transition-colors ${active ? 'bg-[var(--bg-muted)] text-[var(--accent)] font-semibold' : 'text-[var(--text)] hover:bg-[var(--bg-muted)]'}`}
                                        >
                                            <div style="position:relative;display:inline-flex;">
                                                <Icon size={14} />
                                                {showUnreadBadge && (
                                                    <span style="position:absolute;top:-2px;right:-2px;width:6px;height:6px;border-radius:999px;background:var(--accent);box-shadow:0 0 0 2px var(--surface);" />
                                                )}
                                            </div>
                                            {tab.label}
                                        </HoverButton>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </nav>
    );
}

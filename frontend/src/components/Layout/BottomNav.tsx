import {
    BookOpen,
    ClipboardList,
    Home,
    MessageCircle,
    PawPrint,
    ShieldCheck,
    User,
} from 'lucide-preact';
import { useLocation } from 'wouter';
import { useAuth } from '../../lib/auth';
import { useUnreadChatCount } from '../../lib/chatNotifications';

const tabs = [
    { path: '/', icon: Home, label: 'Feed' },
    { path: '/library', icon: BookOpen, label: 'Library' },
    { path: '/messages', icon: MessageCircle, label: 'Chat' },
    { path: '/requests', icon: ClipboardList, label: 'Requests' },
    { path: '/pets', icon: PawPrint, label: 'Pets' },
    { path: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
    const [location, setLocation] = useLocation();
    const { session } = useAuth();
    const unreadChatCount = useUnreadChatCount();
    const isAdmin = session?.user.role?.toLowerCase() === 'admin';

    const visibleTabs = isAdmin
        ? [...tabs, { path: '/admin', icon: ShieldCheck, label: 'Admin' }]
        : tabs;

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
                        <button
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
                            onMouseEnter={(e) => {(e.target as HTMLElement).style.filter = 'var(--hover-brightness)';
                                (e.target as HTMLElement).style.background = 'var(--bg-muted)';
                                }}
                            onMouseLeave={(e) => {(e.target as HTMLElement).style.filter = 'none';
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
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

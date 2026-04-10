import { BookOpen, Home, MessageCircle, PawPrint, User } from 'lucide-preact';
import { useLocation } from 'wouter';

const tabs = [
    { path: '/', icon: Home, label: 'Feed' },
    { path: '/library', icon: BookOpen, label: 'Library' },
    { path: '/messages', icon: MessageCircle, label: 'Chat' },
    { path: '/pets', icon: PawPrint, label: 'Pets' },
    { path: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
    const [location, setLocation] = useLocation();

    return (
        <nav
            class="nav-bar"
            style="position:fixed;bottom:0;left:0;right:0;z-index:50;height:var(--nav-h);"
        >
            <div
                class="app-container"
                style="height:100%;display:flex;align-items:center;justify-content:space-around;padding:0 4px;"
            >
                {tabs.map((tab) => {
                    const active =
                        location === tab.path ||
                        (tab.path !== '/' && location.startsWith(tab.path));
                    const Icon = tab.icon;
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
                        >
                            <Icon size={18} strokeWidth={active ? 2.2 : 1.7} />
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

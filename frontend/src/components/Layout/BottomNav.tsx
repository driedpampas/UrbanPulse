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
        <nav class="fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/20">
            <div class="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
                {tabs.map((tab) => {
                    const active =
                        location === tab.path ||
                        (tab.path !== '/' && location.startsWith(tab.path));
                    const Icon = tab.icon;
                    return (
                        <button
                            type="button"
                            key={tab.path}
                            onClick={() => setLocation(tab.path)}
                            class={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 ${
                                active
                                    ? 'text-primary scale-105'
                                    : 'text-text-secondary hover:text-primary/70'
                            }`}
                        >
                            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                            <span class="text-[10px] font-medium">{tab.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { Route, Switch, useLocation } from 'wouter';
import { useBatterySaver } from './hooks/useBatterySaver';
import { AccessibilityProvider } from './lib/accessibility';
import { AuthProvider, useAuth } from './lib/auth';
import {
    type ChatSocketEvent,
    connectChatWebSocket,
    disconnectChatWebSocket,
    setChatBatteryLevel,
    setChatCrisisMode,
} from './lib/chatApi';
import { isActiveChatThread, markThreadUnread, useUnreadChatCount } from './lib/chatNotifications';
import { CrisisModeProvider, useCrisisMode } from './lib/crisisMode';
import {
    connectWebSocket as connectPulseWebSocket,
    disconnectWebSocket as disconnectPulseWebSocket,
    type PulseSocketEvent,
    setPulseBatteryLevel,
    setPulseCrisisMode,
} from './lib/pulseApi';
import { ThemeProvider } from './lib/theme';
import { AdminDashboard } from './pages/AdminDashboard';
import { Auth } from './pages/Auth';
import { ConfirmPassword } from './pages/ConfirmPassword';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { Messages } from './pages/Messages';
import { PetMatch } from './pages/PetMatch';
import { Profile } from './pages/Profile';
import { Requests } from './pages/Requests';
import { Settings } from './pages/Settings';
import { VerifyEmail } from './pages/VerifyEmail';
import './index.css';

function RouteRedirect({ to }: { to: string }) {
    const [, setLocation] = useLocation();
    useEffect(() => {
        setLocation(to);
    }, [setLocation, to]);
    return (
        <div class="page-shell flex-center">
            <span class="text-sm text-(--text-tertiary) animate-pulse">Redirecting…</span>
        </div>
    );
}

function AppRoutes() {
    const { isAuthenticated, isReady, session } = useAuth();
    const role = session?.user.role?.toLowerCase();
    const isAdmin = role === 'admin' || role === 'mod';

    if (!isReady) {
        return (
            <div class="page-shell flex-center bg-(--bg)">
                <div class="stack-v gap-sm text-center">
                    <p class="text-lg font-bold text-(--text) tracking-tight">UrbanPulse</p>
                    <div class="stack-h gap-sm justify-center">
                        <div
                            class="h-1.5 w-1.5 rounded-full bg-(--accent) animate-bounce"
                            style="animation-delay:-0.3s"
                        />
                        <div
                            class="h-1.5 w-1.5 rounded-full bg-(--accent) animate-bounce"
                            style="animation-delay:-0.15s"
                        />
                        <div class="h-1.5 w-1.5 rounded-full bg-(--accent) animate-bounce" />
                    </div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <Switch>
                <Route path="/confirm-password" component={ConfirmPassword} />
                <Route path="/verify-email" component={VerifyEmail} />
                <Route path="/auth" component={Auth} />
                <Route>
                    <RouteRedirect to="/auth" />
                </Route>
            </Switch>
        );
    }

    return (
        <Switch>
            <Route path="/confirm-password" component={ConfirmPassword} />
            <Route path="/verify-email" component={VerifyEmail} />
            <Route path="/" component={Dashboard} />
            <Route path="/library" component={Library} />
            <Route path="/messages" component={Messages} />
            <Route path="/requests" component={Requests} />
            <Route path="/pet-match" component={PetMatch} />
            <Route path="/profile" component={Profile} />
            <Route path="/settings" component={Settings} />
            <Route path="/auth">
                <RouteRedirect to="/" />
            </Route>
            <Route path="/admin">
                {isAdmin ? (
                    <AdminDashboard />
                ) : (
                    <RouteRedirect to={isAuthenticated ? '/' : '/auth'} />
                )}
            </Route>
            <Route>
                <div class="page-shell flex-center">
                    <span class="text-sm text-(--text-tertiary)">Page not found</span>
                </div>
            </Route>
        </Switch>
    );
}

function ChatNotificationsBridge() {
    const { isAuthenticated } = useAuth();
    const { crisisMode } = useCrisisMode();
    const { battery } = useBatterySaver({ crisisMode: crisisMode });
    const [location] = useLocation();
    const [toasts, setToasts] = useState<Array<{ id: string; title: string; body: string }>>([]);
    const seenMessageIdsRef = useRef<Map<string, number>>(new Map());
    const seenHeroAlertIdsRef = useRef<Map<string, number>>(new Map());
    const [isForeground, setIsForeground] = useState(() => {
        if (typeof document === 'undefined') {
            return true;
        }

        return document.visibilityState === 'visible' && document.hasFocus();
    });

    useEffect(() => {
        if (typeof document === 'undefined' || typeof window === 'undefined') {
            return;
        }

        const refresh = () => {
            setIsForeground(document.visibilityState === 'visible' && document.hasFocus());
        };

        refresh();
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('focus', refresh);
        window.addEventListener('blur', refresh);

        return () => {
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('blur', refresh);
        };
    }, []);

    useEffect(() => {
        setChatCrisisMode(crisisMode);
        setPulseCrisisMode(crisisMode);
    }, [crisisMode]);

    useEffect(() => {
        const level = battery ? battery.level : null;
        setChatBatteryLevel(level);
        setPulseBatteryLevel(level);
    }, [battery]);

    const unreadCount = useUnreadChatCount();

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (!favicon) return;

        if (unreadCount === 0) {
            favicon.href = '/vite.svg';
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.src = '/vite.svg';
        img.onload = () => {
            ctx.clearRect(0, 0, 32, 32);
            ctx.drawImage(img, 0, 0, 32, 32);

            // Draw red dot
            ctx.beginPath();
            ctx.arc(25, 7, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#dc2626';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            favicon.href = canvas.toDataURL('image/png');
        };
    }, [unreadCount]);

    const pushToast = (title: string, body: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setToasts((current) => [...current.slice(-3), { id, title, body }]);
        window.setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 5000);
    };

    const dismissToast = (id: string) => {
        setToasts((current) => current.filter((t) => t.id !== id));
    };

    useEffect(() => {
        if (!isAuthenticated) {
            setToasts([]);
            return;
        }

        const handleChatEvent = (event: ChatSocketEvent) => {
            if (event.event !== 'notification.message' || !event.message) {
                return;
            }

            const seen = seenMessageIdsRef.current;
            const messageId = event.message.id;
            if (seen.has(messageId)) {
                return;
            }

            const now = Date.now();
            seen.set(messageId, now);
            if (seen.size > 400) {
                for (const [id, ts] of seen) {
                    if (now - ts > 5 * 60 * 1000) {
                        seen.delete(id);
                    }
                }
            }

            const notificationEvent = event as Extract<
                ChatSocketEvent,
                { event: 'notification.message' }
            >;

            if (isActiveChatThread(event.message.threadId)) {
                return;
            }

            markThreadUnread(event.message.threadId);

            if (isForeground) {
                pushToast(
                    notificationEvent.threadName
                        ? `Message in ${notificationEvent.threadName}`
                        : `Message from ${notificationEvent.senderName}`,
                    notificationEvent.threadName
                        ? `${notificationEvent.senderName}: ${event.message.content}`
                        : event.message.content
                );
                return;
            }

            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
                return;
            }

            new Notification(
                notificationEvent.threadName
                    ? `Message in ${notificationEvent.threadName}`
                    : `Message from ${notificationEvent.senderName}`,
                {
                    body: notificationEvent.threadName
                        ? `${notificationEvent.senderName}: ${event.message.content}`
                        : event.message.content,
                    tag: event.message.threadId,
                }
            );
        };

        const handlePulseEvent = (event: PulseSocketEvent) => {
            if (event.event !== 'hero.alert') {
                return;
            }

            const seenHeroAlerts = seenHeroAlertIdsRef.current;
            const pulseId = event.pulse.id;
            if (seenHeroAlerts.has(pulseId)) {
                return;
            }

            const now = Date.now();
            seenHeroAlerts.set(pulseId, now);
            if (seenHeroAlerts.size > 400) {
                for (const [id, ts] of seenHeroAlerts) {
                    if (now - ts > 30 * 60 * 1000) {
                        seenHeroAlerts.delete(id);
                    }
                }
            }

            if (isForeground) {
                // Dashboard has its own richer hero alert card.
                if (location !== '/') {
                    pushToast('Hero alert', event.pulse.content);
                }
                return;
            }

            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
                return;
            }

            new Notification('Hero alert', {
                body: event.pulse.content,
                tag: `hero-${event.pulse.id}`,
            });
        };

        connectChatWebSocket(handleChatEvent);
        connectPulseWebSocket(handlePulseEvent);
        return () => {
            disconnectChatWebSocket(handleChatEvent);
            disconnectPulseWebSocket(handlePulseEvent);
        };
    }, [isAuthenticated, isForeground, location]);

    return (
        <div style="position:fixed;top:12px;right:12px;z-index:140;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(360px, calc(100vw - 24px));">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className="animate-slide-in-right"
                    style="pointer-events:auto;border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:10px 12px;box-shadow:var(--shadow-lg);position:relative;min-width:240px;"
                >
                    <div style="padding-right:24px;">
                        <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            {toast.title}
                        </p>
                        <p style="margin:0;font-size:12px;color:var(--text-secondary);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                            {toast.body}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => dismissToast(toast.id)}
                        className="btn-icon"
                        style="position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:6px;"
                        title="Dismiss"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <title>Dismiss Notification</title>
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--accent-muted);overflow:hidden;border-radius:0 0 12px 12px;">
                        <div
                            className="toast-progress-bar"
                            style="height:100%;background:var(--accent);width:100%;transform-origin:left;"
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function App() {
    return (
        <ThemeProvider>
            <CrisisModeProvider>
                <AccessibilityProvider>
                    <AuthProvider>
                        <ChatNotificationsBridge />
                        <AppRoutes />
                    </AuthProvider>
                </AccessibilityProvider>
            </CrisisModeProvider>
        </ThemeProvider>
    );
}

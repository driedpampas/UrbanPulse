import { useEffect, useState } from 'preact/hooks';
import { Route, Switch, useLocation } from 'wouter';
import { AuthProvider, useAuth } from './lib/auth';
import { type ChatSocketEvent, connectChatWebSocket, disconnectChatWebSocket } from './lib/chatApi';
import { isActiveChatThread, markThreadUnread } from './lib/chatNotifications';
import {
    connectWebSocket as connectPulseWebSocket,
    disconnectWebSocket as disconnectPulseWebSocket,
    type PulseSocketEvent,
} from './lib/pulseApi';
import { ThemeProvider } from './lib/theme';
import { AdminDashboard } from './pages/AdminDashboard';
import { Auth } from './pages/Auth';
import { ConfirmPassword } from './pages/ConfirmPassword';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { Messages } from './pages/Messages';
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
        <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;">
            <span style="font-size:13px;color:var(--text-secondary);">Redirecting…</span>
        </div>
    );
}

function AppRoutes() {
    const { isAuthenticated, isReady, session } = useAuth();
    const role = session?.user.role?.toLowerCase();
    const isAdmin = role === 'admin' || role === 'mod';

    if (!isReady) {
        return (
            <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;">
                <div style="text-align:center;">
                    <p style="font-size:15px;font-weight:700;color:var(--text);letter-spacing:-0.02em;">
                        UrbanPulse
                    </p>
                    <p style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">
                        Loading…
                    </p>
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
                <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;">
                    <span style="color:var(--text-secondary);font-size:13px;">Page not found</span>
                </div>
            </Route>
        </Switch>
    );
}

function ChatNotificationsBridge() {
    const { isAuthenticated } = useAuth();
    const [location] = useLocation();
    const [toasts, setToasts] = useState<Array<{ id: string; title: string; body: string }>>([]);
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

    const pushToast = (title: string, body: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setToasts((current) => [...current.slice(-3), { id, title, body }]);
        window.setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 5000);
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
                    `New message from ${notificationEvent.senderName}`,
                    event.message.content
                );
                return;
            }

            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
                return;
            }

            new Notification(`New message from ${notificationEvent.senderName}`, {
                body: event.message.content,
                tag: event.message.threadId,
            });
        };

        const handlePulseEvent = (event: PulseSocketEvent) => {
            if (event.event !== 'hero.alert') {
                return;
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
                    style="pointer-events:auto;border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:10px 12px;box-shadow:var(--shadow-lg);"
                >
                    <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:var(--text);">
                        {toast.title}
                    </p>
                    <p style="margin:0;font-size:12px;color:var(--text-secondary);line-height:1.35;">
                        {toast.body}
                    </p>
                </div>
            ))}
        </div>
    );
}

export function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <ChatNotificationsBridge />
                <AppRoutes />
            </AuthProvider>
        </ThemeProvider>
    );
}

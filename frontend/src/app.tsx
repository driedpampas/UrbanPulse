import { useEffect } from 'preact/hooks';
import { Route, Switch, useLocation } from 'wouter';
import { AuthProvider, useAuth } from './lib/auth';
import { type ChatSocketEvent, connectChatWebSocket, disconnectChatWebSocket } from './lib/chatApi';
import { isActiveChatThread, markThreadUnread } from './lib/chatNotifications';
import { ThemeProvider } from './lib/theme';
import { AdminDashboard } from './pages/AdminDashboard';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { Messages } from './pages/Messages';
import { PetMatch } from './pages/PetMatch';
import { Profile } from './pages/Profile';
import { Requests } from './pages/Requests';
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
    const isAdmin = session?.user.role?.toLowerCase() === 'admin';

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
                <Route path="/auth" component={Auth} />
                <Route>
                    <RouteRedirect to="/auth" />
                </Route>
            </Switch>
        );
    }

    return (
        <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/library" component={Library} />
            <Route path="/messages" component={Messages} />
            <Route path="/requests" component={Requests} />
            <Route path="/profile" component={Profile} />
            <Route path="/pets" component={PetMatch} />
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

    useEffect(() => {
        if (!isAuthenticated) {
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

            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
                return;
            }

            new Notification(`New message from ${notificationEvent.senderName}`, {
                body: event.message.content,
                tag: event.message.threadId,
            });
        };

        connectChatWebSocket(handleChatEvent);
        return () => disconnectChatWebSocket(handleChatEvent);
    }, [isAuthenticated]);

    return null;
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

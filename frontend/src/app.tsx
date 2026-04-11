import { useEffect } from 'preact/hooks';
import { Route, Switch, useLocation } from 'wouter';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { AdminDashboard } from './pages/AdminDashboard';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { Messages } from './pages/Messages';
import { PetMatch } from './pages/PetMatch';
import { Profile } from './pages/Profile';
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

export function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </ThemeProvider>
    );
}

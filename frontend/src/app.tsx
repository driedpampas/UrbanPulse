import { useEffect } from 'preact/hooks';
import { Route, Switch, useLocation } from 'wouter';
import { AuthProvider, useAuth } from './lib/auth';
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
        <div class="min-h-dvh flex items-center justify-center bg-linear-to-br from-primary/8 via-white to-secondary/10 px-6">
            <div class="glass rounded-3xl px-6 py-5 text-center">
                <p class="text-sm font-medium text-text-secondary">Redirecting...</p>
            </div>
        </div>
    );
}

function AppRoutes() {
    const { isAuthenticated, isReady } = useAuth();

    if (!isReady) {
        return (
            <div class="min-h-dvh flex items-center justify-center bg-linear-to-br from-primary/8 via-white to-secondary/10 px-6">
                <div class="glass rounded-[28px] px-8 py-6 text-center animate-fade-up">
                    <p class="text-xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent">
                        UrbanPulse
                    </p>
                    <p class="mt-2 text-sm text-text-secondary">Loading your neighborhood...</p>
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
            <Route path="/admin" component={AdminDashboard} />
            <Route>
                <div class="min-h-dvh flex items-center justify-center">
                    <p class="text-text-secondary">Page not found</p>
                </div>
            </Route>
        </Switch>
    );
}

export function App() {
    return (
        <AuthProvider>
            <AppRoutes />
        </AuthProvider>
    );
}

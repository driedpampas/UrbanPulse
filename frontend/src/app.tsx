import { Route, Switch } from 'wouter';
import { AdminDashboard } from './pages/AdminDashboard';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { Messages } from './pages/Messages';
import { PetMatch } from './pages/PetMatch';
import { Profile } from './pages/Profile';
import './index.css';

export function App() {
    return (
        <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/library" component={Library} />
            <Route path="/messages" component={Messages} />
            <Route path="/profile" component={Profile} />
            <Route path="/pets" component={PetMatch} />
            <Route path="/auth" component={Auth} />
            <Route path="/admin" component={AdminDashboard} />
            <Route>
                <div class="min-h-dvh flex items-center justify-center">
                    <p class="text-text-secondary">Page not found</p>
                </div>
            </Route>
        </Switch>
    );
}

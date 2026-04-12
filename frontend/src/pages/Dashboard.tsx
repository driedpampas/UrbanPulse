import { DashboardFiltersPanel } from '../components/Dashboard/DashboardFiltersPanel';
import { DashboardToolbar } from '../components/Dashboard/DashboardToolbar';
import { HeroAlert } from '../components/Dashboard/HeroAlert';
import { LiveFeed } from '../components/Dashboard/LiveFeed';
import { PulseMap } from '../components/Dashboard/PulseMap';
import { WeatherAlert } from '../components/Dashboard/WeatherAlert';
import { AppLayout } from '../components/Layout/AppLayout';
import { NeedPostingForm } from '../components/Requests/NeedPostingForm';
import { useDashboardViewState } from '../hooks/useDashboardViewState';
import { useAuth } from '../lib/auth';

export function Dashboard() {
    const { session } = useAuth();
    const showEmailVerificationBanner = session?.user.isEmailVerified === false;

    const {
        view,
        setView,
        showPostForm,
        openPostForm,
        closePostForm,
        radius,
        updateRadius,
        limit,
        setLimit,
        showFilters,
        toggleFilters,
    } = useDashboardViewState();

    return (
        <AppLayout title="UrbanPulse" headerRight={null}>
            <div style={`display:flex;flex-direction:column;${view === 'map' ? 'flex:1;' : ''}`}>
                <DashboardToolbar
                    view={view}
                    showFilters={showFilters}
                    radius={radius}
                    limit={limit}
                    onViewChange={setView}
                    onToggleFilters={toggleFilters}
                    onOpenPostForm={openPostForm}
                />
                <DashboardFiltersPanel
                    showFilters={showFilters}
                    radius={radius}
                    limit={limit}
                    onRadiusChange={updateRadius}
                    onLimitChange={setLimit}
                />
                {showEmailVerificationBanner && (
                    <div class="mx-4 mt-3 rounded-xl border border-[var(--warning)] bg-[var(--warning-subtle)] px-4 py-3">
                        <p class="text-sm font-semibold text-[var(--warning)]">
                            Please verify your email to unlock high-trust features.
                        </p>
                        <p class="mt-1 text-xs text-[var(--text-secondary)]">
                            Check your inbox for the verification link.
                        </p>
                    </div>
                )}
                <WeatherAlert />
                <HeroAlert />
                {view === 'feed' ? (
                    <LiveFeed radiusFilter={radius} pulseLimit={limit} />
                ) : (
                    <div style="margin-top:12px;flex:1;display:flex;flex-direction:column;min-height:55dvh;">
                        <PulseMap expanded radiusFilter={radius} pulseLimit={limit} />
                    </div>
                )}
            </div>

            {showPostForm && <NeedPostingForm onClose={closePostForm} />}
        </AppLayout>
    );
}

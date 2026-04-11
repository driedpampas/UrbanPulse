import { DashboardFiltersPanel } from '../components/Dashboard/DashboardFiltersPanel';
import { DashboardToolbar } from '../components/Dashboard/DashboardToolbar';
import { HeroAlert } from '../components/Dashboard/HeroAlert';
import { LiveFeed } from '../components/Dashboard/LiveFeed';
import { PulseMap } from '../components/Dashboard/PulseMap';
import { WeatherAlert } from '../components/Dashboard/WeatherAlert';
import { AppLayout } from '../components/Layout/AppLayout';
import { NeedPostingForm } from '../components/Requests/NeedPostingForm';
import { useDashboardViewState } from '../hooks/useDashboardViewState';

export function Dashboard() {
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

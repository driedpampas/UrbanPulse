import { ShieldCheck } from 'lucide-preact';
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
import { cn } from '../lib/utils';

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
            <div class={cn('stack-v', view === 'map' && 'flex-1')}>
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
                    <div class="mx-4 mt-3 animate-slide-up">
                        <div class="section border-[var(--warning)] bg-[var(--warning-subtle)]/30">
                            <div class="p-4 stack-h gap-md">
                                <div class="rounded-full bg-[var(--warning-subtle)] p-2 border border-[var(--warning)]/20">
                                    <ShieldCheck class="h-5 w-5 text-[var(--warning)]" />
                                </div>
                                <div class="stack-v">
                                    <p class="text-sm font-bold text-[var(--text)]">
                                        Verify your email address
                                    </p>
                                    <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
                                        High-trust features require a verified account. Check your
                                        inbox for the link.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div class="mx-4">
                    <WeatherAlert />
                </div>
                <HeroAlert />
                {view === 'feed' ? (
                    <LiveFeed radiusFilter={radius} pulseLimit={limit} />
                ) : (
                    <div class="stack-v mt-3 flex-1 min-h-[55dvh]">
                        <PulseMap expanded radiusFilter={radius} pulseLimit={limit} />
                    </div>
                )}
            </div>

            {showPostForm && <NeedPostingForm onClose={closePostForm} />}
        </AppLayout>
    );
}

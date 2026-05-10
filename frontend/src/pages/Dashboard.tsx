import { ShieldCheck } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { BatterySaverDialog } from '../components/Dashboard/BatterySaverDialog';
import { DashboardFiltersPanel } from '../components/Dashboard/DashboardFiltersPanel';
import { DashboardToolbar } from '../components/Dashboard/DashboardToolbar';
import { HeroAlert } from '../components/Dashboard/HeroAlert';
import { IncidentBanner } from '../components/Dashboard/IncidentBanner';
import { IncidentOverlay } from '../components/Dashboard/IncidentOverlay';
import { LiveFeed } from '../components/Dashboard/LiveFeed';
import { PulseMap } from '../components/Dashboard/PulseMap';
import { WeatherAlert } from '../components/Dashboard/WeatherAlert';
import { AppLayout } from '../components/Layout/AppLayout';
import { NeedPostingForm } from '../components/Requests/NeedPostingForm';
import { HoverButton } from '../components/ui/HoverButton';
import { useBatterySaver } from '../hooks/useBatterySaver';
import { useCrisisMode } from '../hooks/useCrisisMode';
import { useDashboardViewState } from '../hooks/useDashboardViewState';
import { useAuth } from '../lib/auth';
import type { IncidentFeedItem } from '../lib/incidentApi';
import { requestVerificationEmail } from '../lib/settingsApi';
import { cn } from '../lib/utils';

export function Dashboard() {
    const { session } = useAuth();
    const showEmailVerificationBanner = session?.user.isEmailVerified === false;
    const [sendingVerificationEmail, setSendingVerificationEmail] = useState(false);
    const [verificationEmailFeedback, setVerificationEmailFeedback] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const handleSendVerificationEmail = async () => {
        if (sendingVerificationEmail) {
            return;
        }

        setSendingVerificationEmail(true);
        setVerificationEmailFeedback(null);

        try {
            const result = await requestVerificationEmail();
            setVerificationEmailFeedback({
                type: 'success',
                message: result.message || 'Verification link sent. Check your inbox.',
            });
        } catch (error) {
            setVerificationEmailFeedback({
                type: 'error',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unable to send verification email right now.',
            });
        } finally {
            setSendingVerificationEmail(false);
        }
    };

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

    const {
        crisisMode,
        crisisFeedTab,
        setCrisisFeedTab,
        activeIncidents,
        autoOpenOverlay,
        setAutoOpenOverlay,
    } = useCrisisMode();
    const [selectedIncident, setSelectedIncident] = useState<IncidentFeedItem | null>(null);

    useEffect(() => {
        if (autoOpenOverlay && activeIncidents.length > 0 && !selectedIncident) {
            setSelectedIncident(activeIncidents[0]);
            setAutoOpenOverlay(false);
        }
    }, [autoOpenOverlay, activeIncidents, selectedIncident, setAutoOpenOverlay]);

    const { battery, shouldShowDialog, requestWakeLock, dismissDialog } = useBatterySaver({
        crisisMode,
    });

    const crisisFilter = !crisisMode
        ? null
        : view === 'feed'
          ? crisisFeedTab === 'emergency'
              ? 'emergency'
              : 'other'
          : null;

    return (
        <AppLayout id="page-dashboard" title="UrbanPulse" headerRight={null}>
            <div id="dashboard-content" class={cn('stack-v', view === 'map' && 'flex-1')}>
                <div class="mx-4">
                    <DashboardToolbar
                        view={view}
                        showFilters={showFilters}
                        radius={radius}
                        limit={limit}
                        onViewChange={setView}
                        onToggleFilters={toggleFilters}
                        onOpenPostForm={openPostForm}
                        crisisMode={crisisMode}
                        crisisFeedTab={crisisFeedTab}
                        onCrisisFeedTabChange={setCrisisFeedTab}
                    />
                </div>
                <DashboardFiltersPanel
                    showFilters={showFilters}
                    radius={radius}
                    limit={limit}
                    onRadiusChange={updateRadius}
                    onLimitChange={setLimit}
                />
                {showEmailVerificationBanner && (
                    <div class="mx-4 mt-3 animate-slide-up">
                        <div class="section border-(--warning) bg-(--warning-subtle)/30">
                            <div class="p-4 stack-h gap-md">
                                <div class="rounded-full bg-(--warning-subtle) p-2 border border-(--warning)/20">
                                    <ShieldCheck class="h-5 w-5 text-(--warning)" />
                                </div>
                                <div class="stack-v">
                                    <p class="text-sm font-bold text-(--text)">
                                        Verify your email address
                                    </p>
                                    <p class="text-xs text-(--text-secondary) leading-relaxed">
                                        High-trust features require a verified account. Check your
                                        inbox for the link.
                                    </p>
                                    <div class="mt-2 stack-h gap-sm">
                                        <HoverButton
                                            type="button"
                                            class="btn-primary"
                                            onClick={() => void handleSendVerificationEmail()}
                                            disabled={sendingVerificationEmail}
                                            style="height:30px;padding:0 12px;font-size:11px;"
                                        >
                                            {sendingVerificationEmail
                                                ? 'Sending...'
                                                : 'Send verification email'}
                                        </HoverButton>
                                    </div>
                                    {verificationEmailFeedback && (
                                        <p
                                            class="text-xs mt-2"
                                            style={`color:${verificationEmailFeedback.type === 'success' ? 'var(--success)' : 'var(--danger)'};`}
                                        >
                                            {verificationEmailFeedback.message}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div class="mx-4">
                    <WeatherAlert />
                </div>
                {activeIncidents.length > 0 && (
                    <IncidentBanner
                        incident={activeIncidents[0]}
                        onClick={() => setSelectedIncident(activeIncidents[0])}
                    />
                )}
                <HeroAlert />
                {view === 'feed' ? (
                    <LiveFeed
                        radiusFilter={radius}
                        pulseLimit={limit}
                        crisisFilter={crisisFilter}
                    />
                ) : (
                    <div class="stack-v mt-3 flex-1 min-h-[55dvh]">
                        <PulseMap expanded radiusFilter={radius} pulseLimit={limit} />
                    </div>
                )}
            </div>

            {showPostForm && <NeedPostingForm onClose={closePostForm} />}

            <BatterySaverDialog
                open={shouldShowDialog}
                battery={battery}
                onRequestExclusion={requestWakeLock}
                onDismiss={dismissDialog}
            />

            {selectedIncident && (
                <IncidentOverlay
                    incident={selectedIncident}
                    onClose={() => setSelectedIncident(null)}
                />
            )}
        </AppLayout>
    );
}

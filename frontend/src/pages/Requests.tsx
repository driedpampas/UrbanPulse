import { AppLayout } from '../components/Layout/AppLayout';
import { AcceptedRequestsSection } from '../components/Requests/AcceptedRequestsSection';
import { PostedPulsesSection } from '../components/Requests/PostedPulsesSection';
import { useRequestsData } from '../hooks/useRequestsData';

export function Requests() {
    const {
        myPulses,
        acceptedByMe,
        interactionsByPulse,
        expandedPulseId,
        loading,
        error,
        loadingInteractionsFor,
        confirmingInteractionId,
        solvingPulseId,
        togglePulseDetails,
        handleConfirmHelper,
        handleMarkPulseSolved,
    } = useRequestsData();

    return (
        <AppLayout title="Requests">
            <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
                {loading && (
                    <div
                        class="card"
                        style="padding:16px;font-size:13px;color:var(--text-secondary);"
                    >
                        Loading request dashboard...
                    </div>
                )}

                {error && (
                    <div style="padding:12px 14px;border-radius:8px;background:var(--danger-subtle);border:1px solid var(--type-emergency-border);color:var(--danger);font-size:13px;">
                        {error}
                    </div>
                )}

                {!loading && !error && (
                    <>
                        <PostedPulsesSection
                            myPulses={myPulses}
                            expandedPulseId={expandedPulseId}
                            interactionsByPulse={interactionsByPulse}
                            loadingInteractionsFor={loadingInteractionsFor}
                            confirmingInteractionId={confirmingInteractionId}
                            solvingPulseId={solvingPulseId}
                            onTogglePulseDetails={togglePulseDetails}
                            onConfirmHelper={handleConfirmHelper}
                            onMarkPulseSolved={handleMarkPulseSolved}
                        />

                        <AcceptedRequestsSection acceptedByMe={acceptedByMe} />
                    </>
                )}
            </div>
        </AppLayout>
    );
}

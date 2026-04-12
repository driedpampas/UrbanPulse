import { useCallback, useEffect, useState } from 'preact/hooks';
import {
    confirmPulseInteraction,
    fetchAcceptedPulseInteractions,
    fetchMyPostedPulses,
    fetchPulseInteractions,
    markPulseSolved,
} from '../lib/apiClients';
import type { AcceptedInteraction, AuthorPulseRequest, PulseInteraction } from '../types';

export function useRequestsData() {
    const [myPulses, setMyPulses] = useState<AuthorPulseRequest[]>([]);
    const [acceptedByMe, setAcceptedByMe] = useState<AcceptedInteraction[]>([]);
    const [interactionsByPulse, setInteractionsByPulse] = useState<
        Record<string, PulseInteraction[]>
    >({});
    const [expandedPulseId, setExpandedPulseId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loadingInteractionsFor, setLoadingInteractionsFor] = useState<string | null>(null);
    const [confirmingInteractionId, setConfirmingInteractionId] = useState<string | null>(null);
    const [solvingPulseId, setSolvingPulseId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        Promise.all([fetchMyPostedPulses(50, 0), fetchAcceptedPulseInteractions(50, 0)])
            .then(([postedPulses, accepted]) => {
                if (cancelled) return;
                setMyPulses(postedPulses);
                setAcceptedByMe(accepted);
            })
            .catch((apiError) => {
                if (!cancelled) {
                    setError(
                        apiError instanceof Error ? apiError.message : 'Failed to load requests.'
                    );
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const togglePulseDetails = useCallback(
        async (pulseId: string) => {
            if (expandedPulseId === pulseId) {
                setExpandedPulseId(null);
                return;
            }

            setExpandedPulseId(pulseId);
            if (interactionsByPulse[pulseId]) {
                return;
            }

            setLoadingInteractionsFor(pulseId);
            try {
                const interactions = await fetchPulseInteractions(pulseId);
                setInteractionsByPulse((current) => ({ ...current, [pulseId]: interactions }));
            } catch (apiError) {
                alert(
                    apiError instanceof Error
                        ? apiError.message
                        : 'Could not load accepted helpers.'
                );
            } finally {
                setLoadingInteractionsFor(null);
            }
        },
        [expandedPulseId, interactionsByPulse]
    );

    const handleConfirmHelper = useCallback(
        async (pulseId: string, interactionId: string) => {
            if (confirmingInteractionId) {
                return;
            }

            setConfirmingInteractionId(interactionId);
            try {
                const updated = await confirmPulseInteraction(pulseId, interactionId);

                setInteractionsByPulse((current) => ({
                    ...current,
                    [pulseId]: (current[pulseId] ?? []).map((interaction) =>
                        interaction.id === interactionId ? updated : interaction
                    ),
                }));

                setMyPulses((current) =>
                    current.map((pulse) =>
                        pulse.id === pulseId
                            ? {
                                  ...pulse,
                                  successfulCount: pulse.successfulCount + 1,
                              }
                            : pulse
                    )
                );
            } catch (apiError) {
                alert(apiError instanceof Error ? apiError.message : 'Could not confirm helper.');
            } finally {
                setConfirmingInteractionId(null);
            }
        },
        [confirmingInteractionId]
    );

    const handleMarkPulseSolved = useCallback(
        async (pulseId: string) => {
            if (solvingPulseId) {
                return;
            }

            setSolvingPulseId(pulseId);
            try {
                const updatedPulse = await markPulseSolved(pulseId);

                setMyPulses((current) =>
                    current.map((pulse) =>
                        pulse.id === pulseId
                            ? {
                                  ...pulse,
                                  isSolved: updatedPulse.isSolved,
                                  isEmergency: updatedPulse.isEmergency,
                              }
                            : pulse
                    )
                );

                setAcceptedByMe((current) =>
                    current.map((entry) =>
                        entry.pulse.id === pulseId
                            ? {
                                  ...entry,
                                  pulse: {
                                      ...entry.pulse,
                                      isSolved: true,
                                  },
                              }
                            : entry
                    )
                );
            } catch (apiError) {
                alert(apiError instanceof Error ? apiError.message : 'Could not mark solved.');
            } finally {
                setSolvingPulseId(null);
            }
        },
        [solvingPulseId]
    );

    return {
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
    };
}

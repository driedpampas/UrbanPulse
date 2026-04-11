import { CheckCircle, Clock, UserCheck, Users } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import {
    confirmPulseInteraction,
    fetchAcceptedPulseInteractions,
    fetchMyPostedPulses,
    fetchPulseInteractions,
} from '../lib/pulseApi';
import type { AcceptedInteraction, AuthorPulseRequest, PulseInteraction } from '../lib/types';
import { HoverButton } from '../components/ui/HoverButton';

function timeAgo(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export function Requests() {
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

    useEffect(() => {
        let cancelled = false;

        Promise.all([fetchMyPostedPulses(50, 0), fetchAcceptedPulseInteractions(50, 0)])
            .then(([postedPulses, accepted]) => {
                if (cancelled) {
                    return;
                }
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

    const togglePulseDetails = async (pulseId: string) => {
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
                apiError instanceof Error ? apiError.message : 'Could not load accepted helpers.'
            );
        } finally {
            setLoadingInteractionsFor(null);
        }
    };

    const handleConfirmHelper = async (pulseId: string, interactionId: string) => {
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
                current.map((pulse) => {
                    if (pulse.id !== pulseId) {
                        return pulse;
                    }

                    return {
                        ...pulse,
                        successfulCount: pulse.successfulCount + 1,
                    };
                })
            );
        } catch (apiError) {
            alert(apiError instanceof Error ? apiError.message : 'Could not confirm helper.');
        } finally {
            setConfirmingInteractionId(null);
        }
    };

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
                        <section
                            class="card"
                            style="padding:14px;display:flex;flex-direction:column;gap:10px;"
                        >
                            <div style="display:flex;align-items:center;gap:7px;">
                                <Users size={14} style="color:var(--accent);" />
                                <h2 style="margin:0;font-size:13px;color:var(--text);">
                                    My Posted Pulses
                                </h2>
                            </div>

                            {myPulses.length === 0 && (
                                <p style="margin:0;font-size:12px;color:var(--text-tertiary);">
                                    You have not posted any pulses yet.
                                </p>
                            )}

                            {myPulses.map((pulse) => {
                                const expanded = expandedPulseId === pulse.id;
                                const interactions = interactionsByPulse[pulse.id] ?? [];

                                return (
                                    <article
                                        key={pulse.id}
                                        style="padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-raised);display:flex;flex-direction:column;gap:8px;"
                                    >
                                        <p style="margin:0;font-size:13px;color:var(--text);line-height:1.5;">
                                            {pulse.content}
                                        </p>

                                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                            <span style="font-size:11px;color:var(--text-tertiary);display:inline-flex;align-items:center;gap:4px;">
                                                <UserCheck size={10} />
                                                {pulse.acceptedCount} accepted
                                            </span>
                                            <span style="font-size:11px;color:var(--text-tertiary);display:inline-flex;align-items:center;gap:4px;">
                                                <CheckCircle size={10} />
                                                {pulse.successfulCount} successful
                                            </span>
                                            <span style="font-size:11px;color:var(--text-tertiary);display:inline-flex;align-items:center;gap:4px;">
                                                <Clock size={10} />
                                                {timeAgo(pulse.timestamp)}
                                            </span>
                                            <HoverButton
                                                type="button"
                                                onClick={() => void togglePulseDetails(pulse.id)}
                                                style="margin-left:auto;font-size:11px;font-weight:700;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;"
                                            >
                                                {expanded ? 'Hide helpers' : 'View helpers'}
                                            </HoverButton>
                                        </div>

                                        {expanded && (
                                            <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px;border-top:1px solid var(--border);">
                                                {loadingInteractionsFor === pulse.id && (
                                                    <p style="margin:0;font-size:11px;color:var(--text-secondary);">
                                                        Loading accepted helpers...
                                                    </p>
                                                )}

                                                {loadingInteractionsFor !== pulse.id &&
                                                    interactions.length === 0 && (
                                                        <p style="margin:0;font-size:11px;color:var(--text-tertiary);">
                                                            No helpers accepted this pulse yet.
                                                        </p>
                                                    )}

                                                {interactions.map((interaction) => (
                                                    <div
                                                        key={interaction.id}
                                                        style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 8px;border-radius:8px;background:var(--bg-subtle);"
                                                    >
                                                        <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                                                            <span style="font-size:12px;font-weight:600;color:var(--text);">
                                                                {interaction.helperName}
                                                            </span>
                                                            <span style="font-size:10px;color:var(--text-tertiary);">
                                                                {interaction.status === 'successful'
                                                                    ? `Confirmed • +${interaction.trustAwarded} trust awarded`
                                                                    : 'Accepted and waiting for your confirmation'}
                                                            </span>
                                                        </div>

                                                        {interaction.status === 'accepted' ? (
                                                            <HoverButton
                                                                type="button"
                                                                onClick={() =>
                                                                    void handleConfirmHelper(
                                                                        pulse.id,
                                                                        interaction.id
                                                                    )
                                                                }
                                                                disabled={
                                                                    confirmingInteractionId ===
                                                                    interaction.id
                                                                }
                                                                class="btn-primary"
                                                                style="height:28px;padding:0 10px;font-size:11px;white-space:nowrap;"
                                                            >
                                                                {confirmingInteractionId ===
                                                                interaction.id
                                                                    ? 'Confirming...'
                                                                    : 'Mark Success'}
                                                            </HoverButton>
                                                        ) : (
                                                            <span style="font-size:11px;font-weight:700;color:var(--success);white-space:nowrap;">
                                                                Successful
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </section>

                        <section
                            class="card"
                            style="padding:14px;display:flex;flex-direction:column;gap:10px;"
                        >
                            <div style="display:flex;align-items:center;gap:7px;">
                                <CheckCircle size={14} style="color:var(--success);" />
                                <h2 style="margin:0;font-size:13px;color:var(--text);">
                                    Requests I Accepted
                                </h2>
                            </div>

                            {acceptedByMe.length === 0 && (
                                <p style="margin:0;font-size:12px;color:var(--text-tertiary);">
                                    You have not accepted any requests yet.
                                </p>
                            )}

                            {acceptedByMe.map((entry) => (
                                <article
                                    key={entry.interaction.id}
                                    style="padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-raised);display:flex;flex-direction:column;gap:6px;"
                                >
                                    <p style="margin:0;font-size:13px;color:var(--text);line-height:1.5;">
                                        {entry.pulse.content}
                                    </p>
                                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                        <span style="font-size:11px;color:var(--text-tertiary);">
                                            Author: {entry.author.name}
                                        </span>
                                        <span style="font-size:11px;color:var(--text-tertiary);">
                                            Accepted {timeAgo(entry.interaction.acceptedAt)}
                                        </span>
                                        {entry.interaction.status === 'successful' ? (
                                            <span style="font-size:11px;font-weight:700;color:var(--success);margin-left:auto;">
                                                Successful (+{entry.interaction.trustAwarded} trust)
                                            </span>
                                        ) : (
                                            <span style="font-size:11px;font-weight:700;color:var(--warning);margin-left:auto;">
                                                Waiting author confirmation
                                            </span>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </section>
                    </>
                )}
            </div>
        </AppLayout>
    );
}

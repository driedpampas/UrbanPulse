import { CheckCircle, Clock, UserCheck, Users } from 'lucide-preact';
import { memo } from 'preact/compat';
import { useState } from 'preact/hooks';
import type { AuthorPulseRequest, PulseInteraction } from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { HoverButton } from '../ui/HoverButton';
import { timeAgo } from './requests.utils';

type Props = {
    myPulses: AuthorPulseRequest[];
    expandedPulseId: string | null;
    interactionsByPulse: Record<string, PulseInteraction[]>;
    loadingInteractionsFor: string | null;
    confirmingInteractionId: string | null;
    solvingPulseId: string | null;
    onTogglePulseDetails: (pulseId: string) => Promise<void>;
    onConfirmHelper: (pulseId: string, interactionId: string) => Promise<void>;
    onMarkPulseSolved: (pulseId: string) => Promise<void>;
    canManageActions?: boolean;
};

function PostedPulsesSectionComponent({
    myPulses,
    expandedPulseId,
    interactionsByPulse,
    loadingInteractionsFor,
    confirmingInteractionId,
    solvingPulseId,
    onTogglePulseDetails,
    onConfirmHelper,
    onMarkPulseSolved,
    canManageActions = true,
}: Props) {
    const [confirmSolvePulseId, setConfirmSolvePulseId] = useState<string | null>(null);
    const confirmSolvePulse =
        confirmSolvePulseId !== null
            ? myPulses.find((pulse) => pulse.id === confirmSolvePulseId) ?? null
            : null;

    return (
        <section class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:7px;">
                <Users size={14} style="color:var(--accent);" />
                <h2 style="margin:0;font-size:13px;color:var(--text);">My Posted Requests</h2>
            </div>

            {myPulses.length === 0 && (
                <p style="margin:0;font-size:12px;color:var(--text-tertiary);">
                    You have not posted any requests yet.
                </p>
            )}

            {myPulses.map((pulse) => {
                const expanded = expandedPulseId === pulse.id;
                const interactions = interactionsByPulse[pulse.id] ?? [];
                const canSolvePulse = pulse.type !== 'update' && pulse.successfulCount > 0;
                const canConfirmInteraction = pulse.type === 'need' && !pulse.isSolved;

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
                            {pulse.isSolved && (
                                <span style="font-size:11px;font-weight:700;color:var(--success);">
                                    Solved
                                </span>
                            )}
                            {canManageActions && canSolvePulse && !pulse.isSolved && (
                                <HoverButton
                                    type="button"
                                    onClick={() => setConfirmSolvePulseId(pulse.id)}
                                    disabled={solvingPulseId === pulse.id}
                                    class="btn-ghost"
                                    style="height:26px;padding:0 8px;font-size:11px;"
                                >
                                    {solvingPulseId === pulse.id ? 'Solving...' : 'Mark solved'}
                                </HoverButton>
                            )}
                            {!canManageActions && (
                                <span style="font-size:11px;color:var(--text-tertiary);font-style:italic;">
                                    Success and solve actions are handled by admins/mods.
                                </span>
                            )}
                            <HoverButton
                                type="button"
                                onClick={() => void onTogglePulseDetails(pulse.id)}
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

                                        {interaction.status === 'accepted' && canManageActions ? (
                                            <HoverButton
                                                type="button"
                                                onClick={() =>
                                                    void onConfirmHelper(pulse.id, interaction.id)
                                                }
                                                disabled={
                                                    confirmingInteractionId === interaction.id ||
                                                    !canConfirmInteraction
                                                }
                                                class="btn-primary"
                                                style="height:28px;padding:0 10px;font-size:11px;white-space:nowrap;"
                                            >
                                                {confirmingInteractionId === interaction.id
                                                    ? 'Confirming...'
                                                    : 'Mark Success'}
                                            </HoverButton>
                                        ) : interaction.status === 'accepted' ? (
                                            <span style="font-size:11px;font-weight:600;color:var(--text-tertiary);white-space:nowrap;">
                                                Admin only
                                            </span>
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

            <ConfirmDialog
                open={canManageActions && confirmSolvePulseId !== null}
                title="Mark pulse as solved"
                message={
                    confirmSolvePulse
                        ? `Mark this pulse as solved? This will close the request and disable further success confirmations.\n\n"${confirmSolvePulse.content}"`
                        : 'Mark this pulse as solved? This will close the request and disable further success confirmations.'
                }
                confirmLabel="Mark Solved"
                destructive={false}
                busy={Boolean(confirmSolvePulseId && solvingPulseId === confirmSolvePulseId)}
                onCancel={() => setConfirmSolvePulseId(null)}
                onConfirm={async () => {
                    if (!confirmSolvePulseId) {
                        return;
                    }

                    await onMarkPulseSolved(confirmSolvePulseId);
                    setConfirmSolvePulseId(null);
                }}
            />
        </section>
    );
}

export const PostedPulsesSection = memo(PostedPulsesSectionComponent);

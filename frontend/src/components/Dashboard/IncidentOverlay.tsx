import { Check, Info, Users, X } from 'lucide-preact';
import { useCallback, useState } from 'preact/hooks';
import { type GroupedIncident, type IncidentFeedItem, voteOnIncident } from '../../lib/incidentApi';
import { HoverButton } from '../ui/HoverButton';
import { UserAvatar } from '../ui/UserAvatar';

interface Props {
    group: GroupedIncident;
    onClose: () => void;
}

interface VoteState {
    voting: boolean;
    feedback: string | null;
}

function IncidentSection({
    incident,
    showHeader,
}: {
    incident: IncidentFeedItem;
    showHeader: boolean;
}) {
    const [voteState, setVoteState] = useState<VoteState>({ voting: false, feedback: null });

    const handleVote = useCallback(
        async (approved: boolean) => {
            setVoteState({ voting: true, feedback: null });
            try {
                const success = await voteOnIncident(incident.id, approved);
                if (success) {
                    setVoteState({
                        voting: false,
                        feedback: approved ? 'Thank you for confirming.' : 'Report submitted.',
                    });
                } else {
                    setVoteState({ voting: false, feedback: 'Unable to submit vote.' });
                }
            } catch {
                setVoteState({ voting: false, feedback: 'Network error.' });
            }
        },
        [incident.id]
    );

    return (
        <div class="stack-v gap-md">
            {showHeader && (
                <div class="stack-h gap-sm items-center">
                    <div class="h-px flex-1 bg-(--border)" />
                    <div class="stack-h gap-xs text-xs text-(--text-tertiary) shrink-0">
                        <Users size={12} />
                        <span>
                            {incident.reports.length} report
                            {incident.reports.length === 1 ? '' : 's'}
                        </span>
                        <span>·</span>
                        <span class="font-bold text-(--danger)">
                            {Math.round(incident.confidenceScore)}%
                        </span>
                    </div>
                    <div class="h-px flex-1 bg-(--border)" />
                </div>
            )}

            {/* Community Reports */}
            <div class="stack-v gap-md">
                {!showHeader && <p class="label-caps text-(--text-tertiary)">Community Reports</p>}
                {incident.reports.map((report, idx) => (
                    <div
                        key={idx}
                        class="p-4 rounded-xl border border-(--border) bg-(--bg-muted)/30 stack-v gap-sm"
                    >
                        <div class="stack-h gap-md">
                            <UserAvatar
                                userId={report.userId}
                                fallbackSrc=""
                                alt={`${report.userName} avatar`}
                                className="w-8 h-8 rounded-full border border-(--border)"
                            />
                            <div class="stack-v">
                                <p class="text-sm font-bold text-(--text)">
                                    {report.userName || 'Anonymous neighbor'}
                                </p>
                                <p class="text-[10px] text-(--text-tertiary) uppercase tracking-wider">
                                    {new Date(report.createdAt).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </p>
                            </div>
                        </div>
                        <div class="stack-v gap-xs">
                            <p class="text-sm font-bold text-(--text)">{report.title}</p>
                            <p class="text-sm text-(--text-secondary) leading-relaxed">
                                {report.description}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Per-incident vote row */}
            <div class="stack-v gap-sm">
                <p class="text-center text-xs font-bold text-(--text)">
                    Is this incident still occurring?
                </p>
                <div class="stack-h gap-md">
                    <HoverButton
                        disabled={voteState.voting}
                        onClick={() => void handleVote(true)}
                        class="btn-primary flex-1 h-10 rounded-xl bg-(--danger) hover:bg-(--danger)/90 border-none shadow-lg shadow-(--danger)/20 text-sm"
                    >
                        <Check size={16} />
                        Still happening
                    </HoverButton>
                    <HoverButton
                        disabled={voteState.voting}
                        onClick={() => void handleVote(false)}
                        class="btn-ghost flex-1 h-10 rounded-xl border-(--border) bg-(--surface) font-bold text-sm"
                    >
                        <X size={16} />
                        It's over
                    </HoverButton>
                </div>
                {voteState.feedback && (
                    <p class="text-center text-xs font-medium text-(--accent) animate-fade-in">
                        {voteState.feedback}
                    </p>
                )}
            </div>
        </div>
    );
}

export function IncidentOverlay({ group, onClose }: Props) {
    const multi = group.incidents.length > 1;

    return (
        <div
            id="incident-overlay"
            class="modal-overlay flex-center p-4 animate-fade-in"
            style="background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 200;"
        >
            <div
                class="modal-content w-full max-w-lg bg-(--surface) border border-(--border) rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') onClose();
                }}
                role="dialog"
                aria-modal="true"
            >
                {/* Header */}
                <div class="px-5 py-4 border-b border-(--border) flex-between bg-(--bg-muted)/50">
                    <div class="stack-h gap-sm">
                        <div class="p-1.5 rounded-lg bg-(--danger-subtle) text-(--danger)">
                            <Info size={18} />
                        </div>
                        <span class="font-bold text-(--text)">Incident Details</span>
                    </div>
                    <HoverButton onClick={onClose} class="btn-icon">
                        <X size={18} />
                    </HoverButton>
                </div>

                {/* Body */}
                <div class="p-5 max-h-[70vh] overflow-y-auto">
                    <div class="stack-v gap-lg">
                        {/* Summary */}
                        <div class="stack-v gap-xs">
                            <h2 class="text-xl font-extrabold text-(--text) tracking-tight">
                                {group.typeLabel}
                            </h2>
                            <div class="stack-h gap-sm text-sm text-(--text-secondary)">
                                <span class="stack-h gap-xs">
                                    <Users size={14} />
                                    {group.totalReports} report
                                    {group.totalReports === 1 ? '' : 's'}
                                </span>
                                {multi && (
                                    <>
                                        <span>·</span>
                                        <span>{group.incidents.length} active incidents</span>
                                    </>
                                )}
                                <span>•</span>
                                <span class="font-bold text-(--danger)">
                                    Confidence: {Math.round(group.maxConfidenceScore)}%
                                </span>
                            </div>
                        </div>

                        {/* Incident sections */}
                        {group.incidents.map((incident, idx) => (
                            <IncidentSection
                                key={incident.id}
                                incident={incident}
                                showHeader={multi && idx > 0}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

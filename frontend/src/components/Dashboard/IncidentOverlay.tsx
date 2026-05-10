import { Check, Info, Users, X } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { type IncidentFeedItem, voteOnIncident } from '../../lib/incidentApi';
import { HoverButton } from '../ui/HoverButton';
import { UserAvatar } from '../ui/UserAvatar';

interface Props {
    incident: IncidentFeedItem;
    onClose: () => void;
}

export function IncidentOverlay({ incident, onClose }: Props) {
    const [voting, setVoting] = useState<boolean>(false);
    const [voteFeedback, setVoteFeedback] = useState<string | null>(null);

    const handleVote = async (approved: boolean) => {
        setVoting(true);
        setVoteFeedback(null);
        try {
            const success = await voteOnIncident(incident.id, approved);
            if (success) {
                setVoteFeedback(approved ? 'Thank you for confirming.' : 'Report submitted.');
                setTimeout(onClose, 1500);
            } else {
                setVoteFeedback('Unable to submit vote.');
            }
        } catch {
            setVoteFeedback('Network error.');
        } finally {
            setVoting(false);
        }
    };

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
                                {incident.typeLabel}
                            </h2>
                            <div class="stack-h gap-sm text-sm text-(--text-secondary)">
                                <span class="stack-h gap-xs">
                                    <Users size={14} />
                                    {incident.reports.length} report
                                    {incident.reports.length === 1 ? '' : 's'}
                                </span>
                                <span>•</span>
                                <span class="font-bold text-(--danger)">
                                    Confidence: {Math.round(incident.confidenceScore * 100)}%
                                </span>
                            </div>
                        </div>

                        {/* User Reports */}
                        <div class="stack-v gap-md">
                            <p class="label-caps text-(--text-tertiary)">Community Reports</p>
                            <div class="stack-v gap-md">
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
                                                    {new Date(report.createdAt).toLocaleTimeString(
                                                        [],
                                                        { hour: '2-digit', minute: '2-digit' }
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div class="stack-v gap-xs">
                                            <p class="text-sm font-bold text-(--text)">
                                                {report.title}
                                            </p>
                                            <p class="text-sm text-(--text-secondary) leading-relaxed">
                                                {report.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer / Actions */}
                <div class="p-5 bg-(--bg-muted)/20 border-t border-(--border) stack-v gap-md">
                    <p class="text-center text-sm font-bold text-(--text)">
                        Is this incident still occurring?
                    </p>
                    <div class="stack-h gap-md">
                        <HoverButton
                            disabled={voting}
                            onClick={() => handleVote(true)}
                            class="btn-primary flex-1 h-12 rounded-xl bg-(--danger) hover:bg-(--danger)/90 border-none shadow-lg shadow-(--danger)/20"
                        >
                            <Check size={18} />
                            Still happening
                        </HoverButton>
                        <HoverButton
                            disabled={voting}
                            onClick={() => handleVote(false)}
                            class="btn-ghost flex-1 h-12 rounded-xl border-(--border) bg-(--surface) font-bold"
                        >
                            <X size={18} />
                            It's over
                        </HoverButton>
                    </div>
                    {voteFeedback && (
                        <p class="text-center text-xs font-medium text-(--accent) animate-fade-in">
                            {voteFeedback}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

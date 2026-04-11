import { AlertTriangle, Send, X } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { createReport } from '../../lib/reportsApi';
import { HoverButton } from '../ui/HoverButton';

const REASONS = ['Spam', 'Harassment', 'Inappropriate content', 'False information', 'Other'];

interface Props {
    targetId: string;
    targetType: 'pulse' | 'user' | 'message';
    contentSnippet: string;
    onClose: () => void;
}

export function ReportModal({ targetId, targetType, contentSnippet, onClose }: Props) {
    const [reason, setReason] = useState(REASONS[0]);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSending(true);
        setError(null);

        try {
            await createReport({
                targetId,
                targetType,
                reason: reason!,
                content: contentSnippet,
            });
            onClose();
            alert('Thank you. The report has been submitted to the moderators.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit report.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Report content"
            style="position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);padding:20px;"
        >
            <div style="position:absolute;inset:0;" onClick={onClose} aria-hidden="true" />

            <div
                class="card animate-scale-in"
                style="position:relative;width:100%;max-width:400px;padding:24px;display:flex;flex-direction:column;gap:16px;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);"
            >
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <h2 style="margin:0;font-size:18px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px;">
                        <AlertTriangle size={18} style="color:var(--warning);" />
                        Report Content
                    </h2>
                    <HoverButton
                        type="button"
                        class="btn-icon"
                        onClick={onClose}
                        aria-label="Close"
                        style="color:var(--text-secondary);"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <X size={18} />
                    </HoverButton>
                </div>

                <div style="padding:12px;border-radius:8px;background:var(--bg-muted);border:1px solid var(--border);">
                    <p style="margin:0;font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:4px;">
                        Reported {targetType}
                    </p>
                    <p style="margin:0;font-size:13px;color:var(--text-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;">
                        "{contentSnippet}"
                    </p>
                </div>

                <form onSubmit={handleSubmit} style="display:flex;flex-direction:column;gap:14px;">
                    <div>
                        <label style="display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;">
                            Reason for reporting
                        </label>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            {REASONS.map((r) => (
                                <HoverButton
                                    key={r}
                                    type="button"
                                    onClick={() => setReason(r)}
                                    style={`
                                        display:flex;align-items:center;gap:10px;padding:10px 14px;
                                        border-radius:10px;border:1px solid ${reason === r ? 'var(--accent)' : 'var(--border)'};
                                        background:${reason === r ? 'var(--accent-subtle)' : 'var(--bg-subtle)'};
                                        color:${reason === r ? 'var(--accent)' : 'var(--text-secondary)'};
                                        font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;
                                        text-align:left;
                                    `}
                                    onMouseEnter={(e) =>
                                        ((e.target as HTMLElement).style.filter =
                                            'var(--hover-brightness)')
                                    }
                                    onMouseLeave={(e) =>
                                        ((e.target as HTMLElement).style.filter = 'none')
                                    }
                                >
                                    <div
                                        style={`width:12px;height:12px;border-radius:50%;border:2px solid ${reason === r ? 'var(--accent)' : 'var(--border-strong)'};background:${reason === r ? 'var(--accent)' : 'transparent'};box-shadow:${reason === r ? '0 0 0 2px var(--accent-subtle)' : 'none'};`}
                                    />
                                    {r}
                                </HoverButton>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <p style="margin:0;padding:8px 12px;border-radius:6px;background:var(--danger-subtle);color:var(--danger);font-size:12px;border:1px solid var(--type-emergency-border);">
                            {error}
                        </p>
                    )}

                    <HoverButton
                        type="submit"
                        disabled={sending}
                        class="btn-primary"
                        style="width:100%;height:42px;font-size:14px;background:var(--accent);color:white;border-radius:10px;margin-top:4px;"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        {sending ? (
                            'Submitting…'
                        ) : (
                            <>
                                <Send size={14} />
                                Submit Report
                            </>
                        )}
                    </HoverButton>
                </form>
            </div>
        </div>
    );
}

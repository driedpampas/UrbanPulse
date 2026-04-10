import {
    AlertTriangle,
    MapPin,
    MessageSquare,
    Package,
    PawPrint,
    Send,
    Wrench,
    X,
} from 'lucide-preact';
import { useState } from 'preact/hooks';
import { postPulse } from '../../lib/pulseApi';
import type { Pulse } from '../../lib/types';

const TYPES: { val: Pulse['type']; label: string; icon: typeof AlertTriangle; css: string }[] = [
    { val: 'update', label: 'Update', icon: MessageSquare, css: 'update' },
    { val: 'emergency', label: 'Emergency', icon: AlertTriangle, css: 'emergency' },
    { val: 'skill', label: 'Skill', icon: Wrench, css: 'skill' },
    { val: 'item', label: 'Item', icon: Package, css: 'item' },
    { val: 'pet', label: 'Pet alert', icon: PawPrint, css: 'pet' },
];

const MAX = 280;

interface Props {
    onClose: () => void;
}

export function NeedPostingForm({ onClose }: Props) {
    const [type, setType] = useState<Pulse['type']>('update');
    const [content, setContent] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const left = MAX - content.length;

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!content.trim() || left < 0) return;
        setSending(true);
        setError(null);
        try {
            await postPulse({ type, content, lat: 40.7128, lng: -74.006 });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to post pulse.');
        } finally {
            setSending(false);
        }
    };

    return (
        /* Overlay */
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Post a pulse"
            style="position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);"
        >
            {/* Tap-outside to close */}
            <div style="position:absolute;inset:0;" onClick={onClose} aria-hidden="true" />

            {/* Sheet */}
            <div
                class="animate-slide-up"
                style={`
					position:relative;
					width:100%;
					max-width:680px;
					background:var(--surface);
					border:1px solid var(--border);
					border-bottom:none;
					border-radius:14px 14px 0 0;
					box-shadow:0 -8px 40px rgba(0,0,0,0.2);
					padding:20px 20px 28px;
				`}
            >
                {/* Header */}
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                    <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.01em;">
                        Post a Pulse
                    </p>
                    <button
                        type="button"
                        class="btn-icon"
                        onClick={onClose}
                        aria-label="Close"
                        style="color:var(--text-secondary);"
                    >
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Type pills */}
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
                        {TYPES.map((t) => {
                            const Icon = t.icon;
                            const active = type === t.val;
                            return (
                                <button
                                    key={t.val}
                                    type="button"
                                    onClick={() => setType(t.val)}
                                    style={`
										display:inline-flex;align-items:center;gap:5px;
										padding:4px 10px;border-radius:6px;border:1px solid;
										font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;
										${
                                            active
                                                ? `background:var(--type-${t.css}-bg);color:var(--type-${t.css}-text);border-color:var(--type-${t.css}-border);`
                                                : 'background:transparent;color:var(--text-tertiary);border-color:var(--border);'
                                        }
									`}
                                >
                                    <Icon size={11} />
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Textarea */}
                    <div style="position:relative;">
                        <textarea
                            value={content}
                            onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
                            placeholder="What's happening in your neighborhood?"
                            class="input-field"
                            style="height:100px;resize:none;padding-bottom:28px;font-family:inherit;font-size:13px;line-height:1.6;"
                            maxLength={MAX + 20}
                            onFocus={(e) => {
                                const el = e.target as HTMLElement;
                                el.style.borderColor = 'var(--border-focus)';
                                el.style.boxShadow = '0 0 0 3px var(--accent-muted)';
                            }}
                            onBlur={(e) => {
                                const el = e.target as HTMLElement;
                                el.style.borderColor = 'var(--border)';
                                el.style.boxShadow = 'none';
                            }}
                        />
                        <span
                            style={`
								position:absolute;right:10px;bottom:10px;
								font-size:11px;font-variant-numeric:tabular-nums;
								color:${left < 0 ? 'var(--danger)' : left < 40 ? 'var(--warning)' : 'var(--text-tertiary)'};
							`}
                        >
                            {left}
                        </span>
                    </div>

                    {/* Location note */}
                    <p style="font-size:11px;color:var(--text-tertiary);margin:8px 0 0;display:flex;align-items:center;gap:4px;">
                        <MapPin size={10} />
                        Location auto-detected from your profile
                    </p>

                    {error && (
                        <p style="margin:10px 0 0;padding:8px 12px;border-radius:6px;background:var(--danger-subtle);color:var(--danger);font-size:12px;border:1px solid var(--type-emergency-border);">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        id="post-pulse-submit"
                        disabled={!content.trim() || sending || left < 0}
                        class="btn-primary"
                        style="margin-top:14px;width:100%;height:38px;font-size:13px;background:var(--accent);border-radius:8px;opacity:1;"
                    >
                        <Send size={13} />
                        {sending ? 'Posting…' : 'Post Pulse'}
                    </button>
                </form>
            </div>
        </div>
    );
}

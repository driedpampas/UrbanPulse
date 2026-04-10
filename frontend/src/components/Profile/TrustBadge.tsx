import { CheckCircle, Star } from 'lucide-preact';

interface Props {
    score: number;
    verified: boolean;
    compact?: boolean;
}

export function TrustBadge({ score, verified, compact = false }: Props) {
    const color =
        score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--text-tertiary)';
    const bg =
        score >= 90
            ? 'var(--success-subtle)'
            : score >= 70
              ? 'var(--warning-subtle)'
              : 'var(--bg-muted)';

    if (compact) {
        return (
            <div style="display:inline-flex;align-items:center;gap:4px;">
                {verified && <CheckCircle size={12} style="color:var(--success);" />}
                <span
                    style={`font-size:11px;font-weight:700;color:${color};font-variant-numeric:tabular-nums;`}
                >
                    {score}
                </span>
            </div>
        );
    }

    return (
        <div style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span
                style={`display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:${bg};color:${color};`}
            >
                <Star size={10} fill="currentColor" />
                {score}
            </span>
            {verified && (
                <span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--success);">
                    <CheckCircle size={11} />
                    Verified
                </span>
            )}
        </div>
    );
}

import { CheckCircle, Star } from 'lucide-preact';

interface Props {
    score: number;
    verified: boolean;
    compact?: boolean;
}

export function TrustBadge({ score, verified, compact = false }: Props) {
    const color =
        score >= 90 ? 'text-secondary' : score >= 70 ? 'text-accent' : 'text-text-secondary';
    const bgColor = score >= 90 ? 'bg-secondary/10' : score >= 70 ? 'bg-accent/10' : 'bg-gray-100';

    if (compact) {
        return (
            <div class="flex items-center gap-1">
                {verified && <CheckCircle size={14} class="text-secondary" />}
                <span class={`text-xs font-semibold ${color}`}>{score}</span>
            </div>
        );
    }

    return (
        <div class="flex items-center gap-2">
            <div class={`flex items-center gap-1 px-2.5 py-1 rounded-full ${bgColor}`}>
                <Star size={14} class={color} fill="currentColor" />
                <span class={`text-sm font-bold ${color}`}>{score}</span>
            </div>
            {verified && (
                <span class="flex items-center gap-1 text-xs font-medium text-secondary bg-secondary/10 px-2 py-1 rounded-full">
                    <CheckCircle size={12} /> Verified Neighbor
                </span>
            )}
        </div>
    );
}

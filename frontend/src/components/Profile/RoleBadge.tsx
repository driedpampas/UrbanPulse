import { ShieldCheck } from 'lucide-preact';

interface Props {
    role: string;
    compact?: boolean;
}

export function RoleBadge({ role, compact = false }: Props) {
    const n = role.toLowerCase();
    if (n !== 'admin' && n !== 'mod' && n !== 'banned') return null;

    const label = n === 'admin' ? 'Admin' : n === 'mod' ? 'Mod' : 'Banned';
    const color =
        n === 'admin' ? 'var(--accent)' : n === 'mod' ? 'var(--warning)' : 'var(--danger)';
    const bg =
        n === 'admin'
            ? 'var(--accent-subtle)'
            : n === 'mod'
              ? 'var(--warning-subtle)'
              : 'var(--danger-subtle)';

    if (compact) {
        return (
            <span
                style={`display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:${color};`}
            >
                <ShieldCheck size={11} />
                {label}
            </span>
        );
    }

    return (
        <span
            style={`display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;background:${bg};color:${color};`}
        >
            <ShieldCheck size={10} />
            {label}
        </span>
    );
}

import { ShieldCheck } from 'lucide-preact';

interface Props {
    role: string;
    compact?: boolean;
}

export function RoleBadge({ role, compact = false }: Props) {
    const normalizedRole = role.toLowerCase();
    const isAdmin = normalizedRole === 'admin';
    const isMod = normalizedRole === 'mod';

    if (!isAdmin && !isMod) {
        return null;
    }

    const label = isAdmin ? 'Admin' : 'Moderator';
    const color = isAdmin ? 'text-primary' : 'text-accent';
    const bgColor = isAdmin ? 'bg-primary/10' : 'bg-accent/10';
    const borderColor = isAdmin ? 'border-primary/20' : 'border-accent/20';

    if (compact) {
        return (
            <span class={`flex items-center gap-1 text-xs font-semibold ${color}`}>
                <ShieldCheck size={12} /> {label}
            </span>
        );
    }

    return (
        <span
            class={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${color} ${bgColor} ${borderColor}`}
        >
            <ShieldCheck size={12} /> {label}
        </span>
    );
}

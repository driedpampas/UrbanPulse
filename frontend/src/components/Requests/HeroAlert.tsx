import { AlertTriangle, ShieldAlert, Zap } from 'lucide-preact';
import { HoverButton } from '../ui/HoverButton';

interface Props {
    type: 'skill' | 'need' | 'emergency';
    userName: string;
    skill: string;
    onRespond?: () => void;
    onDismiss?: () => void;
}

export function HeroAlert({ type, userName, skill, onRespond, onDismiss }: Props) {
    const configs = {
        skill: {
            bg: 'bg-primary/10 border-primary/30',
            text: 'text-primary',
            label: 'Hero Alert!',
            Icon: ShieldAlert,
        },
        need: {
            bg: 'bg-accent/10 border-accent/30',
            text: 'text-accent',
            label: 'Help Needed',
            Icon: Zap,
        },
        emergency: {
            bg: 'bg-danger/10 border-danger/30',
            text: 'text-danger',
            label: 'Emergency',
            Icon: AlertTriangle,
        },
    };
    const cfg = configs[type];
    const LabelIcon = cfg.Icon;

    return (
        <div class={`mx-4 mt-2 p-4 rounded-2xl border ${cfg.bg} animate-fade-up`}>
            <p class={`text-xs font-bold ${cfg.text} mb-1 flex items-center gap-1`}>
                <LabelIcon size={12} />
                {cfg.label}
            </p>
            <p class="text-sm font-medium">
                {userName} needs someone with <span class="font-bold">{skill}</span> skills!
            </p>
            <div class="flex gap-2 mt-3">
                <HoverButton
                    type="button"
                    onClick={onRespond}
                    class="flex-1 bg-linear-to-r from-primary to-primary-dark text-white text-xs py-2 rounded-xl font-semibold"
                    onMouseEnter={(e) =>
                        ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                    }
                    onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                >
                    I can help!
                </HoverButton>
                <HoverButton
                    type="button"
                    onClick={onDismiss}
                    class="px-4 text-xs text-text-secondary border border-border rounded-xl hover:bg-surface-dim transition-colors"
                    onMouseEnter={(e) =>
                        ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                    }
                    onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                >
                    Later
                </HoverButton>
            </div>
        </div>
    );
}

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
            label: '🦸 Hero Alert!',
        },
        need: { bg: 'bg-accent/10 border-accent/30', text: 'text-accent', label: '💪 Help Needed' },
        emergency: {
            bg: 'bg-danger/10 border-danger/30',
            text: 'text-danger',
            label: '🚨 Emergency',
        },
    };
    const cfg = configs[type];

    return (
        <div class={`mx-4 mt-2 p-4 rounded-2xl border ${cfg.bg} animate-fade-up`}>
            <p class={`text-xs font-bold ${cfg.text} mb-1`}>{cfg.label}</p>
            <p class="text-sm font-medium">
                {userName} needs someone with <span class="font-bold">{skill}</span> skills!
            </p>
            <div class="flex gap-2 mt-3">
                <button
                    type="button"
                    onClick={onRespond}
                    class="flex-1 bg-linear-to-r from-primary to-primary-dark text-white text-xs py-2 rounded-xl font-semibold"
                >
                    I can help!
                </button>
                <button
                    type="button"
                    onClick={onDismiss}
                    class="px-4 text-xs text-text-secondary border border-border rounded-xl hover:bg-surface-dim transition-colors"
                >
                    Later
                </button>
            </div>
        </div>
    );
}

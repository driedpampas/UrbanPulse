import {
    AlertTriangle,
    CheckCircle,
    Clock,
    Heart,
    MessageSquare,
    Package,
    PawPrint,
    Wrench,
} from 'lucide-preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { connectWebSocket, disconnectWebSocket, fetchPulses } from '../../lib/mockApi';
import type { Pulse } from '../../lib/types';

const typeConfig: Record<
    string,
    { color: string; bg: string; icon: typeof AlertTriangle; label: string }
> = {
    emergency: {
        color: 'text-danger',
        bg: 'bg-danger/10',
        icon: AlertTriangle,
        label: 'Emergency',
    },
    skill: { color: 'text-primary', bg: 'bg-primary/10', icon: Wrench, label: 'Skill' },
    item: { color: 'text-secondary', bg: 'bg-secondary/10', icon: Package, label: 'Item' },
    need: { color: 'text-accent', bg: 'bg-accent/10', icon: Heart, label: 'Need' },
    pet: { color: 'text-pink-500', bg: 'bg-pink-500/10', icon: PawPrint, label: 'Pet' },
    update: {
        color: 'text-text-secondary',
        bg: 'bg-gray-100',
        icon: MessageSquare,
        label: 'Update',
    },
};

function timeAgo(ts: number) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

interface Props {
    radiusFilter: number;
}

export function LiveFeed(_props: Props) {
    const [pulses, setPulses] = useState<Pulse[]>([]);
    const [loading, setLoading] = useState(true);
    const [newPulseFlash, setNewPulseFlash] = useState<string | null>(null);
    const clearFlashTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        fetchPulses().then((data) => {
            setPulses(data);
            setLoading(false);
        });
    }, []);

    const handleWS = useCallback((pulse: Pulse) => {
        setPulses((prev) => [pulse, ...prev]);
        setNewPulseFlash(pulse.id);

        if (clearFlashTimeoutRef.current !== null) {
            window.clearTimeout(clearFlashTimeoutRef.current);
        }

        clearFlashTimeoutRef.current = window.setTimeout(() => {
            setNewPulseFlash((current) => (current === pulse.id ? null : current));
            clearFlashTimeoutRef.current = null;
        }, 2000);
    }, []);

    useEffect(() => {
        connectWebSocket(handleWS);
        return () => {
            disconnectWebSocket(handleWS);

            if (clearFlashTimeoutRef.current !== null) {
                window.clearTimeout(clearFlashTimeoutRef.current);
            }
        };
    }, [handleWS]);

    if (loading) {
        return (
            <div class="px-4 space-y-3 mt-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} class="glass rounded-2xl p-4 animate-pulse">
                        <div class="flex gap-3">
                            <div class="w-10 h-10 rounded-full bg-surface-dim" />
                            <div class="flex-1 space-y-2">
                                <div class="h-3 bg-surface-dim rounded w-1/3" />
                                <div class="h-3 bg-surface-dim rounded w-full" />
                                <div class="h-3 bg-surface-dim rounded w-2/3" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div class="px-4 space-y-3 mt-3">
            {pulses.map((pulse, i) => {
                const cfg = typeConfig[pulse.type] || typeConfig.update;
                const Icon = cfg.icon;
                const isNew = pulse.id === newPulseFlash;
                const isVerified = pulse.verified || pulse.confirmations >= 3;

                return (
                    <div
                        key={pulse.id}
                        class="relative animate-fade-up"
                        style={{ animationDelay: `${i * 60}ms` }}
                    >
                        {isNew && (
                            <div
                                aria-hidden="true"
                                class="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-primary/50 animate-pulse-glow"
                            />
                        )}
                        <div
                            class={`glass rounded-2xl p-4 transition-all duration-500 ${
                                pulse.type === 'emergency' ? 'border-l-4 border-l-danger' : ''
                            }`}
                        >
                            <div class="flex gap-3">
                                <img
                                    src={pulse.userAvatar}
                                    alt=""
                                    class="w-10 h-10 rounded-full bg-surface-dim shrink-0"
                                />
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-semibold text-sm">{pulse.userName}</span>
                                        <span class="flex items-center gap-1">
                                            <span
                                                class={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
                                            >
                                                <Icon size={10} class="inline -mt-0.5 mr-0.5" />
                                                {cfg.label}
                                            </span>
                                            {isVerified && (
                                                <span class="text-[10px] text-secondary flex items-center gap-0.5">
                                                    <CheckCircle size={10} /> Verified
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <p class="text-sm mt-1.5 text-text leading-relaxed">
                                        {pulse.content}
                                    </p>
                                    <div class="flex items-center gap-3 mt-2 text-[11px] text-text-secondary">
                                        <span class="flex items-center gap-1">
                                            <Clock size={11} />
                                            {timeAgo(pulse.timestamp)}
                                        </span>
                                        {pulse.confirmations > 0 && (
                                            <span class="flex items-center gap-1">
                                                <CheckCircle size={11} />
                                                {pulse.confirmations} confirmed
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

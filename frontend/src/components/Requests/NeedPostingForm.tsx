import { AlertTriangle, Heart, Package, PawPrint, Send, Wrench, X } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { postPulse } from '../../lib/mockApi';
import type { Pulse } from '../../lib/types';

const TYPES = [
    { val: 'need' as const, label: 'Need', icon: Heart, color: 'text-accent' },
    { val: 'emergency' as const, label: 'Emergency', icon: AlertTriangle, color: 'text-danger' },
    { val: 'skill' as const, label: 'Skill Offer', icon: Wrench, color: 'text-primary' },
    { val: 'item' as const, label: 'Item', icon: Package, color: 'text-secondary' },
    { val: 'pet' as const, label: 'Pet Alert', icon: PawPrint, color: 'text-pink-500' },
];

interface Props {
    onClose: () => void;
}

export function NeedPostingForm({ onClose }: Props) {
    const [type, setType] = useState<Pulse['type']>('need');
    const [content, setContent] = useState('');
    const [sending, setSending] = useState(false);

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!content.trim()) return;
        setSending(true);
        await postPulse({
            userId: 'me',
            userName: 'Alex Rivera',
            userAvatar: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Felix',
            type,
            content,
            lat: 40.7128,
            lng: -74.006,
        });
        setSending(false);
        onClose();
    };

    return (
        <div
            class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
        >
            <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 animate-fade-up shadow-2xl">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-lg font-bold">Post a Pulse</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        class="p-1 rounded-full hover:bg-surface-dim transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div class="flex gap-2 flex-wrap mb-4">
                        {TYPES.map((t) => {
                            const Icon = t.icon;
                            return (
                                <button
                                    key={t.val}
                                    type="button"
                                    onClick={() => setType(t.val)}
                                    class={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                                        type === t.val
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border text-text-secondary hover:border-primary/30'
                                    }`}
                                >
                                    <Icon size={12} /> {t.label}
                                </button>
                            );
                        })}
                    </div>

                    <textarea
                        value={content}
                        onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
                        placeholder="What's happening in the neighborhood?"
                        class="w-full h-28 rounded-2xl border border-border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                    />

                    <button
                        type="submit"
                        disabled={!content.trim() || sending}
                        class="mt-3 w-full bg-linear-to-r from-primary to-primary-dark text-white py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity shadow-lg"
                    >
                        <Send size={16} /> {sending ? 'Posting…' : 'Post Pulse'}
                    </button>
                </form>
            </div>
        </div>
    );
}

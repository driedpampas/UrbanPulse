import { CheckCircle, Flag, Shield, Users, XCircle } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { fetchFlags, fetchUsers, resolveFlag } from '../lib/mockApi';
import type { AdminFlag, User } from '../lib/types';

export function AdminDashboard() {
    const [flags, setFlags] = useState<AdminFlag[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'flags' | 'users'>('flags');

    useEffect(() => {
        Promise.all([fetchFlags(), fetchUsers()]).then(([f, u]) => {
            setFlags(f);
            setUsers(u);
            setLoading(false);
        });
    }, []);

    const handleResolve = async (id: string, status: 'resolved' | 'dismissed') => {
        await resolveFlag(id, status);
        setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    };

    const statusColors: Record<string, string> = {
        pending: 'bg-accent/10 text-accent',
        resolved: 'bg-secondary/10 text-secondary',
        dismissed: 'bg-gray-100 text-text-secondary',
    };

    return (
        <AppLayout title="Admin">
            <div class="p-4 space-y-3">
                <div class="flex glass rounded-xl p-0.5 gap-0.5">
                    <button
                        type="button"
                        onClick={() => setTab('flags')}
                        class={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                            tab === 'flags'
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-text-secondary'
                        }`}
                    >
                        <Flag size={14} /> Flagged (
                        {flags.filter((f) => f.status === 'pending').length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('users')}
                        class={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                            tab === 'users'
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-text-secondary'
                        }`}
                    >
                        <Users size={14} /> Users ({users.length})
                    </button>
                </div>

                {loading ? (
                    [1, 2, 3].map((i) => (
                        <div key={i} class="glass rounded-2xl p-4 animate-pulse h-20" />
                    ))
                ) : tab === 'flags' ? (
                    flags.length === 0 ? (
                        <div class="text-center py-16 text-text-secondary">
                            <Shield size={32} class="mx-auto mb-2 opacity-40" />
                            <p class="text-sm">No flagged content</p>
                        </div>
                    ) : (
                        flags.map((flag, i) => (
                            <div
                                key={flag.id}
                                class="glass rounded-2xl p-4 animate-fade-up"
                                style={{ animationDelay: `${i * 60}ms` }}
                            >
                                <div class="flex items-start justify-between gap-2">
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <span
                                                class={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColors[flag.status]}`}
                                            >
                                                {flag.status}
                                            </span>
                                            <span class="text-[10px] text-text-secondary capitalize">
                                                {flag.targetType}
                                            </span>
                                        </div>
                                        <p class="text-sm font-medium mt-1.5">{flag.reason}</p>
                                        <p class="text-xs text-text-secondary mt-1 bg-surface-dim/60 rounded-lg p-2 line-clamp-2">
                                            {flag.content}
                                        </p>
                                    </div>
                                    {flag.status === 'pending' && (
                                        <div class="flex gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleResolve(flag.id, 'resolved')}
                                                class="p-2 rounded-xl bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors"
                                                title="Resolve"
                                            >
                                                <CheckCircle size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleResolve(flag.id, 'dismissed')}
                                                class="p-2 rounded-xl bg-gray-100 text-text-secondary hover:bg-gray-200 transition-colors"
                                                title="Dismiss"
                                            >
                                                <XCircle size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )
                ) : (
                    users.map((user, i) => (
                        <div
                            key={user.id}
                            class="glass rounded-2xl p-4 flex items-center gap-3 animate-fade-up"
                            style={{ animationDelay: `${i * 60}ms` }}
                        >
                            <img
                                src={user.avatar}
                                alt=""
                                class="w-10 h-10 rounded-full bg-surface-dim"
                            />
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <p class="font-semibold text-sm">{user.name}</p>
                                    {user.verified && (
                                        <CheckCircle size={12} class="text-secondary" />
                                    )}
                                </div>
                                <p class="text-xs text-text-secondary truncate">{user.bio}</p>
                            </div>
                            <div class="flex items-center gap-1 text-xs text-text-secondary">
                                <span class="font-semibold">{user.trustScore}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </AppLayout>
    );
}

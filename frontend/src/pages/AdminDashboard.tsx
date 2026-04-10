import { CheckCircle, Flag, Shield, Users, XCircle } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { fetchFlags, resolveFlag } from '../lib/mockApi';
import type { AdminFlag, User } from '../lib/types';
import { fetchUsers } from '../lib/userApi';

const TAB_BTN = (active: boolean) => `
    flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
    padding:6px 12px;border-radius:6px;border:none;
    font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
    transition:all 0.15s;
    ${
        active
            ? 'background:var(--surface-raised);color:var(--text);box-shadow:var(--shadow-sm);'
            : 'background:transparent;color:var(--text-tertiary);'
    }
`;

const STATUS_STYLE: Record<string, string> = {
    pending:
        'background:var(--accent-subtle);color:var(--accent);border-color:var(--accent-muted);',
    resolved:
        'background:var(--success-subtle);color:var(--success);border-color:rgba(74,222,128,0.2);',
    dismissed: 'background:var(--bg-muted);color:var(--text-tertiary);border-color:var(--border);',
};

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

    const pendingCount = flags.filter((f) => f.status === 'pending').length;

    return (
        <AppLayout title="Admin">
            <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
                {/* Tab strip */}
                <div style="display:flex;gap:0;padding:3px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);">
                    <button
                        type="button"
                        onClick={() => setTab('flags')}
                        style={TAB_BTN(tab === 'flags')}
                    >
                        <Flag size={13} />
                        Flagged ({pendingCount})
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('users')}
                        style={TAB_BTN(tab === 'users')}
                    >
                        <Users size={13} />
                        Users ({users.length})
                    </button>
                </div>

                {/* Content */}
                {loading ? (
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                style="height:80px;border-radius:10px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                            />
                        ))}
                    </div>
                ) : tab === 'flags' ? (
                    flags.length === 0 ? (
                        <div style="padding:48px 24px;text-align:center;border:1px solid var(--border);border-radius:10px;background:var(--surface);">
                            <Shield
                                size={28}
                                style="color:var(--text-tertiary);margin:0 auto 8px;"
                            />
                            <p style="font-size:13px;color:var(--text-secondary);margin:0;">
                                No flagged content
                            </p>
                        </div>
                    ) : (
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            {flags.map((flag, i) => (
                                <div
                                    key={flag.id}
                                    class="card animate-slide-up"
                                    style={`padding:14px 16px;animation-delay:${i * 50}ms;`}
                                >
                                    <div style="display:flex;align-items:flex-start;gap:12px;">
                                        <div style="flex:1;min-width:0;">
                                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
                                                <span
                                                    class="type-badge"
                                                    style={
                                                        STATUS_STYLE[flag.status] ??
                                                        STATUS_STYLE.dismissed
                                                    }
                                                >
                                                    {flag.status}
                                                </span>
                                                <span style="font-size:11px;color:var(--text-tertiary);text-transform:capitalize;">
                                                    {flag.targetType}
                                                </span>
                                            </div>
                                            <p style="font-size:13px;font-weight:600;color:var(--text);margin:0 0 6px;">
                                                {flag.reason}
                                            </p>
                                            <p style="font-size:11px;color:var(--text-secondary);margin:0;padding:8px 10px;border-radius:6px;background:var(--bg-subtle);border:1px solid var(--border);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                                                {flag.content}
                                            </p>
                                        </div>

                                        {flag.status === 'pending' && (
                                            <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleResolve(flag.id, 'resolved')
                                                    }
                                                    class="btn-icon"
                                                    title="Resolve"
                                                    style="color:var(--success);background:var(--success-subtle);width:30px;height:30px;"
                                                >
                                                    <CheckCircle size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleResolve(flag.id, 'dismissed')
                                                    }
                                                    class="btn-icon"
                                                    title="Dismiss"
                                                    style="color:var(--text-tertiary);background:var(--bg-muted);width:30px;height:30px;"
                                                >
                                                    <XCircle size={15} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        {users.map((user, i) => (
                            <div
                                key={user.id}
                                class="card animate-slide-up"
                                style={`padding:12px 14px;display:flex;align-items:center;gap:12px;animation-delay:${i * 40}ms;`}
                            >
                                <img
                                    src={user.avatar}
                                    alt=""
                                    style="width:36px;height:36px;border-radius:50%;border:1px solid var(--border);object-fit:cover;flex-shrink:0;background:var(--bg-muted);"
                                />
                                <div style="flex:1;min-width:0;">
                                    <div style="display:flex;align-items:center;gap:6px;">
                                        <span style="font-size:13px;font-weight:600;color:var(--text);">
                                            {user.name}
                                        </span>
                                        {user.verified && (
                                            <CheckCircle
                                                size={12}
                                                style="color:var(--success);flex-shrink:0;"
                                            />
                                        )}
                                    </div>
                                    <p style="font-size:11px;color:var(--text-tertiary);margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                        {user.bio}
                                    </p>
                                </div>
                                <span style="font-size:12px;font-weight:700;color:var(--text-secondary);flex-shrink:0;font-variant-numeric:tabular-nums;">
                                    {user.trustScore}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

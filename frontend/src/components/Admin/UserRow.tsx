import { ShieldCheck, ShieldX, Slash, Trash2 } from 'lucide-preact';
import { memo, useState } from 'preact/compat';
import { Link } from 'wouter';
import type { User } from '../../types';
import { HoverButton } from '../ui/HoverButton';
import { UserAvatar } from '../ui/UserAvatar';

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

type Props = {
    user: User;
    onSetRole: (userId: string, role: 'admin' | 'mod' | 'user' | 'banned') => void | Promise<void>;
    onDelete: (userId: string) => void | Promise<void>;
};

function UserRowComponent({ user, onSetRole, onDelete }: Props) {
    const role = user.role?.toLowerCase() ?? 'user';
    const [busy, setBusy] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const isAdmin = role === 'admin';

    const setRole = async (nextRole: 'admin' | 'mod' | 'user' | 'banned') => {
        setBusy(true);
        try {
            await onSetRole(user.id, nextRole);
            setShowActions(false);
        } finally {
            setBusy(false);
        }
    };

    const deleteUser = async () => {
        setBusy(true);
        try {
            await onDelete(user.id);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            style={`${surfaceCard};padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;`}
        >
            <Link
                href={`/profile?userId=${encodeURIComponent(user.id)}`}
                style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;text-decoration:none;"
            >
                <div style="width:40px;height:40px;border-radius:12px;overflow:hidden;background:var(--bg-muted);flex-shrink:0;">
                    <UserAvatar
                        userId={user.id}
                        fallbackSrc={user.avatar}
                        alt={`${user.name} profile picture`}
                        style="width:100%;height:100%;object-fit:cover;"
                    />
                </div>
                <div style="min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="font-size:13px;font-weight:700;color:var(--text);">
                            {user.name}
                        </span>
                        <span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--accent-subtle);color:var(--accent);text-transform:uppercase;">
                            {role}
                        </span>
                    </div>
                    <p style="margin:3px 0 0;font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34rem;">
                        {user.email ?? 'No email available'}
                    </p>
                </div>
            </Link>
            <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;justify-content:flex-end;align-items:center;">
                {showActions ? (
                    <div
                        style="display:flex;gap:4px;align-items:center;background:var(--bg-muted);padding:4px;border-radius:10px;border:1px solid var(--border);"
                        class="animate-fade-in"
                    >
                        {role !== 'admin' && (
                            <HoverButton
                                type="button"
                                disabled={busy}
                                onClick={() => void setRole('admin')}
                                style="width:32px;height:32px;border-radius:8px;border:none;background:var(--accent-subtle);color:var(--accent);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                                aria-label="Make Admin"
                                title="Make Admin"
                            >
                                <ShieldCheck size={14} />
                            </HoverButton>
                        )}
                        {role !== 'mod' && (
                            <HoverButton
                                type="button"
                                disabled={busy}
                                onClick={() => void setRole('mod')}
                                style="width:32px;height:32px;border-radius:8px;border:none;background:var(--warning-subtle);color:var(--warning);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                                aria-label={isAdmin ? 'Demote to Mod' : 'Make Mod'}
                                title={isAdmin ? 'Demote to Mod' : 'Make Mod'}
                            >
                                {isAdmin ? <ShieldX size={14} /> : <ShieldCheck size={14} />}
                            </HoverButton>
                        )}
                        {role !== 'user' && (
                            <HoverButton
                                type="button"
                                disabled={busy}
                                onClick={() => void setRole('user')}
                                style="width:32px;height:32px;border-radius:8px;border:none;background:var(--bg-subtle);color:var(--text-tertiary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                                aria-label="Demote to User"
                                title="Demote to User"
                            >
                                <ShieldX size={14} />
                            </HoverButton>
                        )}
                        {role !== 'banned' && (
                            <HoverButton
                                type="button"
                                disabled={busy}
                                onClick={() => void setRole('banned')}
                                style="width:32px;height:32px;border-radius:8px;border:none;background:var(--danger-subtle);color:var(--danger);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                                aria-label="Ban User"
                                title="Ban User"
                            >
                                <Slash size={14} />
                            </HoverButton>
                        )}
                        <HoverButton
                            type="button"
                            onClick={() => setShowActions(false)}
                            style="width:32px;height:32px;border-radius:8px;border:none;background:none;color:var(--text-tertiary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;"
                            aria-label="Cancel"
                        >
                            ×
                        </HoverButton>
                    </div>
                ) : (
                    <HoverButton
                        type="button"
                        onClick={() => setShowActions(true)}
                        style="height:34px;padding:0 12px;border-radius:10px;border:1px solid var(--accent-muted);background:var(--accent-subtle);color:var(--accent);cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;"
                    >
                        <ShieldCheck size={14} />
                        Manage
                    </HoverButton>
                )}

                <HoverButton
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteUser()}
                    style="width:34px;height:34px;border-radius:10px;border:none;background:var(--bg-muted);color:var(--text-tertiary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                    aria-label="Schedule deletion"
                    title="Schedule deletion"
                >
                    <Trash2 size={14} />
                </HoverButton>
            </div>
        </div>
    );
}

export const UserRow = memo(UserRowComponent);

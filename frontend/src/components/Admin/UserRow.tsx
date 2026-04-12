import { Ban, CheckCircle, Shield, Trash2 } from 'lucide-preact';
import { memo, useState } from 'preact/compat';
import type { User } from '../../types';
import { HoverButton } from '../ui/HoverButton';

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

type Props = {
    user: User;
    onSetRole: (
        userId: string,
        role: 'admin' | 'mod' | 'resident' | 'banned'
    ) => void | Promise<void>;
    onDelete: (userId: string) => void | Promise<void>;
};

function UserRowComponent({ user, onSetRole, onDelete }: Props) {
    const role = user.role?.toLowerCase() ?? 'resident';
    const [busy, setBusy] = useState(false);
    const isAdmin = role === 'admin';
    const isMod = role === 'mod';

    const setRole = async (nextRole: 'admin' | 'mod' | 'resident' | 'banned') => {
        setBusy(true);
        try {
            await onSetRole(user.id, nextRole);
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
            <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                <div style="width:40px;height:40px;border-radius:12px;overflow:hidden;background:var(--bg-muted);flex-shrink:0;">
                    <img
                        src={user.avatar}
                        alt=""
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
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;justify-content:flex-end;">
                <HoverButton
                    type="button"
                    disabled={busy || isAdmin}
                    onClick={() => void setRole('admin')}
                    style="width:34px;height:34px;border-radius:10px;border:none;background:var(--accent-subtle);color:var(--accent);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                    aria-label="Promote to admin"
                    title="Promote to admin"
                >
                    <Shield size={14} />
                </HoverButton>
                <HoverButton
                    type="button"
                    disabled={busy || isAdmin || isMod}
                    onClick={() => void setRole('mod')}
                    style="width:34px;height:34px;border-radius:10px;border:none;background:var(--warning-subtle);color:var(--warning);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                    aria-label="Promote to mod"
                    title="Promote to mod"
                >
                    <Shield size={14} />
                </HoverButton>
                <HoverButton
                    type="button"
                    disabled={busy || isAdmin || role === 'resident'}
                    onClick={() => void setRole('resident')}
                    style="width:34px;height:34px;border-radius:10px;border:none;background:var(--bg-muted);color:var(--text-tertiary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                    aria-label="Demote user"
                    title="Demote user"
                >
                    <CheckCircle size={14} />
                </HoverButton>
                <HoverButton
                    type="button"
                    disabled={busy || isAdmin}
                    onClick={() => void setRole('banned')}
                    style="width:34px;height:34px;border-radius:10px;border:none;background:var(--danger-subtle);color:var(--danger);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                    aria-label="Ban user"
                    title="Ban user"
                >
                    <Ban size={14} />
                </HoverButton>
                <HoverButton
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteUser()}
                    style="width:34px;height:34px;border-radius:10px;border:none;background:var(--bg-muted);color:var(--text-tertiary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"
                    aria-label="Delete user"
                    title="Delete user"
                >
                    <Trash2 size={14} />
                </HoverButton>
            </div>
        </div>
    );
}

export const UserRow = memo(UserRowComponent);

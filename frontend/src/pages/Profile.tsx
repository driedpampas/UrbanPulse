import { Ban, CalendarDays, LogOut, MapPin, MessageSquare, Moon, Pencil, Plus, Save, Trash2, X } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { AppLayout } from '../components/Layout/AppLayout';
import { RoleBadge } from '../components/Profile/RoleBadge';
import { TrustBadge } from '../components/Profile/TrustBadge';
import { blockUser, fetchBlockedUserIds, startDirectConversation, unblockUser } from '../lib/chatApi';
import { useAuth } from '../lib/auth';
import type { User } from '../lib/types';
import { deleteAccount, fetchCurrentUser, fetchUserById, updateProfile } from '../lib/userApi';

const DAYS = [
    { v: 0, s: 'Sun' },
    { v: 1, s: 'Mon' },
    { v: 2, s: 'Tue' },
    { v: 3, s: 'Wed' },
    { v: 4, s: 'Thu' },
    { v: 5, s: 'Fri' },
    { v: 6, s: 'Sat' },
];

function normDays(days: Array<number | string> | undefined): number[] {
    return Array.from(
        new Set((days || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
    ).sort((a, b) => a - b);
}

const S = {
    label: 'display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;letter-spacing:0.01em;text-transform:uppercase;',
    val: 'font-size:13px;color:var(--text);',
    section:
        'border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:hidden;',
    sectionHead:
        'padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;',
    sectionBody: 'padding:16px;display:flex;flex-direction:column;gap:14px;',
    row: 'display:flex;align-items:center;justify-content:space-between;gap:12px;',
    input: 'width:100%;padding:7px 10px;border-radius:7px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color 0.15s,box-shadow 0.15s;',
    textarea:
        'width:100%;padding:8px 10px;border-radius:7px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;resize:none;height:80px;transition:border-color 0.15s,box-shadow 0.15s;',
};

const focusOn = (e: Event) => {
    const el = e.target as HTMLElement;
    el.style.borderColor = 'var(--border-focus)';
    el.style.boxShadow = '0 0 0 3px var(--accent-muted)';
};
const focusOff = (e: Event) => {
    const el = e.target as HTMLElement;
    el.style.borderColor = 'var(--border)';
    el.style.boxShadow = 'none';
};

export function Profile() {
    const [location, setLocation] = useLocation();
    const { logout, session, updateLocalUser } = useAuth();
    const [user, setUser] = useState<User | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Partial<User>>({});
    const [newSkill, setNewSkill] = useState('');
    const [saving, setSaving] = useState(false);
    const [showDel, setShowDel] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);

    const selectedUserId =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('userId') : null;
    const isOwnProfile = !selectedUserId || selectedUserId === session?.user.id;

    useEffect(() => {
        setEditing(false);
        setShowDel(false);

        const loadUser = async () => {
            const loadedUser = isOwnProfile
                ? await fetchCurrentUser()
                : await fetchUserById(selectedUserId!);

            if (!loadedUser) {
                setUser(null);
                return;
            }

            setUser(loadedUser);
            setDraft(loadedUser);

            if (!isOwnProfile && selectedUserId) {
                const blockedUserIds = await fetchBlockedUserIds();
                setBlocked(blockedUserIds.includes(selectedUserId));
            }
        };

        void loadUser();
    }, [location, isOwnProfile, selectedUserId]);

    const handleSave = async () => {
        if (!draft) return;
        setSaving(true);
        const updated = await updateProfile(draft);
        updateLocalUser({ displayName: updated.name });
        setUser(updated);
        setDraft(updated);
        setEditing(false);
        setSaving(false);
    };

    const handleMessageUser = async () => {
        if (!selectedUserId || actionBusy) {
            return;
        }

        setActionBusy(true);
        try {
            const result = await startDirectConversation(selectedUserId);
            setLocation(`/messages?threadId=${encodeURIComponent(result.threadId)}`);
        } catch (error) {
            console.error(error);
            window.alert('Could not open conversation.');
        } finally {
            setActionBusy(false);
        }
    };

    const handleToggleBlock = async () => {
        if (!selectedUserId || actionBusy) {
            return;
        }

        setActionBusy(true);
        try {
            if (blocked) {
                await unblockUser(selectedUserId);
                setBlocked(false);
            } else {
                await blockUser(selectedUserId);
                setBlocked(true);
            }
        } catch (error) {
            console.error(error);
            window.alert('Could not update block status.');
        } finally {
            setActionBusy(false);
        }
    };

    const addSkill = () => {
        if (!newSkill.trim()) return;
        setDraft((d) => ({ ...d, skills: [...(d.skills ?? []), newSkill.trim()] }));
        setNewSkill('');
    };

    const removeSkill = (s: string) =>
        setDraft((d) => ({ ...d, skills: (d.skills ?? []).filter((x) => x !== s) }));

    const toggleDay = (day: number) => {
        setDraft((d) => {
            const cur = normDays(d.quietDays === undefined ? user?.quietDays : d.quietDays);
            const next = cur.includes(day)
                ? cur.filter((x) => x !== day)
                : [...new Set([...cur, day])];
            return { ...d, quietDays: next.sort((a, b) => a - b) };
        });
    };

    const selDays = normDays(draft.quietDays === undefined ? user?.quietDays : draft.quietDays);

    if (!user) {
        return (
            <AppLayout title="Profile">
                <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
                    {[80, 120, 100].map((h, i) => (
                        <div
                            key={i}
                            style={`height:${h}px;border-radius:10px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;animation-delay:${i * 100}ms;`}
                        />
                    ))}
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout
            title="Profile"
            headerRight={
                isOwnProfile && !editing ? (
                    <button
                        type="button"
                        id="edit-profile-btn"
                        class="btn-ghost"
                        onClick={() => {
                            setDraft(user);
                            setEditing(true);
                        }}
                        style="height:30px;font-size:12px;gap:5px;"
                    >
                        <Pencil size={12} />
                        Edit
                    </button>
                ) : undefined
            }
        >
            <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
                {/* Identity card */}
                <div style={S.section} class="animate-slide-up">
                    <div style={S.sectionHead}>
                        <p style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0;">
                            IDENTITY
                        </p>
                    </div>
                    <div style={`${S.sectionBody}flex-direction:row;align-items:flex-start;`}>
                        <img
                            src={user.avatar}
                            alt=""
                            style="width:48px;height:48px;border-radius:8px;border:1px solid var(--border);object-fit:cover;flex-shrink:0;background:var(--bg-muted);"
                        />
                        <div style="flex:1;min-width:0;">
                            {editing ? (
                                <input
                                    value={draft.name ?? ''}
                                    onInput={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            name: (e.target as HTMLInputElement).value,
                                        }))
                                    }
                                    style={S.input}
                                    placeholder="Display name"
                                    onFocus={focusOn}
                                    onBlur={focusOff}
                                />
                            ) : (
                                <>
                                    <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.01em;">
                                        {user.name}
                                    </p>
                                    {isOwnProfile && (
                                        <p style="font-size:12px;color:var(--text-tertiary);margin:2px 0 6px;">
                                            {user.email}
                                        </p>
                                    )}
                                </>
                            )}
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
                                <TrustBadge score={user.trustScore} verified={user.verified} />
                                {user.role && <RoleBadge role={user.role} />}
                            </div>
                        </div>
                    </div>

                    {/* Bio row */}
                    <div style="padding:0 16px 16px;">
                        <p style={S.label}>Bio</p>
                        {editing ? (
                            <textarea
                                value={draft.bio ?? ''}
                                onInput={(e) =>
                                    setDraft((d) => ({
                                        ...d,
                                        bio: (e.target as HTMLTextAreaElement).value,
                                    }))
                                }
                                style={S.textarea}
                                placeholder="Tell your neighbors a bit about yourself…"
                                onFocus={focusOn}
                                onBlur={focusOff}
                            />
                        ) : (
                            <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.55;">
                                {user.bio || (
                                    <span style="color:var(--text-tertiary);font-style:italic;">
                                        No bio set.
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                </div>

                {!isOwnProfile && (
                    <div style="display:flex;gap:8px;">
                        <button
                            type="button"
                            class="btn-primary"
                            onClick={handleMessageUser}
                            disabled={actionBusy}
                            style="flex:1;height:36px;"
                        >
                            <MessageSquare size={14} />
                            Message
                        </button>
                        <button
                            type="button"
                            class="btn-ghost"
                            onClick={handleToggleBlock}
                            disabled={actionBusy}
                            style="flex:1;height:36px;color:var(--danger);border-color:var(--danger-muted);"
                        >
                            <Ban size={14} />
                            {blocked ? 'Unblock' : 'Block'}
                        </button>
                    </div>
                )}

                {/* Skills */}
                <div style={S.section} class="animate-slide-up" style-animation-delay="50ms">
                    <div style={S.sectionHead}>
                        <p style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0;">
                            SKILLS & RESOURCES
                        </p>
                    </div>
                    <div style={S.sectionBody}>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                            {(editing ? draft.skills : user.skills)?.map((skill) => (
                                <span
                                    key={skill}
                                    style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:500;background:var(--accent-subtle);color:var(--accent);border:1px solid var(--accent-muted);"
                                >
                                    {skill}
                                    {editing && (
                                        <button
                                            type="button"
                                            onClick={() => removeSkill(skill)}
                                            style="background:none;border:none;cursor:pointer;padding:0;color:var(--text-tertiary);display:flex;align-items:center;"
                                            aria-label={`Remove ${skill}`}
                                        >
                                            <X size={11} />
                                        </button>
                                    )}
                                </span>
                            ))}
                            {!(editing ? draft.skills : user.skills)?.length && !editing && (
                                <span style="font-size:12px;color:var(--text-tertiary);font-style:italic;">
                                    No skills listed.
                                </span>
                            )}
                            {editing && (
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <input
                                        value={newSkill}
                                        onInput={(e) =>
                                            setNewSkill((e.target as HTMLInputElement).value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addSkill();
                                            }
                                        }}
                                        placeholder="Add skill…"
                                        style="width:100px;padding:3px 10px;border-radius:6px;border:1px dashed var(--border-strong);background:transparent;color:var(--text);font-size:12px;font-family:inherit;outline:none;"
                                        onFocus={(e) =>
                                        ((e.target as HTMLElement).style.borderColor =
                                            'var(--border-focus)')
                                        }
                                        onBlur={(e) =>
                                        ((e.target as HTMLElement).style.borderColor =
                                            'var(--border-strong)')
                                        }
                                    />
                                    <button
                                        type="button"
                                        onClick={addSkill}
                                        class="btn-icon"
                                        style="color:var(--accent);width:28px;height:28px;"
                                        aria-label="Add skill"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Preferences */}
                <div style={S.section} class="animate-slide-up" style-animation-delay="100ms">
                    <div style={S.sectionHead}>
                        <p style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0;">
                            PREFERENCES
                        </p>
                    </div>
                    <div style={S.sectionBody}>
                        {/* Distance limit */}
                        <div style={S.row}>
                            <div style="display:flex;align-items:center;gap:7px;">
                                <MapPin
                                    size={13}
                                    style="color:var(--text-tertiary);flex-shrink:0;"
                                />
                                <span style="font-size:13px;color:var(--text-secondary);">
                                    Distance limit
                                </span>
                            </div>
                            {editing ? (
                                <input
                                    type="number"
                                    value={draft.distanceLimit}
                                    onInput={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            distanceLimit: Number(
                                                (e.target as HTMLInputElement).value
                                            ),
                                        }))
                                    }
                                    style="width:80px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:12px;font-family:inherit;outline:none;text-align:right;"
                                    onFocus={focusOn}
                                    onBlur={focusOff}
                                />
                            ) : (
                                <span style="font-size:13px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;">
                                    {user.distanceLimit} m
                                </span>
                            )}
                        </div>

                        {/* Quiet hours */}
                        <div style={S.row}>
                            <div style="display:flex;align-items:center;gap:7px;">
                                <Moon size={13} style="color:var(--text-tertiary);flex-shrink:0;" />
                                <span style="font-size:13px;color:var(--text-secondary);">
                                    Quiet hours
                                </span>
                            </div>
                            {editing ? (
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <input
                                        type="time"
                                        value={draft.quietHoursStart}
                                        onInput={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                quietHoursStart: (e.target as HTMLInputElement)
                                                    .value,
                                            }))
                                        }
                                        style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:12px;font-family:inherit;outline:none;"
                                        onFocus={focusOn}
                                        onBlur={focusOff}
                                    />
                                    <span style="color:var(--text-tertiary);font-size:12px;">
                                        –
                                    </span>
                                    <input
                                        type="time"
                                        value={draft.quietHoursEnd}
                                        onInput={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                quietHoursEnd: (e.target as HTMLInputElement).value,
                                            }))
                                        }
                                        style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:12px;font-family:inherit;outline:none;"
                                        onFocus={focusOn}
                                        onBlur={focusOff}
                                    />
                                </div>
                            ) : (
                                <span style="font-size:13px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;">
                                    {user.quietHoursStart || '—'} – {user.quietHoursEnd || '—'}
                                </span>
                            )}
                        </div>

                        {/* Quiet days */}
                        <div>
                            <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                                <CalendarDays size={13} style="color:var(--text-tertiary);" />
                                <span style="font-size:13px;color:var(--text-secondary);">
                                    Quiet days
                                </span>
                            </div>
                            <div style="display:flex;flex-wrap:wrap;gap:5px;">
                                {DAYS.map((d) => {
                                    const sel = selDays.includes(d.v);
                                    const active = editing ? sel : user.quietDays?.includes(d.v);
                                    return (
                                        <button
                                            key={d.v}
                                            type="button"
                                            onClick={editing ? () => toggleDay(d.v) : undefined}
                                            aria-pressed={editing ? sel : undefined}
                                            disabled={!editing}
                                            style={`
												padding:4px 10px;border-radius:5px;border:1px solid;
												font-size:12px;font-weight:500;cursor:${editing ? 'pointer' : 'default'};
												transition:all 0.15s;
												${active
                                                    ? 'background:var(--accent-subtle);color:var(--accent);border-color:var(--accent-muted);'
                                                    : 'background:transparent;color:var(--text-tertiary);border-color:var(--border);'
                                                }
											`}
                                        >
                                            {d.s}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Edit action bar */}
                {isOwnProfile && editing && (
                    <div class="animate-fade-in" style="display:flex;gap:8px;">
                        <button
                            type="button"
                            id="save-profile-btn"
                            class="btn-primary"
                            onClick={handleSave}
                            disabled={saving}
                            style="flex:1;height:40px;background:var(--accent);"
                        >
                            <Save size={14} />
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button
                            type="button"
                            class="btn-ghost"
                            onClick={() => {
                                setEditing(false);
                                setDraft(user);
                            }}
                            style="height:40px;padding:0 16px;"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* Sign out */}
                {isOwnProfile && (
                    <>
                        <button
                            type="button"
                            id="sign-out-btn"
                            class="btn-ghost"
                            onClick={() => {
                                logout();
                                setLocation('/auth');
                            }}
                            style="height:38px;width:100%;font-size:13px;color:var(--text-secondary);"
                        >
                            <LogOut size={14} />
                            Sign Out
                        </button>

                        {/* Delete account */}
                        <button
                            type="button"
                            id="delete-account-btn"
                            onClick={() => setShowDel(true)}
                            style="width:100%;height:32px;display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px;font-weight:500;color:var(--text-tertiary);background:none;border:none;cursor:pointer;"
                        >
                            <Trash2 size={12} />
                            Delete Account
                        </button>
                    </>
                )}
            </div>

            {/* Delete confirm */}
            {isOwnProfile && showDel && (
                <div
                    role="dialog"
                    aria-modal="true"
                    style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);"
                >
                    <div
                        class="animate-slide-up"
                        style="width:100%;max-width:340px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:var(--shadow-xl);"
                    >
                        <h3 style="font-size:15px;font-weight:700;color:var(--danger);margin:0 0 6px;">
                            Delete Account?
                        </h3>
                        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 18px;line-height:1.5;">
                            This is permanent. All your pulses and profile data will be removed.
                        </p>
                        <div style="display:flex;gap:8px;">
                            <button
                                type="button"
                                onClick={() => {
                                    deleteAccount();
                                    logout();
                                    setLocation('/auth');
                                }}
                                style="flex:1;height:38px;border-radius:8px;border:none;background:var(--danger);color:#fff;font-size:13px;font-weight:600;cursor:pointer;"
                            >
                                Delete
                            </button>
                            <button
                                type="button"
                                class="btn-ghost"
                                onClick={() => setShowDel(false)}
                                style="flex:1;height:38px;"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}

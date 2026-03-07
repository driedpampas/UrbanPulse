import { MapPin, Moon, Plus, Save, Trash2, X } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { TrustBadge } from '../components/Profile/TrustBadge';
import { deleteAccount, fetchCurrentUser, updateProfile } from '../lib/mockApi';
import type { User } from '../lib/types';

export function Profile() {
    const [user, setUser] = useState<User | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Partial<User>>({});
    const [newSkill, setNewSkill] = useState('');
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        fetchCurrentUser().then((u) => {
            setUser(u);
            setDraft(u);
        });
    }, []);

    const handleSave = async () => {
        if (!draft) return;
        setSaving(true);
        const updated = await updateProfile(draft);
        setUser(updated);
        setDraft(updated);
        setEditing(false);
        setSaving(false);
    };

    const addSkill = () => {
        if (!newSkill.trim()) return;
        setDraft((d) => ({ ...d, skills: [...(d.skills || []), newSkill.trim()] }));
        setNewSkill('');
    };

    const removeSkill = (skill: string) => {
        setDraft((d) => ({ ...d, skills: (d.skills || []).filter((s) => s !== skill) }));
    };

    if (!user) {
        return (
            <AppLayout title="Profile">
                <div class="p-4 space-y-4">
                    <div class="glass rounded-2xl p-6 animate-pulse">
                        <div class="flex items-center gap-4">
                            <div class="w-16 h-16 rounded-full bg-surface-dim" />
                            <div class="space-y-2 flex-1">
                                <div class="h-4 bg-surface-dim rounded w-1/3" />
                                <div class="h-3 bg-surface-dim rounded w-2/3" />
                            </div>
                        </div>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Profile">
            <div class="p-4 space-y-4">
                <div class="glass rounded-2xl p-5 animate-fade-up">
                    <div class="flex items-center gap-4">
                        <img
                            src={user.avatar}
                            alt=""
                            class="w-16 h-16 rounded-full bg-surface-dim ring-2 ring-primary/20"
                        />
                        <div class="flex-1">
                            {editing ? (
                                <input
                                    value={draft.name || ''}
                                    onInput={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            name: (e.target as HTMLInputElement).value,
                                        }))
                                    }
                                    class="text-lg font-bold border-b border-primary/30 focus:outline-none bg-transparent w-full"
                                />
                            ) : (
                                <h2 class="text-lg font-bold">{user.name}</h2>
                            )}
                            <TrustBadge score={user.trustScore} verified={user.verified} />
                        </div>
                    </div>

                    <div class="mt-4">
                        <label class="text-xs font-medium text-text-secondary">
                            Bio
                            {editing ? (
                                <textarea
                                    value={draft.bio || ''}
                                    onInput={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            bio: (e.target as HTMLTextAreaElement).value,
                                        }))
                                    }
                                    class="w-full mt-1 rounded-xl border border-border p-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            ) : (
                                <p class="text-sm mt-1">{user.bio}</p>
                            )}
                        </label>
                    </div>
                </div>

                <div class="glass rounded-2xl p-5 animate-fade-up" style="animation-delay: 100ms">
                    <h3 class="text-sm font-bold flex items-center gap-2 mb-3">Skill Tags</h3>
                    <div class="flex flex-wrap gap-2">
                        {(editing ? draft.skills : user.skills)?.map((skill) => (
                            <span
                                key={skill}
                                class="flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-3 py-1.5 rounded-full"
                            >
                                {skill}
                                {editing && (
                                    <button
                                        type="button"
                                        onClick={() => removeSkill(skill)}
                                        class="hover:text-danger ml-0.5"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </span>
                        ))}
                        {editing && (
                            <div class="flex items-center gap-1">
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
                                    placeholder="Add skill"
                                    class="w-24 text-xs border border-dashed border-primary/30 rounded-full px-3 py-1.5 focus:outline-none"
                                />
                                <button type="button" onClick={addSkill} class="text-primary">
                                    <Plus size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div class="glass rounded-2xl p-5 animate-fade-up" style="animation-delay: 200ms">
                    <h3 class="text-sm font-bold mb-3">Preferences</h3>
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2 text-sm">
                                <MapPin size={14} class="text-text-secondary" /> Distance Limit
                            </div>
                            {editing ? (
                                <input
                                    type="number"
                                    value={draft.distanceLimitKm}
                                    onInput={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            distanceLimitKm: Number(
                                                (e.target as HTMLInputElement).value
                                            ),
                                        }))
                                    }
                                    class="w-16 text-sm text-right border border-border rounded-lg px-2 py-1 focus:outline-none"
                                />
                            ) : (
                                <span class="text-sm text-text-secondary">
                                    {user.distanceLimitKm} km
                                </span>
                            )}
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2 text-sm">
                                <Moon size={14} class="text-text-secondary" /> Quiet Hours
                            </div>
                            {editing ? (
                                <div class="flex items-center gap-1 text-sm">
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
                                        class="border border-border rounded-lg px-2 py-1 text-xs"
                                    />
                                    <span>–</span>
                                    <input
                                        type="time"
                                        value={draft.quietHoursEnd}
                                        onInput={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                quietHoursEnd: (e.target as HTMLInputElement).value,
                                            }))
                                        }
                                        class="border border-border rounded-lg px-2 py-1 text-xs"
                                    />
                                </div>
                            ) : (
                                <span class="text-sm text-text-secondary">
                                    {user.quietHoursStart || '—'} – {user.quietHoursEnd || '—'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div class="flex gap-2">
                    {editing ? (
                        <>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                class="flex-1 bg-linear-to-r from-primary to-primary-dark text-white py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                            >
                                <Save size={16} /> {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditing(false);
                                    setDraft(user);
                                }}
                                class="px-5 border border-border rounded-2xl text-sm"
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            class="flex-1 glass py-3 rounded-2xl font-semibold text-sm hover:bg-primary/5 transition-colors"
                        >
                            Edit Profile
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    class="w-full text-xs text-danger/60 hover:text-danger py-2 transition-colors flex items-center justify-center gap-1"
                >
                    <Trash2 size={12} /> Delete Account
                </button>

                {showDeleteConfirm && (
                    <div
                        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                        role="dialog"
                    >
                        <div class="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-2xl animate-fade-up">
                            <h3 class="text-lg font-bold text-danger mb-2">Delete Account?</h3>
                            <p class="text-sm text-text-secondary mb-4">
                                This action cannot be undone. All your data will be permanently
                                removed.
                            </p>
                            <div class="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        deleteAccount();
                                        setShowDeleteConfirm(false);
                                    }}
                                    class="flex-1 bg-danger text-white py-2.5 rounded-xl font-semibold text-sm"
                                >
                                    Delete
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    class="flex-1 border border-border py-2.5 rounded-xl text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

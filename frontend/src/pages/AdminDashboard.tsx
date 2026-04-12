import { Activity, Flag, LibraryBig, Search, UsersRound } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { LibraryRow } from '../components/Admin/LibraryRow';
import { PulseRow } from '../components/Admin/PulseRow';
import { ReportRow } from '../components/Admin/ReportRow';
import { SectionButton } from '../components/Admin/SectionButton';
import { StatCard } from '../components/Admin/StatCard';
import { UserRow } from '../components/Admin/UserRow';
import { AppLayout } from '../components/Layout/AppLayout';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { HoverButton } from '../components/ui/HoverButton';
import { type AdminSection, useAdminDashboardData } from '../hooks/useAdminDashboardData';
import { useAuth } from '../lib/auth';
import type { LibraryItem } from '../types';

const SECTIONS: Array<{ id: AdminSection; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'users', label: 'Users', icon: UsersRound },
    { id: 'pulses', label: 'Pulses', icon: Search },
    { id: 'library', label: 'Library', icon: LibraryBig },
    { id: 'reports', label: 'Reports', icon: Flag },
];

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

export function AdminDashboard() {
    const { session } = useAuth();
    const {
        section,
        setSection,
        overview,
        users,
        pulses,
        library,
        reports,
        pendingDeletions,
        pulseId,
        userSearch,
        setUserSearch,
        setPulseId,
        loading,
        pulseSearchLoading,
        userSearchLoading,
        usersHasMore,
        usersLoadingMore,
        loadData,
        searchPulse,
        searchUsers,
        loadMoreUsers,
        setUserRole,
        removeUser,
        cancelUserDeletion,
        removePulse,
        changeReportStatus,
        updateLibrary,
        removeLibrary,
        libraryBusyId,
    } = useAdminDashboardData();
    const [confirmation, setConfirmation] = useState<{
        title: string;
        message: string;
        confirmLabel?: string;
        destructive?: boolean;
        onConfirm: () => Promise<void>;
    } | null>(null);
    const [editingLibraryItem, setEditingLibraryItem] = useState<LibraryItem | null>(null);
    const usersSentinelRef = useRef<HTMLDivElement>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimerRef = useRef<number | null>(null);

    const showToast = (message: string) => {
        setToastMessage(message);
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
            setToastMessage(null);
        }, 2400);
    };

    useEffect(() => {
        const target = usersSentinelRef.current;
        if (!target) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) {
                void loadMoreUsers();
            }
        });

        observer.observe(target);
        return () => observer.disconnect();
    }, [loadMoreUsers, section]);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current);
            }
        };
    }, []);

    return (
        <AppLayout title="Admin">
            <div style="padding:16px;display:flex;flex-direction:column;gap:16px;">
                <div
                    style={`${surfaceCard};padding:20px;display:flex;align-items:center;justify-content:space-between;gap:16px;`}
                >
                    <div style="min-width:0;">
                        <h2 style="margin:0;font-size:20px;font-weight:700;color:var(--text);">
                            Admin Dashboard
                        </h2>
                        <p style="margin:4px 0 0;font-size:13px;color:var(--text-secondary);">
                            Internal management and network oversight.
                        </p>
                    </div>
                    <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;background:var(--bg-muted);border:1px solid var(--border);color:var(--text-secondary);font-size:12px;font-weight:600;">
                        Role: {session?.user.role ?? 'Unknown'}
                    </span>
                </div>

                <div style="display:flex;gap:8px;overflow-x:auto;-ms-overflow-style:none;scrollbar-width:none;padding-bottom:4px;">
                    {SECTIONS.map((item) => (
                        <SectionButton
                            key={item.id}
                            active={section === item.id}
                            label={item.label}
                            icon={item.icon}
                            onClick={() => setSection(item.id)}
                        />
                    ))}
                </div>

                {loading ? (
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
                        {[1, 2, 3, 4].map((i) => (
                            <div
                                key={i}
                                style={`${surfaceCard};height:96px;animation:pulse 1.5s ease-in-out infinite;`}
                            />
                        ))}
                    </div>
                ) : (
                    <>
                        {section === 'overview' && overview && (
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
                                <StatCard
                                    label="Users"
                                    value={overview.totalUsers}
                                    hint={`${overview.adminUsers} admins • ${overview.modUsers} mods`}
                                />
                                <StatCard
                                    label="Verified"
                                    value={overview.verifiedUsers}
                                    hint="Confirmed identities"
                                />
                                <StatCard
                                    label="Pulses"
                                    value={overview.totalPulses}
                                    hint={`${overview.verifiedPulses} verified`}
                                />
                                <StatCard
                                    label="Library"
                                    value={overview.totalLibraryItems}
                                    hint={`${overview.availableLibraryItems} available`}
                                />
                            </div>
                        )}

                        {section === 'users' && (
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                <div
                                    style={`${surfaceCard};padding:14px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;`}
                                >
                                    <input
                                        value={userSearch}
                                        onInput={(event) =>
                                            setUserSearch((event.target as HTMLInputElement).value)
                                        }
                                        placeholder="Search users by name"
                                        style="flex:1;min-width:240px;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;"
                                    />
                                    <HoverButton
                                        type="button"
                                        disabled={userSearchLoading}
                                        onClick={() => void searchUsers()}
                                        style="padding:9px 12px;border-radius:8px;border:none;background:var(--accent-subtle);color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;"
                                    >
                                        Search
                                    </HoverButton>
                                    <HoverButton
                                        type="button"
                                        onClick={loadData}
                                        style="padding:9px 12px;border-radius:8px;border:none;background:var(--bg-muted);color:var(--text-tertiary);font-size:12px;font-weight:700;cursor:pointer;"
                                    >
                                        Reset
                                    </HoverButton>
                                    <span style="font-size:12px;color:var(--text-tertiary);">
                                        {usersLoadingMore || userSearchLoading ? 'Loading…' : ''}
                                    </span>
                                </div>
                                {users.map((user) => (
                                    <UserRow
                                        key={user.id}
                                        user={user}
                                        onSetRole={(userId, role) => {
                                            setConfirmation({
                                                title: 'Update user role',
                                                message: `Change ${user.name} to ${role}?`,
                                                confirmLabel: 'Confirm change',
                                                destructive: role === 'banned',
                                                onConfirm: async () => {
                                                    await setUserRole(userId, role);
                                                    showToast(`${user.name} role changed to ${role}.`);
                                                },
                                            });
                                        }}
                                        onDelete={(userId) => {
                                            setConfirmation({
                                                title: 'Delete user',
                                                message: `Schedule deletion for ${user.name}?`,
                                                confirmLabel: 'Schedule deletion',
                                                destructive: true,
                                                onConfirm: async () => {
                                                    await removeUser(userId);
                                                },
                                            });
                                        }}
                                    />
                                ))}
                                <div ref={usersSentinelRef} style="height:1px;" />
                                {usersLoadingMore && (
                                    <div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:12px;">
                                        Loading more users...
                                    </div>
                                )}
                                {!usersHasMore && (
                                    <div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:12px;">
                                        No more users to display
                                    </div>
                                )}
                            </div>
                        )}

                        {section === 'pulses' && (
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                <div
                                    style={`${surfaceCard};padding:14px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;`}
                                >
                                    <input
                                        value={pulseId}
                                        onInput={(event) =>
                                            setPulseId((event.target as HTMLInputElement).value)
                                        }
                                        placeholder="Search pulse by ID"
                                        style="flex:1;min-width:240px;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;"
                                    />
                                    <HoverButton
                                        type="button"
                                        disabled={pulseSearchLoading}
                                        onClick={() => void searchPulse()}
                                        style="padding:9px 12px;border-radius:8px;border:none;background:var(--accent-subtle);color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;"
                                    >
                                        Search
                                    </HoverButton>
                                    <HoverButton
                                        type="button"
                                        onClick={loadData}
                                        style="padding:9px 12px;border-radius:8px;border:none;background:var(--bg-muted);color:var(--text-tertiary);font-size:12px;font-weight:700;cursor:pointer;"
                                    >
                                        Reset
                                    </HoverButton>
                                </div>
                                {pulses.map((pulse) => (
                                    <PulseRow
                                        key={pulse.id}
                                        pulse={pulse}
                                        onDelete={(pulseId) => {
                                            setConfirmation({
                                                title: 'Delete pulse',
                                                message: `Delete pulse ${pulseId} permanently?`,
                                                confirmLabel: 'Delete pulse',
                                                destructive: true,
                                                onConfirm: async () => {
                                                    await removePulse(pulseId);
                                                },
                                            });
                                        }}
                                    />
                                ))}
                                {pulses.length === 0 && (
                                    <div
                                        style={`${surfaceCard};padding:32px;text-align:center;color:var(--text-tertiary);`}
                                    >
                                        <Search
                                            size={28}
                                            style="margin:0 auto 10px;opacity:0.35;"
                                        />
                                        <p style="margin:0;font-size:14px;font-weight:600;">
                                            No pulses found
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {section === 'library' && (
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                {library.map((item) => (
                                    <LibraryRow
                                        key={item.id}
                                        item={item}
                                        busy={libraryBusyId === item.id}
                                        onEdit={() => setEditingLibraryItem(item)}
                                        onDelete={() => {
                                            setConfirmation({
                                                title: 'Delete library item',
                                                message: `Delete ${item.title} permanently?`,
                                                confirmLabel: 'Delete item',
                                                destructive: true,
                                                onConfirm: async () => {
                                                    await removeLibrary(item.id);
                                                },
                                            });
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {section === 'reports' && (
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                {reports.length === 0 ? (
                                    <div
                                        style={`${surfaceCard};padding:40px;text-align:center;color:var(--text-tertiary);`}
                                    >
                                        <Flag size={32} style="margin:0 auto 12px;opacity:0.3;" />
                                        <p style="margin:0;font-size:14px;font-weight:600;">
                                            No reports found
                                        </p>
                                    </div>
                                ) : (
                                    reports.map((report) => (
                                        <ReportRow
                                            key={report.id}
                                            report={report}
                                            onUpdate={(id, status) => {
                                                setConfirmation({
                                                    title:
                                                        status === 'resolved'
                                                            ? 'Resolve report'
                                                            : 'Dismiss report',
                                                    message: `${status === 'resolved' ? 'Resolve' : 'Dismiss'} report ${report.reason}?`,
                                                    confirmLabel:
                                                        status === 'resolved'
                                                            ? 'Resolve'
                                                            : 'Dismiss',
                                                    destructive: status === 'dismissed',
                                                    onConfirm: async () => {
                                                        await changeReportStatus(id, status);
                                                    },
                                                });
                                            }}
                                        />
                                    ))
                                )}
                            </div>
                        )}

                        {section === 'overview' && pendingDeletions.length > 0 && (
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                <h3 style="margin:0;font-size:14px;font-weight:700;color:var(--text);">
                                    Pending account deletions
                                </h3>
                                {pendingDeletions.map((item) => (
                                    <div
                                        key={item.user.id}
                                        style={`${surfaceCard};padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;`}
                                    >
                                        <div style="min-width:0;">
                                            <div style="font-size:13px;font-weight:700;color:var(--text);">
                                                {item.user.name}
                                            </div>
                                            <div style="font-size:12px;color:var(--text-secondary);">
                                                Purges in 7 days
                                            </div>
                                        </div>
                                        <HoverButton
                                            type="button"
                                            onClick={() => {
                                                setConfirmation({
                                                    title: 'Cancel deletion',
                                                    message: `Cancel deletion for ${item.user.name}?`,
                                                    confirmLabel: 'Cancel deletion',
                                                    onConfirm: async () => {
                                                        await cancelUserDeletion(item.user.id);
                                                    },
                                                });
                                            }}
                                            style="padding:9px 12px;border-radius:8px;border:none;background:var(--bg-muted);color:var(--text-tertiary);font-size:12px;font-weight:700;cursor:pointer;"
                                        >
                                            Cancel
                                        </HoverButton>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
                <ConfirmDialog
                    open={confirmation !== null}
                    title={confirmation?.title ?? ''}
                    message={confirmation?.message ?? ''}
                    confirmLabel={confirmation?.confirmLabel}
                    destructive={confirmation?.destructive}
                    busy={false}
                    onCancel={() => setConfirmation(null)}
                    onConfirm={async () => {
                        if (!confirmation) return;
                        try {
                            await confirmation.onConfirm();
                        } catch (error) {
                            console.error(error);
                            window.alert(
                                error instanceof Error ? error.message : 'Action failed.'
                            );
                        } finally {
                            setConfirmation(null);
                        }
                    }}
                />
                {editingLibraryItem && (
                    <LibraryEditModal
                        item={editingLibraryItem}
                        busy={libraryBusyId === editingLibraryItem.id}
                        onClose={() => setEditingLibraryItem(null)}
                        onSave={async (updates) => {
                            await updateLibrary(editingLibraryItem.id, updates);
                            setEditingLibraryItem(null);
                        }}
                    />
                )}
                {toastMessage && (
                    <div
                        role="status"
                        aria-live="polite"
                        class="animate-fade-in"
                        style="position:fixed;right:16px;bottom:88px;z-index:140;max-width:min(92vw,320px);padding:10px 12px;border-radius:10px;border:1px solid var(--accent-muted);background:var(--accent-subtle);color:var(--accent);font-size:12px;font-weight:700;box-shadow:var(--shadow-lg);"
                    >
                        {toastMessage}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

function LibraryEditModal({
    item,
    busy,
    onClose,
    onSave,
}: {
    item: LibraryItem;
    busy: boolean;
    onClose: () => void;
    onSave: (updates: {
        title: string;
        description: string;
        tags: string[];
        isAvailable: boolean;
    }) => Promise<void>;
}) {
    const [title, setTitle] = useState(item.title);
    const [description, setDescription] = useState(item.description);
    const [tags, setTags] = useState(item.tags.join(', '));
    const [isAvailable, setIsAvailable] = useState(item.available);

    return (
        <div
            role="dialog"
            aria-modal="true"
            style="position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);padding:16px;"
        >
            <div style="position:absolute;inset:0;" onClick={onClose} aria-hidden="true" />
            <div style="position:relative;width:100%;max-width:520px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <div>
                        <p style="margin:0;font-size:16px;font-weight:700;color:var(--text);">
                            Edit library item
                        </p>
                        <p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary);">
                            {item.type}
                        </p>
                    </div>
                    <HoverButton
                        type="button"
                        class="btn-ghost"
                        onClick={onClose}
                        style="height:32px;padding:0 10px;font-size:12px;"
                    >
                        Close
                    </HoverButton>
                </div>
                <input
                    value={title}
                    onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                    style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;"
                />
                <textarea
                    value={description}
                    onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
                    style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;min-height:100px;resize:vertical;"
                />
                <input
                    value={tags}
                    onInput={(e) => setTags((e.target as HTMLInputElement).value)}
                    style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;"
                />
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);">
                    <input
                        type="checkbox"
                        checked={isAvailable}
                        onChange={(e) => setIsAvailable((e.target as HTMLInputElement).checked)}
                    />
                    Available
                </label>
                <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
                    <HoverButton
                        type="button"
                        class="btn-ghost"
                        onClick={onClose}
                        style="height:36px;padding:0 12px;font-size:12px;"
                    >
                        Cancel
                    </HoverButton>
                    <HoverButton
                        type="button"
                        class="btn-primary"
                        disabled={busy || !title.trim()}
                        onClick={() =>
                            void onSave({
                                title: title.trim(),
                                description: description.trim(),
                                tags: tags
                                    .split(',')
                                    .map((tag) => tag.trim())
                                    .filter(Boolean),
                                isAvailable,
                            })
                        }
                        style="height:36px;padding:0 12px;font-size:12px;"
                    >
                        {busy ? 'Saving…' : 'Save'}
                    </HoverButton>
                </div>
            </div>
        </div>
    );
}

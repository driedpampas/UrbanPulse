import { Activity, LibraryBig, UsersRound } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { useAuth } from '../lib/auth';
import { fetchAdminLibrary } from '../lib/libraryApi';
import type { LibraryItem, User } from '../lib/types';
import { fetchAdminOverview, fetchAdminUsers } from '../lib/userApi';

type AdminSection = 'overview' | 'users' | 'library';

type AdminOverview = Awaited<ReturnType<typeof fetchAdminOverview>>;

const SECTIONS: Array<{ id: AdminSection; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'users', label: 'Users', icon: UsersRound },
    { id: 'library', label: 'Library', icon: LibraryBig },
];

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

function SectionButton({
    active,
    label,
    icon: Icon,
    onClick,
}: {
    active: boolean;
    label: string;
    icon: typeof Activity;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={`display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border-radius:12px;border:1px solid ${active ? 'var(--border-strong)' : 'var(--border)'};background:${active ? 'var(--surface-raised)' : 'var(--bg-subtle)'};color:${active ? 'var(--text)' : 'var(--text-tertiary)'};font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s ease;`}
        >
            <Icon size={13} />
            {label}
        </button>
    );
}

function StatCard({
    label,
    value,
    hint,
}: {
    label: string;
    value: string | number;
    hint?: string;
}) {
    return (
        <div style={`${surfaceCard};padding:18px;display:flex;flex-direction:column;gap:8px;`}>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);">
                {label}
            </span>
            <span style="font-size:24px;font-weight:700;color:var(--text);line-height:1;">
                {value}
            </span>
            {hint && <span style="font-size:12px;color:var(--text-secondary);">{hint}</span>}
        </div>
    );
}

function UserRow({ user }: { user: User }) {
    const role = user.role?.toLowerCase() ?? 'resident';

    return (
        <div
            style={`${surfaceCard};padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;`}
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
        </div>
    );
}

function LibraryRow({ item }: { item: LibraryItem }) {
    return (
        <div
            style={`${surfaceCard};padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;`}
        >
            <div style="min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--bg-muted);color:var(--text-tertiary);text-transform:uppercase;">
                        {item.type}
                    </span>
                    <span
                        style={`font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:${item.available ? 'var(--success-subtle)' : 'var(--bg-muted)'};color:${item.available ? 'var(--success)' : 'var(--text-tertiary)'};`}
                    >
                        {item.available ? 'Available' : 'Hidden'}
                    </span>
                </div>
                <h3 style="margin:8px 0 4px;font-size:14px;font-weight:700;color:var(--text);">
                    {item.title}
                </h3>
                <p style="margin:0;font-size:12px;color:var(--text-secondary);">{item.userName}</p>
            </div>
            <div style="text-align:right;flex-shrink:0;max-width:18rem;">
                <p style="margin:0;font-size:12px;color:var(--text-secondary);">
                    {item.description}
                </p>
            </div>
        </div>
    );
}

export function AdminDashboard() {
    const { session } = useAuth();
    const [section, setSection] = useState<AdminSection>('overview');
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [library, setLibrary] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const currentRole = useMemo(() => session?.user.role?.toLowerCase() ?? 'resident', [session]);

    useEffect(() => {
        Promise.all([fetchAdminOverview(), fetchAdminUsers(), fetchAdminLibrary()])
            .then(([o, u, items]) => {
                setOverview(o);
                setUsers(u);
                setLibrary(items);
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <AppLayout title="Admin" showNav={false}>
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
                        {currentRole}
                    </span>
                </div>

                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
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
                                {users.map((user) => (
                                    <UserRow key={user.id} user={user} />
                                ))}
                            </div>
                        )}

                        {section === 'library' && (
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                {library.map((item) => (
                                    <LibraryRow key={item.id} item={item} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppLayout>
    );
}

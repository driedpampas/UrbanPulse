import { Activity, CheckCircle2, LibraryBig, Shield, UsersRound } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { useAuth } from '../lib/auth';
import { fetchAdminLibrary } from '../lib/libraryApi';
import type { LibraryItem, User } from '../lib/types';
import { fetchAdminOverview, fetchAdminUsers } from '../lib/userApi';

type AdminSection = 'overview' | 'users' | 'library' | 'access';

type AdminOverview = Awaited<ReturnType<typeof fetchAdminOverview>>;

const SECTIONS: Array<{ id: AdminSection; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'users', label: 'Users', icon: UsersRound },
    { id: 'library', label: 'Library', icon: LibraryBig },
    { id: 'access', label: 'Access', icon: Shield },
];

const surfaceCard =
    'border:1px solid var(--border);background:linear-gradient(180deg,var(--surface),var(--bg-subtle));border-radius:18px;box-shadow:var(--shadow-sm);';

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
            <span style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-tertiary);">
                {label}
            </span>
            <span style="font-size:28px;font-weight:800;letter-spacing:-0.04em;color:var(--text);line-height:1;">
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
    const elevatedCount = useMemo(
        () =>
            users.filter((user) => ['admin', 'mod'].includes((user.role ?? '').toLowerCase()))
                .length,
        [users]
    );

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
                    style={`${surfaceCard};padding:18px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;`}
                >
                    <div style="min-width:0;">
                        <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-tertiary);">
                            Admin console
                        </p>
                        <h2 style="margin:0;font-size:24px;font-weight:800;letter-spacing:-0.04em;color:var(--text);">
                            Operate UrbanPulse
                        </h2>
                        <p style="margin:8px 0 0;font-size:13px;color:var(--text-secondary);max-width:42rem;">
                            Manage trusted users, inspect content, and keep the network healthy.
                        </p>
                        <p style="margin:10px 0 0;font-size:12px;color:var(--text-tertiary);">
                            {elevatedCount} elevated accounts on record
                        </p>
                    </div>
                    <span style="display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border-radius:999px;background:var(--success-subtle);color:var(--success);font-size:12px;font-weight:700;">
                        <CheckCircle2 size={14} />
                        {currentRole}
                    </span>
                </div>

                <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
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
                                    label="Verified users"
                                    value={overview.verifiedUsers}
                                    hint="Identity confirmed on the network"
                                />
                                <StatCard
                                    label="Pulses"
                                    value={overview.totalPulses}
                                    hint={`${overview.verifiedPulses} verified updates`}
                                />
                                <StatCard
                                    label="Library"
                                    value={overview.totalLibraryItems}
                                    hint={`${overview.availableLibraryItems} available items`}
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

                        {section === 'access' && (
                            <div
                                style={`${surfaceCard};padding:18px;display:flex;flex-direction:column;gap:10px;`}
                            >
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <CheckCircle2 size={18} />
                                    <span style="font-size:14px;font-weight:700;color:var(--text);">
                                        Server enforced
                                    </span>
                                </div>
                                <p style="margin:0;font-size:13px;color:var(--text-secondary);">
                                    Admin routes require a valid session and the backend re-checks
                                    the stored user role before returning protected data.
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppLayout>
    );
}

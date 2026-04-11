import { Activity, Flag, LibraryBig, UsersRound } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { useAuth } from '../lib/auth';
import { fetchAdminLibrary } from '../lib/libraryApi';
import { fetchAdminReports, updateReportStatus } from '../lib/reportsApi';
import type { AdminFlag, LibraryItem, User } from '../lib/types';
import { fetchAdminOverview, fetchAdminUsers } from '../lib/userApi';

type AdminSection = 'overview' | 'users' | 'library' | 'reports';

type AdminOverview = Awaited<ReturnType<typeof fetchAdminOverview>>;

const SECTIONS: Array<{ id: AdminSection; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'users', label: 'Users', icon: UsersRound },
    { id: 'library', label: 'Library', icon: LibraryBig },
    { id: 'reports', label: 'Reports', icon: Flag },
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

function ReportRow({ report, onUpdate }: { report: AdminFlag; onUpdate: () => void }) {
    const [updating, setUpdating] = useState(false);

    const handleAction = async (status: 'resolved' | 'dismissed') => {
        setUpdating(true);
        try {
            await updateReportStatus(report.id, status);
            onUpdate();
        } catch (e) {
            console.error(e);
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div
            style={`${surfaceCard};padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;opacity:${report.status === 'pending' ? 1 : 0.6};`}
        >
            <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span
                        style={`font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:${report.status === 'pending' ? 'var(--warning-subtle)' : 'var(--bg-muted)'};color:${report.status === 'pending' ? 'var(--warning)' : 'var(--text-tertiary)'};text-transform:uppercase;`}
                    >
                        {report.status}
                    </span>
                    <span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--bg-muted);color:var(--text-tertiary);text-transform:uppercase;">
                        {report.targetType}
                    </span>
                </div>
                <h3 style="margin:8px 0 4px;font-size:14px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px;">
                    {report.reason}
                </h3>
                <p style="margin:0;font-size:12px;color:var(--text-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;">
                    "{report.content}"
                </p>
                <div style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-tertiary);">
                    <span>{new Date(report.timestamp).toLocaleString()}</span>
                    <span>•</span>
                    <span>ID: {report.targetId.slice(0, 8)}...</span>
                </div>
            </div>

            {report.status === 'pending' && (
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button
                        type="button"
                        disabled={updating}
                        onClick={() => handleAction('resolved')}
                        style="padding:6px 10px;border-radius:8px;border:none;background:var(--success-subtle);color:var(--success);font-size:11px;font-weight:700;cursor:pointer;"
                    >
                        Resolve
                    </button>
                    <button
                        type="button"
                        disabled={updating}
                        onClick={() => handleAction('dismissed')}
                        style="padding:6px 10px;border-radius:8px;border:none;background:var(--bg-muted);color:var(--text-tertiary);font-size:11px;font-weight:700;cursor:pointer;"
                    >
                        Dismiss
                    </button>
                </div>
            )}
        </div>
    );
}

export function AdminDashboard() {
    const { session } = useAuth();
    const [section, setSection] = useState<AdminSection>('overview');
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [library, setLibrary] = useState<LibraryItem[]>([]);
    const [reports, setReports] = useState<AdminFlag[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = () => {
        setLoading(true);
        Promise.all([
            fetchAdminOverview(),
            fetchAdminUsers(),
            fetchAdminLibrary(),
            fetchAdminReports(),
        ])
            .then(([o, u, items, r]) => {
                setOverview(o);
                setUsers(u);
                setLibrary(items);
                setReports(r);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
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
                                            onUpdate={loadData}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppLayout>
    );
}

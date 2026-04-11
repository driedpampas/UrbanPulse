import { Activity, Flag, LibraryBig, Search, UsersRound } from 'lucide-preact';
import { LibraryRow } from '../components/Admin/LibraryRow';
import { PulseRow } from '../components/Admin/PulseRow';
import { ReportRow } from '../components/Admin/ReportRow';
import { SectionButton } from '../components/Admin/SectionButton';
import { StatCard } from '../components/Admin/StatCard';
import { UserRow } from '../components/Admin/UserRow';
import { AppLayout } from '../components/Layout/AppLayout';
import { HoverButton } from '../components/ui/HoverButton';
import { type AdminSection, useAdminDashboardData } from '../hooks/useAdminDashboardData';
import { useAuth } from '../lib/auth';

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
        pulseId,
        setPulseId,
        loading,
        pulseSearchLoading,
        loadData,
        searchPulse,
        setUserRole,
        removeUser,
        removePulse,
        changeReportStatus,
    } = useAdminDashboardData();

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
                                {users.map((user) => (
                                    <UserRow
                                        key={user.id}
                                        user={user}
                                        onSetRole={setUserRole}
                                        onDelete={removeUser}
                                    />
                                ))}
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
                                    <PulseRow key={pulse.id} pulse={pulse} onDelete={removePulse} />
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
                                            onUpdate={changeReportStatus}
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

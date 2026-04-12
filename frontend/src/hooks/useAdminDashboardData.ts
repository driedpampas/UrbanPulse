import { useCallback, useEffect, useState } from 'preact/hooks';
import {
    cancelAdminUserDeletion,
    deleteAdminPulse,
    deleteAdminUser,
    deleteLibraryItem,
    fetchAdminLibrary,
    fetchAdminOverview,
    fetchAdminPulseById,
    fetchAdminPulses,
    fetchAdminReports,
    fetchAdminUserDeletions,
    fetchAdminUsers,
    updateAdminUserRole,
    updateLibraryItem,
    updateReportStatus,
} from '../lib/apiClients';
import type { AdminFlag, AdminOverview, LibraryItem, Pulse, User } from '../types';

export type AdminSection = 'overview' | 'users' | 'pulses' | 'library' | 'reports';

export function useAdminDashboardData() {
    const [section, setSection] = useState<AdminSection>('overview');
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [pulses, setPulses] = useState<Pulse[]>([]);
    const [library, setLibrary] = useState<LibraryItem[]>([]);
    const [reports, setReports] = useState<AdminFlag[]>([]);
    const [pendingDeletions, setPendingDeletions] = useState<
        Array<{ user: User; requestedAt: number; purgeAt: number }>
    >([]);
    const [pulseId, setPulseId] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [pulseSearchLoading, setPulseSearchLoading] = useState(false);
    const [userSearchLoading, setUserSearchLoading] = useState(false);
    const [libraryBusyId, setLibraryBusyId] = useState<string | null>(null);
    const [usersOffset, setUsersOffset] = useState(0);
    const [usersHasMore, setUsersHasMore] = useState(true);
    const [usersLoadingMore, setUsersLoadingMore] = useState(false);
    const [userSearchActive, setUserSearchActive] = useState(false);

    const USERS_BATCH = 25;

    const loadData = useCallback(() => {
        setLoading(true);
        Promise.all([
            fetchAdminOverview(),
            fetchAdminUsers({ limit: USERS_BATCH, offset: 0 }),
            fetchAdminPulses(),
            fetchAdminLibrary(),
            fetchAdminReports(),
            fetchAdminUserDeletions({ limit: USERS_BATCH, offset: 0 }),
        ])
            .then(
                ([
                    overviewData,
                    usersData,
                    pulsesData,
                    libraryData,
                    reportsData,
                    deletionsData,
                ]) => {
                    setOverview(overviewData);
                    setUsers(usersData);
                    setPulses(pulsesData);
                    setLibrary(libraryData);
                    setReports(reportsData);
                    setPendingDeletions(deletionsData);
                    setUsersOffset(usersData.length);
                    setUsersHasMore(usersData.length === USERS_BATCH);
                    setUserSearchActive(false);
                }
            )
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const searchPulse = useCallback(async () => {
        const id = pulseId.trim();
        if (!id) return;

        setPulseSearchLoading(true);
        try {
            const pulse = await fetchAdminPulseById(id);
            setPulses(pulse ? [pulse] : []);
        } catch (error) {
            console.error(error);
        } finally {
            setPulseSearchLoading(false);
        }
    }, [pulseId]);

    const searchUsers = useCallback(async () => {
        const query = userSearch.trim();
        setUserSearchLoading(true);
        setUserSearchActive(true);
        try {
            const results = await fetchAdminUsers({
                displayName: query || undefined,
                limit: USERS_BATCH,
                offset: 0,
            });
            setUsers(results);
            setUsersOffset(results.length);
            setUsersHasMore(results.length === USERS_BATCH);
        } finally {
            setUserSearchLoading(false);
        }
    }, [userSearch]);

    const loadMoreUsers = useCallback(async () => {
        if (usersLoadingMore || !usersHasMore) return;
        setUsersLoadingMore(true);
        try {
            const query = userSearchActive ? userSearch.trim() : '';
            const nextUsers = await fetchAdminUsers({
                displayName: query || undefined,
                limit: USERS_BATCH,
                offset: usersOffset,
            });
            setUsers((current) => {
                const merged = [...current];
                for (const next of nextUsers) {
                    if (!merged.some((user) => user.id === next.id)) {
                        merged.push(next);
                    }
                }
                return merged;
            });
            setUsersOffset((current) => current + nextUsers.length);
            setUsersHasMore(nextUsers.length === USERS_BATCH);
        } finally {
            setUsersLoadingMore(false);
        }
    }, [userSearchActive, usersHasMore, usersLoadingMore, usersOffset]);

    const setUserRole = useCallback(
        async (userId: string, role: 'admin' | 'mod' | 'resident' | 'banned') => {
            await updateAdminUserRole(userId, role);
            loadData();
        },
        [loadData]
    );

    const updateLibrary = useCallback(
        async (
            itemId: string,
            updates: {
                title?: string;
                description?: string;
                tags?: string[];
                isAvailable?: boolean;
            }
        ) => {
            setLibraryBusyId(itemId);
            try {
                await updateLibraryItem(itemId, updates);
                loadData();
            } finally {
                setLibraryBusyId(null);
            }
        },
        [loadData]
    );

    const removeLibrary = useCallback(
        async (itemId: string) => {
            setLibraryBusyId(itemId);
            try {
                await deleteLibraryItem(itemId);
                loadData();
            } finally {
                setLibraryBusyId(null);
            }
        },
        [loadData]
    );

    const removeUser = useCallback(
        async (userId: string) => {
            await deleteAdminUser(userId);
            await loadData();
        },
        [loadData]
    );

    const cancelUserDeletion = useCallback(
        async (userId: string) => {
            await cancelAdminUserDeletion(userId);
            await loadData();
        },
        [loadData]
    );

    const removePulse = useCallback(
        async (pulseIdValue: string) => {
            await deleteAdminPulse(pulseIdValue);
            loadData();
        },
        [loadData]
    );

    const changeReportStatus = useCallback(
        async (id: string, status: 'resolved' | 'dismissed') => {
            await updateReportStatus(id, status);
            loadData();
        },
        [loadData]
    );

    return {
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
        libraryBusyId,
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
    };
}

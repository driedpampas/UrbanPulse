import { useCallback, useEffect, useState } from 'preact/hooks';
import {
    applyAdminMessageReportAction,
    cancelAdminUserDeletion,
    deleteAdminPulse,
    deleteAdminUser,
    deleteLibraryItem,
    fetchAdminLibrary,
    fetchAdminMessageReports,
    fetchAdminOverview,
    fetchAdminPulseById,
    fetchAdminPulses,
    fetchAdminReports,
    fetchAdminRequestInteractions,
    fetchAdminRequests,
    fetchAdminUserDeletions,
    fetchAdminUsers,
    markAdminRequestInteractionSuccessful,
    markAdminRequestSolved,
    updateAdminUserRole,
    updateLibraryItem,
    updateReportStatus,
} from '../lib/apiClients';
import { fetchIncidentTypes, type IncidentType, deleteIncidentType, updateIncidentType } from '../lib/incidentApi';
import type {
    AdminFlag,
    AdminMessageReport,
    AdminOverview,
    AuthorPulseRequest,
    LibraryItem,
    MessageReportAction,
    Pulse,
    PulseInteraction,
    User,
} from '../types';

export type AdminSection =
    | 'overview'
    | 'users'
    | 'requests'
    | 'pulses'
    | 'library'
    | 'reports'
    | 'flaggedMessages'
    | 'incidentTypes';

export function useAdminDashboardData() {
    const [section, setSection] = useState<AdminSection>('overview');
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [requests, setRequests] = useState<AuthorPulseRequest[]>([]);
    const [pulses, setPulses] = useState<Pulse[]>([]);
    const [library, setLibrary] = useState<LibraryItem[]>([]);
    const [reports, setReports] = useState<AdminFlag[]>([]);
    const [flaggedMessageReports, setFlaggedMessageReports] = useState<AdminMessageReport[]>([]);
    const [pendingDeletions, setPendingDeletions] = useState<
        Array<{ user: User; requestedAt: number; purgeAt: number }>
    >([]);
    const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([]);
    const [pulseId, setPulseId] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [pulseSearchLoading, setPulseSearchLoading] = useState(false);
    const [userSearchLoading, setUserSearchLoading] = useState(false);
    const [requestInteractionsByPulse, setRequestInteractionsByPulse] = useState<
        Record<string, PulseInteraction[]>
    >({});
    const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
    const [requestInteractionsLoadingFor, setRequestInteractionsLoadingFor] = useState<
        string | null
    >(null);
    const [requestInteractionActionId, setRequestInteractionActionId] = useState<string | null>(
        null
    );
    const [requestSolveActionId, setRequestSolveActionId] = useState<string | null>(null);
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
            fetchAdminRequests(50, 0),
            fetchAdminPulses(),
            fetchAdminLibrary(),
            fetchAdminReports(),
            fetchAdminMessageReports(),
            fetchAdminUserDeletions({ limit: USERS_BATCH, offset: 0 }),
            fetchIncidentTypes(),
        ])
            .then(
                ([
                    overviewData,
                    usersData,
                    requestsData,
                    pulsesData,
                    libraryData,
                    reportsData,
                    flaggedMessageReportsData,
                    deletionsData,
                    incidentTypesData,
                ]) => {
                    setOverview(overviewData);
                    setUsers(usersData);
                    setRequests(requestsData);
                    setPulses(pulsesData);
                    setLibrary(libraryData);
                    setReports(reportsData);
                    setFlaggedMessageReports(flaggedMessageReportsData);
                    setPendingDeletions(deletionsData);
                    setIncidentTypes(incidentTypesData);
                    setUsersOffset(usersData.length);
                    setUsersHasMore(usersData.length === USERS_BATCH);
                    setUserSearchActive(false);
                    setRequestInteractionsByPulse({});
                    setExpandedRequestId(null);
                }
            )
            .catch((error) => {
                console.error('Failed to load admin data:', error);
            })
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
        async (userId: string, role: 'admin' | 'mod' | 'user' | 'banned') => {
            await updateAdminUserRole(userId, role);

            setUsers((current) =>
                current.map((user) => (user.id === userId ? { ...user, role } : user))
            );

            try {
                const [freshUser] = await fetchAdminUsers({ id: userId, limit: 1, offset: 0 });
                if (freshUser) {
                    setUsers((current) =>
                        current.map((user) =>
                            user.id === userId ? { ...user, ...freshUser } : user
                        )
                    );
                }
            } catch {
                // Keep optimistic UI update if targeted refresh fails.
            }

            try {
                const overviewData = await fetchAdminOverview();
                setOverview(overviewData);
            } catch {
                // Keep optimistic UI update even if overview refresh fails.
            }
        },
        []
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

    const removeIncidentType = useCallback(
        async (id: string) => {
            const success = await deleteIncidentType(id);
            if (success) {
                loadData();
            }
            return success;
        },
        [loadData]
    );

    const editIncidentType = useCallback(
        async (id: string, label: string) => {
            const success = await updateIncidentType(id, label);
            if (success) {
                loadData();
            }
            return success;
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

    const applyFlaggedMessageAction = useCallback(
        async (reportId: string, action: MessageReportAction) => {
            await applyAdminMessageReportAction(reportId, action);
            const refreshed = await fetchAdminMessageReports();
            setFlaggedMessageReports(refreshed);
        },
        []
    );

    const toggleRequestDetails = useCallback(
        async (pulseId: string) => {
            if (expandedRequestId === pulseId) {
                setExpandedRequestId(null);
                return;
            }

            setExpandedRequestId(pulseId);
            if (requestInteractionsByPulse[pulseId]) {
                return;
            }

            setRequestInteractionsLoadingFor(pulseId);
            try {
                const interactions = await fetchAdminRequestInteractions(pulseId);
                setRequestInteractionsByPulse((current) => ({
                    ...current,
                    [pulseId]: interactions,
                }));
            } finally {
                setRequestInteractionsLoadingFor(null);
            }
        },
        [expandedRequestId, requestInteractionsByPulse]
    );

    const markRequestInteractionSuccessful = useCallback(
        async (pulseId: string, interactionId: string) => {
            setRequestInteractionActionId(interactionId);
            try {
                await markAdminRequestInteractionSuccessful(pulseId, interactionId);
                const [freshRequests, freshInteractions] = await Promise.all([
                    fetchAdminRequests(50, 0),
                    fetchAdminRequestInteractions(pulseId),
                ]);
                setRequests(freshRequests);
                setRequestInteractionsByPulse((current) => ({
                    ...current,
                    [pulseId]: freshInteractions,
                }));
            } finally {
                setRequestInteractionActionId(null);
            }
        },
        []
    );

    const markRequestSolved = useCallback(async (pulseId: string) => {
        setRequestSolveActionId(pulseId);
        try {
            await markAdminRequestSolved(pulseId);
            const freshRequests = await fetchAdminRequests(50, 0);
            setRequests(freshRequests);
        } finally {
            setRequestSolveActionId(null);
        }
    }, []);

    return {
        section,
        setSection,
        overview,
        users,
        requests,
        pulses,
        library,
        reports,
        flaggedMessageReports,
        pendingDeletions,
        incidentTypes,
        pulseId,
        userSearch,
        setUserSearch,
        setPulseId,
        loading,
        pulseSearchLoading,
        userSearchLoading,
        usersHasMore,
        usersLoadingMore,
        requestInteractionsByPulse,
        expandedRequestId,
        requestInteractionsLoadingFor,
        requestInteractionActionId,
        requestSolveActionId,
        libraryBusyId,
        loadData,
        searchPulse,
        searchUsers,
        loadMoreUsers,
        setUserRole,
        removeUser,
        cancelUserDeletion,
        removePulse,
        removeIncidentType,
        editIncidentType,
        changeReportStatus,
        applyFlaggedMessageAction,
        toggleRequestDetails,
        markRequestInteractionSuccessful,
        markRequestSolved,
        updateLibrary,
        removeLibrary,
    };
}

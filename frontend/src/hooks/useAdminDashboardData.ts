import { useCallback, useEffect, useState } from 'preact/hooks';
import {
    deleteAdminPulse,
    deleteAdminUser,
    deleteLibraryItem,
    fetchAdminLibrary,
    fetchAdminOverview,
    fetchAdminPulseById,
    fetchAdminPulses,
    fetchAdminReports,
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
    const [pulseId, setPulseId] = useState('');
    const [loading, setLoading] = useState(true);
    const [pulseSearchLoading, setPulseSearchLoading] = useState(false);
    const [libraryBusyId, setLibraryBusyId] = useState<string | null>(null);

    const loadData = useCallback(() => {
        setLoading(true);
        Promise.all([
            fetchAdminOverview(),
            fetchAdminUsers(),
            fetchAdminPulses(),
            fetchAdminLibrary(),
            fetchAdminReports(),
        ])
            .then(([overviewData, usersData, pulsesData, libraryData, reportsData]) => {
                setOverview(overviewData);
                setUsers(usersData);
                setPulses(pulsesData);
                setLibrary(libraryData);
                setReports(reportsData);
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
            loadData();
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
        pulseId,
        setPulseId,
        loading,
        pulseSearchLoading,
        libraryBusyId,
        loadData,
        searchPulse,
        setUserRole,
        removeUser,
        removePulse,
        changeReportStatus,
        updateLibrary,
        removeLibrary,
    };
}

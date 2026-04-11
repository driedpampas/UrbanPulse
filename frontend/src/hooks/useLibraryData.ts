import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
    deleteLibraryItem,
    fetchLibrary,
    postLibraryItem,
    updateLibraryItem,
} from '../lib/apiClients';
import { useAuth } from '../lib/auth';
import type { LibraryItem } from '../types';

type LibraryFilter = 'all' | 'item' | 'skill';

type LibraryUpdateInput = {
    title: string;
    description: string;
    tags: string[];
    isAvailable: boolean;
};

type LibraryCreateInput = {
    type: 'item' | 'skill';
    title: string;
    description: string;
    tags: string[];
};

export function useLibraryData() {
    const { session } = useAuth();
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<LibraryFilter>('all');
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
    const [deletingItem, setDeletingItem] = useState<LibraryItem | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busyItemId, setBusyItemId] = useState<string | null>(null);

    const currentUser = session?.user;
    const canManageItem = useCallback(
        (item: LibraryItem) => {
            const role = currentUser?.role;
            return Boolean(
                currentUser &&
                    (currentUser.id === item.userId || role === 'admin' || role === 'mod')
            );
        },
        [currentUser]
    );

    const loadLibrary = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchLibrary();
            setItems(data);
        } catch (error) {
            console.error(error);
            setActionError('Could not load library items.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadLibrary();
    }, [loadLibrary]);

    const filteredItems = useMemo(() => {
        const searchTerm = search.trim().toLowerCase();
        return items.filter((item) => {
            if (filter !== 'all' && item.type !== filter) return false;
            if (!searchTerm) return true;
            return (
                item.title.toLowerCase().includes(searchTerm) ||
                item.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
            );
        });
    }, [filter, items, search]);

    const saveItemUpdates = useCallback(
        async (itemId: string, updates: LibraryUpdateInput) => {
            setBusyItemId(itemId);
            try {
                await updateLibraryItem(itemId, updates);
                await loadLibrary();
                setEditingItem(null);
            } catch (error) {
                console.error(error);
                setActionError(
                    error instanceof Error ? error.message : 'Could not update library item.'
                );
            } finally {
                setBusyItemId(null);
            }
        },
        [loadLibrary]
    );

    const removeItem = useCallback(
        async (itemId: string) => {
            setBusyItemId(itemId);
            try {
                await deleteLibraryItem(itemId);
                await loadLibrary();
                setDeletingItem(null);
            } catch (error) {
                console.error(error);
                setActionError(
                    error instanceof Error ? error.message : 'Could not delete library item.'
                );
            } finally {
                setBusyItemId(null);
            }
        },
        [loadLibrary]
    );

    const createItem = useCallback(async (input: LibraryCreateInput) => {
        try {
            const created = await postLibraryItem(input);
            setItems((current) => [...current, created]);
            setShowAdd(false);
        } catch (error) {
            console.error(error);
            setActionError(error instanceof Error ? error.message : 'Could not add library item.');
        }
    }, []);

    return {
        loading,
        filter,
        setFilter,
        search,
        setSearch,
        showAdd,
        setShowAdd,
        editingItem,
        setEditingItem,
        deletingItem,
        setDeletingItem,
        actionError,
        setActionError,
        busyItemId,
        filteredItems,
        canManageItem,
        createItem,
        saveItemUpdates,
        removeItem,
    };
}

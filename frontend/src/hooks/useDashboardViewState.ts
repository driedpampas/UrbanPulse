import { useCallback, useState } from 'preact/hooks';

export type DashboardView = 'feed' | 'map';

const RADIUS_STORAGE_KEY = 'up_radius_filter';

function getInitialRadius() {
    if (typeof window === 'undefined') {
        return 500;
    }

    const saved = localStorage.getItem(RADIUS_STORAGE_KEY);
    return saved ? Number(saved) : 500;
}

export function useDashboardViewState() {
    const [view, setView] = useState<DashboardView>('feed');
    const [showPostForm, setShowPostForm] = useState(false);
    const [radius, setRadius] = useState(getInitialRadius);
    const [limit, setLimit] = useState(50);
    const [showFilters, setShowFilters] = useState(false);

    const updateRadius = useCallback((value: number) => {
        setRadius(value);
        localStorage.setItem(RADIUS_STORAGE_KEY, value.toString());
    }, []);

    const openPostForm = useCallback(() => setShowPostForm(true), []);
    const closePostForm = useCallback(() => setShowPostForm(false), []);
    const toggleFilters = useCallback(() => setShowFilters((current) => !current), []);

    return {
        view,
        setView,
        showPostForm,
        openPostForm,
        closePostForm,
        radius,
        updateRadius,
        limit,
        setLimit,
        showFilters,
        toggleFilters,
    };
}

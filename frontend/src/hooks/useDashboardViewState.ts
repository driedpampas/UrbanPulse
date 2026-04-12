import { useCallback, useState } from 'preact/hooks';

export type DashboardView = 'feed' | 'map';

const RADIUS_STORAGE_KEY = 'up_radius_filter';
const LIMIT_STORAGE_KEY = 'up_limit_filter';

function getInitialValue(key: string, defaultValue: number) {
    if (typeof window === 'undefined') {
        return defaultValue;
    }

    const saved = localStorage.getItem(key);
    return saved ? Number(saved) : defaultValue;
}

export function useDashboardViewState() {
    const [view, setView] = useState<DashboardView>('feed');
    const [showPostForm, setShowPostForm] = useState(false);
    const [radius, setRadius] = useState(() => getInitialValue(RADIUS_STORAGE_KEY, 500));
    const [limit, _setLimit] = useState(() => getInitialValue(LIMIT_STORAGE_KEY, 50));
    const [showFilters, setShowFilters] = useState(false);

    const updateRadius = useCallback((value: number) => {
        setRadius(value);
        localStorage.setItem(RADIUS_STORAGE_KEY, value.toString());
    }, []);

    const setLimit = useCallback((value: number) => {
        _setLimit(value);
        localStorage.setItem(LIMIT_STORAGE_KEY, value.toString());
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

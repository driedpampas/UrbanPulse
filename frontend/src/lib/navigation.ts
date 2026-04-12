import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter';

export function readQueryParam(param: string): string | null {
    if (typeof window === 'undefined') {
        return null;
    }

    return new URLSearchParams(window.location.search).get(param);
}

export function useQueryParamState(param: string) {
    const [location] = useLocation();
    const [value, setValue] = useState<string | null>(() => readQueryParam(param));

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const sync = () => {
            setValue(readQueryParam(param));
        };

        sync();
        window.addEventListener('popstate', sync);
        return () => {
            window.removeEventListener('popstate', sync);
        };
    }, [param]);

    useEffect(() => {
        setValue(readQueryParam(param));
    }, [location, param]);

    return [value, setValue] as const;
}

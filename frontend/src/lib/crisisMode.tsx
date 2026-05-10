import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useState } from 'preact/hooks';
import { fetchCrisis } from './incidentApi';

const CRISIS_MODE_KEY = 'up_crisis_mode';

function getInitialCrisisMode(): boolean {
    if (typeof window === 'undefined') {
        return true;
    }
    const saved = localStorage.getItem(CRISIS_MODE_KEY);
    if (saved === null) {
        return true;
    }
    return saved === 'true';
}

export type CrisisFeedTab = 'emergency' | 'other';

interface CrisisModeCtx {
    crisisMode: boolean;
    crisisFeedTab: CrisisFeedTab;
    setCrisisFeedTab: (tab: CrisisFeedTab) => void;
    toggleCrisisMode: () => void;
    setCrisisMode: (value: boolean) => void;
    checkAndSetCrisis: (lat: number, lng: number) => Promise<void>;
}

const CrisisModeContext = createContext<CrisisModeCtx>({
    crisisMode: true,
    crisisFeedTab: 'emergency',
    setCrisisFeedTab: () => {},
    toggleCrisisMode: () => {},
    setCrisisMode: () => {},
    checkAndSetCrisis: async () => {},
});

export function CrisisModeProvider({ children }: { children: ComponentChildren }) {
    const [crisisMode, setCrisisModeRaw] = useState<boolean>(getInitialCrisisMode);
    const [crisisFeedTab, setCrisisFeedTab] = useState<CrisisFeedTab>('emergency');

    const setCrisisMode = useCallback((value: boolean) => {
        setCrisisModeRaw(value);
        localStorage.setItem(CRISIS_MODE_KEY, String(value));
    }, []);

    const toggleCrisisMode = useCallback(() => {
        setCrisisModeRaw((prev) => {
            const next = !prev;
            localStorage.setItem(CRISIS_MODE_KEY, String(next));
            return next;
        });
    }, []);

    const checkAndSetCrisis = useCallback(
        async (lat: number, lng: number) => {
            try {
                const incidents = await fetchCrisis(lat, lng);
                setCrisisMode(incidents.length > 0);
            } catch {
                // Ignore network errors — don't override user's current crisis mode
            }
        },
        [setCrisisMode]
    );

    return (
        <CrisisModeContext.Provider
            value={{
                crisisMode,
                crisisFeedTab,
                setCrisisFeedTab,
                toggleCrisisMode,
                setCrisisMode,
                checkAndSetCrisis,
            }}
        >
            {children}
        </CrisisModeContext.Provider>
    );
}

export function useCrisisMode() {
    return useContext(CrisisModeContext);
}

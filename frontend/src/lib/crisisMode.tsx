import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useState } from 'preact/hooks';

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
}

const CrisisModeContext = createContext<CrisisModeCtx>({
    crisisMode: true,
    crisisFeedTab: 'emergency',
    setCrisisFeedTab: () => {},
    toggleCrisisMode: () => {},
});

export function CrisisModeProvider({ children }: { children: ComponentChildren }) {
    const [crisisMode, setCrisisMode] = useState<boolean>(getInitialCrisisMode);
    const [crisisFeedTab, setCrisisFeedTab] = useState<CrisisFeedTab>('emergency');

    const toggleCrisisMode = useCallback(() => {
        setCrisisMode((prev) => {
            const next = !prev;
            localStorage.setItem(CRISIS_MODE_KEY, String(next));
            return next;
        });
    }, []);

    return (
        <CrisisModeContext.Provider
            value={{ crisisMode, crisisFeedTab, setCrisisFeedTab, toggleCrisisMode }}
        >
            {children}
        </CrisisModeContext.Provider>
    );
}

export function useCrisisMode() {
    return useContext(CrisisModeContext);
}

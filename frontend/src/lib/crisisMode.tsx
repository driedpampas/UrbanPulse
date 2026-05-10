import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useState } from 'preact/hooks';
import { fetchCrisis, fetchIncidents, type IncidentFeedItem } from './incidentApi';
import { connectWebSocket, disconnectWebSocket, type PulseSocketEvent } from './pulseApi';

const CRISIS_MODE_KEY = 'up_crisis_mode';

function getInitialCrisisMode(): boolean {
    if (typeof window === 'undefined') {
        return true;
    }
    const saved = localStorage.getItem(CRISIS_MODE_KEY);
    if (saved === null) {
        return false; // Default to false if not saved
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
    activeIncidents: IncidentFeedItem[];
    pendingIncidents: IncidentFeedItem[];
    autoOpenOverlay: boolean;
    setAutoOpenOverlay: (value: boolean) => void;
}

const CrisisModeContext = createContext<CrisisModeCtx>({
    crisisMode: false,
    crisisFeedTab: 'emergency',
    setCrisisFeedTab: () => {},
    toggleCrisisMode: () => {},
    setCrisisMode: () => {},
    checkAndSetCrisis: async () => {},
    activeIncidents: [],
    pendingIncidents: [],
    autoOpenOverlay: false,
    setAutoOpenOverlay: () => {},
});

export function CrisisModeProvider({ children }: { children: ComponentChildren }) {
    const [crisisMode, setCrisisModeRaw] = useState<boolean>(getInitialCrisisMode);
    const [crisisFeedTab, setCrisisFeedTab] = useState<CrisisFeedTab>('emergency');
    const [activeIncidents, setActiveIncidents] = useState<IncidentFeedItem[]>([]);
    const [pendingIncidents, setPendingIncidents] = useState<IncidentFeedItem[]>([]);
    const [autoOpenOverlay, setAutoOpenOverlay] = useState(false);

    const setCrisisMode = useCallback((value: boolean) => {
        setCrisisModeRaw(value);
        localStorage.setItem(CRISIS_MODE_KEY, String(value));
        if (value) {
            setAutoOpenOverlay(true);
        }
    }, []);

    const toggleCrisisMode = useCallback(() => {
        setCrisisModeRaw((prev) => {
            const next = !prev;
            localStorage.setItem(CRISIS_MODE_KEY, String(next));
            if (next) {
                setAutoOpenOverlay(true);
            }
            return next;
        });
    }, []);

    const checkAndSetCrisis = useCallback(
        async (lat: number, lng: number) => {
            try {
                const [active, pending] = await Promise.all([
                    fetchCrisis(lat, lng),
                    fetchIncidents(lat, lng),
                ]);

                setActiveIncidents(active);
                setPendingIncidents(pending);

                const shouldBeInCrisis = active.length > 0;
                if (shouldBeInCrisis && !crisisMode) {
                    setCrisisMode(true);
                } else if (!shouldBeInCrisis && crisisMode) {
                    // We don't automatically turn off crisis mode if it was manually enabled or already on
                    // but we update the incident list.
                }
            } catch {
                // Ignore network errors — don't override user's current crisis mode
            }
        },
        [crisisMode, setCrisisMode]
    );

    useEffect(() => {
        const handleWsEvent = (event: PulseSocketEvent) => {
            if (event.event === 'crisis.alert') {
                setCrisisMode(true);
            }
        };

        connectWebSocket(handleWsEvent);
        return () => disconnectWebSocket(handleWsEvent);
    }, [setCrisisMode]);

    return (
        <CrisisModeContext.Provider
            value={{
                crisisMode,
                crisisFeedTab,
                setCrisisFeedTab,
                toggleCrisisMode,
                setCrisisMode,
                checkAndSetCrisis,
                activeIncidents,
                pendingIncidents,
                autoOpenOverlay,
                setAutoOpenOverlay,
            }}
        >
            {children}
        </CrisisModeContext.Provider>
    );
}

export function useCrisisMode() {
    return useContext(CrisisModeContext);
}

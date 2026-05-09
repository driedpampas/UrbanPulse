import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { useCrisisMode } from './crisisMode';
import type { Theme } from './theme';
import { useTheme } from './theme';

type SettingSource = 'user' | 'crisis';

interface AccessibilityCtx {
    highContrast: boolean;
    limitedMotion: boolean;
    toggleHighContrast: () => void;
    toggleLimitedMotion: () => void;
}

const AccessibilityContext = createContext<AccessibilityCtx>({
    highContrast: false,
    limitedMotion: false,
    toggleHighContrast: () => {},
    toggleLimitedMotion: () => {},
});

const HC_KEY = 'up_high_contrast';
const HC_SOURCE_KEY = 'up_hc_source';
const LM_KEY = 'up_limited_motion';
const LM_SOURCE_KEY = 'up_lm_source';
const BASE_THEME_KEY = 'up_base_theme';

function readBool(key: string): boolean {
    return localStorage.getItem(key) === 'true';
}

function readSource(key: string): SettingSource | null {
    const v = localStorage.getItem(key);
    if (v === 'user' || v === 'crisis') return v;
    return null;
}

export function AccessibilityProvider({ children }: { children: ComponentChildren }) {
    const { crisisMode } = useCrisisMode();
    const themeCtx = useTheme();

    const [highContrast, setHighContrast] = useState(() => readBool(HC_KEY));
    const [hcSource, setHcSource] = useState<SettingSource | null>(() => readSource(HC_SOURCE_KEY));
    const [limitedMotion, setLimitedMotion] = useState(() => readBool(LM_KEY));
    const [lmSource, setLmSource] = useState<SettingSource | null>(() => readSource(LM_SOURCE_KEY));

    const initialRef = useRef(true);

    useEffect(() => {
        const isInitial = initialRef.current;
        if (isInitial) {
            initialRef.current = false;
        }

        if (crisisMode) {
            let nextHC = highContrast;
            if (!highContrast) {
                nextHC = true;
                setHighContrast(true);
                setHcSource('crisis');
                localStorage.setItem(HC_KEY, 'true');
                localStorage.setItem(HC_SOURCE_KEY, 'crisis');
            }
            let nextLM = limitedMotion;
            if (!limitedMotion) {
                nextLM = true;
                setLimitedMotion(true);
                setLmSource('crisis');
                localStorage.setItem(LM_KEY, 'true');
                localStorage.setItem(LM_SOURCE_KEY, 'crisis');
            }
            applyHighContrast(nextHC);
            applyLimitedMotion(nextLM);
        } else if (!isInitial) {
            if (highContrast && hcSource === 'crisis') {
                setHighContrast(false);
                setHcSource(null);
                localStorage.setItem(HC_KEY, 'false');
                localStorage.removeItem(HC_SOURCE_KEY);
                applyHighContrast(false);
            }
            if (limitedMotion && lmSource === 'crisis') {
                setLimitedMotion(false);
                setLmSource(null);
                localStorage.setItem(LM_KEY, 'false');
                localStorage.removeItem(LM_SOURCE_KEY);
                applyLimitedMotion(false);
            }
        }
    }, [crisisMode]);

    function applyHighContrast(enabled: boolean) {
        if (enabled) {
            const currentTheme = themeCtx.theme;
            if (currentTheme !== 'high-contrast') {
                localStorage.setItem(BASE_THEME_KEY, currentTheme);
            }
            themeCtx.setTheme('high-contrast' as Theme);
        } else {
            const base = localStorage.getItem(BASE_THEME_KEY) as Theme | null;
            const restore: Theme = base === 'light' || base === 'dark' ? base : 'dark';
            themeCtx.setTheme(restore);
        }
    }

    function applyLimitedMotion(enabled: boolean) {
        document.documentElement.setAttribute('data-limited-motion', String(enabled));
    }

    const toggleHighContrast = () => {
        setHighContrast((prev) => {
            const next = !prev;
            setHcSource('user');
            localStorage.setItem(HC_KEY, String(next));
            localStorage.setItem(HC_SOURCE_KEY, 'user');
            applyHighContrast(next);
            return next;
        });
    };

    const toggleLimitedMotion = () => {
        setLimitedMotion((prev) => {
            const next = !prev;
            setLmSource('user');
            localStorage.setItem(LM_KEY, String(next));
            localStorage.setItem(LM_SOURCE_KEY, 'user');
            applyLimitedMotion(next);
            return next;
        });
    };

    return (
        <AccessibilityContext.Provider
            value={{ highContrast, limitedMotion, toggleHighContrast, toggleLimitedMotion }}
        >
            {children}
        </AccessibilityContext.Provider>
    );
}

export function useAccessibility() {
    return useContext(AccessibilityContext);
}

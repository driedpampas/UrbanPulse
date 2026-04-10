import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'up-theme';

function getInitialTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeCtx {
    theme: Theme;
    toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }: { children: ComponentChildren }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const t = getInitialTheme();
        applyTheme(t);
        return t;
    });

    const toggle = () => {
        setTheme((t) => {
            const next = t === 'dark' ? 'light' : 'dark';
            localStorage.setItem(STORAGE_KEY, next);
            applyTheme(next);
            return next;
        });
    };

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    return useContext(ThemeContext);
}

import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';

export type Theme = 'light' | 'dark' | 'high-contrast';

const STORAGE_KEY = 'up-theme';

function getInitialTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'high-contrast') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeCtx {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
    theme: 'dark',
    setTheme: () => {},
    toggle: () => {},
});

export function ThemeProvider({ children }: { children: ComponentChildren }) {
    const [theme, _setTheme] = useState<Theme>(() => {
        const t = getInitialTheme();
        applyTheme(t);
        return t;
    });

    const setTheme = (t: Theme) => {
        _setTheme(t);
        localStorage.setItem(STORAGE_KEY, t);
        applyTheme(t);
    };

    const toggle = () => {
        _setTheme((t) => {
            if (t === 'high-contrast') return t;
            const next = t === 'light' ? 'dark' : 'light';
            localStorage.setItem(STORAGE_KEY, next);
            applyTheme(next);
            return next;
        });
    };

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}

import type { ComponentChildren } from 'preact';
import { BottomNav } from './BottomNav';

interface Props {
    children: ComponentChildren;
    title?: string;
    showNav?: boolean;
}

export function AppLayout({ children, title, showNav = true }: Props) {
    return (
        <div class="min-h-dvh flex flex-col">
            {title && (
                <header class="sticky top-0 z-40 glass px-4 py-3 flex items-center justify-between">
                    <h1 class="text-lg font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent">
                        {title}
                    </h1>
                </header>
            )}
            <main class="flex-1 pb-20 overflow-y-auto">{children}</main>
            {showNav && <BottomNav />}
        </div>
    );
}

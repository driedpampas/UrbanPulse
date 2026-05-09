import { List, Map as MapIcon, Plus, SlidersHorizontal } from 'lucide-preact';
import { memo } from 'preact/compat';
import type { DashboardView } from '../../hooks/useDashboardViewState';
import { cn } from '../../lib/utils';
import { HoverButton } from '../ui/HoverButton';

type Props = {
    view: DashboardView;
    showFilters: boolean;
    radius: number;
    limit: number;
    onViewChange: (view: DashboardView) => void;
    onToggleFilters: () => void;
    onOpenPostForm: () => void;
};

function DashboardToolbarComponent({
    view,
    showFilters,
    radius,
    limit,
    onViewChange,
    onToggleFilters,
    onOpenPostForm,
}: Props) {
    return (
        <div class="flex flex-col gap-md pt-3 sm:flex-row sm:items-center sm:justify-between w-full overflow-hidden">
            <div class="flex flex-row items-center gap-md flex-1 min-w-0">
                <div class="tab-switcher flex-1">
                    <HoverButton
                        type="button"
                        id="view-feed-btn"
                        class={cn('tab-btn', view === 'feed' && 'active')}
                        onClick={() => onViewChange('feed')}
                    >
                        <List size={14} strokeWidth={2.5} />
                        <span>Feed</span>
                    </HoverButton>
                    <HoverButton
                        type="button"
                        id="view-map-btn"
                        class={cn('tab-btn', view === 'map' && 'active')}
                        onClick={() => onViewChange('map')}
                    >
                        <MapIcon size={14} strokeWidth={2.5} />
                        <span>Map</span>
                    </HoverButton>
                </div>

                <div class="stack-h gap-md shrink-0">
                    <HoverButton
                        type="button"
                        id="toggle-filters-btn"
                        class={cn(
                            'btn-icon w-[34px] h-[34px] shrink-0',
                            showFilters
                                ? 'text-[var(--accent)] bg-[var(--accent-subtle)]'
                                : 'text-[var(--text-secondary)]'
                        )}
                        onClick={onToggleFilters}
                        aria-label="Filters"
                    >
                        <SlidersHorizontal size={15} />
                    </HoverButton>
                    <HoverButton
                        type="button"
                        id="post-pulse-btn"
                        class="btn-primary h-[34px] px-3 gap-xs text-[12px] w-auto"
                        onClick={onOpenPostForm}
                        aria-label="Post pulse"
                    >
                        <Plus size={14} strokeWidth={2.4} />
                        <span class="hidden sm:inline">New Pulse</span>
                    </HoverButton>
                </div>
            </div>

            {!showFilters && (
                <div class="stack-v items-start gap-[1px] sm:pl-2">
                    <span class="text-[11px] text-[var(--text-tertiary)] leading-none whitespace-nowrap">
                        {radius}m radius
                    </span>
                    <span class="text-[9px] text-[var(--text-tertiary)] opacity-70 font-semibold tracking-wide uppercase whitespace-nowrap">
                        {limit} PER BATCH
                    </span>
                </div>
            )}
        </div>
    );
}

export const DashboardToolbar = memo(DashboardToolbarComponent);

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
        <div class="stack-v gap-md pt-3 sm:flex-row sm:items-start sm:justify-start">
            <div class="stack-v gap-md sm:flex-row sm:items-center sm:flex-wrap">
                <div class="tab-switcher w-fit max-w-full">
                    <HoverButton
                        type="button"
                        id="view-feed-btn"
                        class={cn('tab-btn justify-center', view === 'feed' && 'active')}
                        onClick={() => onViewChange('feed')}
                    >
                        <List size={14} strokeWidth={2.5} />
                        <span class="hidden sm:inline">Feed</span>
                    </HoverButton>
                    <HoverButton
                        type="button"
                        id="view-map-btn"
                        class={cn('tab-btn justify-center', view === 'map' && 'active')}
                        onClick={() => onViewChange('map')}
                    >
                        <MapIcon size={14} strokeWidth={2.5} />
                        <span class="hidden sm:inline">Map</span>
                    </HoverButton>
                </div>

                <div class="stack-h gap-md flex-wrap">
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

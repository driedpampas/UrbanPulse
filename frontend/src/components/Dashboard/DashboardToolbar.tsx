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
        <div class="flex-between gap-md flex-wrap pt-3">
            <div class="stack-h gap-md flex-wrap">
                <div class="tab-switcher">
                    <HoverButton
                        type="button"
                        id="view-feed-btn"
                        class={cn('tab-btn', view === 'feed' && 'active')}
                        onClick={() => onViewChange('feed')}
                    >
                        <List size={14} strokeWidth={2.5} />
                        Feed
                    </HoverButton>
                    <HoverButton
                        type="button"
                        id="view-map-btn"
                        class={cn('tab-btn', view === 'map' && 'active')}
                        onClick={() => onViewChange('map')}
                    >
                        <MapIcon size={14} strokeWidth={2.5} />
                        Map
                    </HoverButton>
                </div>

                <div class="stack-h gap-md">
                    <HoverButton
                        type="button"
                        id="toggle-filters-btn"
                        class={cn(
                            'btn-icon w-[34px] h-[34px]',
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
                        class="btn-primary h-[34px] px-3 gap-xs text-[12px]"
                        onClick={onOpenPostForm}
                        aria-label="Post pulse"
                    >
                        <Plus size={14} strokeWidth={2.4} />
                        New Pulse
                    </HoverButton>
                </div>
            </div>

            {!showFilters && (
                <div class="stack-v items-end gap-[1px]">
                    <span class="text-[11px] text-[var(--text-tertiary)] leading-none">
                        {radius}m radius
                    </span>
                    <span class="text-[9px] text-[var(--text-tertiary)] opacity-70 font-semibold tracking-wide uppercase">
                        {limit} PER BATCH
                    </span>
                </div>
            )}
        </div>
    );
}

export const DashboardToolbar = memo(DashboardToolbarComponent);

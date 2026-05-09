import { AlertTriangle, List, Map as MapIcon, Plus, SlidersHorizontal } from 'lucide-preact';
import { Fragment } from 'preact';
import { memo } from 'preact/compat';
import type { CrisisFeedTab } from '../../hooks/useCrisisMode';
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
    crisisMode?: boolean;
    crisisFeedTab?: CrisisFeedTab;
    onCrisisFeedTabChange?: (tab: CrisisFeedTab) => void;
};

function DashboardToolbarComponent({
    view,
    showFilters,
    radius,
    limit,
    onViewChange,
    onToggleFilters,
    onOpenPostForm,
    crisisMode = false,
    crisisFeedTab = 'emergency',
    onCrisisFeedTabChange,
}: Props) {
    const showCrisisTabs = crisisMode && view === 'feed';

    return (
        <Fragment>
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
                                    ? 'text-(--accent) bg-(--accent-subtle)'
                                    : 'text-(--text-secondary)'
                            )}
                            onClick={onToggleFilters}
                            aria-label="Filters"
                        >
                            <SlidersHorizontal size={15} />
                        </HoverButton>
                        <HoverButton
                            type="button"
                            id="post-pulse-btn"
                            class="btn-ghost h-[34px] px-3 gap-xs text-[12px] w-auto"
                            style="color:var(--accent);border-color:var(--accent);"
                            onClick={onOpenPostForm}
                            aria-label="Post pulse"
                        >
                            <Plus size={14} strokeWidth={2.4} />
                            <span class="hidden sm:inline">New Pulse</span>
                        </HoverButton>
                    </div>
                </div>

                {!showFilters && (
                    <div class="stack-v items-start gap-px sm:pl-2">
                        <span class="text-[11px] text-(--text-tertiary) leading-none whitespace-nowrap">
                            {radius}m radius
                        </span>
                        <span class="text-[9px] text-(--text-tertiary) opacity-70 font-semibold tracking-wide uppercase whitespace-nowrap">
                            {limit} PER BATCH
                        </span>
                    </div>
                )}
            </div>

            {showCrisisTabs && (
                <div class="flex flex-col gap-sm w-full mt-lg pt-3">
                    <div class="tab-switcher">
                        <HoverButton
                            type="button"
                            id="crisis-tab-emergency"
                            class={cn(
                                'tab-btn',
                                crisisFeedTab === 'emergency' && 'active',
                                crisisMode && crisisFeedTab === 'emergency' && 'crisis-emergency'
                            )}
                            onClick={() => onCrisisFeedTabChange?.('emergency')}
                        >
                            <AlertTriangle size={13} strokeWidth={2.5} />
                            <span>Emergency</span>
                        </HoverButton>
                        <HoverButton
                            type="button"
                            id="crisis-tab-other"
                            class={cn('tab-btn', crisisFeedTab === 'other' && 'active')}
                            onClick={() => onCrisisFeedTabChange?.('other')}
                        >
                            <List size={13} strokeWidth={2.5} />
                            <span>Other</span>
                        </HoverButton>
                    </div>
                </div>
            )}
        </Fragment>
    );
}

export const DashboardToolbar = memo(DashboardToolbarComponent);

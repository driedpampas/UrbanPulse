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

const tabBaseStyle =
    'display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;font-family:inherit;';

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
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0 0;gap:12px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);">
                    <HoverButton
                        type="button"
                        id="view-feed-btn"
                        class={cn(tabBaseStyle)}
                        style={`${
                            view === 'feed'
                                ? 'background:var(--accent-subtle);color:var(--accent);'
                                : 'background:transparent;color:var(--text-tertiary);'
                        }`}
                        onClick={() => onViewChange('feed')}
                    >
                        <List size={13} />
                        Feed
                    </HoverButton>
                    <HoverButton
                        type="button"
                        id="view-map-btn"
                        class={cn(tabBaseStyle)}
                        style={`${
                            view === 'map'
                                ? 'background:var(--accent-subtle);color:var(--accent);'
                                : 'background:transparent;color:var(--text-tertiary);'
                        }`}
                        onClick={() => onViewChange('map')}
                    >
                        <MapIcon size={13} />
                        Map
                    </HoverButton>
                </div>

                <div style="display:flex;align-items:center;gap:6px;">
                    <HoverButton
                        type="button"
                        id="toggle-filters-btn"
                        class="btn-icon"
                        onClick={onToggleFilters}
                        aria-label="Filters"
                        style={`color:${showFilters ? 'var(--accent)' : 'var(--text-secondary)'};background:${showFilters ? 'var(--accent-subtle)' : 'transparent'};width:34px;height:34px;`}
                    >
                        <SlidersHorizontal size={15} />
                    </HoverButton>
                    <HoverButton
                        type="button"
                        id="post-pulse-btn"
                        class="btn-primary"
                        onClick={onOpenPostForm}
                        aria-label="Post pulse"
                        style="padding:0 12px;height:34px;font-size:12px;gap:6px;"
                    >
                        <Plus size={14} strokeWidth={2.4} />
                        New Pulse
                    </HoverButton>
                </div>
            </div>

            {!showFilters && (
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;">
                    <span style="font-size:11px;color:var(--text-tertiary);line-height:1;">
                        {radius}m radius
                    </span>
                    <span style="font-size:9px;color:var(--text-tertiary);opacity:0.7;font-weight:600;letter-spacing:0.02em;">
                        {limit} PER BATCH
                    </span>
                </div>
            )}
        </div>
    );
}

export const DashboardToolbar = memo(DashboardToolbarComponent);

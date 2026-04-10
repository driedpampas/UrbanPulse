import { List, Map as MapIcon, Plus, SlidersHorizontal } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { LiveFeed } from '../components/Dashboard/LiveFeed';
import { PulseMap } from '../components/Dashboard/PulseMap';
import { WeatherAlert } from '../components/Dashboard/WeatherAlert';
import { AppLayout } from '../components/Layout/AppLayout';
import { NeedPostingForm } from '../components/Requests/NeedPostingForm';

export function Dashboard() {
    const [view, setView] = useState<'feed' | 'map'>('feed');
    const [showPostForm, setShowPostForm] = useState(false);
    const [radius, setRadius] = useState(500);
    const [showFilters, setShowFilters] = useState(false);

    /* Segmented control tab */
    const tabStyle = (active: boolean) => `
		display:inline-flex;align-items:center;gap:5px;
		padding:4px 10px;border-radius:6px;border:none;
		font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;
		font-family:inherit;
		${
            active
                ? 'background:var(--accent-subtle);color:var(--accent);'
                : 'background:transparent;color:var(--text-tertiary);'
        }
	`;

    return (
        <AppLayout
            title="UrbanPulse"
            headerRight={
                <>
                    <button
                        type="button"
                        id="toggle-filters-btn"
                        class="btn-icon"
                        onClick={() => setShowFilters((v) => !v)}
                        aria-label="Filters"
                        style={`color:${showFilters ? 'var(--accent)' : 'var(--text-secondary)'};background:${showFilters ? 'var(--accent-subtle)' : 'transparent'};`}
                    >
                        <SlidersHorizontal size={15} />
                    </button>
                    <button
                        type="button"
                        id="post-pulse-btn"
                        class="btn-primary"
                        onClick={() => setShowPostForm(true)}
                        aria-label="Post pulse"
                    >
                        <Plus size={14} strokeWidth={2.4} />
                        New Pulse
                    </button>
                </>
            }
        >
            <div style={`display:flex;flex-direction:column;${view === 'map' ? 'flex:1;' : ''}`}>
                {/* Toolbar row */}
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0 0;gap:10px;">
                    {/* View toggle */}
                    <div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);">
                        <button
                            type="button"
                            id="view-feed-btn"
                            style={tabStyle(view === 'feed')}
                            onClick={() => setView('feed')}
                        >
                            <List size={13} />
                            Feed
                        </button>
                        <button
                            type="button"
                            id="view-map-btn"
                            style={tabStyle(view === 'map')}
                            onClick={() => setView('map')}
                        >
                            <MapIcon size={13} />
                            Map
                        </button>
                    </div>

                    {!showFilters && (
                        <span style="font-size:11px;color:var(--text-tertiary);font-variant-numeric:tabular-nums;">
                            {radius}m radius
                        </span>
                    )}
                </div>

                {/* Filter panel */}
                {showFilters && (
                    <div
                        class="animate-slide-up"
                        style="margin-top:10px;padding:12px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);"
                    >
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <label
                                style="font-size:12px;font-weight:600;color:var(--text-secondary);"
                                for="radius-input"
                            >
                                Radius filter
                            </label>
                            <span style="font-size:12px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums;">
                                {radius} m
                            </span>
                        </div>
                        <input
                            id="radius-input"
                            type="range"
                            min={100}
                            max={2000}
                            step={100}
                            value={radius}
                            onInput={(e) => setRadius(Number((e.target as HTMLInputElement).value))}
                            style="width:100%;accent-color:var(--accent);"
                            aria-label={`Radius: ${radius} meters`}
                        />
                        <div style="display:flex;justify-content:space-between;margin-top:4px;">
                            <span style="font-size:10px;color:var(--text-tertiary);">100m</span>
                            <span style="font-size:10px;color:var(--text-tertiary);">2km</span>
                        </div>
                    </div>
                )}

                {/* Weather */}
                <WeatherAlert />

                {/* Main view */}
                {view === 'feed' ? (
                    <LiveFeed radiusFilter={radius} />
                ) : (
                    <div style="margin-top:12px;flex:1;display:flex;flex-direction:column;min-height:55dvh;">
                        <PulseMap expanded radiusFilter={radius} />
                    </div>
                )}
            </div>

            {showPostForm && <NeedPostingForm onClose={() => setShowPostForm(false)} />}
        </AppLayout>
    );
}

import { List, Map as MapIcon, Plus, SlidersHorizontal } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { HeroAlert } from '../components/Dashboard/HeroAlert';
import { LiveFeed } from '../components/Dashboard/LiveFeed';
import { PulseMap } from '../components/Dashboard/PulseMap';
import { WeatherAlert } from '../components/Dashboard/WeatherAlert';
import { AppLayout } from '../components/Layout/AppLayout';
import { NeedPostingForm } from '../components/Requests/NeedPostingForm';

export function Dashboard() {
    const [view, setView] = useState<'feed' | 'map'>('feed');
    const [showPostForm, setShowPostForm] = useState(false);
    const [radius, setRadius] = useState(() => {
        const saved = localStorage.getItem('up_radius_filter');
        return saved ? Number(saved) : 500;
    });

    const updateRadius = (val: number) => {
        setRadius(val);
        localStorage.setItem('up_radius_filter', val.toString());
    };
    const [limit, setLimit] = useState(50);
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
        <AppLayout title="UrbanPulse" headerRight={null}>
            <div style={`display:flex;flex-direction:column;${view === 'map' ? 'flex:1;' : ''}`}>
                {/* Toolbar row */}
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0 0;gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        {/* View toggle */}
                        <div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);">
                            <button
                                type="button"
                                id="view-feed-btn"
                                style={tabStyle(view === 'feed')}
                                onClick={() => setView('feed')}
                                onMouseEnter={(e) => ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')}
                                onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                            >
                                <List size={13} />
                                Feed
                            </button>
                            <button
                                type="button"
                                id="view-map-btn"
                                style={tabStyle(view === 'map')}
                                onClick={() => setView('map')}
                                onMouseEnter={(e) => ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')}
                                onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                            >
                                <MapIcon size={13} />
                                Map
                            </button>
                        </div>

                        {/* Actions */}
                        <div style="display:flex;align-items:center;gap:6px;">
                            <button
                                type="button"
                                id="toggle-filters-btn"
                                class="btn-icon"
                                onClick={() => setShowFilters((v) => !v)}
                                aria-label="Filters"
                                style={`color:${showFilters ? 'var(--accent)' : 'var(--text-secondary)'};background:${showFilters ? 'var(--accent-subtle)' : 'transparent'};width:34px;height:34px;`}
                                onMouseEnter={(e) => ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')}
                                onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                            >
                                <SlidersHorizontal size={15} />
                            </button>
                            <button
                                type="button"
                                id="post-pulse-btn"
                                class="btn-primary"
                                onClick={() => setShowPostForm(true)}
                                aria-label="Post pulse"
                                style="padding:0 12px;height:34px;font-size:12px;gap:6px;"
                                onMouseEnter={(e) => ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')}
                                onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                            >
                                <Plus size={14} strokeWidth={2.4} />
                                New Pulse
                            </button>
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

                {/* Filter panel */}
                {showFilters && (
                    <div
                        class="animate-slide-up"
                        style="margin-top:10px;padding:14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-subtle);display:flex;flex-direction:column;gap:14px;"
                    >
                        {/* Radius slider */}
                        <div>
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
                                max={5000}
                                step={100}
                                value={radius}
                                onInput={(e) =>
                                    updateRadius(Number((e.target as HTMLInputElement).value))
                                }
                                style="width:100%;accent-color:var(--accent);cursor:pointer;"
                                aria-label={`Radius: ${radius} meters`}
                            />
                        </div>

                        {/* Limit slider */}
                        <div style="padding-top:12px;border-top:1px solid var(--border);">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                <label
                                    style="font-size:12px;font-weight:600;color:var(--text-secondary);"
                                    for="limit-input"
                                >
                                    Pulse capacity
                                </label>
                                <span style="font-size:10px;font-weight:800;color:var(--accent);text-transform:uppercase;">
                                    {limit} PER BATCH
                                </span>
                            </div>
                            <input
                                id="limit-input"
                                type="range"
                                min={10}
                                max={100}
                                step={10}
                                value={limit}
                                onInput={(e) =>
                                    setLimit(Number((e.target as HTMLInputElement).value))
                                }
                                style="width:100%;accent-color:var(--accent);cursor:pointer;"
                                aria-label={`Limit: ${limit} pulses`}
                            />
                        </div>
                    </div>
                )}

                {/* Weather */}
                <WeatherAlert />

                {/* Hero Alert Listener */}
                <HeroAlert />

                {/* Main view */}
                {view === 'feed' ? (
                    <LiveFeed radiusFilter={radius} pulseLimit={limit} />
                ) : (
                    <div style="margin-top:12px;flex:1;display:flex;flex-direction:column;min-height:55dvh;">
                        <PulseMap expanded radiusFilter={radius} pulseLimit={limit} />
                    </div>
                )}
            </div>

            {showPostForm && <NeedPostingForm onClose={() => setShowPostForm(false)} />}
        </AppLayout>
    );
}

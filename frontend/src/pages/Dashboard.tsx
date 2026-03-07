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

    return (
        <AppLayout title="UrbanPulse">
            <WeatherAlert />

            <div class="flex items-center justify-between px-4 mt-3">
                <div class="flex glass rounded-xl p-0.5 gap-0.5">
                    <button
                        type="button"
                        onClick={() => setView('feed')}
                        class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            view === 'feed'
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-text-secondary hover:text-text'
                        }`}
                    >
                        <List size={14} /> Feed
                    </button>
                    <button
                        type="button"
                        onClick={() => setView('map')}
                        class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            view === 'map'
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-text-secondary hover:text-text'
                        }`}
                    >
                        <MapIcon size={14} /> Map
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowFilters(!showFilters)}
                        class="glass rounded-xl p-2 text-text-secondary hover:text-primary transition-colors"
                    >
                        <SlidersHorizontal size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowPostForm(true)}
                        class="bg-linear-to-r from-primary to-primary-dark text-white rounded-xl p-2 shadow-lg hover:shadow-xl transition-shadow"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {showFilters && (
                <div class="mx-4 mt-2 glass rounded-xl p-3 animate-fade-up">
                    <label class="text-xs font-medium text-text-secondary">
                        Radius: {radius}m
                        <input
                            type="range"
                            min={100}
                            max={2000}
                            step={100}
                            value={radius}
                            onInput={(e) => setRadius(Number((e.target as HTMLInputElement).value))}
                            class="w-full mt-1 accent-primary"
                        />
                    </label>
                </div>
            )}

            {view === 'feed' ? <LiveFeed radiusFilter={radius} /> : <PulseMap />}

            {showPostForm && <NeedPostingForm onClose={() => setShowPostForm(false)} />}
        </AppLayout>
    );
}

import { AlertTriangle, RefreshCw, Sun } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { fetchWeather } from '../../lib/mockApi';
import type { WeatherData } from '../../lib/types';

export function WeatherAlert() {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchWeather();
            setWeather(data);
        } catch {
            setWeather(null);
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    if (loading)
        return <div class="mx-4 mt-3 rounded-2xl bg-surface-dim/50 p-3 animate-pulse h-14" />;

    if (!weather) return null;

    if (weather.severe) {
        return (
            <div class="mx-4 mt-3 rounded-2xl bg-linear-to-r from-danger/90 to-danger-light/80 text-white p-4 animate-fade-up shadow-lg">
                <div class="flex items-start gap-3">
                    <AlertTriangle size={24} class="shrink-0 mt-0.5" />
                    <div class="flex-1">
                        <p class="font-bold text-sm">
                            {weather.icon} {weather.description}
                        </p>
                        <p class="text-xs opacity-90 mt-1">{weather.warning}</p>
                        <div class="mt-2 flex items-center gap-2">
                            <span class="text-xs bg-white/20 rounded-full px-2 py-0.5">
                                Safety Check-in
                            </span>
                            <button
                                type="button"
                                onClick={load}
                                class="text-xs underline opacity-80 hover:opacity-100 flex items-center gap-1"
                            >
                                <RefreshCw size={12} /> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div class="mx-4 mt-3 rounded-2xl glass p-3 flex items-center gap-3 animate-fade-up">
            <Sun size={20} class="text-accent" />
            <div>
                <span class="text-sm font-medium">{weather.temp}°C</span>
                <span class="text-xs text-text-secondary ml-2">{weather.description}</span>
            </div>
        </div>
    );
}

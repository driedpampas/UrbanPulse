import { AlertTriangle, RefreshCw, Thermometer } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import type { WeatherData } from '../../lib/types';
import { fetchCurrentUser } from '../../lib/userApi';
import {
    DEFAULT_PULSE_CENTER,
    getCurrentBrowserLocation,
    isUsableCoordinates,
} from '../../lib/utils';
import { fetchWeather } from '../../lib/weatherApi';
import { HoverButton } from '../ui/HoverButton';

export function WeatherAlert() {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const user = await fetchCurrentUser();
            let lat = user.lat;
            let lng = user.lng;

            if (!isUsableCoordinates(lat, lng)) {
                try {
                    const loc = await getCurrentBrowserLocation();
                    lat = loc.lat;
                    lng = loc.lng;
                } catch {
                    lat = DEFAULT_PULSE_CENTER.lat;
                    lng = DEFAULT_PULSE_CENTER.lng;
                }
            }

            setWeather(await fetchWeather(lat, lng));
        } catch {
            setWeather(null);
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    if (loading) {
        return (
            <div style="margin:12px 0 0;height:36px;border-radius:8px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;" />
        );
    }

    if (!weather) return null;

    if (weather.severe) {
        return (
            <div
                class="animate-fade-in"
                style="margin:12px 0 0;padding:10px 14px;border-radius:8px;background:var(--danger-subtle);border:1px solid var(--type-emergency-border);display:flex;align-items:flex-start;gap:10px;"
            >
                <AlertTriangle
                    size={15}
                    style="color:var(--danger);flex-shrink:0;margin-top:1px;"
                />
                <div style="flex:1;min-width:0;">
                    <p style="font-size:13px;font-weight:600;color:var(--danger);margin:0 0 2px;">
                        {weather.icon} {weather.description}
                    </p>
                    {weather.warning && (
                        <p style="font-size:11px;color:var(--text-secondary);margin:0 0 6px;">
                            {weather.warning}
                        </p>
                    )}
                    <HoverButton
                        type="button"
                        onClick={load}
                        style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;color:var(--danger);background:none;border:none;cursor:pointer;padding:0;opacity:0.7;"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <RefreshCw size={10} />
                        Refresh
                    </HoverButton>
                </div>
            </div>
        );
    }

    return (
        <div
            class="animate-fade-in"
            style="margin:12px 0 0;padding:8px 12px;border-radius:8px;background:var(--bg-subtle);border:1px solid var(--border);display:inline-flex;align-items:center;gap:8px;width:100%;"
        >
            <Thermometer size={13} style="color:var(--warning);flex-shrink:0;" />
            <span style="font-size:13px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;">
                {weather.temp}°C
            </span>
            <span style="font-size:12px;color:var(--text-secondary);">
                {weather.icon} {weather.description}
            </span>
        </div>
    );
}

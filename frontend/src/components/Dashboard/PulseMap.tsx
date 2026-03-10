import { AlertCircle, MapPin } from 'lucide-preact';
import type { ErrorEvent as MapboxErrorEvent, Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'preact/hooks';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN?.trim() || '';
const MAPBOX_STYLE_ID = 'mapbox/light-v11';
const MAPBOX_STYLE_URL = `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE_ID}`;

const MOCK_MARKERS = [
    { lat: 40.7128, lng: -74.006, label: 'Grocery help needed', type: 'need' },
    { lat: 40.714, lng: -74.003, label: 'Yoga class', type: 'skill' },
    { lat: 40.711, lng: -74.009, label: 'Power drill available', type: 'item' },
    { lat: 40.715, lng: -74.001, label: 'Water main break', type: 'emergency' },
    { lat: 40.71, lng: -74.007, label: 'Found dog', type: 'pet' },
];

const typeColors: Record<string, string> = {
    need: '#f59e0b',
    skill: '#8b5cf6',
    item: '#10b981',
    emergency: '#ef4444',
    pet: '#ec4899',
};

function ensureMapboxToken(token: string) {
    if (!token) {
        throw new Error(
            'Missing VITE_MAPBOX_TOKEN. Set a public Mapbox token before loading the map.'
        );
    }

    if (!token.startsWith('pk.')) {
        throw new Error(
            'Invalid Mapbox token. Browser apps must use a public token that starts with "pk.".'
        );
    }
}

async function verifyMapboxToken(token: string) {
    ensureMapboxToken(token);

    const response = await fetch(`${MAPBOX_STYLE_URL}?access_token=${encodeURIComponent(token)}`);
    if (response.ok) {
        return;
    }

    const responseBody = await response.text().catch(() => '');
    const details = responseBody.includes('Not Authorized')
        ? ' Token is not authorized for this style or domain.'
        : '';

    throw new Error(
        `Invalid Mapbox token. Style request failed with ${response.status} ${response.statusText}.${details}`
    );
}

export function PulseMap({ expanded = false }: { expanded?: boolean }) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const [mapError, setMapError] = useState<string | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);

    useEffect(() => {
        if (!mapContainer.current) {
            return;
        }

        let disposed = false;
        let map: MapboxMap | undefined;
        let resizeObserver: ResizeObserver | undefined;

        const initMap = async () => {
            await verifyMapboxToken(MAPBOX_TOKEN);

            const [{ default: mapboxgl }] = await Promise.all([
                import('mapbox-gl'),
                import('mapbox-gl/dist/mapbox-gl.css'),
            ]);

            if (disposed || !mapContainer.current) {
                return;
            }

            mapboxgl.accessToken = MAPBOX_TOKEN;
            map = new mapboxgl.Map({
                container: mapContainer.current,
                style: `mapbox://styles/${MAPBOX_STYLE_ID}`,
                center: [-74.006, 40.7128],
                zoom: 14,
            });

            resizeObserver = new ResizeObserver(() => {
                map?.resize();
            });
            resizeObserver.observe(mapContainer.current);

            map.on('load', () => {
                if (disposed) {
                    return;
                }

                map?.resize();
                setMapLoaded(true);
                const activeMap = map;
                if (!activeMap) {
                    return;
                }

                MOCK_MARKERS.forEach((m) => {
                    const el = document.createElement('div');
                    el.style.width = '14px';
                    el.style.height = '14px';
                    el.style.borderRadius = '50%';
                    el.style.backgroundColor = typeColors[m.type] || '#8b5cf6';
                    el.style.border = '2px solid white';
                    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                    el.title = m.label;

                    new mapboxgl.Marker(el)
                        .setLngLat([m.lng, m.lat])
                        .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(m.label))
                        .addTo(activeMap);
                });
            });

            map.on('error', (event: MapboxErrorEvent) => {
                const message = event.error?.message || 'Mapbox failed to render the map.';
                const status = (event.error as { status?: number } | undefined)?.status;

                if (
                    status === 401 ||
                    status === 403 ||
                    /token|authorized|authentication/i.test(message)
                ) {
                    const error = new Error(`Invalid Mapbox token. ${message}`);
                    console.error(error);
                    setMapError(error.message);
                    return;
                }

                setMapError(message);
            });
        };

        initMap().catch((error: unknown) => {
            if (disposed) {
                return;
            }

            const mapInitError =
                error instanceof Error ? error : new Error('Mapbox failed to initialize.');
            console.error(mapInitError);
            setMapError(mapInitError.message);
        });

        return () => {
            disposed = true;
            resizeObserver?.disconnect();
            if (map) map.remove();
        };
    }, []);

    if (mapError) {
        return <MapOfflineFallback expanded={expanded} reason={mapError} />;
    }

    return (
        <div
            class={`mx-4 mt-3 rounded-2xl overflow-hidden glass flex flex-col ${
                expanded ? 'flex-1 min-h-[50dvh]' : ''
            }`}
        >
            {!mapLoaded && (
                <div
                    class={`flex items-center justify-center bg-surface-dim/30 ${
                        expanded ? 'min-h-[50dvh] flex-1' : 'h-52'
                    }`}
                >
                    <div class="animate-pulse text-text-secondary text-sm">Loading map…</div>
                </div>
            )}
            <div
                ref={mapContainer}
                class={`w-full ${expanded ? 'flex-1 min-h-[50dvh]' : 'h-52'}`}
                style={{ display: mapLoaded ? 'block' : 'none' }}
            />
        </div>
    );
}

function MapOfflineFallback({ expanded, reason }: { expanded?: boolean; reason: string }) {
    return (
        <div
            class={`mx-4 mt-3 rounded-2xl glass p-5 animate-fade-up ${
                expanded ? 'flex-1 min-h-[50dvh]' : ''
            }`}
        >
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <MapPin size={20} class="text-primary" />
                </div>
                <div>
                    <p class="font-semibold text-sm">Map Offline</p>
                    <p class="text-xs text-text-secondary">Nearby activity shown as a list</p>
                </div>
            </div>
            <div class="space-y-2">
                {MOCK_MARKERS.map((m, i) => (
                    <div
                        key={i}
                        class="flex items-center gap-2 text-sm p-2 rounded-xl bg-surface-dim/40"
                    >
                        <span
                            class="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: typeColors[m.type] }}
                        />
                        <span class="flex-1">{m.label}</span>
                        <span class="text-[10px] text-text-secondary capitalize">{m.type}</span>
                    </div>
                ))}
            </div>
            <p class="text-[10px] text-text-secondary mt-3 flex items-center gap-1">
                <AlertCircle size={10} /> {reason}
            </p>
        </div>
    );
}

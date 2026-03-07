import { AlertCircle, MapPin } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

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

export function PulseMap() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const [mapError, setMapError] = useState(false);
    const [mapLoaded, setMapLoaded] = useState(false);

    useEffect(() => {
        if (!MAPBOX_TOKEN || !mapContainer.current) {
            setMapError(true);
            return;
        }

        let map: mapboxgl.Map | undefined;
        const initMap = async () => {
            try {
                const mapboxgl = await import('mapbox-gl');
                await import('mapbox-gl/dist/mapbox-gl.css');

                (mapboxgl as any).accessToken = MAPBOX_TOKEN;
                map = new mapboxgl.Map({
                    container: mapContainer.current!,
                    style: 'mapbox://styles/mapbox/light-v11',
                    center: [-74.006, 40.7128],
                    zoom: 14,
                });

                map.on('load', () => {
                    setMapLoaded(true);
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
                            .addTo(map!);
                    });
                });

                map.on('error', () => setMapError(true));
            } catch {
                setMapError(true);
            }
        };

        initMap();
        return () => {
            if (map) map.remove();
        };
    }, []);

    if (mapError) {
        return <MapOfflineFallback />;
    }

    return (
        <div class="mx-4 mt-3 rounded-2xl overflow-hidden glass">
            {!mapLoaded && (
                <div class="h-52 flex items-center justify-center bg-surface-dim/30">
                    <div class="animate-pulse text-text-secondary text-sm">Loading map…</div>
                </div>
            )}
            <div
                ref={mapContainer}
                class="h-52 w-full"
                style={{ display: mapLoaded ? 'block' : 'none' }}
            />
        </div>
    );
}

function MapOfflineFallback() {
    return (
        <div class="mx-4 mt-3 rounded-2xl glass p-5 animate-fade-up">
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
                <AlertCircle size={10} /> Set VITE_MAPBOX_TOKEN to enable the interactive map
            </p>
        </div>
    );
}

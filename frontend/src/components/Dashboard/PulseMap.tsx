import { AlertCircle, Clock, MapPin } from 'lucide-preact';
import type { GeoJSONSource, ErrorEvent as MapboxErrorEvent, Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PulseSocketEvent } from '../../lib/pulseApi';
import {
    connectWebSocket,
    disconnectWebSocket,
    fetchPulses,
    mergePulses,
} from '../../lib/pulseApi';
import type { Pulse } from '../../lib/types';
import { fetchCurrentUser } from '../../lib/userApi';
import { distanceInMeters, getCurrentBrowserLocation, isUsableCoordinates } from '../../lib/utils';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN?.trim() || '';
const MAPBOX_STYLE_ID = 'mapbox/light-v11';
const MAPBOX_STYLE_URL = `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE_ID}`;

type MapboxGL = typeof import('mapbox-gl')['default'];
type MarkerHandle = { remove(): void };

const PULSE_DENSITY_SOURCE_ID = 'pulse-density-source';
const PULSE_DENSITY_LAYER_ID = 'pulse-density-heat';
const PULSE_DENSITY_FILL_LAYER_ID = 'pulse-density-fill';

type DensityFeatureCollection = {
    type: 'FeatureCollection';
    features: Array<{
        type: 'Feature';
        geometry: { type: 'Point'; coordinates: [number, number] };
        properties: { weight: number; type: string };
    }>;
};

const typeColors: Record<string, string> = {
    need: '#f59e0b',
    skill: '#8b5cf6',
    item: '#10b981',
    emergency: '#ef4444',
    pet: '#ec4899',
    update: '#64748b',
};

function timeAgo(ts: number) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

function buildDensityData(pulses: Pulse[]): DensityFeatureCollection {
    return {
        type: 'FeatureCollection',
        features: pulses.map((pulse) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [pulse.lng, pulse.lat] },
            properties: {
                weight:
                    Math.max(1, pulse.confirmations || 0) + (pulse.type === 'emergency' ? 2 : 0),
                type: pulse.type,
            },
        })),
    };
}

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

export function PulseMap({
    expanded = false,
    radiusFilter,
    pulseLimit = 50,
}: {
    expanded?: boolean;
    radiusFilter: number;
    pulseLimit?: number;
}) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapboxMap | null>(null);
    const mapboxGlRef = useRef<MapboxGL | null>(null);
    const markersRef = useRef<MarkerHandle[]>([]);
    const [mapError, setMapError] = useState<string | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [pulseError, setPulseError] = useState<string | null>(null);
    const [loadingPulses, setLoadingPulses] = useState(true);
    const [pulses, setPulses] = useState<Pulse[]>([]);
    const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
    const [locationResolved, setLocationResolved] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const initLocation = async () => {
            let nextCenter: { lat: number; lng: number } | null = null;

            try {
                const user = await fetchCurrentUser();
                if (!cancelled && isUsableCoordinates(user.lat, user.lng)) {
                    nextCenter = { lat: user.lat, lng: user.lng };
                }
            } catch {
                // Ignore
            }

            if (!nextCenter) {
                try {
                    const loc = await getCurrentBrowserLocation();
                    if (!cancelled) nextCenter = loc;
                } catch (e) {
                    console.warn('Map browser geolocation failed:', e);
                }
            }

            if (!cancelled) {
                setMapCenter(nextCenter);
                setLocationResolved(true);
            }
        };

        initLocation();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!locationResolved) {
            return;
        }

        let cancelled = false;

        if (!mapCenter) {
            setPulses([]);
            setLoadingPulses(false);
            setPulseError(null);
            return () => {
                cancelled = true;
            };
        }

        setLoadingPulses(true);
        setPulseError(null);

        fetchPulses(mapCenter.lat, mapCenter.lng, radiusFilter, pulseLimit)
            .then((data) => {
                if (!cancelled) {
                    setPulses(data);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setPulseError(
                        error instanceof Error ? error.message : 'Unable to load live pulses.'
                    );
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingPulses(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [radiusFilter, mapCenter, locationResolved, pulseLimit]);

    useEffect(() => {
        const handleWS = (event: PulseSocketEvent) => {
            if (event.event === 'pulse.created') {
                if (!mapCenter) {
                    return;
                }

                if (
                    distanceInMeters(
                        mapCenter.lat,
                        mapCenter.lng,
                        event.pulse.lat,
                        event.pulse.lng
                    ) <= radiusFilter
                ) {
                    setPulses((current) => mergePulses(current, [event.pulse]));
                }
                return;
            }

            if (event.event === 'pulse.deleted') {
                setPulses((current) => current.filter((pulse) => pulse.id !== event.pulseId));
            }
        };

        connectWebSocket(handleWS);

        return () => {
            disconnectWebSocket(handleWS);
        };
    }, [mapCenter, radiusFilter]);

    useEffect(() => {
        if (!mapError) {
            return;
        }

        markersRef.current.forEach((marker) => {
            marker.remove();
        });
        markersRef.current = [];
        mapRef.current?.remove();
        mapRef.current = null;
        mapboxGlRef.current = null;
        setMapLoaded(false);
    }, [mapError]);

    useEffect(() => {
        const activeMap = mapRef.current;

        if (!mapLoaded || !activeMap || !mapCenter) {
            return;
        }

        activeMap.setCenter([mapCenter.lng, mapCenter.lat]);
    }, [mapLoaded, mapCenter]);

    const visiblePulses = pulses;

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

            mapboxGlRef.current = mapboxgl;
            mapboxgl.accessToken = MAPBOX_TOKEN;
            map = new mapboxgl.Map({
                container: mapContainer.current,
                style: `mapbox://styles/${MAPBOX_STYLE_ID}`,
                center: [-74.006, 40.7128],
                zoom: 14,
            });
            mapRef.current = map;

            resizeObserver = new ResizeObserver(() => {
                map?.resize();
            });
            resizeObserver.observe(mapContainer.current);

            map.on('load', () => {
                if (disposed) {
                    return;
                }

                if (!map?.getSource(PULSE_DENSITY_SOURCE_ID)) {
                    map?.addSource(PULSE_DENSITY_SOURCE_ID, {
                        type: 'geojson',
                        data: buildDensityData([]),
                    });

                    map?.addLayer({
                        id: PULSE_DENSITY_LAYER_ID,
                        type: 'heatmap',
                        source: PULSE_DENSITY_SOURCE_ID,
                        maxzoom: 15,
                        paint: {
                            'heatmap-weight': [
                                'interpolate',
                                ['linear'],
                                ['get', 'weight'],
                                0,
                                0,
                                6,
                                1.2,
                                12,
                                2.2,
                            ],
                            'heatmap-intensity': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                0,
                                0.7,
                                12,
                                1.6,
                                15,
                                2.4,
                            ],
                            'heatmap-radius': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                0,
                                16,
                                9,
                                30,
                                12,
                                44,
                                15,
                                60,
                            ],
                            'heatmap-opacity': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                10,
                                0.78,
                                15,
                                0.52,
                            ],
                            'heatmap-color': [
                                'interpolate',
                                ['linear'],
                                ['heatmap-density'],
                                0,
                                'rgba(14,165,233,0)',
                                0.2,
                                'rgba(59,130,246,0.22)',
                                0.4,
                                'rgba(16,185,129,0.36)',
                                0.6,
                                'rgba(250,204,21,0.50)',
                                0.8,
                                'rgba(249,115,22,0.62)',
                                1,
                                'rgba(239,68,68,0.72)',
                            ],
                        },
                    });

                    map?.addLayer({
                        id: PULSE_DENSITY_FILL_LAYER_ID,
                        type: 'circle',
                        source: PULSE_DENSITY_SOURCE_ID,
                        minzoom: 12,
                        paint: {
                            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 15, 11],
                            'circle-color': [
                                'match',
                                ['get', 'type'],
                                'emergency',
                                '#ef4444',
                                'need',
                                '#f59e0b',
                                'skill',
                                '#8b5cf6',
                                'item',
                                '#10b981',
                                'pet',
                                '#ec4899',
                                '#0ea5e9',
                            ],
                            'circle-opacity': 0.28,
                            'circle-blur': 0.85,
                        },
                    });
                }

                map?.resize();
                setMapLoaded(true);
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
            markersRef.current.forEach((marker) => {
                marker.remove();
            });
            markersRef.current = [];
            if (map) map.remove();
            mapRef.current = null;
            mapboxGlRef.current = null;
        };
    }, []);

    useEffect(() => {
        const activeMap = mapRef.current;
        const mapboxgl = mapboxGlRef.current;

        if (!mapLoaded || !activeMap || !mapboxgl || !mapCenter) {
            return;
        }

        const densitySource = activeMap.getSource(PULSE_DENSITY_SOURCE_ID) as
            | GeoJSONSource
            | undefined;
        if (densitySource) {
            densitySource.setData(buildDensityData(visiblePulses) as never);
        }

        markersRef.current.forEach((marker) => {
            marker.remove();
        });
        markersRef.current = [];

        markersRef.current = visiblePulses.map((pulse) => {
            const markerElement = document.createElement('div');
            markerElement.style.width = pulse.type === 'emergency' ? '16px' : '14px';
            markerElement.style.height = pulse.type === 'emergency' ? '16px' : '14px';
            markerElement.style.borderRadius = '50%';
            markerElement.style.backgroundColor = typeColors[pulse.type] || typeColors.update;
            markerElement.style.border = '2px solid white';
            markerElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            markerElement.title = `${pulse.userName}: ${pulse.content}`;

            return new mapboxgl.Marker(markerElement)
                .setLngLat([pulse.lng, pulse.lat])
                .setPopup(
                    new mapboxgl.Popup({ offset: 12 }).setText(
                        `${pulse.userName}: ${pulse.content}`
                    )
                )
                .addTo(activeMap);
        });

        return () => {
            markersRef.current.forEach((marker) => {
                marker.remove();
            });
            markersRef.current = [];
        };
    }, [mapCenter, mapLoaded, visiblePulses]);

    if (locationResolved && !mapCenter) {
        return (
            <div class="mx-4 mt-3 rounded-2xl glass p-5 animate-fade-up">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <MapPin size={20} class="text-primary" />
                    </div>
                    <div>
                        <p class="font-semibold text-sm">No home location selected</p>
                        <p class="text-xs text-text-secondary">
                            Set a home location to see nearby pulses
                        </p>
                    </div>
                </div>
                <div class="rounded-xl bg-surface-dim/40 p-3 text-sm text-text-secondary">
                    Nearby pulses are hidden until a home location is saved or location access is
                    allowed.
                </div>
            </div>
        );
    }

    if (mapError) {
        return (
            <MapOfflineFallback
                expanded={expanded}
                reason={mapError}
                pulses={visiblePulses}
                loading={loadingPulses}
                pulseError={pulseError}
            />
        );
    }

    return (
        <div
            class={`mx-4 mt-3 rounded-2xl overflow-hidden glass flex flex-col relative ${
                expanded ? 'flex-1 min-h-[50dvh]' : ''
            }`}
        >
            <div class="absolute left-4 top-4 z-20 rounded-2xl border border-border/70 bg-white/90 px-3 py-2 text-[11px] font-medium text-text-secondary shadow-lg backdrop-blur-sm">
                Heatmap shows pulse density and urgency
            </div>
            {pulseError && (
                <div class="border-b border-danger/20 bg-danger/5 px-4 py-3 text-xs text-danger">
                    Live pulse feed unavailable. {pulseError}
                </div>
            )}
            {!loadingPulses && visiblePulses.length === 0 && !pulseError && (
                <div class="absolute left-4 top-4 z-10 rounded-2xl border border-border bg-white/90 px-3 py-2 text-xs text-text-secondary shadow-lg backdrop-blur-sm">
                    No pulses within {radiusFilter}m.
                </div>
            )}
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

function MapOfflineFallback({
    expanded,
    reason,
    pulses,
    loading,
    pulseError,
}: {
    expanded?: boolean;
    reason: string;
    pulses: Pulse[];
    loading: boolean;
    pulseError: string | null;
}) {
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
                    <p class="text-xs text-text-secondary">Nearby activity shown as a live list</p>
                </div>
            </div>
            <div class="space-y-2">
                {loading ? (
                    [1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            class="flex items-center gap-3 text-sm p-2 rounded-xl bg-surface-dim/40 animate-pulse"
                        >
                            <div class="w-9 h-9 rounded-full bg-surface-dim shrink-0" />
                            <div class="flex-1 space-y-2">
                                <div class="h-3 bg-surface-dim rounded w-2/5" />
                                <div class="h-3 bg-surface-dim rounded w-full" />
                            </div>
                        </div>
                    ))
                ) : pulses.length === 0 ? (
                    <div class="rounded-xl bg-surface-dim/40 p-3 text-sm text-text-secondary">
                        No pulses are available right now.
                    </div>
                ) : (
                    pulses.slice(0, 6).map((pulse) => (
                        <div
                            key={pulse.id}
                            class="flex items-center gap-3 text-sm p-2 rounded-xl bg-surface-dim/40"
                        >
                            <img
                                src={pulse.userAvatar}
                                alt=""
                                class="w-9 h-9 rounded-full bg-white shrink-0"
                            />
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between gap-2">
                                    <p class="font-medium truncate">{pulse.userName}</p>
                                    <span class="text-[10px] text-text-secondary capitalize shrink-0">
                                        {pulse.type}
                                    </span>
                                </div>
                                <p class="text-xs text-text-secondary line-clamp-2">
                                    {pulse.content}
                                </p>
                                <div class="flex items-center gap-3 mt-1 text-[10px] text-text-secondary">
                                    <span class="flex items-center gap-1">
                                        <Clock size={10} />
                                        {timeAgo(pulse.timestamp)}
                                    </span>
                                    {pulse.confirmations > 0 && (
                                        <span>{pulse.confirmations} confirmed</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {pulseError && <p class="text-xs text-danger mt-3">{pulseError}</p>}
            <p class="text-[10px] text-text-secondary mt-3 flex items-center gap-1">
                <AlertCircle size={10} /> {reason}
            </p>
        </div>
    );
}

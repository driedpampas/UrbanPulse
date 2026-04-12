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
import { useTheme } from '../../lib/theme';
import type { Pulse } from '../../lib/types';
import { fetchCurrentUser } from '../../lib/userApi';
import { distanceInMeters, getCurrentBrowserLocation, isUsableCoordinates } from '../../lib/utils';
import { UserAvatar } from '../ui/UserAvatar';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN?.trim() || '';
const MAPBOX_LIGHT_STYLE_ID = 'mapbox/light-v11';
const MAPBOX_DARK_STYLE_ID = 'mapbox/dark-v11';
const MAPBOX_STYLE_URL = (styleId: string) => `https://api.mapbox.com/styles/v1/${styleId}`;

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

function getThemeColors() {
    if (typeof window === 'undefined') {
        return {
            accent: '#6366f1',
            text: '#0f1117',
            border: '#e2e3e6',
            surface: '#ffffff',
            success: '#16a34a',
            warning: '#d97706',
            danger: '#dc2626',
            muted: '#5c5f6e',
            overlay: 'rgba(255,255,255,0.94)',
        };
    }

    const styles = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback;

    return {
        accent: get('--accent', '#6366f1'),
        text: get('--text', '#0f1117'),
        border: get('--border', '#e2e3e6'),
        surface: get('--surface', '#ffffff'),
        success: get('--success', '#16a34a'),
        warning: get('--warning', '#d97706'),
        danger: get('--danger', '#dc2626'),
        muted: get('--text-secondary', '#5c5f6e'),
        overlay: get('--surface-overlay', 'rgba(255,255,255,0.94)'),
    };
}

function getPulseTypeColors() {
    if (typeof window === 'undefined') {
        return {
            need: '#d97706',
            skill: '#6366f1',
            item: '#16a34a',
            emergency: '#dc2626',
            update: '#64748b',
            pet: '#0ea5e9',
        };
    }

    const styles = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback;

    return {
        need: get('--type-update-text', '#d97706'),
        skill: get('--type-skill-text', '#6366f1'),
        item: get('--type-item-text', '#16a34a'),
        emergency: get('--type-emergency-text', '#dc2626'),
        update: get('--text-secondary', '#64748b'),
        pet: get('--accent', '#0ea5e9'),
    };
}

function toRgba(color: string, alpha: number) {
    if (color.startsWith('rgb')) {
        return color.replace(/rgba?\(([^)]+)\)/, (_match, channelList: string) => {
            const [r, g, b] = channelList.split(',').map((value: string) => value.trim());
            return `rgba(${r},${g},${b},${alpha})`;
        });
    }

    const hex = color.replace('#', '');
    if (hex.length === 3) {
        const r = hex[0];
        const g = hex[1];
        const b = hex[2];
        return `rgba(${parseInt(r + r, 16)},${parseInt(g + g, 16)},${parseInt(b + b, 16)},${alpha})`;
    }

    if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    return color;
}

function buildHeatmapColors(colors: ReturnType<typeof getThemeColors>) {
    return [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        toRgba(colors.accent, 0),
        0.2,
        toRgba(colors.accent, 0.16),
        0.4,
        toRgba(colors.warning, 0.24),
        0.6,
        toRgba(colors.success, 0.32),
        0.8,
        toRgba(colors.warning, 0.48),
        1,
        toRgba(colors.danger, 0.6),
    ] as const;
}

function buildCircleColors(colors: ReturnType<typeof getThemeColors>) {
    return [
        'match',
        ['get', 'type'],
        'emergency',
        colors.danger,
        'need',
        colors.warning,
        'skill',
        colors.accent,
        'item',
        colors.success,
        colors.muted,
    ] as const;
}

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
}

async function verifyMapboxToken(token: string) {
    ensureMapboxToken(token);

    const response = await fetch(
        `${MAPBOX_STYLE_URL(MAPBOX_LIGHT_STYLE_ID)}?access_token=${encodeURIComponent(token)}`
    );
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
    const { theme } = useTheme();
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
    const themeColors = getThemeColors();
    const pulseTypeColors = getPulseTypeColors();
    const mapStyleId = theme === 'dark' ? MAPBOX_DARK_STYLE_ID : MAPBOX_LIGHT_STYLE_ID;

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
                return;
            }

            if (event.event === 'pulse.updated') {
                setPulses((current) => {
                    let found = false;
                    const next = current.map((pulse) => {
                        if (pulse.id === event.pulse.id) {
                            found = true;
                            return event.pulse;
                        }

                        return pulse;
                    });

                    return found ? next : current;
                });
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

        const applyLayers = (activeMap: MapboxMap, colors = getThemeColors()) => {
            if (!activeMap.getSource(PULSE_DENSITY_SOURCE_ID)) {
                activeMap.addSource(PULSE_DENSITY_SOURCE_ID, {
                    type: 'geojson',
                    data: buildDensityData([]),
                });
            }

            if (!activeMap.getLayer(PULSE_DENSITY_LAYER_ID)) {
                activeMap.addLayer({
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
                        'heatmap-color': buildHeatmapColors(colors) as never,
                    },
                });
            } else {
                activeMap.setPaintProperty(
                    PULSE_DENSITY_LAYER_ID,
                    'heatmap-color',
                    buildHeatmapColors(colors) as never
                );
            }

            if (!activeMap.getLayer(PULSE_DENSITY_FILL_LAYER_ID)) {
                activeMap.addLayer({
                    id: PULSE_DENSITY_FILL_LAYER_ID,
                    type: 'circle',
                    source: PULSE_DENSITY_SOURCE_ID,
                    minzoom: 12,
                    paint: {
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 15, 11],
                        'circle-color': buildCircleColors(colors) as never,
                        'circle-opacity': 0.28,
                        'circle-blur': 0.85,
                    },
                });
            } else {
                activeMap.setPaintProperty(
                    PULSE_DENSITY_FILL_LAYER_ID,
                    'circle-color',
                    buildCircleColors(colors) as never
                );
            }
        };

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
                style: `mapbox://styles/${mapStyleId}`,
                center: [-74.006, 40.7128],
                zoom: 14,
            });
            mapRef.current = map;

            resizeObserver = new ResizeObserver(() => {
                map?.resize();
            });
            resizeObserver.observe(mapContainer.current);

            map.on('load', () => {
                if (disposed || !map) {
                    return;
                }

                applyLayers(map);
                map.resize();
                setMapLoaded(true);
            });

            map.on('style.load', () => {
                if (disposed || !map) {
                    return;
                }

                applyLayers(map);
                map.resize();
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
    }, [mapStyleId]);

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
            markerElement.style.backgroundColor = pulseTypeColors[pulse.type] || themeColors.muted;
            markerElement.style.border = `2px solid ${themeColors.surface}`;
            markerElement.style.boxShadow = `0 0 0 3px ${toRgba(themeColors.accent, 0.12)}, 0 2px 8px ${toRgba(themeColors.text, 0.2)}`;
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
    }, [
        mapCenter,
        mapLoaded,
        visiblePulses,
        theme,
        themeColors.accent,
        themeColors.text,
        themeColors.surface,
        themeColors.muted,
        themeColors.border,
        themeColors.overlay,
        themeColors.warning,
        themeColors.success,
        themeColors.danger,
    ]);

    if (locationResolved && !mapCenter) {
        return (
            <div class="mx-4 mt-3 section animate-fade-up">
                <div class="flex items-center gap-3 mb-3">
                    <div
                        class="w-10 h-10 rounded-full flex items-center justify-center"
                        style={`background:${toRgba(themeColors.accent, 0.12)};`}
                    >
                        <MapPin size={20} style={`color:${themeColors.accent};`} />
                    </div>
                    <div>
                        <p class="font-semibold text-sm" style={`color:${themeColors.text};`}>
                            No home location selected
                        </p>
                        <p class="text-xs" style={`color:${themeColors.muted};`}>
                            Set a home location to see nearby pulses
                        </p>
                    </div>
                </div>
                <div
                    class="rounded-xl p-3 text-sm"
                    style={`background:${toRgba(themeColors.text, 0.04)};color:${themeColors.muted};border:1px solid ${themeColors.border};`}
                >
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
                themeColors={themeColors}
            />
        );
    }

    return (
        <div
            class={`mx-4 mt-3 section flex flex-col relative overflow-hidden ${
                expanded ? 'flex-1 min-h-[50dvh]' : ''
            }`}
        >
            <div
                class="absolute left-4 top-4 z-20 rounded-2xl px-3 py-2 text-[11px] font-medium shadow-lg backdrop-blur-sm"
                style={`border:1px solid ${themeColors.border};background:${themeColors.overlay};color:${themeColors.muted};`}
            >
                Heatmap shows pulse density and urgency
            </div>
            {pulseError && (
                <div
                    class="border-b px-4 py-3 text-xs"
                    style={`border-color:${toRgba(themeColors.danger, 0.2)};background:${toRgba(themeColors.danger, 0.06)};color:${themeColors.danger};`}
                >
                    Live pulse feed unavailable. {pulseError}
                </div>
            )}
            {!loadingPulses && visiblePulses.length === 0 && !pulseError && (
                <div
                    class="absolute left-4 top-4 z-10 rounded-2xl px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
                    style={`border:1px solid ${themeColors.border};background:${themeColors.overlay};color:${themeColors.muted};`}
                >
                    No pulses within {radiusFilter}m.
                </div>
            )}
            {!mapLoaded && (
                <div
                    class={`flex items-center justify-center ${
                        expanded ? 'min-h-[50dvh] flex-1' : 'h-52'
                    }`}
                    style={`background:${toRgba(themeColors.text, 0.03)};`}
                >
                    <div class="animate-pulse text-sm" style={`color:${themeColors.muted};`}>
                        Loading map…
                    </div>
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
    themeColors,
}: {
    expanded?: boolean;
    reason: string;
    pulses: Pulse[];
    loading: boolean;
    pulseError: string | null;
    themeColors: ReturnType<typeof getThemeColors>;
}) {
    return (
        <div
            class={`mx-4 mt-3 section p-5 animate-fade-up ${
                expanded ? 'flex-1 min-h-[50dvh]' : ''
            }`}
        >
            <div class="flex items-center gap-3 mb-4">
                <div
                    class="w-10 h-10 rounded-full flex items-center justify-center"
                    style={`background:${toRgba(themeColors.accent, 0.12)};`}
                >
                    <MapPin size={20} style={`color:${themeColors.accent};`} />
                </div>
                <div>
                    <p class="font-semibold text-sm" style={`color:${themeColors.text};`}>
                        Map Offline
                    </p>
                    <p class="text-xs" style={`color:${themeColors.muted};`}>
                        Nearby activity shown as a live list
                    </p>
                </div>
            </div>
            <div class="space-y-2">
                {loading ? (
                    [1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            class="flex items-center gap-3 text-sm p-2 rounded-xl animate-pulse"
                            style={`background:${toRgba(themeColors.text, 0.04)};`}
                        >
                            <div
                                class="w-9 h-9 rounded-full shrink-0"
                                style={`background:${toRgba(themeColors.text, 0.08)};`}
                            />
                            <div class="flex-1 space-y-2">
                                <div
                                    class="h-3 rounded w-2/5"
                                    style={`background:${toRgba(themeColors.text, 0.08)};`}
                                />
                                <div
                                    class="h-3 rounded w-full"
                                    style={`background:${toRgba(themeColors.text, 0.08)};`}
                                />
                            </div>
                        </div>
                    ))
                ) : pulses.length === 0 ? (
                    <div
                        class="rounded-xl p-3 text-sm"
                        style={`background:${toRgba(themeColors.text, 0.04)};color:${themeColors.muted};`}
                    >
                        No pulses are available right now.
                    </div>
                ) : (
                    pulses.slice(0, 6).map((pulse) => (
                        <div
                            key={pulse.id}
                            class="flex items-center gap-3 text-sm p-2 rounded-xl"
                            style={`background:${toRgba(themeColors.text, 0.04)};`}
                        >
                            <UserAvatar
                                userId={pulse.userId}
                                fallbackSrc={pulse.userAvatar}
                                alt={`${pulse.userName} profile picture`}
                                className="w-9 h-9 rounded-full shrink-0"
                                style={`background:${themeColors.surface};`}
                            />
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between gap-2">
                                    <p
                                        class="font-medium truncate"
                                        style={`color:${themeColors.text};`}
                                    >
                                        {pulse.userName}
                                    </p>
                                    <span
                                        class="text-[10px] capitalize shrink-0"
                                        style={`color:${themeColors.muted};`}
                                    >
                                        {pulse.type}
                                    </span>
                                </div>
                                <p
                                    class="text-xs line-clamp-2"
                                    style={`color:${themeColors.muted};`}
                                >
                                    {pulse.content}
                                </p>
                                <div
                                    class="flex items-center gap-3 mt-1 text-[10px]"
                                    style={`color:${themeColors.muted};`}
                                >
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
            {pulseError && (
                <p class="text-xs mt-3" style={`color:${themeColors.danger};`}>
                    {pulseError}
                </p>
            )}
            <p
                class="text-[10px] mt-3 flex items-center gap-1"
                style={`color:${themeColors.muted};`}
            >
                <AlertCircle size={10} /> {reason}
            </p>
        </div>
    );
}

import { AlertCircle, Clock, MapPin } from "lucide-preact";
import type {
	ErrorEvent as MapboxErrorEvent,
	Map as MapboxMap,
} from "mapbox-gl";
import { useEffect, useRef, useState } from "preact/hooks";
import {
	connectWebSocket,
	disconnectWebSocket,
	fetchPulses,
	mergePulses,
} from "../../lib/pulseApi";
import type { Pulse } from "../../lib/types";
import type { PulseSocketEvent } from "../../lib/pulseApi";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN?.trim() || "";
const MAPBOX_STYLE_ID = "mapbox/light-v11";
const MAPBOX_STYLE_URL = `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE_ID}`;

type MapboxGL = typeof import("mapbox-gl")["default"];
type MarkerHandle = { remove(): void };

const typeColors: Record<string, string> = {
	need: "#f59e0b",
	skill: "#8b5cf6",
	item: "#10b981",
	emergency: "#ef4444",
	pet: "#ec4899",
	update: "#64748b",
};

function timeAgo(ts: number) {
	const diff = Date.now() - ts;
	if (diff < 60000) return "just now";
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
	return `${Math.floor(diff / 86400000)}d ago`;
}

function ensureMapboxToken(token: string) {
	if (!token) {
		throw new Error(
			"Missing VITE_MAPBOX_TOKEN. Set a public Mapbox token before loading the map.",
		);
	}

	if (!token.startsWith("pk.")) {
		throw new Error(
			'Invalid Mapbox token. Browser apps must use a public token that starts with "pk.".',
		);
	}
}

async function verifyMapboxToken(token: string) {
	ensureMapboxToken(token);

	const response = await fetch(
		`${MAPBOX_STYLE_URL}?access_token=${encodeURIComponent(token)}`,
	);
	if (response.ok) {
		return;
	}

	const responseBody = await response.text().catch(() => "");
	const details = responseBody.includes("Not Authorized")
		? " Token is not authorized for this style or domain."
		: "";

	throw new Error(
		`Invalid Mapbox token. Style request failed with ${response.status} ${response.statusText}.${details}`,
	);
}

export function PulseMap({ expanded = false }: { expanded?: boolean }) {
	const mapContainer = useRef<HTMLDivElement>(null);
	const mapRef = useRef<MapboxMap | null>(null);
	const mapboxGlRef = useRef<MapboxGL | null>(null);
	const markersRef = useRef<MarkerHandle[]>([]);
	const [mapError, setMapError] = useState<string | null>(null);
	const [mapLoaded, setMapLoaded] = useState(false);
	const [pulseError, setPulseError] = useState<string | null>(null);
	const [loadingPulses, setLoadingPulses] = useState(true);
	const [pulses, setPulses] = useState<Pulse[]>([]);

	useEffect(() => {
		let cancelled = false;

		setLoadingPulses(true);
		setPulseError(null);

		fetchPulses()
			.then((data) => {
				if (!cancelled) {
					setPulses((current) => mergePulses(current, data));
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setPulseError(
						error instanceof Error
							? error.message
							: "Unable to load live pulses.",
					);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoadingPulses(false);
				}
			});

		const handleWS = (event: PulseSocketEvent) => {
			if (event.event === "pulse.created") {
				setPulses((current) => mergePulses(current, [event.pulse]));
				return;
			}

			setPulses((current) =>
				current.filter((pulse) => pulse.id !== event.pulseId),
			);
		};

		connectWebSocket(handleWS);

		return () => {
			cancelled = true;
			disconnectWebSocket(handleWS);
		};
	}, []);

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
		if (!mapContainer.current) {
			return;
		}

		let disposed = false;
		let map: MapboxMap | undefined;
		let resizeObserver: ResizeObserver | undefined;

		const initMap = async () => {
			await verifyMapboxToken(MAPBOX_TOKEN);

			const [{ default: mapboxgl }] = await Promise.all([
				import("mapbox-gl"),
				import("mapbox-gl/dist/mapbox-gl.css"),
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

			map.on("load", () => {
				if (disposed) {
					return;
				}

				map?.resize();
				setMapLoaded(true);
			});

			map.on("error", (event: MapboxErrorEvent) => {
				const message =
					event.error?.message || "Mapbox failed to render the map.";
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
				error instanceof Error
					? error
					: new Error("Mapbox failed to initialize.");
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

		if (!mapLoaded || !activeMap || !mapboxgl) {
			return;
		}

		markersRef.current.forEach((marker) => {
			marker.remove();
		});
		markersRef.current = [];

		markersRef.current = pulses.map((pulse) => {
			const markerElement = document.createElement("div");
			markerElement.style.width = pulse.type === "emergency" ? "16px" : "14px";
			markerElement.style.height = pulse.type === "emergency" ? "16px" : "14px";
			markerElement.style.borderRadius = "50%";
			markerElement.style.backgroundColor =
				typeColors[pulse.type] || typeColors.update;
			markerElement.style.border = "2px solid white";
			markerElement.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
			markerElement.title = `${pulse.userName}: ${pulse.content}`;

			return new mapboxgl.Marker(markerElement)
				.setLngLat([pulse.lng, pulse.lat])
				.setPopup(
					new mapboxgl.Popup({ offset: 12 }).setText(
						`${pulse.userName}: ${pulse.content}`,
					),
				)
				.addTo(activeMap);
		});

		return () => {
			markersRef.current.forEach((marker) => {
				marker.remove();
			});
			markersRef.current = [];
		};
	}, [mapLoaded, pulses]);

	if (mapError) {
		return (
			<MapOfflineFallback
				expanded={expanded}
				reason={mapError}
				pulses={pulses}
				loading={loadingPulses}
				pulseError={pulseError}
			/>
		);
	}

	return (
		<div
			class={`mx-4 mt-3 rounded-2xl overflow-hidden glass flex flex-col relative ${
				expanded ? "flex-1 min-h-[50dvh]" : ""
			}`}
		>
			{pulseError && (
				<div class="border-b border-danger/20 bg-danger/5 px-4 py-3 text-xs text-danger">
					Live pulse feed unavailable. {pulseError}
				</div>
			)}
			{!loadingPulses && pulses.length === 0 && !pulseError && (
				<div class="absolute left-4 top-4 z-10 rounded-2xl border border-border bg-white/90 px-3 py-2 text-xs text-text-secondary shadow-lg backdrop-blur-sm">
					No live pulses yet.
				</div>
			)}
			{!mapLoaded && (
				<div
					class={`flex items-center justify-center bg-surface-dim/30 ${
						expanded ? "min-h-[50dvh] flex-1" : "h-52"
					}`}
				>
					<div class="animate-pulse text-text-secondary text-sm">
						Loading map…
					</div>
				</div>
			)}
			<div
				ref={mapContainer}
				class={`w-full ${expanded ? "flex-1 min-h-[50dvh]" : "h-52"}`}
				style={{ display: mapLoaded ? "block" : "none" }}
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
				expanded ? "flex-1 min-h-[50dvh]" : ""
			}`}
		>
			<div class="flex items-center gap-3 mb-4">
				<div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
					<MapPin size={20} class="text-primary" />
				</div>
				<div>
					<p class="font-semibold text-sm">Map Offline</p>
					<p class="text-xs text-text-secondary">
						Nearby activity shown as a live list
					</p>
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

export function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
}

export const DEFAULT_PULSE_CENTER = {
    lat: 40.7128,
    lng: -74.006,
};

export function isUsableCoordinates(lat: number, lng: number): boolean {
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number): number {
    return (value * Math.PI) / 180;
}

export function distanceInMeters(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
): number {
    const latDelta = toRadians(toLat - fromLat);
    const lngDelta = toRadians(toLng - fromLng);
    const fromLatRadians = toRadians(fromLat);
    const toLatRadians = toRadians(toLat);

    const haversineValue =
        Math.sin(latDelta / 2) ** 2 +
        Math.cos(fromLatRadians) * Math.cos(toLatRadians) * Math.sin(lngDelta / 2) ** 2;

    return (
        2 *
        EARTH_RADIUS_METERS *
        Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue))
    );
}

export async function getCurrentBrowserLocation(): Promise<{ lat: number; lng: number }> {
    if (typeof window === 'undefined') {
        throw new Error('Location lookup is only available in the browser');
    }

    if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported by your browser');
    }

    if (!window.isSecureContext) {
        throw new Error('Location access requires a secure context (https or localhost)');
    }

    const readPosition = (options: PositionOptions) =>
        new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });

    const attempts: PositionOptions[] = [
        {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0,
        },
        {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 5 * 60 * 1000,
        },
    ];

    let lastError: unknown;

    for (const options of attempts) {
        try {
            const position = await readPosition(options);
            return {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };
        } catch (error) {
            lastError = error;

            const code =
                typeof error === 'object' && error !== null && 'code' in error
                    ? Number((error as { code?: number }).code)
                    : null;

            if (
                code !== GeolocationPositionError.POSITION_UNAVAILABLE &&
                code !== GeolocationPositionError.TIMEOUT
            ) {
                break;
            }
        }
    }

    if (lastError instanceof Error) {
        throw lastError;
    }

    throw new Error('Could not determine your current location');
}

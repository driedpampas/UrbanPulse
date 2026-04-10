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
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
            }
        );
    });
}

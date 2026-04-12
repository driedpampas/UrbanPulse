import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
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

export async function compressImageForAvatar(
    file: File,
    maxDimension = 512,
    quality = 0.78
): Promise<Blob> {
    const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                reject(new Error('Failed to read image file'));
                return;
            }
            resolve(result);
        };
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image file'));
        img.src = imageDataUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Unable to initialize canvas renderer');
    }

    context.drawImage(image, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/webp', quality);
    });

    if (!compressedBlob) {
        throw new Error('Image compression failed');
    }

    return compressedBlob;
}

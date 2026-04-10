import { API_BASE_URL } from './api';
import { readStoredAuthSession } from './auth';
import type { User } from './types';

type BackendUser = {
    id: string;
    role?: string;
    email?: string | null;
    displayName?: string | null;
    skillsAndResources?: string[] | null;
    trustScore?: number | null;
    verified?: boolean;
    radius?: number | null;
    location?: {
        lat?: number | null;
        lng?: number | null;
    } | null;
    quietHours?: Array<{
        start?: string;
        end?: string;
    }> | null;
    quietDays?: Array<number | string> | null;
    bio?: string | null;
};

class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

function fallbackDisplayName(id: string) {
    return `Neighbor ${id.slice(0, 6)}`;
}

function toAvatarUrl(seed: string) {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

function stripSeconds(time: string): string {
    return time.replace(/:00$/, '');
}

function mergeQuietHours(
    ranges: Array<{ start?: string | null; end?: string | null }> | null | undefined
): { start?: string; end?: string } {
    if (!ranges || ranges.length === 0) {
        return {};
    }

    if (ranges.length === 1) {
        return {
            start: ranges[0].start ? stripSeconds(ranges[0].start) : undefined,
            end: ranges[0].end ? stripSeconds(ranges[0].end) : undefined,
        };
    }

    const morning = ranges.find((r) => r.start?.startsWith('00:00'));
    const evening = ranges.find((r) => r.end?.startsWith('24:00'));

    if (morning && evening) {
        return {
            start: evening.start ? stripSeconds(evening.start) : undefined,
            end: morning.end ? stripSeconds(morning.end) : undefined,
        };
    }

    const first = ranges[0];
    return {
        start: first.start ? stripSeconds(first.start) : undefined,
        end: first.end ? stripSeconds(first.end) : undefined,
    };
}

function normalizeQuietDays(quietDays: Array<number | string> | null | undefined): number[] {
    return Array.from(
        new Set(
            (quietDays || [])
                .map((day) => Number(day))
                .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        )
    ).sort((a, b) => a - b);
}

function mapBackendUser(user: BackendUser): User {
    const quiet = mergeQuietHours(user.quietHours);

    return {
        id: user.id,
        role: user.role,
        name: user.displayName || fallbackDisplayName(user.id),
        avatar: toAvatarUrl(user.displayName || user.id),
        bio: user.bio || 'No bio yet.',
        skills: user.skillsAndResources || [],
        trustScore: Math.round(user.trustScore || 0),
        verified: Boolean(user.verified),
        lat: user.location?.lat ?? 0,
        lng: user.location?.lng ?? 0,
        quietHoursStart: quiet.start,
        quietHoursEnd: quiet.end,
        distanceLimit: Math.max(user.radius ?? 1, 1),
        quietDays: normalizeQuietDays(user.quietDays),
    };
}

function getAuthHeaders(extraHeaders?: HeadersInit): Headers {
    const headers = new Headers(extraHeaders);
    const session = readStoredAuthSession();
    if (session?.token) {
        headers.set('Authorization', `Bearer ${session.token}`);
    }
    return headers;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: getAuthHeaders(init.headers),
    });

    if (!response.ok) {
        let message = 'Request failed';
        try {
            const payload = (await response.json()) as { error?: string };
            if (payload.error) {
                message = payload.error;
            }
        } catch {
            message = response.statusText || message;
        }

        throw new ApiError(message, response.status);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return (await response.json()) as T;
    }

    return undefined as T;
}

export async function fetchCurrentUser(): Promise<User> {
    const user = await request<BackendUser>('/user', { method: 'GET' });
    return mapBackendUser(user);
}

export async function updateProfile(updates: Partial<User>): Promise<User> {
    const quietHoursProvided =
        updates.quietHoursStart !== undefined || updates.quietHoursEnd !== undefined;

    const patchBody: {
        displayName?: string;
        bio?: string;
        radius?: number;
        location?: { lat: number; lng: number };
        quietHours?: Array<{ start: string; end: string }> | null;
        quietDays?: number[] | null;
        skills_and_resources?: string[] | null;
    } = {};

    if (typeof updates.name === 'string') {
        patchBody.displayName = updates.name.trim();
    }

    if (typeof updates.bio === 'string') {
        patchBody.bio = updates.bio;
    }

    if (typeof updates.distanceLimit === 'number') {
        patchBody.radius = Math.max(1, Math.round(updates.distanceLimit));
    }

    if (typeof updates.lat === 'number' && typeof updates.lng === 'number') {
        patchBody.location = { lat: updates.lat, lng: updates.lng };
    }

    if (quietHoursProvided) {
        if (updates.quietHoursStart && updates.quietHoursEnd) {
            patchBody.quietHours = [
                {
                    start: updates.quietHoursStart,
                    end: updates.quietHoursEnd,
                },
            ];
        } else {
            patchBody.quietHours = null;
        }
    }

    if (updates.quietDays !== undefined) {
        patchBody.quietDays = normalizeQuietDays(updates.quietDays);
    }

    if (updates.skills) {
        patchBody.skills_and_resources = updates.skills;
    }

    await request<void>('/user', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchBody),
    });

    return fetchCurrentUser();
}

export async function deleteAccount(): Promise<void> {
    await request<void>('/user', { method: 'DELETE' });
}

export async function fetchUsers(): Promise<User[]> {
    const users = await request<BackendUser[]>('/users', { method: 'GET' });
    return users.map(mapBackendUser);
}

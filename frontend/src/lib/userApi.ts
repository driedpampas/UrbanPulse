import { API_BASE_URL } from './api';
import { readStoredAuthSession } from './auth';
import type { User } from './types';
import { isUsableCoordinates } from './utils';

type BackendUser = {
    id: string;
    createdAt?: number | string | null;
    role?: string;
    email?: string | null;
    displayName?: string | null;
    trustScore?: number | null;
    verified?: boolean;
    isEmailVerified?: boolean;
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
    timezone?: string | null;
    bio?: string | null;
    deletionRequestedAt?: number | string | null;
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
    const location =
        user.location && isUsableCoordinates(user.location.lat ?? 0, user.location.lng ?? 0)
            ? {
                  lat: user.location.lat ?? 0,
                  lng: user.location.lng ?? 0,
              }
            : null;

    return {
        id: user.id,
        email: user.email || undefined,
        role: user.role,
        name: user.displayName || fallbackDisplayName(user.id),
        avatar: toAvatarUrl(user.displayName || user.id),
        bio: user.bio || 'No bio yet.',
        trustScore: Math.round(user.trustScore || 0),
        verified: Boolean(user.verified),
        isEmailVerified: Boolean(user.isEmailVerified),
        lat: location?.lat ?? 0,
        lng: location?.lng ?? 0,
        location,
        quietHoursStart: quiet.start,
        quietHoursEnd: quiet.end,
        distanceLimit: Math.max(user.radius ?? 1, 1),
        quietDays: normalizeQuietDays(user.quietDays),
        timezone: user.timezone ?? 'UTC',
        createdAt: user.createdAt ? Number(user.createdAt) : undefined,
        deletionRequestedAt: user.deletionRequestedAt ? Number(user.deletionRequestedAt) : null,
    };
}

function buildUserQuery(params?: { displayName?: string; id?: string; limit?: number }): string {
    if (!params) {
        return '';
    }

    const query = new URLSearchParams();
    if (params.displayName?.trim()) {
        query.set('displayName', params.displayName.trim());
    }
    if (params.id?.trim()) {
        query.set('id', params.id.trim());
    }

    if (typeof params.limit === 'number') {
        query.set('limit', String(params.limit));
    }

    const queryString = query.toString();
    return queryString.length ? `?${queryString}` : '';
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
    const nextLocation =
        updates.location && isUsableCoordinates(updates.location.lat, updates.location.lng)
            ? updates.location
            : isUsableCoordinates(updates.lat ?? 0, updates.lng ?? 0)
              ? {
                    lat: updates.lat ?? 0,
                    lng: updates.lng ?? 0,
                }
              : null;

    const patchBody: {
        displayName?: string;
        bio?: string;
        radius?: number;
        location?: { lat: number; lng: number };
        quietHours?: Array<{ start: string; end: string }> | null;
        quietDays?: number[] | null;
        timezone?: string;
    } = {};

    try {
        patchBody.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
        patchBody.timezone = undefined;
    }

    if (typeof updates.name === 'string') {
        patchBody.displayName = updates.name.trim();
    }

    if (typeof updates.bio === 'string') {
        patchBody.bio = updates.bio;
    }

    if (typeof updates.distanceLimit === 'number') {
        patchBody.radius = Math.max(1, Math.round(updates.distanceLimit));
    }

    if (nextLocation) {
        patchBody.location = nextLocation;
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

export async function cancelAccountDeletion(): Promise<void> {
    await request<void>('/user/deletion/cancel', { method: 'POST' });
}

export async function fetchUsers(params?: {
    displayName?: string;
    id?: string;
    limit?: number;
}): Promise<User[]> {
    const users = await request<BackendUser[]>(`/users${buildUserQuery(params)}`, {
        method: 'GET',
    });
    return users.map(mapBackendUser);
}

export async function fetchAdminUsers(params?: {
    id?: string;
    displayName?: string;
    role?: string;
    limit?: number;
    offset?: number;
}): Promise<User[]> {
    const query = new URLSearchParams();

    if (params?.id?.trim()) query.set('id', params.id.trim());
    if (params?.displayName?.trim()) query.set('displayName', params.displayName.trim());
    if (params?.role) query.set('role', params.role);
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') query.set('offset', String(params.offset));

    const result = await request<{ users: BackendUser[] }>(
        `/admin/users${query.toString() ? `?${query.toString()}` : ''}`,
        { method: 'GET' }
    );

    return result.users.map(mapBackendUser);
}

export async function fetchAdminUserDeletions(params?: {
    limit?: number;
    offset?: number;
}): Promise<Array<{ user: User; requestedAt: number; purgeAt: number }>> {
    const query = new URLSearchParams();
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') query.set('offset', String(params.offset));

    const result = await request<{
        deletions: Array<{ user: BackendUser; requestedAt: number; purgeAt: number }>;
    }>(`/admin/user-deletions${query.toString() ? `?${query.toString()}` : ''}`, {
        method: 'GET',
    });

    return result.deletions.map((deletion) => ({
        user: mapBackendUser(deletion.user),
        requestedAt: deletion.requestedAt,
        purgeAt: deletion.purgeAt,
    }));
}

export async function cancelAdminUserDeletion(userId: string): Promise<void> {
    await request<void>(`/admin/user-deletions/${userId}/cancel`, { method: 'POST' });
}

export async function updateAdminUserRole(userId: string, role: string): Promise<void> {
    await request<void>(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
    });
}

export async function deleteAdminUser(userId: string): Promise<void> {
    await request<void>(`/admin/users/${userId}`, { method: 'DELETE' });
}

export async function fetchAdminOverview(): Promise<{
    totalUsers: number;
    adminUsers: number;
    modUsers: number;
    verifiedUsers: number;
    totalPulses: number;
    verifiedPulses: number;
    totalLibraryItems: number;
    availableLibraryItems: number;
}> {
    return request<{
        totalUsers: number;
        adminUsers: number;
        modUsers: number;
        verifiedUsers: number;
        totalPulses: number;
        verifiedPulses: number;
        totalLibraryItems: number;
        availableLibraryItems: number;
    }>('/admin/overview', { method: 'GET' });
}

export async function fetchUserById(userId: string): Promise<User | null> {
    const users = await fetchUsers({ id: userId });
    return users[0] ?? null;
}

import { API_BASE_URL } from './api';
import { readStoredAuthSession } from './auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CrisisStatus = 'safe' | 'need_help' | 'injured' | 'available_to_help' | 'no_response';

export type IncidentApprovalState =
    | 'admin_approved'
    | 'first_responder_approved'
    | 'community_only';

export interface IncidentReport {
    userId: string;
    userName: string | null;
    profilePictureFilename: string | null;
    title: string;
    description: string;
    createdAt: number;
}

export interface IncidentFeedItem {
    id: string;
    typeId: string;
    typeLabel: string;
    confidenceScore: number;
    confirmed: boolean;
    approvalState: IncidentApprovalState;
    reports: IncidentReport[];
    userVote: boolean | null;
}

export interface IncidentType {
    id: string;
    label: string;
}

export interface UserCrisisEntry {
    userId: string;
    displayName: string | null;
    profilePictureFilename: string | null;
    lat: number;
    lng: number;
    status: CrisisStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
    const session = readStoredAuthSession();
    return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
            ...(init.headers as Record<string, string> | undefined),
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
}

// ─── Incident feed ────────────────────────────────────────────────────────────

/** Fetch confirmed (crisis-level) incidents near a point. */
export async function fetchCrisis(lat: number, lng: number): Promise<IncidentFeedItem[]> {
    const data = await apiFetch<{ incidents: IncidentFeedItem[] }>(`/crisis?lat=${lat}&lng=${lng}`);
    return data.incidents;
}

/** Fetch unconfirmed (pending) incidents near a point. */
export async function fetchIncidents(lat: number, lng: number): Promise<IncidentFeedItem[]> {
    const data = await apiFetch<{ incidents: IncidentFeedItem[] }>(
        `/incident?lat=${lat}&lng=${lng}`
    );
    return data.incidents;
}

// ─── Incident types ───────────────────────────────────────────────────────────

export async function fetchIncidentTypes(): Promise<IncidentType[]> {
    const data = await apiFetch<{ types: IncidentType[] }>('/incident/type');
    return data.types;
}

export async function createIncidentType(label: string): Promise<IncidentType> {
    const data = await apiFetch<{ type: IncidentType }>('/incident/type', {
        method: 'POST',
        body: JSON.stringify({ label }),
    });
    return data.type;
}

export async function deleteIncidentType(id: string): Promise<boolean> {
    try {
        await apiFetch(`/incident/type/${id}`, {
            method: 'DELETE',
        });
        return true;
    } catch {
        return false;
    }
}

export async function updateIncidentType(id: string, label: string): Promise<boolean> {
    try {
        await apiFetch(`/incident/type/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ label }),
        });
        return true;
    } catch {
        return false;
    }
}

// ─── Report an incident (user) ────────────────────────────────────────────────

export async function reportIncident(input: {
    typeId: string;
    title: string;
    description: string;
    lat?: number;
    lng?: number;
}): Promise<boolean> {
    try {
        await apiFetch('/incident', {
            method: 'POST',
            body: JSON.stringify(input),
        });
        return true;
    } catch {
        return false;
    }
}

// ─── Vote on an incident ──────────────────────────────────────────────────────

export async function voteOnIncident(incidentId: string, approved: boolean): Promise<boolean> {
    try {
        await apiFetch('/incident/verify', {
            method: 'PUT',
            body: JSON.stringify({ incidentId, approved }),
        });
        return true;
    } catch {
        return false;
    }
}

// ─── User crisis location & status ───────────────────────────────────────────

/** Share the authenticated user's crisis location. Returns false when not in a crisis zone. */
export async function updateUserCrisisLocation(lat: number, lng: number): Promise<boolean> {
    try {
        await apiFetch('/user/location', {
            method: 'PATCH',
            body: JSON.stringify({ lat, lng }),
        });
        return true;
    } catch {
        return false;
    }
}

/** Update the authenticated user's crisis status. Returns false when no location shared yet. */
export async function updateUserCrisisStatus(status: CrisisStatus): Promise<boolean> {
    try {
        await apiFetch('/user/status', {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
        return true;
    } catch {
        return false;
    }
}

/** Fetch nearby users in the same crisis zone. Throws when not in an active zone. */
export async function fetchUserCrisisLocations(radius = 5000): Promise<UserCrisisEntry[]> {
    const data = await apiFetch<{ users: UserCrisisEntry[] }>(`/user/location?radius=${radius}`);
    return data.users;
}
// ─── Admin incident reporting ───────────────────────────────────────────────

export async function reportIncidentAdmin(input: {
    typeId: string;
    title: string;
    description: string;
    lat: number;
    lng: number;
    range: 'neighborhood' | 'district' | 'city';
}): Promise<boolean> {
    try {
        await apiFetch('/incident/admin', {
            method: 'POST',
            body: JSON.stringify(input),
        });
        return true;
    } catch {
        return false;
    }
}

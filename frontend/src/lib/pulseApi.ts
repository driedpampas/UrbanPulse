import { API_BASE_URL, PULSE_FEED_WS_URL } from './api';
import { readStoredAuthSession } from './auth';
import type {
    AcceptedInteraction,
    AuthorPulseRequest,
    HeroMatchUser,
    Pulse,
    PulseInteraction,
    ResourceCatalogEntry,
} from './types';

type BackendPulse = {
    id: string;
    userId: string;
    userName: string;
    type: Pulse['type'];
    content: string;
    timestamp: number | string;
    lat: number | string;
    lng: number | string;
    verified: boolean;
    confirmations: number | string;
    urgencyLevel?: number;
    urgency_level?: number;
    isEmergency?: boolean;
    is_emergency?: boolean;
    isSolved?: boolean;
    is_solved?: boolean;
    requiredSkills?: string[];
    required_skills?: string[];
};

type CreatePulseInput = {
    type: Pulse['type'];
    isEmergency?: boolean;
    content: string;
    lat: number;
    lng: number;
    urgencyLevel?: number;
    requiredSkills?: string[];
};

type BackendResourceCatalogEntry = {
    value: string;
    type: 'item' | 'skill';
};

type BackendHeroMatchUser = {
    id: string;
    displayName: string | null;
    matchedResources?: string[];
    suppressedByQuietHours?: boolean;
};

type BackendPulseInteraction = {
    id: string;
    pulseId: string;
    authorId: string;
    helperId: string;
    helperName: string;
    status: 'accepted' | 'successful';
    acceptedAt: number | string;
    confirmedAt: number | string | null;
    trustAwarded: number | string;
};

type BackendAuthorPulseRequest = BackendPulse & {
    acceptedCount: number | string;
    successfulCount: number | string;
};

type BackendAcceptedInteraction = {
    interaction: BackendPulseInteraction;
    pulse: {
        id: string;
        content: string;
        type: Pulse['type'];
        timestamp: number | string;
        urgencyLevel: number | string;
        isSolved?: boolean;
    };
    author: {
        id: string;
        name: string;
    };
};

type PulseSocketHandler = (event: PulseSocketEvent) => void;

export type PulseSocketEvent =
    | { event: 'pulse.created'; pulse: Pulse }
    | { event: 'pulse.deleted'; pulseId: string }
    | { event: 'hero.alert'; pulse: Pulse; matchedResources?: string[] };

const DEFAULT_URGENCY_BY_TYPE: Record<Pulse['type'], number> = {
    need: 4,
    emergency: 5,
    skill: 2,
    item: 1,
    pet: 3,
    update: 1,
};

const wsHandlers = new Set<PulseSocketHandler>();
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectEnabled = false;

class PulseApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'PulseApiError';
        this.status = status;
    }
}

function getAvatarUrl(seed: string): string {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

function normalizePulseType(value: string): Pulse['type'] {
    const normalized = value.toLowerCase();

    if (
        normalized === 'need' ||
        normalized === 'emergency' ||
        normalized === 'skill' ||
        normalized === 'item' ||
        normalized === 'pet' ||
        normalized === 'update'
    ) {
        return normalized;
    }

    return 'update';
}

function mapBackendPulse(pulse: BackendPulse): Pulse {
    const userName = pulse.userName.trim() || `Neighbor ${pulse.userId.slice(0, 6)}`;
    const normalizedType = normalizePulseType(pulse.type);
    const isEmergency =
        Boolean(pulse.isEmergency ?? pulse.is_emergency) || normalizedType === 'emergency';

    return {
        id: pulse.id,
        userId: pulse.userId,
        userName,
        userAvatar: getAvatarUrl(userName || pulse.userId),
        type: normalizedType,
        content: pulse.content,
        timestamp: Number(pulse.timestamp),
        lat: Number(pulse.lat),
        lng: Number(pulse.lng),
        verified: Boolean(pulse.verified),
        confirmations: Number(pulse.confirmations ?? 0),
        urgencyLevel: Number(pulse.urgencyLevel ?? pulse.urgency_level ?? 1),
        isEmergency,
        isSolved: Boolean(pulse.isSolved ?? pulse.is_solved),
        requiredSkills: pulse.requiredSkills ?? pulse.required_skills ?? [],
    };
}

function mapBackendResource(entry: BackendResourceCatalogEntry): ResourceCatalogEntry {
    return {
        value: entry.value,
        type: entry.type,
    };
}

function mapBackendHeroMatch(user: BackendHeroMatchUser): HeroMatchUser {
    return {
        id: user.id,
        displayName: user.displayName,
        matchedResources: user.matchedResources ?? [],
        suppressedByQuietHours: Boolean(user.suppressedByQuietHours),
    };
}

function mapBackendPulseInteraction(interaction: BackendPulseInteraction): PulseInteraction {
    return {
        id: interaction.id,
        pulseId: interaction.pulseId,
        authorId: interaction.authorId,
        helperId: interaction.helperId,
        helperName: interaction.helperName,
        status: interaction.status,
        acceptedAt: Number(interaction.acceptedAt),
        confirmedAt: interaction.confirmedAt === null ? null : Number(interaction.confirmedAt),
        trustAwarded: Number(interaction.trustAwarded),
    };
}

function mapBackendAuthorPulseRequest(pulse: BackendAuthorPulseRequest): AuthorPulseRequest {
    return {
        ...mapBackendPulse(pulse),
        acceptedCount: Number(pulse.acceptedCount ?? 0),
        successfulCount: Number(pulse.successfulCount ?? 0),
    };
}

function mapBackendAcceptedInteraction(
    acceptedInteraction: BackendAcceptedInteraction
): AcceptedInteraction {
    return {
        interaction: mapBackendPulseInteraction(acceptedInteraction.interaction),
        pulse: {
            id: acceptedInteraction.pulse.id,
            content: acceptedInteraction.pulse.content,
            type: normalizePulseType(acceptedInteraction.pulse.type),
            timestamp: Number(acceptedInteraction.pulse.timestamp),
            urgencyLevel: Number(acceptedInteraction.pulse.urgencyLevel),
            isSolved: Boolean(acceptedInteraction.pulse.isSolved),
        },
        author: acceptedInteraction.author,
    };
}

export function mergePulses(current: Pulse[], next: Pulse[]): Pulse[] {
    const byId = new Map<string, Pulse>();

    for (const pulse of [...current, ...next]) {
        byId.set(pulse.id, pulse);
    }

    return Array.from(byId.values()).sort((left, right) => right.timestamp - left.timestamp);
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

        throw new PulseApiError(message, response.status);
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

function dispatchPulseEvent(event: PulseSocketEvent) {
    for (const handler of wsHandlers) {
        handler(event);
    }
}

function parseSocketMessage(rawMessage: string): PulseSocketEvent | null {
    try {
        const parsed = JSON.parse(rawMessage) as
            | {
                  event?: string;
                  pulse?: BackendPulse;
                  pulseId?: string;
                  matchedResources?: string[];
              }
            | BackendPulse;

        if (
            parsed &&
            typeof parsed === 'object' &&
            'event' in parsed &&
            parsed.event === 'pulse.created' &&
            parsed.pulse
        ) {
            return { event: 'pulse.created', pulse: mapBackendPulse(parsed.pulse) };
        }

        if (
            parsed &&
            typeof parsed === 'object' &&
            'event' in parsed &&
            parsed.event === 'pulse.deleted' &&
            typeof parsed.pulseId === 'string'
        ) {
            return { event: 'pulse.deleted', pulseId: parsed.pulseId };
        }

        if (
            parsed &&
            typeof parsed === 'object' &&
            'id' in parsed &&
            'userId' in parsed &&
            'content' in parsed
        ) {
            return {
                event: 'pulse.created',
                pulse: mapBackendPulse(parsed as BackendPulse),
            };
        }

        if (
            parsed &&
            typeof parsed === 'object' &&
            'event' in parsed &&
            parsed.event === 'hero.alert' &&
            parsed.pulse
        ) {
            return {
                event: 'hero.alert',
                pulse: mapBackendPulse(parsed.pulse),
                matchedResources: Array.isArray(parsed.matchedResources)
                    ? parsed.matchedResources
                    : undefined,
            };
        }
    } catch {
        return null;
    }

    return null;
}

function scheduleReconnect() {
    if (!reconnectEnabled || wsHandlers.size === 0 || reconnectTimer !== null) {
        return;
    }

    reconnectTimer = globalThis.setTimeout(() => {
        reconnectTimer = null;
        ensureSocket();
    }, 1500);
}

function ensureSocket() {
    if (typeof WebSocket === 'undefined') {
        return;
    }

    if (
        socket &&
        (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
        return;
    }

    reconnectEnabled = true;
    socket = new WebSocket(PULSE_FEED_WS_URL);

    socket.onopen = () => {
        const session = readStoredAuthSession();
        if (session?.token) {
            socket?.send(
                JSON.stringify({
                    action: 'auth.identify',
                    token: session.token,
                })
            );
        }
    };

    socket.onmessage = (event) => {
        if (typeof event.data !== 'string') {
            return;
        }

        const socketEvent = parseSocketMessage(event.data);
        if (socketEvent) {
            dispatchPulseEvent(socketEvent);
        }
    };

    socket.onclose = () => {
        socket = null;
        if (wsHandlers.size > 0) {
            scheduleReconnect();
        }
    };

    socket.onerror = () => {
        socket?.close();
    };
}

export async function fetchPulses(
    lat?: number,
    lng?: number,
    radius?: number,
    limit = 50,
    offset = 0
): Promise<Pulse[]> {
    let path = '/pulse';
    const params = new URLSearchParams();

    if (lat !== undefined) params.append('lat', lat.toString());
    if (lng !== undefined) params.append('lng', lng.toString());
    if (radius !== undefined) params.append('radius', radius.toString());
    params.append('limit', limit.toString());
    if (offset > 0) params.append('offset', offset.toString());

    const queryString = params.toString();
    if (queryString) {
        path += `?${queryString}`;
    }

    const pulses = await request<BackendPulse[]>(path, { method: 'GET' });
    return pulses.map(mapBackendPulse);
}

export async function postPulse(input: CreatePulseInput): Promise<Pulse> {
    const type = normalizePulseType(input.type);
    const isEmergency = input.isEmergency ?? type === 'emergency';
    const payload = {
        type,
        isEmergency,
        urgencyLevel: input.urgencyLevel ?? DEFAULT_URGENCY_BY_TYPE[type],
        content: input.content,
        location: {
            lat: input.lat,
            lng: input.lng,
        },
        requiredSkills: input.requiredSkills ?? [],
        selectedResources: input.requiredSkills ?? [],
    };

    const response = await request<BackendPulse>('/pulse', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return mapBackendPulse(response);
}

export async function deletePulse(id: string): Promise<void> {
    await request<void>(`/pulse/${id}`, { method: 'DELETE' });
}

export async function fetchAdminPulses(limit = 25, offset = 0): Promise<Pulse[]> {
    const data = await request<{ pulses: BackendPulse[] }>(
        `/admin/pulses?limit=${limit}&offset=${offset}`,
        { method: 'GET' }
    );

    return data.pulses.map(mapBackendPulse);
}

export async function fetchAdminPulseById(id: string): Promise<Pulse | null> {
    if (!id.trim()) {
        return null;
    }

    const pulse = await request<BackendPulse>(`/admin/pulses/${encodeURIComponent(id.trim())}`, {
        method: 'GET',
    });

    return mapBackendPulse(pulse);
}

export async function deleteAdminPulse(id: string): Promise<void> {
    await request<void>(`/admin/pulses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function confirmPulse(id: string): Promise<void> {
    await request<void>(`/pulses/${id}/confirm`, { method: 'POST' });
}

export async function fetchPulseResourceCatalog(
    search?: string,
    limit = 120
): Promise<ResourceCatalogEntry[]> {
    const params = new URLSearchParams();

    if (search?.trim()) {
        params.set('q', search.trim());
    }
    if (Number.isFinite(limit)) {
        params.set('limit', String(limit));
    }

    const query = params.toString();
    const data = await request<{ resources: BackendResourceCatalogEntry[] }>(
        `/pulse/resources${query ? `?${query}` : ''}`,
        {
            method: 'GET',
        }
    );

    return data.resources.map(mapBackendResource);
}

export async function matchPulseHeroes(
    resources: string[],
    location?: { lat: number; lng: number }
): Promise<HeroMatchUser[]> {
    const payload: {
        resources: string[];
        location?: { lat: number; lng: number };
    } = {
        resources,
    };

    if (location) {
        payload.location = location;
    }

    const data = await request<{ matches: BackendHeroMatchUser[] }>('/pulse/match', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return data.matches.map(mapBackendHeroMatch);
}

export async function acceptPulseRequest(pulseId: string): Promise<PulseInteraction> {
    const data = await request<{ interaction: BackendPulseInteraction }>(
        `/pulses/${pulseId}/accept`,
        {
            method: 'POST',
        }
    );

    return mapBackendPulseInteraction(data.interaction);
}

export async function fetchMyPostedPulses(limit = 50, offset = 0): Promise<AuthorPulseRequest[]> {
    const data = await request<{ pulses: BackendAuthorPulseRequest[] }>(
        `/pulses/me?limit=${limit}&offset=${offset}`,
        {
            method: 'GET',
        }
    );

    return data.pulses.map(mapBackendAuthorPulseRequest);
}

export async function fetchPulseInteractions(pulseId: string): Promise<PulseInteraction[]> {
    const data = await request<{ interactions: BackendPulseInteraction[] }>(
        `/pulses/${pulseId}/interactions`,
        {
            method: 'GET',
        }
    );

    return data.interactions.map(mapBackendPulseInteraction);
}

export async function confirmPulseInteraction(
    pulseId: string,
    interactionId: string
): Promise<PulseInteraction> {
    const data = await request<{ interaction: BackendPulseInteraction }>(
        `/pulses/${pulseId}/interactions/${interactionId}/confirm`,
        {
            method: 'POST',
        }
    );

    return mapBackendPulseInteraction(data.interaction);
}

export async function markPulseSolved(pulseId: string): Promise<Pulse> {
    const data = await request<{ pulse: BackendPulse }>(`/pulses/${pulseId}/solve`, {
        method: 'POST',
    });

    return mapBackendPulse(data.pulse);
}

export async function fetchAcceptedPulseInteractions(
    limit = 50,
    offset = 0
): Promise<AcceptedInteraction[]> {
    const data = await request<{ accepted: BackendAcceptedInteraction[] }>(
        `/pulses/accepted?limit=${limit}&offset=${offset}`,
        {
            method: 'GET',
        }
    );

    return data.accepted.map(mapBackendAcceptedInteraction);
}

export function connectWebSocket(handler: PulseSocketHandler) {
    if (typeof WebSocket === 'undefined') {
        return;
    }

    wsHandlers.add(handler);
    ensureSocket();
}

export function disconnectWebSocket(handler: PulseSocketHandler) {
    wsHandlers.delete(handler);

    if (wsHandlers.size === 0) {
        reconnectEnabled = false;

        if (reconnectTimer !== null) {
            globalThis.clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        socket?.close();
        socket = null;
    }
}

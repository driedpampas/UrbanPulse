import { API_BASE_URL, PULSE_FEED_WS_URL } from './api';
import { readStoredAuthSession } from './auth';
import type { Pulse } from './types';

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
};

type CreatePulseInput = {
    type: Pulse['type'];
    content: string;
    lat: number;
    lng: number;
    urgencyLevel?: number;
};

type PulseSocketHandler = (event: PulseSocketEvent) => void;

export type PulseSocketEvent =
    | { event: 'pulse.created'; pulse: Pulse }
    | { event: 'pulse.deleted'; pulseId: string };

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

    return {
        id: pulse.id,
        userId: pulse.userId,
        userName,
        userAvatar: getAvatarUrl(userName || pulse.userId),
        type: normalizePulseType(pulse.type),
        content: pulse.content,
        timestamp: Number(pulse.timestamp),
        lat: Number(pulse.lat),
        lng: Number(pulse.lng),
        verified: Boolean(pulse.verified),
        confirmations: Number(pulse.confirmations ?? 0),
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
            | { event?: string; pulse?: BackendPulse; pulseId?: string }
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

export async function fetchPulses(): Promise<Pulse[]> {
    const pulses = await request<BackendPulse[]>('/pulse', { method: 'GET' });
    return pulses.map(mapBackendPulse);
}

export async function postPulse(input: CreatePulseInput): Promise<Pulse> {
    const type = normalizePulseType(input.type);
    const payload = {
        type,
        urgencyLevel: input.urgencyLevel ?? DEFAULT_URGENCY_BY_TYPE[type],
        content: input.content,
        location: {
            lat: input.lat,
            lng: input.lng,
        },
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

import { API_BASE_URL, PULSE_FEED_WS_URL } from './api';
import { readStoredAuthSession } from './auth';
import type { ChatMessage, ChatThread } from './types';

export type ChatSocketMessage = {
    id: string;
    threadId: string;
    senderId: string;
    content: string;
    timestamp: number;
};

export type ChatSocketEvent =
    | { event: 'message.created'; message: ChatSocketMessage }
    | { event: 'chat.subscribed'; threadId: string }
    | { event: 'chat.unsubscribed'; threadId: string }
    | { event: 'chat.error'; threadId: string; reason: string };

type ChatSocketHandler = (event: ChatSocketEvent) => void;

type BackendChatSummary = {
    id: string;
    participants: Array<{
        userId: string;
        displayName: string | null;
    }>;
    isGroup: boolean;
    timestamp: number | string;
};

type BackendChatMessage = {
    id: string;
    threadId: string;
    senderId: string;
    content: string;
    timestamp: number | string;
};

class ChatApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ChatApiError';
        this.status = status;
    }
}

const wsHandlers = new Set<ChatSocketHandler>();
const subscribedThreadIds = new Set<string>();
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectEnabled = false;

function normalizeMessage(message: BackendChatMessage, senderName: string): ChatMessage {
    return {
        id: message.id,
        senderId: message.senderId,
        senderName,
        content: message.content,
        timestamp: Number(message.timestamp),
    };
}

function normalizeChat(summary: BackendChatSummary, messages: ChatMessage[]): ChatThread {
    const participantIds = summary.participants.map((participant) => participant.userId);
    const participantNames = summary.participants.map((participant) =>
        participant.displayName?.trim().length ? participant.displayName : `Neighbor ${participant.userId.slice(0, 6)}`
    );
    const lastMessage = messages[messages.length - 1];

    return {
        id: summary.id,
        participants: participantIds,
        participantNames,
        isGroup: summary.isGroup,
        name: summary.isGroup
            ? participantNames.filter(Boolean).join(', ')
            : participantNames.find((name) => name) || undefined,
        lastMessage,
        messages,
    };
}

function dispatchEvent(event: ChatSocketEvent) {
    for (const handler of wsHandlers) {
        handler(event);
    }
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

        throw new ChatApiError(message, response.status);
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

function parseSocketMessage(rawMessage: string): ChatSocketEvent | null {
    try {
        const parsed = JSON.parse(rawMessage) as {
            event?: string;
            threadId?: string;
            reason?: string;
            message?: ChatSocketMessage;
        };

        if (
            parsed.event === 'message.created' &&
            parsed.message &&
            typeof parsed.message.id === 'string' &&
            typeof parsed.message.threadId === 'string' &&
            typeof parsed.message.senderId === 'string' &&
            typeof parsed.message.content === 'string'
        ) {
            return {
                event: 'message.created',
                message: {
                    ...parsed.message,
                    timestamp: Number(parsed.message.timestamp),
                },
            };
        }

        if (parsed.event === 'chat.subscribed' && typeof parsed.threadId === 'string') {
            return {
                event: 'chat.subscribed',
                threadId: parsed.threadId,
            };
        }

        if (parsed.event === 'chat.unsubscribed' && typeof parsed.threadId === 'string') {
            return {
                event: 'chat.unsubscribed',
                threadId: parsed.threadId,
            };
        }

        if (
            parsed.event === 'chat.error' &&
            typeof parsed.threadId === 'string' &&
            typeof parsed.reason === 'string'
        ) {
            return {
                event: 'chat.error',
                threadId: parsed.threadId,
                reason: parsed.reason,
            };
        }
    } catch {
        return null;
    }

    return null;
}

async function fetchChatMessages(threadId: string): Promise<ChatMessage[]> {
    const messages = await request<BackendChatMessage[]>(`/chats/${threadId}/messages`, {
        method: 'GET',
    });

    return messages.map((message) => normalizeMessage(message, `Neighbor ${message.senderId.slice(0, 6)}`));
}

export async function fetchChats(): Promise<ChatThread[]> {
    const summaries = await request<BackendChatSummary[]>('/chats', { method: 'GET' });

    const threads = await Promise.all(
        summaries.map(async (summary) => {
            const messages = await fetchChatMessages(summary.id);
            const participantNames = new Map(
                summary.participants.map((participant) => [
                    participant.userId,
                    participant.displayName?.trim().length
                        ? participant.displayName
                        : `Neighbor ${participant.userId.slice(0, 6)}`,
                ])
            );

            const normalizedMessages = messages.map((message) =>
                normalizeMessage(
                    {
                        id: message.id,
                        threadId: summary.id,
                        senderId: message.senderId,
                        content: message.content,
                        timestamp: message.timestamp,
                    },
                    participantNames.get(message.senderId) || `Neighbor ${message.senderId.slice(0, 6)}`
                )
            );

            return normalizeChat(summary, normalizedMessages);
        })
    );

    return threads.sort((left, right) => {
        const rightTimestamp = right.lastMessage?.timestamp ?? right.messages[right.messages.length - 1]?.timestamp ?? right.messages[0]?.timestamp ?? 0;
        const leftTimestamp = left.lastMessage?.timestamp ?? left.messages[left.messages.length - 1]?.timestamp ?? left.messages[0]?.timestamp ?? 0;
        return rightTimestamp - leftTimestamp;
    });
}

export async function sendMessage(threadId: string, content: string): Promise<ChatMessage> {
    const message = await request<BackendChatMessage>(`/chats/${threadId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
    });

    const senderId = readStoredAuthSession()?.user.id ?? message.senderId;
    return {
        id: message.id,
        senderId,
        senderName: readStoredAuthSession()?.user.displayName || `Neighbor ${senderId.slice(0, 6)}`,
        content: message.content,
        timestamp: Number(message.timestamp),
    };
}

function sendSubscribe(threadId: string) {
    const token = readStoredAuthSession()?.token;
    if (!token || !socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }

    socket.send(
        JSON.stringify({
            action: 'chat.subscribe',
            threadId,
            token,
        })
    );
}

function sendUnsubscribe(threadId: string) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }

    socket.send(
        JSON.stringify({
            action: 'chat.unsubscribe',
            threadId,
        })
    );
}

function resubscribeAllThreads() {
    for (const threadId of subscribedThreadIds) {
        sendSubscribe(threadId);
    }
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
        resubscribeAllThreads();
    };

    socket.onmessage = (event) => {
        if (typeof event.data !== 'string') {
            return;
        }

        const socketEvent = parseSocketMessage(event.data);
        if (socketEvent) {
            dispatchEvent(socketEvent);
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

export function connectChatWebSocket(handler: ChatSocketHandler) {
    if (typeof WebSocket === 'undefined') {
        return;
    }

    wsHandlers.add(handler);
    ensureSocket();
}

export function disconnectChatWebSocket(handler: ChatSocketHandler) {
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

export function subscribeChatThread(threadId: string) {
    subscribedThreadIds.add(threadId);
    if (socket?.readyState === WebSocket.OPEN) {
        sendSubscribe(threadId);
    } else {
        ensureSocket();
    }
}

export function unsubscribeChatThread(threadId: string) {
    subscribedThreadIds.delete(threadId);
    sendUnsubscribe(threadId);
}

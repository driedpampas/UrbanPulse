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
    | { event: 'message.deleted'; messageId: string; scope: 'everyone' }
    | { event: 'chat.subscribed'; threadId: string }
    | { event: 'chat.unsubscribed'; threadId: string }
    | { event: 'chat.error'; threadId: string; reason: string }
    | {
          event: 'notification.message';
          message: ChatSocketMessage;
          senderName: string;
          threadName?: string;
      };

type ChatSocketHandler = (event: ChatSocketEvent) => void;

export interface StartDirectConversationResult {
    threadId: string;
    existed: boolean;
}

export type DeleteMessageScope = 'me' | 'everyone';

export type ChatParticipantRole = 'owner' | 'admin';

export type GroupChatMember = {
    userId: string;
    roles?: ChatParticipantRole[];
};

export interface CreateGroupChatInput {
    participantIds: string[];
    name?: string;
}

type BackendChatSummary = {
    id: string;
    participants: Array<{
        userId: string;
        displayName: string | null;
        roles?: Array<'owner' | 'admin'>;
    }>;
    isGroup: boolean;
    timestamp: number | string;
    ownerId?: string | null;
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
        participant.displayName?.trim().length
            ? participant.displayName
            : `Neighbor ${participant.userId.slice(0, 6)}`
    );
    const participantRoles = summary.participants.reduce<Record<string, Array<'owner' | 'admin'>>>(
        (acc, participant) => {
            if (participant.roles?.length) {
                acc[participant.userId] = Array.from(new Set(participant.roles));
            }
            return acc;
        },
        {}
    );
    const lastMessage = messages[messages.length - 1];

    return {
        id: summary.id,
        participants: participantIds,
        participantNames,
        participantRoles,
        ownerId: summary.ownerId ?? null,
        isGroup: summary.isGroup,
        name: summary.isGroup ? participantNames.join(', ') : undefined,
        lastMessage,
        messages,
    };
}

function sortMessagesByTimestamp(messages: ChatMessage[]): ChatMessage[] {
    return [...messages].sort(
        (left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id)
    );
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
            senderName?: string;
            threadName?: string;
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

        if (
            parsed.event === 'message.deleted' &&
            typeof (parsed as { messageId?: unknown }).messageId === 'string'
        ) {
            return {
                event: 'message.deleted',
                messageId: (parsed as { messageId: string }).messageId,
                scope: 'everyone',
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

        if (
            parsed.event === 'notification.message' &&
            parsed.message &&
            typeof parsed.message.id === 'string' &&
            typeof parsed.message.threadId === 'string' &&
            typeof parsed.message.senderId === 'string' &&
            typeof parsed.message.content === 'string' &&
            typeof parsed.senderName === 'string'
        ) {
            return {
                event: 'notification.message',
                message: {
                    ...parsed.message,
                    timestamp: Number(parsed.message.timestamp),
                },
                senderName: parsed.senderName,
                threadName: typeof parsed.threadName === 'string' ? parsed.threadName : undefined,
            };
        }

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
    } catch {
        return null;
    }

    return null;
}

async function fetchChatMessages(threadId: string): Promise<ChatMessage[]> {
    const messages = await request<BackendChatMessage[]>(`/chats/${threadId}/messages`, {
        method: 'GET',
    });

    return sortMessagesByTimestamp(
        messages.map((message) =>
            normalizeMessage(message, `Neighbor ${message.senderId.slice(0, 6)}`)
        )
    );
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
                    participantNames.get(message.senderId) ||
                        `Neighbor ${message.senderId.slice(0, 6)}`
                )
            );

            return normalizeChat(summary, sortMessagesByTimestamp(normalizedMessages));
        })
    );

    return threads.sort((left, right) => {
        const rightTimestamp =
            right.lastMessage?.timestamp ??
            right.messages[right.messages.length - 1]?.timestamp ??
            right.messages[0]?.timestamp ??
            0;
        const leftTimestamp =
            left.lastMessage?.timestamp ??
            left.messages[left.messages.length - 1]?.timestamp ??
            left.messages[0]?.timestamp ??
            0;
        return rightTimestamp - leftTimestamp;
    });
}

export async function fetchChatThread(threadId: string): Promise<ChatThread> {
    const summary = await request<BackendChatSummary>(`/chats/${threadId}`, { method: 'GET' });
    const messages = await fetchChatMessages(threadId);
    return normalizeChat(summary, messages);
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

export async function startDirectConversation(
    otherUserId: string
): Promise<StartDirectConversationResult> {
    const response = await fetch(`${API_BASE_URL}/chats`, {
        method: 'POST',
        headers: getAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
            isGroup: false,
            participantIds: [otherUserId],
        }),
    });

    if (response.status === 409) {
        const payload = (await response.json()) as { chatId?: string };
        if (payload.chatId) {
            return { threadId: payload.chatId, existed: true };
        }

        throw new ChatApiError('Conversation already exists', 409);
    }

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

    const payload = (await response.json()) as { id?: string };
    if (!payload.id) {
        throw new ChatApiError('Invalid chat response', 500);
    }

    return { threadId: payload.id, existed: false };
}

export async function createGroupChat(input: CreateGroupChatInput): Promise<ChatThread> {
    const payload = await request<{ id: string }>(`/chats`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            isGroup: true,
            participantIds: input.participantIds,
            name: input.name,
        }),
    });

    const chats = await fetchChats();
    const thread = chats.find((chat) => chat.id === payload.id);
    if (!thread) {
        throw new ChatApiError('Created group chat could not be loaded', 500);
    }

    return thread;
}

export async function addGroupChatParticipants(threadId: string, participantIds: string[]) {
    await request<void>(`/chats/${threadId}/participants`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ participantIds }),
    });
}

export async function removeGroupChatParticipant(threadId: string, participantId: string) {
    await request<void>(`/chats/${threadId}/participants/${participantId}`, {
        method: 'DELETE',
    });
}

export async function promoteGroupChatParticipant(threadId: string, participantId: string) {
    await request<void>(`/chats/${threadId}/participants/${participantId}/admin`, {
        method: 'POST',
    });
}

export async function deleteChatMessage(
    threadId: string,
    messageId: string,
    scope: DeleteMessageScope
): Promise<void> {
    await request<void>(`/chats/${threadId}/messages`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageId, scope }),
    });
}

export async function fetchBlockedUserIds(): Promise<string[]> {
    const payload = await request<{ userIds?: string[] }>('/users/blocked', {
        method: 'GET',
    });

    return payload.userIds ?? [];
}

export async function blockUser(userId: string): Promise<void> {
    await request<void>(`/users/${userId}/block`, {
        method: 'POST',
    });
}

export async function unblockUser(userId: string): Promise<void> {
    await request<void>(`/users/${userId}/block`, {
        method: 'DELETE',
    });
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

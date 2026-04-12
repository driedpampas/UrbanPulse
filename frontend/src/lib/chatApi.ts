import { API_BASE_URL, PULSE_FEED_WS_URL } from './api';
import { readStoredAuthSession } from './auth';
import type { ChatMessage, ChatThread } from './types';

export type ChatSocketMessage = {
    id: string;
    threadId: string;
    senderId: string;
    content: string;
    isEdited?: boolean;
    messageType?: 'text' | 'notice';
    replyToId?: string | null;
    replyTo?: {
        id: string;
        senderId: string;
        senderName: string;
        snippet: string;
        isUnavailable: boolean;
    } | null;
    timestamp: number;
};

export type ChatSocketEvent =
    | { event: 'message.created'; message: ChatSocketMessage }
    | { event: 'message.updated'; message: ChatSocketMessage }
    | { event: 'message.deleted'; messageId: string; scope: 'everyone' }
    | { event: 'chat.subscribed'; threadId: string }
    | { event: 'chat.unsubscribed'; threadId: string }
    | { event: 'chat.error'; threadId: string; reason: string }
    | { event: 'chat.updated'; threadId: string; name?: string }
    | { event: 'chat.members.updated'; threadId: string }
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
    name?: string | null;
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
    isEdited?: boolean;
    messageType?: string;
    replyToId?: string | null;
    replyTo?: {
        id: string;
        senderId: string;
        senderName: string;
        snippet: string;
        isUnavailable: boolean;
    } | null;
    timestamp: number | string;
};

type BackendSendMessageResponse = {
    message: BackendChatMessage;
    senderName: string;
    threadName?: string;
};

type BackendAddParticipantsResponse = {
    chat: BackendChatSummary;
    messages: BackendChatMessage[];
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
const confirmedSubscribedThreadIds = new Set<string>();
const subscribedThreadWaiters = new Map<string, Set<() => void>>();
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectEnabled = false;
let connectionStatus: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
const statusHandlers = new Set<(status: 'connected' | 'connecting' | 'disconnected') => void>();

function updateStatus(newStatus: typeof connectionStatus) {
    if (connectionStatus === newStatus) return;
    connectionStatus = newStatus;
    for (const handler of statusHandlers) {
        handler(newStatus);
    }
}

function normalizeMessage(message: BackendChatMessage, senderName: string): ChatMessage {
    const replyTo = message.replyTo
        ? {
              id: message.replyTo.id,
              senderId: message.replyTo.senderId,
              senderName: message.replyTo.senderName,
              snippet: message.replyTo.snippet,
              isUnavailable: Boolean(message.replyTo.isUnavailable),
          }
        : null;

    return {
        id: message.id,
        senderId: message.senderId,
        senderName,
        content: message.content,
        isEdited: Boolean(message.isEdited),
        type: (message.messageType as 'text' | 'notice') ?? 'text',
        replyToId: message.replyToId ?? null,
        replyTo,
        timestamp: Number(message.timestamp),
    };
}

function participantNameMap(summary: BackendChatSummary): Map<string, string> {
    return new Map(
        summary.participants.map((participant) => [
            participant.userId,
            participant.displayName?.trim().length
                ? participant.displayName
                : `Neighbor ${participant.userId.slice(0, 6)}`,
        ])
    );
}

function normalizeThreadMessages(
    summary: BackendChatSummary,
    messages: BackendChatMessage[]
): ChatMessage[] {
    const names = participantNameMap(summary);

    return sortMessagesByTimestamp(
        messages.map((message) =>
            normalizeMessage(
                message,
                names.get(message.senderId) || `Neighbor ${message.senderId.slice(0, 6)}`
            )
        )
    );
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
        name:
            summary.isGroup && typeof summary.name === 'string' && summary.name.trim().length > 0
                ? summary.name.trim()
                : summary.isGroup
                  ? participantNames.join(', ')
                  : undefined,
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
    if (event.event === 'chat.subscribed') {
        confirmedSubscribedThreadIds.add(event.threadId);
        const waiters = subscribedThreadWaiters.get(event.threadId);
        if (waiters) {
            for (const resolve of waiters) {
                resolve();
            }
            subscribedThreadWaiters.delete(event.threadId);
        }
    }

    if (event.event === 'chat.unsubscribed') {
        confirmedSubscribedThreadIds.delete(event.threadId);
        subscribedThreadWaiters.delete(event.threadId);
    }

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
            name?: string;
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

        if (
            parsed.event === 'message.updated' &&
            parsed.message &&
            typeof parsed.message.id === 'string' &&
            typeof parsed.message.threadId === 'string' &&
            typeof parsed.message.senderId === 'string' &&
            typeof parsed.message.content === 'string'
        ) {
            return {
                event: 'message.updated',
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

        if (parsed.event === 'chat.updated' && typeof parsed.threadId === 'string') {
            return {
                event: 'chat.updated',
                threadId: parsed.threadId,
                name: typeof parsed.name === 'string' ? parsed.name : undefined,
            };
        }

        if (parsed.event === 'chat.members.updated' && typeof parsed.threadId === 'string') {
            return {
                event: 'chat.members.updated',
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

async function fetchChatMessages(threadId: string): Promise<BackendChatMessage[]> {
    const messages = await request<BackendChatMessage[]>(`/chats/${threadId}/messages`, {
        method: 'GET',
    });

    return messages;
}

export async function fetchChats(): Promise<ChatThread[]> {
    const summaries = await request<BackendChatSummary[]>('/chats', { method: 'GET' });

    const threadResults = await Promise.allSettled(
        summaries.map(async (summary) => {
            try {
                const messages = await fetchChatMessages(summary.id);
                return normalizeChat(summary, normalizeThreadMessages(summary, messages));
            } catch {
                // Keep thread visible even if message history fetch fails.
                return normalizeChat(summary, []);
            }
        })
    );

    const threads = threadResults
        .filter(
            (result): result is PromiseFulfilledResult<ChatThread> => result.status === 'fulfilled'
        )
        .map((result) => result.value);

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
    return normalizeChat(summary, normalizeThreadMessages(summary, messages));
}

export async function sendMessage(
    threadId: string,
    content: string,
    replyToId?: string
): Promise<ChatMessage> {
    const response = await request<BackendChatMessage | BackendSendMessageResponse>(
        `/chats/${threadId}/messages`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content, replyToId }),
        }
    );

    const message = 'message' in response ? response.message : response;
    const senderName =
        'senderName' in response && typeof response.senderName === 'string'
            ? response.senderName
            : readStoredAuthSession()?.user.displayName ||
              `Neighbor ${message.senderId.slice(0, 6)}`;

    const normalized = normalizeMessage(message, senderName);
    const sessionUserId = readStoredAuthSession()?.user.id;

    return {
        ...normalized,
        senderId: sessionUserId ?? normalized.senderId,
        senderName,
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

export async function addGroupChatParticipants(
    threadId: string,
    participantIds: string[]
): Promise<ChatThread> {
    const payload = await request<BackendAddParticipantsResponse>(
        `/chats/${threadId}/participants`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ participantIds }),
        }
    );

    return normalizeChat(payload.chat, normalizeThreadMessages(payload.chat, payload.messages));
}

export async function removeGroupChatParticipant(threadId: string, participantId: string) {
    await request<void>(`/chats/${threadId}/participants/${participantId}`, {
        method: 'DELETE',
    });
}

export async function promoteGroupChatParticipant(threadId: string, participantId: string) {
    const payload = await request<{ chat: BackendChatSummary }>(
        `/chats/${threadId}/participants/${participantId}/admin`,
        {
            method: 'POST',
        }
    );

    return normalizeChat(payload.chat, []);
}

export async function deleteGroupChat(threadId: string) {
    await request<void>(`/chats/${threadId}`, {
        method: 'DELETE',
    });
}

export async function updateChatName(threadId: string, name: string) {
    return await request<{ threadId: string; name: string }>(`/chats/${threadId}/name`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
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

export async function editChatMessage(messageId: string, content: string): Promise<ChatMessage> {
    const payload = await request<{ message: BackendChatMessage }>(`/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
    });

    const sessionUser = readStoredAuthSession()?.user;

    return {
        id: payload.message.id,
        senderId: payload.message.senderId,
        senderName:
            sessionUser && sessionUser.id === payload.message.senderId
                ? sessionUser.displayName ||
                  sessionUser.email ||
                  `Neighbor ${sessionUser.id.slice(0, 6)}`
                : `Neighbor ${payload.message.senderId.slice(0, 6)}`,
        content: payload.message.content,
        isEdited: Boolean(payload.message.isEdited),
        type: (payload.message.messageType as 'text' | 'notice') ?? 'text',
        replyToId: payload.message.replyToId ?? null,
        replyTo: payload.message.replyTo
            ? {
                  id: payload.message.replyTo.id,
                  senderId: payload.message.replyTo.senderId,
                  senderName: payload.message.replyTo.senderName,
                  snippet: payload.message.replyTo.snippet,
                  isUnavailable: Boolean(payload.message.replyTo.isUnavailable),
              }
            : null,
        timestamp: Number(payload.message.timestamp),
    };
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

    updateStatus('connecting');
    reconnectEnabled = true;
    socket = new WebSocket(PULSE_FEED_WS_URL);

    socket.onopen = () => {
        updateStatus('connected');
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
        confirmedSubscribedThreadIds.clear();
        socket = null;
        if (wsHandlers.size > 0) {
            updateStatus('connecting');
            scheduleReconnect();
        } else {
            updateStatus('disconnected');
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

export function isChatThreadSubscribed(threadId: string) {
    return confirmedSubscribedThreadIds.has(threadId) && socket?.readyState === WebSocket.OPEN;
}

export function waitForChatThreadSubscription(threadId: string) {
    if (isChatThreadSubscribed(threadId)) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
        const waiters = subscribedThreadWaiters.get(threadId) ?? new Set<() => void>();
        waiters.add(resolve);
        subscribedThreadWaiters.set(threadId, waiters);
        ensureSocket();
    });
}

export function unsubscribeChatThread(threadId: string) {
    subscribedThreadIds.delete(threadId);
    subscribedThreadWaiters.delete(threadId);
    sendUnsubscribe(threadId);
}

export function onChatConnectionStatusChange(
    handler: (status: 'connected' | 'connecting' | 'disconnected') => void
) {
    statusHandlers.add(handler);
    handler(connectionStatus);
    return () => statusHandlers.delete(handler);
}

export function getChatConnectionStatus() {
    return connectionStatus;
}

import { useEffect, useState } from 'preact/hooks';
import { readStoredAuthSession } from './auth';

const STORAGE_PREFIX = 'urbanpulse.chat.unread.';

const listeners = new Set<() => void>();
let activeThreadId: string | null = null;

function getStorageKey(userId?: string | null) {
    return userId ? `${STORAGE_PREFIX}${userId}` : null;
}

function readUnreadThreadIds(userId?: string | null): string[] {
    const key = getStorageKey(userId);
    if (!key || typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
            return parsed.filter((value): value is string => typeof value === 'string');
        }
    } catch {
        window.localStorage.removeItem(key);
    }

    return [];
}

function writeUnreadThreadIds(userId: string | null | undefined, threadIds: string[]) {
    if (typeof window === 'undefined') {
        return;
    }

    const key = getStorageKey(userId);
    if (!key) {
        return;
    }

    window.localStorage.setItem(key, JSON.stringify(Array.from(new Set(threadIds))));
    for (const listener of listeners) {
        listener();
    }
}

export function markThreadUnread(threadId: string) {
    const session = readStoredAuthSession();
    const userId = session?.user.id;
    if (!userId) {
        return;
    }

    const threadIds = readUnreadThreadIds(userId);
    if (threadIds.includes(threadId)) {
        return;
    }

    writeUnreadThreadIds(userId, [...threadIds, threadId]);
}

export function markThreadRead(threadId: string) {
    const session = readStoredAuthSession();
    const userId = session?.user.id;
    if (!userId) {
        return;
    }

    const threadIds = readUnreadThreadIds(userId).filter((id) => id !== threadId);
    writeUnreadThreadIds(userId, threadIds);
}

export function setActiveChatThread(threadId: string | null) {
    activeThreadId = threadId;
}

export function isActiveChatThread(threadId: string) {
    return activeThreadId === threadId;
}

export function useUnreadChatThreads() {
    const session = readStoredAuthSession();
    const userId = session?.user.id ?? null;
    const [threadIds, setThreadIds] = useState<string[]>(() => readUnreadThreadIds(userId));

    useEffect(() => {
        const sync = () => setThreadIds(readUnreadThreadIds(userId));
        sync();

        listeners.add(sync);
        window.addEventListener('storage', sync);
        return () => {
            listeners.delete(sync);
            window.removeEventListener('storage', sync);
        };
    }, [userId]);

    return threadIds;
}

export function useUnreadChatCount() {
    return useUnreadChatThreads().length;
}

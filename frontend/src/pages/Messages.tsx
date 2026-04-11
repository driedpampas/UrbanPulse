import {
    ChevronRight,
    Clock,
    MessageCircle,
    Plus,
    Search,
    Send,
    ShieldCheck,
    Sparkles,
    Trash2,
    User,
    Users,
    X,
} from 'lucide-preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { AppLayout } from '../components/Layout/AppLayout';
import { RoleBadge } from '../components/Profile/RoleBadge';
import { TrustBadge } from '../components/Profile/TrustBadge';
import { readStoredAuthSession } from '../lib/auth';
import {
    connectChatWebSocket,
    deleteChatMessage,
    disconnectChatWebSocket,
    fetchChats,
    sendMessage,
    startDirectConversation,
    subscribeChatThread,
    unsubscribeChatThread,
} from '../lib/chatApi';
import {
    markThreadRead,
    setActiveChatThread,
    useUnreadChatThreads,
} from '../lib/chatNotifications';
import type { User as AppUser, ChatMessage, ChatThread } from '../lib/types';
import { fetchUsers } from '../lib/userApi';

function timeAgo(ts: number) {
    const d = Date.now() - ts;
    if (d < 60000) return 'just now';
    if (d < 3600000) return `${Math.floor(d / 60000)}m`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
    return `${Math.floor(d / 86400000)}d`;
}

function avatarUrl(seed: string) {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

function upsertMessageById(
    messages: ChatMessage[],
    incoming: ChatMessage
): { messages: ChatMessage[]; changed: boolean } {
    const existingIndex = messages.findIndex((message) => message.id === incoming.id);

    if (existingIndex >= 0) {
        const existing = messages[existingIndex]!;
        const unchanged =
            existing.senderId === incoming.senderId &&
            existing.senderName === incoming.senderName &&
            existing.content === incoming.content &&
            existing.timestamp === incoming.timestamp;

        if (unchanged) {
            return { messages, changed: false };
        }

        const next = [...messages];
        next[existingIndex] = incoming;
        return { messages: next, changed: true };
    }

    return { messages: [...messages, incoming], changed: true };
}

function uniqueMessagesById(messages: ChatMessage[]): ChatMessage[] {
    const map = new Map<string, ChatMessage>();
    for (const message of messages) {
        map.set(message.id, message);
    }

    return Array.from(map.values());
}

function removeMessageById(messages: ChatMessage[], messageId: string): ChatMessage[] {
    return messages.filter((message) => message.id !== messageId);
}

function getThreadDisplayName(thread: ChatThread, currentUserId: string, fallback: string) {
    const names = thread.participants
        .map((participantId, index) => ({
            participantId,
            name: thread.participantNames[index],
        }))
        .filter(({ participantId }) => participantId !== currentUserId)
        .map(({ name, participantId }) => name || `Neighbor ${participantId.slice(0, 6)}`);

    return thread.name || names.join(', ') || fallback;
}

export function Messages() {
    const [location] = useLocation();
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
    const [showCompose, setShowCompose] = useState(false);
    const [query, setQuery] = useState('');
    const [queryResults, setQueryResults] = useState<AppUser[]>([]);
    const [searching, setSearching] = useState(false);
    const [composeError, setComposeError] = useState<string | null>(null);
    const [startingUserId, setStartingUserId] = useState<string | null>(null);
    const unreadThreadIds = useUnreadChatThreads();
    const currentUser = readStoredAuthSession()?.user;
    const currentUserName = currentUser?.displayName ?? currentUser?.email ?? 'You';
    const currentUserId = currentUser?.id ?? 'me';
    const composeSearchLimit = 50;
    const selectedThreadId =
        typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('threadId')
            : null;

    const handleThreadUpdate = (updated: ChatThread) => {
        setThreads((p) => p.map((t) => (t.id === updated.id ? updated : t)));
        setActiveThread(updated);
    };

    useEffect(() => {
        fetchChats().then((data) => {
            setThreads(data);
            setLoading(false);

            if (selectedThreadId) {
                const target = data.find((thread) => thread.id === selectedThreadId);
                if (target) {
                    setActiveThread(target);
                }
            }
        });
    }, [location, selectedThreadId]);

    useEffect(() => {
        if (!showCompose) {
            return;
        }

        let cancelled = false;
        setSearching(true);

        fetchUsers({
            displayName: query.trim() || undefined,
            limit: composeSearchLimit,
        })
            .then((users) => {
                if (cancelled) {
                    return;
                }

                const filtered = users.filter((user) => user.id !== currentUser?.id);
                setQueryResults(filtered);
            })
            .catch(() => {
                if (!cancelled) {
                    setComposeError('Failed to search users');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setSearching(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [showCompose, query, currentUser?.id]);

    const openThreadById = async (threadId: string) => {
        const existing = threads.find((thread) => thread.id === threadId);
        if (existing) {
            setActiveThread(existing);
            return;
        }

        const refreshed = await fetchChats();
        setThreads(refreshed);
        const resolved = refreshed.find((thread) => thread.id === threadId);
        if (resolved) {
            setActiveThread(resolved);
        }
    };

    useEffect(() => {
        setActiveChatThread(activeThread?.id ?? null);

        return () => {
            setActiveChatThread(null);
        };
    }, [activeThread?.id]);

    const openThread = (thread: ChatThread) => {
        markThreadRead(thread.id);
        setActiveThread(thread);
    };

    const handleStartConversation = async (user: AppUser) => {
        if (startingUserId) {
            return;
        }

        setComposeError(null);
        setStartingUserId(user.id);

        try {
            const result = await startDirectConversation(user.id);
            await openThreadById(result.threadId);
            setShowCompose(false);
            setQuery('');
        } catch (error) {
            setComposeError(
                error instanceof Error ? error.message : 'Could not start conversation'
            );
        } finally {
            setStartingUserId(null);
        }
    };

    if (activeThread) {
        return <ChatView thread={activeThread} onThreadUpdate={handleThreadUpdate} />;
    }

    return (
        <AppLayout
            title="Messages"
            headerRight={
                <button
                    type="button"
                    class="btn-primary"
                    onClick={() => {
                        setComposeError(null);
                        setShowCompose(true);
                    }}
                    style="height:30px;padding:0 10px;font-size:12px;gap:4px;"
                >
                    <Plus size={13} />
                    New Chat
                </button>
            }
        >
            <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
                <div
                    class="card animate-slide-up"
                    style="padding:14px;display:flex;align-items:center;gap:12px;background:#f0f4ff;border-color:#d1d5ff;"
                >
                    <div style="width:44px;height:44px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:#4f46e5;color:#fff;">
                        <MessageCircle size={18} />
                    </div>
                    <div style="flex:1;min-width:0;">
                        <p style="margin:0;font-size:15px;font-weight:700;color:#1f2937;letter-spacing:-0.01em;">
                            Conversations
                        </p>
                        <p style="margin:2px 0 0;font-size:13px;color:#6b7280;line-height:1.4;">
                            Keep chat tied to trust, roles, and live pulses.
                        </p>
                    </div>
                </div>

                {loading ? (
                    [1, 2].map((i) => (
                        <div
                            key={i}
                            style="height:74px;border-radius:14px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                        />
                    ))
                ) : threads.length === 0 ? (
                    <div style="padding:56px 24px;text-align:center;border:1px solid var(--border);border-radius:16px;background:var(--surface);">
                        <div style="width:48px;height:48px;margin:0 auto 10px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:var(--accent-subtle);color:var(--accent);">
                            <Users size={24} />
                        </div>
                        <p style="font-size:13px;color:var(--text-secondary);margin:0;">
                            No conversations yet
                        </p>
                    </div>
                ) : (
                    threads.map((thread, i) => {
                        const displayName = getThreadDisplayName(
                            thread,
                            currentUserId,
                            currentUserName
                        );
                        const isGroup = thread.isGroup;
                        const isUnread = unreadThreadIds.includes(thread.id);
                        return (
                            <button
                                type="button"
                                key={thread.id}
                                id={`thread-${thread.id}`}
                                onClick={() => openThread(thread)}
                                class="card animate-slide-up"
                                style={`width:100%;padding:12px 14px;display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;transition:transform 0.15s,background 0.15s;animation-delay:${i * 50}ms;border-radius:16px;`}
                            >
                                <div
                                    style={`width:44px;height:44px;border-radius:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${isGroup ? '#e0e7ff' : '#d1fae5'};color:${isGroup ? '#4f46e5' : '#059669'};`}
                                >
                                    {isGroup ? <Users size={18} /> : <User size={18} />}
                                </div>
                                <div style="flex:1;min-width:0;">
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                        <p
                                            style={`font-size:14px;font-weight:${isUnread ? '700' : '600'};color:var(--text);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`}
                                        >
                                            {displayName}
                                        </p>
                                        {isUnread && (
                                            <span style="width:8px;height:8px;border-radius:999px;background:#4f46e5;flex-shrink:0;" />
                                        )}
                                        <span
                                            style={`display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;background:${isGroup ? '#e0e7ff' : '#d1fae5'};color:${isGroup ? '#4f46e5' : '#059669'};`}
                                        >
                                            {isGroup ? 'Group' : 'Direct'}
                                        </span>
                                    </div>
                                    {thread.lastMessage && (
                                        <p style="font-size:12px;color:var(--text-secondary);margin:4px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                            {thread.lastMessage.senderName}:{' '}
                                            {thread.lastMessage.content}
                                        </p>
                                    )}
                                </div>
                                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
                                    {thread.lastMessage && (
                                        <span style="font-size:11px;color:var(--text-tertiary);font-variant-numeric:tabular-nums;">
                                            {timeAgo(thread.lastMessage.timestamp)}
                                        </span>
                                    )}
                                    <ChevronRight size={14} style="color:var(--text-tertiary);" />
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            {showCompose && (
                <div
                    role="dialog"
                    aria-modal="true"
                    style="position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,17,23,0.52);backdrop-filter:blur(8px);"
                >
                    <div
                        class="animate-slide-up"
                        style="width:100%;max-width:720px;max-height:82dvh;display:flex;flex-direction:column;border:1px solid #d1d5db;border-radius:20px;background:#fff;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.15);"
                    >
                        <div style="padding:16px 16px 14px;border-bottom:1px solid #e5e7eb;background:#f9fafb;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                            <div style="display:flex;align-items:flex-start;gap:12px;">
                                <div style="width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:#4f46e5;color:#fff;flex-shrink:0;">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <p style="margin:0;font-size:15px;font-weight:700;color:#1f2937;">
                                        Start a conversation
                                    </p>
                                    <p style="margin:3px 0 0;font-size:13px;color:#6b7280;line-height:1.4;">
                                        Search a neighbor, then open a thread with their profile
                                        context.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                class="btn-icon"
                                onClick={() => {
                                    setShowCompose(false);
                                    setComposeError(null);
                                    setQuery('');
                                }}
                                aria-label="Close"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                            <label
                                for="chat-user-search"
                                style="display:block;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:7px;text-transform:uppercase;letter-spacing:0.06em;"
                            >
                                Search users
                            </label>
                            <div style="display:flex;align-items:center;gap:10px;padding:0 12px;height:44px;border:1px solid #d1d5db;border-radius:14px;background:#f9fafb;box-shadow:none;">
                                <Search size={14} style="color:#9ca3af;" />
                                <input
                                    id="chat-user-search"
                                    value={query}
                                    onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                                    placeholder="Type a name..."
                                    style="flex:1;border:none;outline:none;background:transparent;color:#1f2937;font-size:14px;font-family:inherit;"
                                />
                            </div>
                            {composeError && (
                                <p style="margin:8px 0 0;font-size:13px;color:#dc2626;">
                                    {composeError}
                                </p>
                            )}
                        </div>

                        <div style="overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;">
                            {searching ? (
                                [1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        style="height:64px;border-radius:16px;background:#f3f4f6;animation:pulse 1.5s ease-in-out infinite;"
                                    />
                                ))
                            ) : queryResults.length === 0 ? (
                                <div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">
                                    No users found
                                </div>
                            ) : (
                                queryResults.map((user) => (
                                    <button
                                        type="button"
                                        key={user.id}
                                        onClick={() => handleStartConversation(user)}
                                        disabled={startingUserId !== null}
                                        class="card"
                                        style="padding:10px 12px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;border-radius:16px;"
                                    >
                                        <div style="width:40px;height:40px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f3f4f6;border:1px solid #e5e7eb;">
                                            <img
                                                src={user.avatar || avatarUrl(user.name)}
                                                alt=""
                                                style="width:100%;height:100%;object-fit:cover;"
                                            />
                                        </div>
                                        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;">
                                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                                <p style="margin:0;font-size:14px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                                    {user.name}
                                                </p>
                                                {user.verified && (
                                                    <ShieldCheck size={12} style="color:#16a34a;" />
                                                )}
                                            </div>
                                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                                <TrustBadge
                                                    score={user.trustScore}
                                                    verified={user.verified}
                                                    compact
                                                />
                                                {user.role && (
                                                    <RoleBadge role={user.role} compact />
                                                )}
                                            </div>
                                        </div>
                                        <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#4f46e5;">
                                            {startingUserId === user.id ? 'Opening...' : 'Chat'}
                                            <ChevronRight size={12} />
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}

function ChatView({
    thread,
    onThreadUpdate,
}: {
    thread: ChatThread;
    onThreadUpdate: (t: ChatThread) => void;
}) {
    const [, setLocation] = useLocation();
    const [messages, setMessages] = useState<ChatMessage[]>(() => [...thread.messages]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
    const [contextMenuMessageId, setContextMenuMessageId] = useState<string | null>(null);
    const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
        null
    );
    const [chatColor, setChatColor] = useState<string>('default');
    const sendingRef = useRef(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const threadRef = useRef(thread);
    const currentUser = readStoredAuthSession()?.user;
    const currentUserId = currentUser?.id ?? 'me';
    const currentUserName = currentUser?.displayName ?? currentUser?.email ?? 'You';

    const participantNameById = useMemo(() => {
        const nameMap = new Map<string, string>();
        thread.participants.forEach((participantId, index) => {
            const candidate = thread.participantNames[index];
            if (candidate && candidate.trim().length > 0) {
                nameMap.set(participantId, candidate);
            }
        });
        nameMap.set(currentUserId, currentUserName);
        return nameMap;
    }, [thread.participants, thread.participantNames, currentUserId, currentUserName]);

    useEffect(() => {
        threadRef.current = thread;
    }, [thread]);

    useEffect(() => {
        const normalized = uniqueMessagesById([...thread.messages]).map((message) => ({
            ...message,
            senderName:
                participantNameById.get(message.senderId) ||
                message.senderName ||
                `Neighbor ${message.senderId.slice(0, 6)}`,
        }));

        setMessages(normalized);
    }, [thread.id, thread.messages, participantNameById]);

    useEffect(() => {
        const handleChatSocket = (event: {
            event: string;
            message?: {
                id: string;
                threadId: string;
                senderId: string;
                content: string;
                timestamp: number;
            };
            messageId?: string;
            senderName?: string;
            threadName?: string;
        }) => {
            if (event.event === 'message.deleted' && typeof event.messageId === 'string') {
                setMessages((prev) => {
                    const next = removeMessageById(prev, event.messageId!);
                    if (next.length === prev.length) {
                        return prev;
                    }

                    onThreadUpdate({
                        ...threadRef.current,
                        messages: next,
                        lastMessage: next[next.length - 1],
                    });

                    return next;
                });

                return;
            }

            if (event.event !== 'message.created' && event.event !== 'notification.message') {
                return;
            }

            if (!event.message || event.message.threadId !== thread.id) {
                return;
            }

            const senderIndex = thread.participants.findIndex((participant) => {
                return participant === event.message?.senderId;
            });
            const isMe = event.message.senderId === currentUserId;
            const senderName = isMe
                ? currentUserName
                : event.event === 'notification.message' && event.senderName
                  ? event.senderName
                  : senderIndex >= 0
                    ? thread.participantNames[senderIndex] ||
                      `Neighbor ${event.message.senderId.slice(0, 6)}`
                    : `Neighbor ${event.message.senderId.slice(0, 6)}`;

            const mappedMessage: ChatMessage = {
                id: event.message.id,
                senderId: event.message.senderId,
                senderName,
                content: event.message.content,
                timestamp: Number(event.message.timestamp),
            };

            setMessages((prev) => {
                const merged = upsertMessageById(prev, mappedMessage);
                if (!merged.changed) {
                    return prev;
                }

                onThreadUpdate({
                    ...threadRef.current,
                    messages: merged.messages,
                    lastMessage: mappedMessage,
                });
                return merged.messages;
            });
        };

        connectChatWebSocket(handleChatSocket);
        subscribeChatThread(thread.id);

        return () => {
            unsubscribeChatThread(thread.id);
            disconnectChatWebSocket(handleChatSocket);
        };
    }, [
        thread.id,
        onThreadUpdate,
        currentUserId,
        currentUserName,
        thread.participants,
        thread.participantNames,
    ]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || sendingRef.current) return;
        const content = input.trim();
        sendingRef.current = true;
        setSending(true);
        try {
            const msg = await sendMessage(thread.id, content);
            setMessages((prev) => {
                const mappedMessage: ChatMessage = {
                    ...msg,
                    senderName:
                        participantNameById.get(msg.senderId) ||
                        msg.senderName ||
                        `Neighbor ${msg.senderId.slice(0, 6)}`,
                };
                const merged = upsertMessageById(prev, mappedMessage);
                if (!merged.changed) {
                    return prev;
                }

                onThreadUpdate({
                    ...threadRef.current,
                    messages: merged.messages,
                    lastMessage: mappedMessage,
                });
                return merged.messages;
            });
            setInput('');
        } finally {
            sendingRef.current = false;
            setSending(false);
        }
    };

    const handleDeleteMessage = async (message: ChatMessage, scope: 'me' | 'everyone') => {
        if (deletingMessageId) {
            return;
        }

        setContextMenuMessageId(null);
        setContextMenuPosition(null);
        setDeletingMessageId(message.id);
        try {
            await deleteChatMessage(thread.id, message.id, scope);

            setMessages((prev) => {
                const next = removeMessageById(prev, message.id);
                if (next.length === prev.length) {
                    return prev;
                }

                onThreadUpdate({
                    ...threadRef.current,
                    messages: next,
                    lastMessage: next[next.length - 1],
                });

                return next;
            });
        } catch (error) {
            console.error(error);
        } finally {
            setDeletingMessageId(null);
        }
    };

    const handleContextMenu = (e: MouseEvent, messageId: string) => {
        e.preventDefault();
        setContextMenuMessageId(messageId);
        setContextMenuPosition({ x: e.clientX, y: e.clientY });
    };

    const chatColorMap: { [key: string]: string } = {
        default: '#4f46e5',
        violet: '#8b5cf6',
        emerald: '#059669',
        orange: '#f97316',
        rose: '#dc2626',
    };

    const getAvatarUrl = (userId: string) => {
        return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(userId)}&scale=80`;
    };

    return (
        <div style="min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);position:relative;">
            {/* Messages */}
            <div style="flex:1;overflow-y:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:12px;padding-bottom:88px;">
                <div style="height:8px;" />
                {messages.map((msg) => {
                    const isMe = msg.senderId === currentUserId;
                    const isContextMenuOpen = contextMenuMessageId === msg.id;
                    return (
                        <div
                            key={msg.id}
                            style={`display:flex;gap:10px;align-items:flex-end;justify-content:${isMe ? 'flex-end' : 'flex-start'};position:relative;`}
                        >
                            {!isMe && (
                                <div style="width:32px;height:32px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;border:1.5px solid var(--border);background:var(--bg-subtle);">
                                    <img
                                        src={getAvatarUrl(msg.senderId)}
                                        alt={msg.senderName}
                                        style="width:100%;height:100%;object-fit:cover;"
                                    />
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={(e) => {
                                    if (isMe) {
                                        handleContextMenu(e as any, msg.id);
                                    }
                                }}
                                onContextMenu={(e) => handleContextMenu(e as any, msg.id)}
                                style={`
                                    max-width:75%;padding:12px 15px;border-radius:18px;font-size:14px;line-height:1.6;transition:all 0.2s;position:relative;border:none;cursor:${isMe ? 'pointer' : 'default'};text-align:left;background:none;color:inherit;display:flex;flex-direction:column;
                                    ${
                                        isMe
                                            ? `background:#4f46e5;color:#fff;border-bottom-right-radius:8px;box-shadow:0 2px 8px rgba(79,70,229,0.3);`
                                            : 'background:#f3f4f6;color:#1f2937;border:1px solid #e5e7eb;border-bottom-left-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);'
                                    }
                                `}
                            >
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;">
                                    {!isMe ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setLocation(
                                                    `/profile?userId=${encodeURIComponent(msg.senderId)}`
                                                )
                                            }
                                            style={`font-size:12px;font-weight:700;color:#4f46e5;margin:0;padding:0;background:none;border:none;cursor:pointer;letter-spacing:0.02em;`}
                                        >
                                            {msg.senderName}
                                        </button>
                                    ) : (
                                        <span
                                            style={`font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;opacity:0.85;flex-shrink:0;`}
                                        >
                                            You
                                        </span>
                                    )}
                                    <span
                                        style={`font-size:12px;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:3px;${isMe ? 'color:rgba(255,255,255,0.8);' : 'color:#6b7280;'}`}
                                    >
                                        <Clock size={10} />
                                        {timeAgo(msg.timestamp)}
                                    </span>
                                </div>
                                <p style="margin:0;word-break:break-word;">{msg.content}</p>
                            </button>

                            {isMe && (
                                <button
                                    type="button"
                                    onClick={(e) => handleContextMenu(e as any, msg.id)}
                                    style={`width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:var(--surface-raised);border:1px solid var(--border);cursor:pointer;color:var(--text-tertiary);transition:all 0.2s;opacity:${contextMenuMessageId === msg.id ? '1' : '0'};pointer-events:${contextMenuMessageId === msg.id ? 'auto' : 'none'};flex-shrink:0;`}
                                    aria-label="Delete message"
                                    onMouseEnter={(e) => {
                                        const btn = e.currentTarget as HTMLElement;
                                        btn.style.background = 'var(--danger-subtle)';
                                        btn.style.color = 'var(--danger)';
                                    }}
                                    onMouseLeave={(e) => {
                                        const btn = e.currentTarget as HTMLElement;
                                        btn.style.background = 'var(--surface-raised)';
                                        btn.style.color = 'var(--text-tertiary)';
                                    }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}

                            {isContextMenuOpen && contextMenuPosition && (
                                <div
                                    style={`position:fixed;left:${contextMenuPosition.x}px;top:${contextMenuPosition.y}px;z-index:50;background:var(--surface-raised);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 40px rgba(15,23,42,0.3);overflow:hidden;min-width:160px;`}
                                    role="menu"
                                    onMouseLeave={() => {
                                        setContextMenuMessageId(null);
                                        setContextMenuPosition(null);
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteMessage(msg, 'me')}
                                        disabled={deletingMessageId !== null}
                                        role="menuitem"
                                        style="width:100%;padding:10px 14px;border:none;background:none;cursor:pointer;font-size:13px;color:var(--text);display:flex;align-items:center;gap:10px;text-align:left;transition:background 0.15s;"
                                        onMouseEnter={(e) => {
                                            (e.currentTarget as HTMLElement).style.background =
                                                'var(--bg-muted)';
                                        }}
                                        onMouseLeave={(e) => {
                                            (e.currentTarget as HTMLElement).style.background =
                                                'none';
                                        }}
                                    >
                                        <Trash2 size={14} />
                                        Delete for me
                                    </button>
                                    <div style="height:1px;background:var(--border);" />
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteMessage(msg, 'everyone')}
                                        disabled={deletingMessageId !== null}
                                        role="menuitem"
                                        style="width:100%;padding:10px 14px;border:none;background:none;cursor:pointer;font-size:13px;color:var(--danger);display:flex;align-items:center;gap:10px;text-align:left;transition:background 0.15s;"
                                        onMouseEnter={(e) => {
                                            (e.currentTarget as HTMLElement).style.background =
                                                'var(--danger-subtle)';
                                        }}
                                        onMouseLeave={(e) => {
                                            (e.currentTarget as HTMLElement).style.background =
                                                'none';
                                        }}
                                    >
                                        <Trash2 size={14} />
                                        Delete for everyone
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div
                class="nav-bar"
                style="position:fixed;bottom:0;left:0;right:0;padding:10px 12px;display:flex;align-items:center;gap:8px;background:linear-gradient(180deg,rgba(255,255,255,0),var(--bg) 25%);"
            >
                <div style="max-width:720px;width:100%;margin:0 auto;display:flex;align-items:center;gap:8px;border:1px solid #e5e7eb;border-radius:18px;background:#fff;padding:8px 10px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                        <MessageCircle size={16} style="color:#6b7280;" />
                        <div style="width:1px;height:18px;background:#e5e7eb;" />
                    </div>
                    <input
                        value={input}
                        onInput={(e) => setInput((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.repeat) {
                                handleSend();
                            }
                        }}
                        placeholder="Message…"
                        style="flex:1;padding:8px 0;border:none;background:transparent;color:#1f2937;font-size:14px;font-family:inherit;outline:none;"
                    />
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                        <button
                            type="button"
                            onClick={() => {
                                const colors = Object.keys(chatColorMap).filter(
                                    (c) => c !== chatColor
                                );
                                const nextColor =
                                    colors[
                                        (Object.keys(chatColorMap).indexOf(chatColor) + 1) %
                                            Object.keys(chatColorMap).length
                                    ];
                                setChatColor(nextColor);
                            }}
                            style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:transparent;border:1px solid #e5e7eb;cursor:pointer;color:#6b7280;transition:all 0.2s;"
                            title="Change chat color"
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.background = '#f3f4f6';
                                (e.currentTarget as HTMLElement).style.color = '#4f46e5';
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.background = 'transparent';
                                (e.currentTarget as HTMLElement).style.color = '#6b7280';
                            }}
                        >
                            <div
                                style={`width:12px;height:12px;border-radius:50%;background:${chatColorMap[chatColor]};`}
                            />
                        </button>
                        <button
                            type="button"
                            id="send-message-btn"
                            onClick={handleSend}
                            disabled={!input.trim() || sending}
                            class="btn-primary"
                            style="height:36px;width:36px;padding:0;background:#4f46e5;border-radius:10px;flex-shrink:0;"
                            aria-label="Send"
                        >
                            <Send size={15} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

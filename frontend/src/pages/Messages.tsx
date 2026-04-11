import {
    ArrowLeft,
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
    const currentUser = readStoredAuthSession()?.user;
    const currentUserName = currentUser?.displayName ?? currentUser?.email ?? 'You';
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

        fetchUsers({ displayName: query.trim() || undefined })
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
        return (
            <ChatView
                thread={activeThread}
                onBack={() => setActiveThread(null)}
                onThreadUpdate={handleThreadUpdate}
            />
        );
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
                    style="padding:14px;display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,rgba(59,130,246,0.14),rgba(16,185,129,0.10));border-color:rgba(59,130,246,0.14);"
                >
                    <div style="width:44px;height:44px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--accent),#14b8a6);color:#fff;box-shadow:0 12px 30px rgba(59,130,246,0.22);">
                        <MessageCircle size={18} />
                    </div>
                    <div style="flex:1;min-width:0;">
                        <p style="margin:0;font-size:14px;font-weight:700;color:var(--text);letter-spacing:-0.01em;">
                            Conversations
                        </p>
                        <p style="margin:2px 0 0;font-size:12px;color:var(--text-secondary);line-height:1.4;">
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
                        const otherNames = thread.participantNames.filter(
                            (name) => name !== currentUserName
                        );
                        const displayName = thread.name || otherNames.join(', ');
                        const isGroup = thread.isGroup;
                        return (
                            <button
                                type="button"
                                key={thread.id}
                                id={`thread-${thread.id}`}
                                onClick={() => setActiveThread(thread)}
                                class="card animate-slide-up"
                                style={`width:100%;padding:12px 14px;display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;transition:transform 0.15s,background 0.15s;animation-delay:${i * 50}ms;border-radius:16px;`}
                            >
                                <div
                                    style={`width:44px;height:44px;border-radius:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${isGroup ? 'linear-gradient(135deg,rgba(99,102,241,0.16),rgba(59,130,246,0.10))' : 'linear-gradient(135deg,rgba(16,185,129,0.14),rgba(14,165,233,0.10))'};color:${isGroup ? 'var(--accent)' : 'var(--success)'};`}
                                >
                                    {isGroup ? <Users size={18} /> : <User size={18} />}
                                </div>
                                <div style="flex:1;min-width:0;">
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                        <p style="font-size:13px;font-weight:700;color:var(--text);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                            {displayName}
                                        </p>
                                        <span
                                            style={`display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;background:${isGroup ? 'var(--accent-subtle)' : 'var(--success-subtle)'};color:${isGroup ? 'var(--accent)' : 'var(--success)'};`}
                                        >
                                            {isGroup ? 'Group' : 'Direct'}
                                        </span>
                                    </div>
                                    {thread.lastMessage && (
                                        <p style="font-size:11px;color:var(--text-tertiary);margin:4px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                            {thread.lastMessage.senderName}:{' '}
                                            {thread.lastMessage.content}
                                        </p>
                                    )}
                                </div>
                                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
                                    {thread.lastMessage && (
                                        <span style="font-size:10px;color:var(--text-tertiary);font-variant-numeric:tabular-nums;">
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
                    style="position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;padding:14px;background:rgba(15,17,23,0.52);backdrop-filter:blur(8px);"
                >
                    <div
                        class="animate-slide-up"
                        style="width:100%;max-width:680px;max-height:82dvh;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:20px;background:linear-gradient(180deg,var(--surface),var(--bg));overflow:hidden;box-shadow:0 24px 80px rgba(15,23,42,0.28);"
                    >
                        <div style="padding:16px 16px 14px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,rgba(59,130,246,0.11),rgba(16,185,129,0.08));display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                            <div style="display:flex;align-items:flex-start;gap:12px;">
                                <div style="width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--accent),#14b8a6);color:#fff;flex-shrink:0;">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <p style="margin:0;font-size:14px;font-weight:800;color:var(--text);">
                                        Start a conversation
                                    </p>
                                    <p style="margin:3px 0 0;font-size:12px;color:var(--text-secondary);line-height:1.4;">
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

                        <div style="padding:14px 16px;border-bottom:1px solid var(--border);">
                            <label
                                for="chat-user-search"
                                style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:7px;text-transform:uppercase;letter-spacing:0.06em;"
                            >
                                Search users
                            </label>
                            <div style="display:flex;align-items:center;gap:10px;padding:0 12px;height:44px;border:1px solid var(--border);border-radius:14px;background:var(--bg-subtle);box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);">
                                <Search size={14} style="color:var(--text-tertiary);" />
                                <input
                                    id="chat-user-search"
                                    value={query}
                                    onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                                    placeholder="Type a name..."
                                    style="flex:1;border:none;outline:none;background:transparent;color:var(--text);font-size:13px;font-family:inherit;"
                                />
                            </div>
                            {composeError && (
                                <p style="margin:8px 0 0;font-size:12px;color:var(--danger);">
                                    {composeError}
                                </p>
                            )}
                        </div>

                        <div style="overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;">
                            {searching ? (
                                [1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        style="height:64px;border-radius:16px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                                    />
                                ))
                            ) : queryResults.length === 0 ? (
                                <div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px;">
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
                                        <div style="width:40px;height:40px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg-muted);border:1px solid var(--border);">
                                            <img
                                                src={user.avatar || avatarUrl(user.name)}
                                                alt=""
                                                style="width:100%;height:100%;object-fit:cover;"
                                            />
                                        </div>
                                        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;">
                                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                                <p style="margin:0;font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                                    {user.name}
                                                </p>
                                                {user.verified && (
                                                    <ShieldCheck
                                                        size={12}
                                                        style="color:var(--success);"
                                                    />
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
                                        <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--accent);">
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
    onBack,
    onThreadUpdate,
}: {
    thread: ChatThread;
    onBack: () => void;
    onThreadUpdate: (t: ChatThread) => void;
}) {
    const [, setLocation] = useLocation();
    const [messages, setMessages] = useState<ChatMessage[]>(() => [...thread.messages]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
    const sendingRef = useRef(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const threadRef = useRef(thread);
    const currentUser = readStoredAuthSession()?.user;
    const currentUserId = currentUser?.id ?? 'me';
    const currentUserName = currentUser?.displayName ?? currentUser?.email ?? 'You';
    const directOtherUserId = !thread.isGroup
        ? thread.participants.find((participantId) => participantId !== currentUserId)
        : null;

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

            if (event.event !== 'message.created' || !event.message) {
                return;
            }

            if (event.message.threadId !== thread.id) {
                return;
            }

            const senderIndex = thread.participants.findIndex((participant) => {
                return participant === event.message?.senderId;
            });
            const isMe = event.message.senderId === currentUserId;

            const mappedMessage: ChatMessage = {
                id: event.message.id,
                senderId: event.message.senderId,
                senderName: isMe
                    ? currentUserName
                    : senderIndex >= 0
                      ? thread.participantNames[senderIndex] ||
                        `Neighbor ${event.message.senderId.slice(0, 6)}`
                      : `Neighbor ${event.message.senderId.slice(0, 6)}`,
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

        const confirmationText =
            scope === 'everyone'
                ? 'Delete this message for everyone? This cannot be undone.'
                : 'Delete this message for you?';

        if (!window.confirm(confirmationText)) {
            return;
        }

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

    const otherNames = thread.participantNames.filter((name) => name !== currentUserName);
    const title = thread.name || otherNames.join(', ');

    return (
        <div style="min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);">
            {/* Header */}
            <header
                class="header-bar"
                style="position:sticky;top:0;z-index:40;height:var(--header-h);display:flex;align-items:center;gap:10px;padding:0 12px;"
            >
                <button
                    type="button"
                    class="btn-icon"
                    onClick={onBack}
                    aria-label="Back"
                    style="color:var(--text-secondary);"
                >
                    <ArrowLeft size={18} />
                </button>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                        <div
                            style={`width:38px;height:38px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${thread.isGroup ? 'linear-gradient(135deg,rgba(99,102,241,0.16),rgba(59,130,246,0.10))' : 'linear-gradient(135deg,rgba(16,185,129,0.16),rgba(14,165,233,0.10))'};color:${thread.isGroup ? 'var(--accent)' : 'var(--success)'};`}
                        >
                            {thread.isGroup ? <Users size={17} /> : <User size={17} />}
                        </div>
                        <div style="min-width:0;">
                            {directOtherUserId ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setLocation(
                                            `/profile?userId=${encodeURIComponent(directOtherUserId)}`
                                        )
                                    }
                                    style="display:block;font-size:14px;font-weight:800;color:var(--text);margin:0;padding:0;background:none;border:none;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;"
                                >
                                    {title}
                                </button>
                            ) : (
                                <p style="font-size:14px;font-weight:800;color:var(--text);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                    {title}
                                </p>
                            )}
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px;">
                                <span
                                    style={`display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:${thread.isGroup ? 'var(--accent-subtle)' : 'var(--success-subtle)'};color:${thread.isGroup ? 'var(--accent)' : 'var(--success)'};`}
                                >
                                    {thread.isGroup ? 'Group' : 'Direct'}
                                </span>
                                <span style="font-size:11px;color:var(--text-tertiary);margin:0;display:inline-flex;align-items:center;gap:4px;">
                                    <Clock size={10} />
                                    {thread.participantNames.length} members
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Messages */}
            <div style="flex:1;overflow-y:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:10px;padding-bottom:88px;">
                {messages.map((msg) => {
                    const isMe = msg.senderId === currentUserId;
                    return (
                        <div
                            key={msg.id}
                            style={`display:flex;gap:8px;align-items:flex-end;justify-content:${isMe ? 'flex-end' : 'flex-start'};`}
                        >
                            {!isMe && (
                                <div style="width:30px;height:30px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--bg-subtle);border:1px solid var(--border);color:var(--text-tertiary);">
                                    <User size={14} />
                                </div>
                            )}
                            <div
                                style={`
                                    max-width:78%;padding:10px 13px;border-radius:16px;font-size:13px;line-height:1.5;box-shadow:0 8px 24px rgba(15,23,42,0.05);
                                    ${
                                        isMe
                                            ? 'background:linear-gradient(135deg,var(--accent),#0ea5e9);color:#fff;border-bottom-right-radius:6px;'
                                            : 'background:var(--surface-raised);color:var(--text);border:1px solid var(--border);border-bottom-left-radius:6px;'
                                    }
                                `}
                            >
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:5px;">
                                    {!isMe ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setLocation(
                                                    `/profile?userId=${encodeURIComponent(msg.senderId)}`
                                                )
                                            }
                                            style="font-size:10px;font-weight:800;color:var(--accent);margin:0;padding:0;background:none;border:none;cursor:pointer;letter-spacing:0.02em;"
                                        >
                                            {msg.senderName}
                                        </button>
                                    ) : (
                                        <span style="font-size:10px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;opacity:0.78;">
                                            You
                                        </span>
                                    )}
                                    <span
                                        style={`font-size:10px;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:4px;${isMe ? 'color:rgba(255,255,255,0.78);' : 'color:var(--text-tertiary);'}`}
                                    >
                                        <Clock size={9} />
                                        {timeAgo(msg.timestamp)}
                                    </span>
                                </div>
                                <p style="margin:0;">{msg.content}</p>
                                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;flex-wrap:wrap;">
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteMessage(msg, 'me')}
                                        disabled={deletingMessageId !== null}
                                        style="display:inline-flex;align-items:center;gap:4px;padding:0;border:none;background:none;cursor:pointer;font-size:10px;color:inherit;opacity:0.8;"
                                    >
                                        <Trash2 size={10} />
                                        Delete for me
                                    </button>
                                    {isMe && (
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteMessage(msg, 'everyone')}
                                            disabled={deletingMessageId !== null}
                                            style="display:inline-flex;align-items:center;gap:4px;padding:0;border:none;background:none;cursor:pointer;font-size:10px;color:inherit;opacity:0.8;"
                                        >
                                            <Trash2 size={10} />
                                            Delete for everyone
                                        </button>
                                    )}
                                </div>
                            </div>
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
                <div style="max-width:720px;width:100%;margin:0 auto;display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:18px;background:var(--surface);padding:8px 10px;box-shadow:0 14px 36px rgba(15,23,42,0.08);">
                    <MessageCircle size={16} style="color:var(--text-tertiary);flex-shrink:0;" />
                    <input
                        value={input}
                        onInput={(e) => setInput((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.repeat) {
                                handleSend();
                            }
                        }}
                        placeholder="Message…"
                        style="flex:1;padding:8px 0;border:none;background:transparent;color:var(--text);font-size:13px;font-family:inherit;outline:none;"
                    />
                    <button
                        type="button"
                        id="send-message-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || sending}
                        class="btn-primary"
                        style="height:40px;width:40px;padding:0;background:linear-gradient(135deg,var(--accent),#0ea5e9);border-radius:14px;flex-shrink:0;"
                        aria-label="Send"
                    >
                        <Send size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}

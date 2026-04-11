import {
    ArrowLeft,
    ChevronRight,
    Clock,
    Plus,
    Search,
    Send,
    ShieldCheck,
    Info,
    Trash2,
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
    addGroupChatParticipants,
    connectChatWebSocket,
    createGroupChat,
    deleteChatMessage,
    disconnectChatWebSocket,
    fetchBlockedUserIds,
    fetchChats,
    fetchChatThread,
    promoteGroupChatParticipant,
    removeGroupChatParticipant,
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
        return { messages: sortMessagesByTimestamp(next), changed: true };
    }

    return { messages: sortMessagesByTimestamp([...messages, incoming]), changed: true };
}

function sortMessagesByTimestamp(messages: ChatMessage[]): ChatMessage[] {
    return [...messages].sort(
        (left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id)
    );
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
    const [composeMode, setComposeMode] = useState<'direct' | 'group'>('direct');
    const [selectedComposeIds, setSelectedComposeIds] = useState<string[]>([]);
    const [creatingGroup, setCreatingGroup] = useState(false);
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

    const resetCompose = () => {
        setShowCompose(false);
        setComposeError(null);
        setQuery('');
        setComposeMode('direct');
        setSelectedComposeIds([]);
    };

    const handleCreateGroupChat = async () => {
        if (creatingGroup || selectedComposeIds.length < 1) {
            setComposeError('Select at least one neighbor to create a group chat.');
            return;
        }

        setCreatingGroup(true);
        setComposeError(null);
        try {
            const thread = await createGroupChat({ participantIds: selectedComposeIds });
            setThreads((current) => [thread, ...current.filter((item) => item.id !== thread.id)]);
            setActiveThread(thread);
            resetCompose();
        } catch (error) {
            setComposeError(error instanceof Error ? error.message : 'Could not create group chat');
        } finally {
            setCreatingGroup(false);
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
                <div style="display:flex;gap:8px;">
                    <button
                        type="button"
                        class="btn-primary"
                        onClick={() => {
                            setComposeError(null);
                            setShowCompose(true);
                            setComposeMode('direct');
                        }}
                        style="height:30px;padding:0 10px;font-size:12px;gap:4px;"
                    >
                        <Plus size={13} />
                        New Chat
                    </button>
                    <button
                        type="button"
                        class="btn-ghost"
                        onClick={() => {
                            setComposeError(null);
                            setShowCompose(true);
                            setComposeMode('group');
                        }}
                        style="height:30px;padding:0 10px;font-size:12px;gap:4px;"
                    >
                        <Users size={13} />
                        Create Group Chat
                    </button>
                </div>
            }
        >
            <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
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
                                style={`width:100%;padding:12px 14px;display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;transition:background 0.15s;animation-delay:${i * 50}ms;`}
                            >
                                <div
                                    style={`width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--bg-muted);overflow:hidden;`}
                                >
                                    {isGroup ? (
                                        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--accent-subtle);color:var(--accent);">
                                            <Users size={17} />
                                        </div>
                                    ) : (
                                        <img
                                            src={avatarUrl(thread.participants.find(p => p !== currentUserId) || thread.participants[0])}
                                            alt=""
                                            style="width:100%;height:100%;object-fit:cover;"
                                        />
                                    )}
                                </div>
                                <div style="flex:1;min-width:0;">
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                        <p
                                            style={`font-size:13px;font-weight:${isUnread ? '700' : '600'};color:var(--text);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`}
                                        >
                                            {displayName}
                                        </p>
                                        {isUnread && (
                                            <span style="width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0;" />
                                        )}
                                        <span
                                            class="type-badge"
                                            style={`background:${isGroup ? 'var(--accent-subtle)' : 'var(--type-item-bg)'};color:${isGroup ? 'var(--accent)' : 'var(--type-item-text)'};border-color:${isGroup ? 'var(--accent-muted)' : 'var(--type-item-border)'};`}
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
                                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
                                    {thread.lastMessage && (
                                        <span style="font-size:11px;color:var(--text-tertiary);font-variant-numeric:tabular-nums;">
                                            {timeAgo(thread.lastMessage.timestamp)}
                                        </span>
                                    )}
                                    <ChevronRight size={13} style="color:var(--text-tertiary);" />
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
                    style="position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(8px);"
                >
                    <div
                        style="position:absolute;inset:0;"
                        onClick={resetCompose}
                        aria-hidden="true"
                    />
                    <div
                        class="animate-slide-up"
                        style="position:relative;width:100%;max-width:680px;max-height:82dvh;display:flex;flex-direction:column;border:1px solid var(--border);border-bottom:none;border-radius:14px 14px 0 0;background:var(--surface);overflow:hidden;box-shadow:0 -8px 40px rgba(0,0,0,0.15);"
                    >
                        {/* Sheet header */}
                        <div style="padding:16px 16px 14px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-shrink:0;">
                            <div>
                                <p style="margin:0;font-size:15px;font-weight:700;color:var(--text);letter-spacing:-0.01em;">
                                    {composeMode === 'group'
                                        ? 'Create Group Chat'
                                        : 'New conversation'}
                                </p>
                                <p style="margin:3px 0 0;font-size:12px;color:var(--text-secondary);">
                                    {composeMode === 'group'
                                        ? 'Select neighbors to add to the group.'
                                        : 'Search a neighbor to start chatting.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                class="btn-icon"
                                onClick={resetCompose}
                                aria-label="Close"
                                style="color:var(--text-secondary);"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div style="padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;">
                            <div style="display:flex;gap:8px;margin-bottom:10px;">
                                <button
                                    type="button"
                                    class="btn-ghost"
                                    onClick={() => setComposeMode('direct')}
                                    style={`height:30px;padding:0 10px;font-size:12px;${composeMode === 'direct' ? 'background:var(--accent-subtle);color:var(--accent);' : ''}`}
                                >
                                    Direct
                                </button>
                                <button
                                    type="button"
                                    class="btn-ghost"
                                    onClick={() => setComposeMode('group')}
                                    style={`height:30px;padding:0 10px;font-size:12px;${composeMode === 'group' ? 'background:var(--accent-subtle);color:var(--accent);' : ''}`}
                                >
                                    Group
                                </button>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;padding:0 12px;height:40px;border:1px solid var(--border);border-radius:8px;background:var(--bg-subtle);">
                                <Search
                                    size={13}
                                    style="color:var(--text-tertiary);flex-shrink:0;"
                                />
                                <input
                                    id="chat-user-search"
                                    value={query}
                                    onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                                    placeholder="Search by name…"
                                    style="flex:1;border:none;outline:none;background:transparent;color:var(--text);font-size:13px;font-family:inherit;"
                                />
                            </div>
                            {composeError && (
                                <p style="margin:8px 0 0;font-size:12px;color:var(--danger);">
                                    {composeError}
                                </p>
                            )}
                        </div>

                        <div style="overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;">
                            {searching ? (
                                [1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        style="height:60px;border-radius:8px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                                    />
                                ))
                            ) : queryResults.length === 0 ? (
                                <div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px;">
                                    No users found
                                </div>
                            ) : (
                                queryResults.map((user) => (
                                    <button
                                        type="button"
                                        key={user.id}
                                        onClick={() => {
                                            if (composeMode === 'group') {
                                                setSelectedComposeIds((current) =>
                                                    current.includes(user.id)
                                                        ? current.filter((id) => id !== user.id)
                                                        : [...current, user.id]
                                                );
                                                return;
                                            }

                                            void handleStartConversation(user);
                                        }}
                                        disabled={startingUserId !== null || creatingGroup}
                                        class="card"
                                        style="padding:10px 12px;display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;width:100%;transition:background 0.15s;"
                                    >
                                        <div style="width:36px;height:36px;border-radius:8px;flex-shrink:0;overflow:hidden;background:var(--bg-muted);border:1px solid var(--border);">
                                            <img
                                                src={user.avatar || avatarUrl(user.name)}
                                                alt=""
                                                style="width:100%;height:100%;object-fit:cover;"
                                            />
                                        </div>
                                        <div style="flex:1;min-width:0;">
                                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                                <span style="font-size:13px;font-weight:600;color:var(--text);">
                                                    {user.name}
                                                </span>
                                                {user.verified && (
                                                    <ShieldCheck
                                                        size={11}
                                                        style="color:var(--success);"
                                                    />
                                                )}
                                            </div>
                                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px;">
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
                                        {composeMode === 'group' ? (
                                            <span
                                                style={`display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;border:1px solid ${selectedComposeIds.includes(user.id) ? 'var(--accent)' : 'var(--border)'};background:${selectedComposeIds.includes(user.id) ? 'var(--accent)' : 'transparent'};color:${selectedComposeIds.includes(user.id) ? '#fff' : 'var(--text-tertiary)'};font-size:11px;`}
                                            >
                                                {selectedComposeIds.includes(user.id) ? '✓' : '+'}
                                            </span>
                                        ) : (
                                            <span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:600;color:var(--accent);white-space:nowrap;">
                                                {startingUserId === user.id ? 'Opening…' : 'Chat'}
                                                <ChevronRight size={12} />
                                            </span>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                        {composeMode === 'group' && (
                            <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
                                <button type="button" class="btn-ghost" onClick={resetCompose}>
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    class="btn-primary"
                                    onClick={handleCreateGroupChat}
                                    disabled={creatingGroup || selectedComposeIds.length < 1}
                                >
                                    {creatingGroup ? 'Creating…' : 'Create Group Chat'}
                                </button>
                            </div>
                        )}
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
    const [contextMenuMessageId, setContextMenuMessageId] = useState<string | null>(null);
    const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
        null
    );
    const [participantActionBusy, setParticipantActionBusy] = useState<string | null>(null);
    const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
    const [showAddMembers, setShowAddMembers] = useState(false);
    const [addMemberQuery, setAddMemberQuery] = useState('');
    const [addMemberResults, setAddMemberResults] = useState<AppUser[]>([]);
    const [searchingAddMembers, setSearchingAddMembers] = useState(false);
    const [addingMembers, setAddingMembers] = useState(false);
    const [showSidebar, setShowSidebar] = useState(false);
    const [sidebarTab, setSidebarTab] = useState<'info' | 'participants'>('info');
    const [selectedColor, setSelectedColor] = useState<string>('#6366f1');
    const sendingRef = useRef(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const threadRef = useRef(thread);
    const currentUser = readStoredAuthSession()?.user;
    const currentUserId = currentUser?.id ?? 'me';
    const currentUserName = currentUser?.displayName ?? currentUser?.email ?? 'You';
    const otherParticipantIds = thread.participants.filter(
        (participantId) => participantId !== currentUserId
    );
    const directCounterpartId = !thread.isGroup ? (otherParticipantIds[0] ?? null) : null;
    const isBlockedConversation = Boolean(
        directCounterpartId && blockedUserIds.includes(directCounterpartId)
    );

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
        let cancelled = false;

        fetchBlockedUserIds()
            .then((ids) => {
                if (!cancelled) {
                    setBlockedUserIds(ids);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setBlockedUserIds([]);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!showAddMembers) {
            return;
        }

        let cancelled = false;
        setSearchingAddMembers(true);

        fetchUsers({ displayName: addMemberQuery.trim() || undefined, limit: 30 })
            .then((users) => {
                if (cancelled) return;
                setAddMemberResults(
                    users.filter(
                        (user) =>
                            user.id !== currentUserId && !thread.participants.includes(user.id)
                    )
                );
            })
            .finally(() => {
                if (!cancelled) setSearchingAddMembers(false);
            });

        return () => {
            cancelled = true;
        };
    }, [showAddMembers, addMemberQuery, currentUserId, thread.participants]);

    useEffect(() => {
        const normalized = sortMessagesByTimestamp(
            uniqueMessagesById([...thread.messages]).map((message) => ({
                ...message,
                senderName:
                    participantNameById.get(message.senderId) ||
                    message.senderName ||
                    `Neighbor ${message.senderId.slice(0, 6)}`,
            }))
        );

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
                    lastMessage: merged.messages[merged.messages.length - 1],
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
                    lastMessage: merged.messages[merged.messages.length - 1],
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
        const screenWidth = window.innerWidth;
        const menuWidth = 170; // approximate width of the context menu
        let x = e.clientX;
        let y = e.clientY;

        if (x + menuWidth > screenWidth) {
            x = screenWidth - menuWidth - 12;
        }

        setContextMenuMessageId(messageId);
        setContextMenuPosition({ x, y });
    };

    const getAvatarUrl = (userId: string) => {
        return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(userId)}&scale=80`;
    };

    const otherNames = thread.participantNames.filter(
        (_name, idx) => thread.participants[idx] !== currentUserId
    );
    const chatTitle = thread.name || otherNames.filter(Boolean).join(', ') || 'Chat';
    const isGroup = thread.isGroup;

    return (
        <div 
            style={`min-height:100dvh;display:flex;flex-direction:column;background:var(--bg); --accent: ${selectedColor};`}
        >
            {/* Chat header */}
            <header
                class="header-bar"
                style="position:sticky;top:0;z-index:40;height:var(--header-h);display:flex;align-items:center;gap:10px;padding:0 12px;flex-shrink:0;"
            >
                <button
                    type="button"
                    class="btn-icon"
                    onClick={() => onBack()}
                    aria-label="Back to messages"
                    style="color:var(--text-secondary);"
                    id="chat-back-btn"
                >
                    <ArrowLeft size={18} />
                </button>
                <div
                    style={`width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;background:var(--bg-muted);`}
                >
                    {isGroup ? (
                        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--accent-subtle);color:var(--accent);">
                            <Users size={15} />
                        </div>
                    ) : (
                        <img
                            src={avatarUrl(thread.participants.find(p => p !== currentUserId) || thread.participants[0])}
                            alt=""
                            style="width:100%;height:100%;object-fit:cover;"
                        />
                    )}
                </div>
                <div style="flex:1;min-width:0;">
                    <p style="font-size:14px;font-weight:700;color:var(--text);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em;">
                        {chatTitle}
                    </p>
                    {isGroup && (
                        <p style="font-size:11px;color:var(--text-tertiary);margin:0;">
                            {thread.participants.length} members
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    class="btn-icon"
                    onClick={() => {
                        setShowSidebar(!showSidebar);
                        if (!showSidebar) setSidebarTab('info');
                    }}
                    aria-label="Chat info"
                    style={`color:${showSidebar && sidebarTab === 'info' ? 'var(--accent)' : 'var(--text-secondary)'};`}
                >
                    <Info size={16} />
                </button>
            </header>

            {showSidebar && (
                <aside style="position:fixed;top:var(--header-h);right:0;bottom:0;width:min(320px,86vw);z-index:45;background:var(--surface);border-left:1px solid var(--border);box-shadow:-12px 0 32px rgba(0,0,0,0.12);overflow:auto;display:flex;flex-direction:column;">
                    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;">
                        <div>
                            <p style="margin:0;font-size:14px;font-weight:700;color:var(--text);">
                                {sidebarTab === 'info' ? 'Chat Info' : 'Participants'}
                            </p>
                        </div>
                        <button
                            type="button"
                            class="btn-icon"
                            onClick={() => setShowSidebar(false)}
                            aria-label="Close sidebar"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {sidebarTab === 'info' ? (
                        <div style="padding:16px;display:flex;flex-direction:column;gap:20px;">
                            <div style="text-align:center;">
                                <div
                                    style={`width:64px;height:64px;border-radius:18px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;background:var(--bg-muted);overflow:hidden;border:2px solid var(--border);`}
                                >
                                    {isGroup ? (
                                        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--accent-subtle);color:var(--accent);">
                                            <Users size={32} />
                                        </div>
                                    ) : (
                                        <img
                                            src={avatarUrl(thread.participants.find(p => p !== currentUserId) || thread.participants[0])}
                                            alt=""
                                            style="width:100%;height:100%;object-fit:cover;"
                                        />
                                    )}
                                </div>
                                <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">{chatTitle}</h3>
                                {!isGroup && (
                                    <p style="margin:4px 0 0;font-size:12px;color:var(--text-tertiary);">Direct Message</p>
                                )}
                            </div>

                            {isGroup && (
                                <button
                                    type="button"
                                    class="btn-secondary"
                                    onClick={() => setSidebarTab('participants')}
                                    style="width:100%;height:38px;font-size:13px;gap:8px;"
                                >
                                    <Users size={14} />
                                    View Members ({thread.participants.length})
                                </button>
                            )}

                            <div style="border-top:1px solid var(--border);padding-top:20px;">
                                <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Chat Color</p>
                                <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:8px;">
                                    {[
                                        '#3b82f6', // blue
                                        '#8b5cf6', // violet
                                        '#ec4899', // pink
                                        '#f97316', // orange
                                        '#10b981', // emerald
                                        '#0ea5e9', // sky
                                        '#f43f5e', // rose
                                        '#6366f1', // indigo
                                        '#14b8a6', // teal
                                        '#22c55e'  // green
                                    ].map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setSelectedColor(color)}
                                            style={`
                                                aspect-ratio:1;border-radius:8px;border:2px solid ${selectedColor === color ? 'var(--text)' : 'transparent'};
                                                background:${color};cursor:pointer;transition:transform 0.1s;
                                            `}
                                            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                            aria-label={`Select color ${color}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style="flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                                <button
                                    type="button"
                                    class="btn-icon"
                                    onClick={() => setSidebarTab('info')}
                                    style="width:28px;height:28px;"
                                >
                                    <ArrowLeft size={14} />
                                </button>
                                <button
                                    type="button"
                                    class="btn-ghost"
                                    onClick={() => setShowAddMembers((current) => !current)}
                                    style="height:30px;padding:0 10px;font-size:11px;"
                                >
                                    Add members
                                </button>
                            </div>
                            
                            {showAddMembers && (
                                <div style="padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--bg-subtle);display:flex;flex-direction:column;gap:8px;">
                                    <input
                                        value={addMemberQuery}
                                        onInput={(e) =>
                                            setAddMemberQuery((e.target as HTMLInputElement).value)
                                        }
                                        placeholder="Search neighbors"
                                        style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;"
                                    />
                                    {searchingAddMembers ? (
                                        <div style="font-size:12px;color:var(--text-tertiary);">
                                            Searching…
                                        </div>
                                    ) : (
                                        addMemberResults.slice(0, 5).map((user) => (
                                            <button
                                                key={user.id}
                                                type="button"
                                                class="btn-ghost"
                                                disabled={addingMembers}
                                                onClick={async () => {
                                                    setAddingMembers(true);
                                                    try {
                                                        await addGroupChatParticipants(thread.id, [
                                                            user.id,
                                                        ]);
                                                        const updated = await fetchChatThread(thread.id);
                                                        onThreadUpdate(updated);
                                                        setShowAddMembers(false);
                                                    } finally {
                                                        setAddingMembers(false);
                                                    }
                                                }}
                                                style="justify-content:space-between;height:32px;padding:0 10px;font-size:12px;"
                                            >
                                                <span>{user.name}</span>
                                                <span>+</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                            {thread.participants.map((participantId, index) => {
                                const name =
                                    thread.participantNames[index] ||
                                    participantNameById.get(participantId) ||
                                    `Neighbor ${participantId.slice(0, 6)}`;
                                const roles = thread.participantRoles?.[participantId] ?? [];
                                const isOwner =
                                    thread.ownerId === participantId || roles.includes('owner');
                                const isAdmin = roles.includes('admin');
                                return (
                                    <div
                                        key={participantId}
                                        style="padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-raised);display:flex;align-items:center;justify-content:space-between;gap:10px;"
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setLocation(
                                                    `/profile?userId=${encodeURIComponent(participantId)}`
                                                )
                                            }
                                            style="background:none;border:none;padding:0;text-align:left;cursor:pointer;min-width:0;flex:1;"
                                        >
                                            <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                                {name}
                                            </div>
                                            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                                                {isOwner && (
                                                    <span
                                                        class="type-badge"
                                                        style="background:var(--accent-subtle);color:var(--accent);border-color:var(--accent-muted);"
                                                    >
                                                        Owner
                                                    </span>
                                                )}
                                                {isAdmin && (
                                                    <span
                                                        class="type-badge"
                                                        style="background:var(--warning-subtle);color:var(--warning);border-color:var(--warning-muted);"
                                                    >
                                                        Admin
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                        {thread.ownerId === currentUserId && !isOwner && (
                                            <button
                                                type="button"
                                                class="btn-ghost"
                                                disabled={participantActionBusy === participantId}
                                                onClick={async () => {
                                                    setParticipantActionBusy(participantId);
                                                    try {
                                                        await promoteGroupChatParticipant(
                                                            thread.id,
                                                            participantId
                                                        );
                                                        const updated = await fetchChatThread(thread.id);
                                                        onThreadUpdate(updated);
                                                    } finally {
                                                        setParticipantActionBusy(null);
                                                    }
                                                }}
                                                style="height:28px;padding:0 10px;font-size:11px;"
                                            >
                                                Promote
                                            </button>
                                        )}
                                        {(thread.ownerId === currentUserId ||
                                            (thread.participantRoles?.[currentUserId]?.includes(
                                                'admin'
                                            ) ??
                                                false)) &&
                                            !isOwner && (
                                                <button
                                                    type="button"
                                                    class="btn-ghost"
                                                    disabled={participantActionBusy === participantId}
                                                    onClick={async () => {
                                                        setParticipantActionBusy(participantId);
                                                        try {
                                                            await removeGroupChatParticipant(
                                                                thread.id,
                                                                participantId
                                                            );
                                                            const updated = await fetchChatThread(thread.id);
                                                            onThreadUpdate(updated);
                                                            // We don't close sidebar here because someone else might still be there
                                                        } finally {
                                                            setParticipantActionBusy(null);
                                                        }
                                                    }}
                                                    style="height:28px;padding:0 10px;font-size:11px;"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </aside>
            )}

            {/* Messages */}
            <div style="flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px;padding-bottom:80px;">
                <div style="height:4px;" />
                {messages.map((msg) => {
                    const isMe = msg.senderId === currentUserId;
                    const isContextMenuOpen = contextMenuMessageId === msg.id;
                    return (
                        <div
                            key={msg.id}
                            className="message-row"
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
                                    if (isMe) handleContextMenu(e as any, msg.id);
                                }}
                                onContextMenu={(e) => handleContextMenu(e as any, msg.id)}
                                style={`
                                    max-width:78%;padding:10px 13px;border-radius:14px;font-size:13px;line-height:1.55;position:relative;border:none;cursor:${isMe ? 'pointer' : 'default'};text-align:left;background:none;color:inherit;display:flex;flex-direction:column;
                                    ${
                                        isMe
                                            ? 'background:var(--accent);color:#fff;border-bottom-right-radius:4px;'
                                            : 'background:var(--surface-raised);color:var(--text);border:1px solid var(--border);border-bottom-left-radius:4px;'
                                    }
                                `}
                            >
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px;">
                                    {!isMe ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setLocation(
                                                    `/profile?userId=${encodeURIComponent(msg.senderId)}`
                                                )
                                            }
                                            style="font-size:11px;font-weight:700;color:var(--accent);margin:0;padding:0;background:none;border:none;cursor:pointer;"
                                        >
                                            {msg.senderName}
                                        </button>
                                    ) : (
                                        <span style="font-size:11px;font-weight:600;opacity:0.8;">
                                            You
                                        </span>
                                    )}
                                    <span
                                        style={`font-size:11px;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:3px;${isMe ? 'color:rgba(255,255,255,0.7);' : 'color:var(--text-tertiary);'}`}
                                    >
                                        <Clock size={9} />
                                        {timeAgo(msg.timestamp)}
                                    </span>
                                </div>
                                <p style="margin:0;word-break:break-word;">{msg.content}</p>
                            </button>

                            <div 
                                className="delete-trigger-container" 
                                style={`display:flex;align-items:center;${isContextMenuOpen ? 'visibility:hidden;' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="delete-btn-hover"
                                    onClick={(e) => handleContextMenu(e as any, msg.id)}
                                    style={`width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:var(--surface-raised);border:1px solid var(--border);cursor:pointer;color:var(--text-tertiary);transition:all 0.2s;flex-shrink:0;`}
                                    aria-label="More options"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            {isContextMenuOpen && contextMenuPosition && (
                                <>
                                    <button
                                        type="button"
                                        aria-label="Close menu"
                                        style="position:fixed;inset:0;z-index:49;background:none;border:none;padding:0;width:100%;height:100%;cursor:default;"
                                        onClick={() => {
                                            setContextMenuMessageId(null);
                                            setContextMenuPosition(null);
                                        }}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            setContextMenuMessageId(null);
                                            setContextMenuPosition(null);
                                        }}
                                    />
                                    <div
                                        style={`position:fixed;left:${contextMenuPosition.x}px;top:${contextMenuPosition.y}px;z-index:50;background:var(--surface-raised);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 40px rgba(15,23,42,0.3);overflow:hidden;min-width:160px;`}
                                        role="menu"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteMessage(msg, 'me')}
                                            disabled={deletingMessageId !== null}
                                            role="menuitem"
                                            key="delete-me"
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
                                        {(isMe || (thread.isGroup && (thread.ownerId === currentUserId || thread.participantRoles?.[currentUserId]?.includes('admin')))) && (
                                            <>
                                                <div style="height:1px;background:var(--border);" />
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMessage(msg, 'everyone')}
                                                    disabled={deletingMessageId !== null}
                                                    role="menuitem"
                                                    key="delete-everyone"
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
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div class="nav-bar" style="position:fixed;bottom:0;left:0;right:0;padding:8px 12px;">
                <div style="max-width:680px;width:100%;margin:0 auto;display:flex;align-items:center;gap:8px;">
                    <input
                        value={input}
                        onInput={(e) => setInput((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.repeat && !isBlockedConversation)
                                handleSend();
                        }}
                        disabled={isBlockedConversation}
                        placeholder={
                            isBlockedConversation ? 'You have blocked this user' : 'Message…'
                        }
                        style="flex:1;padding:9px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color 0.15s,box-shadow 0.15s;"
                        onFocus={(e) => {
                            if (isBlockedConversation) return;
                            (e.target as HTMLElement).style.borderColor = 'var(--border-focus)';
                            (e.target as HTMLElement).style.boxShadow =
                                '0 0 0 3px var(--accent-muted)';
                        }}
                        onBlur={(e) => {
                            if (isBlockedConversation) return;
                            (e.target as HTMLElement).style.borderColor = 'var(--border)';
                            (e.target as HTMLElement).style.boxShadow = 'none';
                        }}
                    />
                    <button
                        type="button"
                        id="send-message-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || sending || isBlockedConversation}
                        class="btn-primary"
                        style="height:38px;width:38px;padding:0;background:var(--accent);border-radius:8px;flex-shrink:0;"
                        aria-label="Send"
                    >
                        <Send size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}

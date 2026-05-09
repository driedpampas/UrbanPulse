import {
    ArrowLeft,
    Check,
    ChevronRight,
    Clock,
    Copy,
    Edit2,
    Flag,
    Info,
    Pencil,
    Plus,
    Reply,
    Search,
    Send,
    ShieldCheck,
    Trash2,
    UserMinus,
    Users,
    X,
} from 'lucide-preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { AppLayout } from '../components/Layout/AppLayout';
import { ReportModal } from '../components/Modals/ReportModal';
import { RoleBadge } from '../components/Profile/RoleBadge';
import { TrustBadge } from '../components/Profile/TrustBadge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { HoverButton } from '../components/ui/HoverButton';
import { UserAvatar } from '../components/ui/UserAvatar';
import { readStoredAuthSession } from '../lib/auth';
import {
    addGroupChatParticipants,
    type ChatSocketEvent,
    connectChatWebSocket,
    createGroupChat,
    deleteChatMessage,
    deleteGroupChat,
    disconnectChatWebSocket,
    editChatMessage,
    fetchBlockedUserIds,
    fetchChats,
    fetchChatThread,
    getChatConnectionStatus,
    onChatConnectionStatusChange,
    promoteGroupChatParticipant,
    removeGroupChatParticipant,
    sendMessage,
    startDirectConversation,
    subscribeChatThread,
    unsubscribeChatThread,
    updateChatName,
    waitForChatThreadSubscription,
} from '../lib/chatApi';
import {
    markThreadRead,
    setActiveChatThread,
    useUnreadChatThreads,
} from '../lib/chatNotifications';
import { useQueryParamState } from '../lib/navigation';
import type { User as AppUser, ChatMessage, ChatThread } from '../lib/types';
import { fetchCurrentUserAreaSelection, fetchUsers } from '../lib/userApi';

function timeAgo(ts: number) {
    const d = Date.now() - ts;
    if (d < 60000) return 'just now';
    if (d < 3600000) return `${Math.floor(d / 60000)}m`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
    return `${Math.floor(d / 86400000)}d`;
}

function avatarFallback(seed: string) {
    return `/default-cat-avatar.svg?seed=${encodeURIComponent(seed)}`;
}

function upsertMessageById(
    messages: ChatMessage[],
    incoming: ChatMessage
): { messages: ChatMessage[]; changed: boolean } {
    const existingIndex = messages.findIndex((message) => message.id === incoming.id);

    if (existingIndex >= 0) {
        const existing = messages[existingIndex];
        if (!existing) return { messages, changed: false };
        const unchanged =
            existing.senderId === incoming.senderId &&
            existing.senderName === incoming.senderName &&
            existing.content === incoming.content &&
            existing.isEdited === incoming.isEdited &&
            existing.type === incoming.type &&
            existing.timestamp === incoming.timestamp &&
            (existing.replyToId ?? null) === (incoming.replyToId ?? null) &&
            (existing.replyTo?.id ?? null) === (incoming.replyTo?.id ?? null) &&
            (existing.replyTo?.senderId ?? null) === (incoming.replyTo?.senderId ?? null) &&
            (existing.replyTo?.senderName ?? null) === (incoming.replyTo?.senderName ?? null) &&
            (existing.replyTo?.snippet ?? null) === (incoming.replyTo?.snippet ?? null) &&
            (existing.replyTo?.isUnavailable ?? null) === (incoming.replyTo?.isUnavailable ?? null);

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

function getThreadLatestTimestamp(thread: ChatThread) {
    return (
        thread.lastMessage?.timestamp ?? thread.messages[thread.messages.length - 1]?.timestamp ?? 0
    );
}

function sortThreadsByLatestMessage(threads: ChatThread[]) {
    return [...threads].sort(
        (left, right) => getThreadLatestTimestamp(right) - getThreadLatestTimestamp(left)
    );
}

function upsertThreadById(threads: ChatThread[], updatedThread: ChatThread) {
    return sortThreadsByLatestMessage(
        threads.map((thread) => (thread.id === updatedThread.id ? updatedThread : thread))
    );
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
    const [, setLocation] = useLocation();
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
    const [selectedThreadId, setSelectedThreadId] = useQueryParamState('threadId');
    const [areaSelection, setAreaSelection] = useState<{
        lat: number;
        lng: number;
        radius: number;
    } | null>(null);

    useEffect(() => {
        let cancelled = false;

        void fetchCurrentUserAreaSelection()
            .then((selection) => {
                if (!cancelled) {
                    setAreaSelection(selection);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAreaSelection(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedThreadId) {
            setActiveThread(null);
        }
    }, [selectedThreadId]);

    useEffect(() => {
        if (!showCompose) {
            return;
        }

        if (!areaSelection) {
            setQueryResults([]);
            setSearching(false);
            setComposeError(
                'Set your location and radius in Profile to discover nearby neighbors.'
            );
            return;
        }

        let cancelled = false;
        setSearching(true);
        setComposeError(null);

        fetchUsers({
            displayName: query.trim() || undefined,
            limit: composeSearchLimit,
            radius: areaSelection.radius,
            location: { lat: areaSelection.lat, lng: areaSelection.lng },
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
    }, [showCompose, query, currentUser?.id, areaSelection]);

    const handleThreadUpdate = (updated: ChatThread) => {
        setThreads((p) => upsertThreadById(p, updated));
        setActiveThread(updated);
    };

    const handleThreadDeleted = (threadId: string) => {
        setThreads((p) => p.filter((t) => t.id !== threadId));
        setActiveThread(null);
    };

    const refreshThread = useCallback(
        async (threadId: string): Promise<ChatThread> => {
            const refreshed = await fetchChatThread(threadId);
            setThreads((prev) => upsertThreadById(prev, refreshed));
            if (activeThread?.id === threadId) {
                setActiveThread(refreshed);
            }
            return refreshed;
        },
        [activeThread?.id]
    );

    const applyThreadNameUpdate = useCallback((threadId: string, name: string) => {
        const normalizedName = name.trim();
        if (!normalizedName) {
            return;
        }

        setThreads((prev) => {
            let changed = false;
            const next = prev.map((thread) => {
                if (thread.id !== threadId) {
                    return thread;
                }

                if (thread.name === normalizedName) {
                    return thread;
                }

                changed = true;
                return {
                    ...thread,
                    name: normalizedName,
                };
            });

            return changed ? next : prev;
        });

        setActiveThread((prev) => {
            if (!prev || prev.id !== threadId || prev.name === normalizedName) {
                return prev;
            }

            return {
                ...prev,
                name: normalizedName,
            };
        });
    }, []);

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
    }, [selectedThreadId]);

    const openThreadById = async (threadId: string) => {
        const existing = threads.find((thread) => thread.id === threadId);
        if (existing) {
            setLocation(`/messages?threadId=${encodeURIComponent(existing.id)}`);
            setSelectedThreadId(existing.id);
            setActiveThread(existing);
            return;
        }

        const refreshed = await fetchChats();
        setThreads(refreshed);
        const resolved = refreshed.find((thread) => thread.id === threadId);
        if (resolved) {
            setLocation(`/messages?threadId=${encodeURIComponent(resolved.id)}`);
            setSelectedThreadId(resolved.id);
            setActiveThread(resolved);
        }
    };

    useEffect(() => {
        const handleRefresh = (event: ChatSocketEvent) => {
            if (event.event === 'chat.updated') {
                if (typeof event.name === 'string') {
                    applyThreadNameUpdate(event.threadId, event.name);
                    return;
                }

                void refreshThread(event.threadId).catch(() => {});
                return;
            }

            if (event.event !== 'chat.members.updated') {
                return;
            }

            void refreshThread(event.threadId).catch(() => {});
        };

        connectChatWebSocket(handleRefresh);
        return () => disconnectChatWebSocket(handleRefresh);
    }, [applyThreadNameUpdate, refreshThread]);

    useEffect(() => {
        const handleThreadListSync = (event: ChatSocketEvent) => {
            if (
                event.event !== 'message.created' &&
                event.event !== 'notification.message' &&
                event.event !== 'message.updated'
            ) {
                return;
            }

            if (!event.message || activeThread?.id === event.message.threadId) {
                return;
            }

            setThreads((prev) => {
                const index = prev.findIndex((thread) => thread.id === event.message?.threadId);
                if (index < 0) {
                    return prev;
                }

                const thread = prev[index];
                if (!thread) {
                    return prev;
                }
                const senderIndex = thread.participants.indexOf(event.message?.senderId);
                const senderName =
                    event.event === 'notification.message' && event.senderName
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
                    isEdited: Boolean(event.message.isEdited),
                    type: (event.message.messageType as 'text' | 'notice') ?? 'text',
                    timestamp: Number(event.message.timestamp),
                };

                const merged = upsertMessageById(thread.messages, mappedMessage);
                if (!merged.changed) {
                    return prev;
                }

                return upsertThreadById(prev, {
                    ...thread,
                    messages: merged.messages,
                    lastMessage: merged.messages[merged.messages.length - 1],
                });
            });
        };

        connectChatWebSocket(handleThreadListSync);
        return () => disconnectChatWebSocket(handleThreadListSync);
    }, [activeThread?.id]);

    useEffect(() => {
        setActiveChatThread(activeThread?.id ?? null);

        return () => {
            setActiveChatThread(null);
        };
    }, [activeThread?.id]);

    const openThread = (thread: ChatThread) => {
        markThreadRead(thread.id);
        setLocation(`/messages?threadId=${encodeURIComponent(thread.id)}`);
        setSelectedThreadId(thread.id);
        setActiveThread(thread);
    };

    const handleBackToThreadList = () => {
        // Keep in-app back deterministic: always return to list route.
        setLocation('/messages');
        setSelectedThreadId(null);
        setActiveThread(null);
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
            setThreads((current) => upsertThreadById(current, thread));
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
                onBack={handleBackToThreadList}
                onThreadUpdate={handleThreadUpdate}
                onThreadDeleted={handleThreadDeleted}
                onThreadRefresh={refreshThread}
            />
        );
    }

    return (
        <AppLayout
            id="page-messages"
            title="Messages"
            headerRight={
                <div class="stack-h gap-sm flex-nowrap">
                    <HoverButton
                        type="button"
                        class="btn-primary"
                        onClick={() => {
                            setComposeError(null);
                            setShowCompose(true);
                            setComposeMode('direct');
                        }}
                        style="height:32px;padding:0 12px;font-size:12px;"
                    >
                        <Plus size={14} />
                        <span class="hidden sm:inline">New Chat</span>
                    </HoverButton>
                    <HoverButton
                        type="button"
                        class="btn-ghost"
                        onClick={() => {
                            setComposeError(null);
                            setShowCompose(true);
                            setComposeMode('group');
                        }}
                        style="height:32px;padding:0 12px;font-size:12px;"
                    >
                        <Users size={14} />
                        <span class="hidden sm:inline">Create Group Chat</span>
                    </HoverButton>
                </div>
            }
        >
            <div class="section-body gap-md">
                {loading ? (
                    [1, 2].map((i) => (
                        <div
                            key={i}
                            style="height:74px;border-radius:14px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                        />
                    ))
                ) : threads.length === 0 ? (
                    <div class="section-body" style="padding:56px 24px;text-align:center;">
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
                            <HoverButton
                                type="button"
                                key={thread.id}
                                id={`thread-${thread.id}`}
                                onClick={() => openThread(thread)}
                                class="card animate-slide-up"
                                style={`width:100%;padding:12px 14px;display:flex;align-items:center;gap:12px;text-align:left;animation-delay:${i * 50}ms;`}
                            >
                                <div
                                    style={`width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--bg-muted);overflow:hidden;`}
                                >
                                    {isGroup ? (
                                        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--accent-subtle);color:var(--accent);">
                                            <Users size={17} />
                                        </div>
                                    ) : (
                                        <UserAvatar
                                            userId={
                                                thread.participants.find(
                                                    (p) => p !== currentUserId
                                                ) || thread.participants[0]
                                            }
                                            fallbackSrc={avatarFallback(
                                                thread.participants.find(
                                                    (p) => p !== currentUserId
                                                ) || thread.participants[0]
                                            )}
                                            alt={`${displayName} profile picture`}
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
                                            {thread.lastMessage.type === 'notice'
                                                ? ''
                                                : `${thread.lastMessage.senderName}: `}
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
                            </HoverButton>
                        );
                    })
                )}
            </div>

            {showCompose && (
                <div role="dialog" aria-modal="true" class="sheet-overlay">
                    <div
                        style="position:absolute;inset:0;"
                        onClick={resetCompose}
                        aria-hidden="true"
                    />
                    <div class="sheet-content animate-slide-up">
                        <div class="px-5 py-4 border-b border-(--border) flex items-start justify-between gap-3 shrink-0">
                            <div class="stack-v gap-xs">
                                <p class="text-base font-bold text-(--text) tracking-tight m-0">
                                    {composeMode === 'group'
                                        ? 'Create Group Chat'
                                        : 'New conversation'}
                                </p>
                                <p class="text-xs text-(--text-secondary) m-0">
                                    {composeMode === 'group'
                                        ? 'Select neighbors to add to the group.'
                                        : 'Search a neighbor to start chatting.'}
                                </p>
                            </div>
                            <HoverButton
                                type="button"
                                class="btn-icon h-8! w-8! text-(--text-tertiary)! hover:text-(--text-secondary)!"
                                onClick={resetCompose}
                                aria-label="Close"
                            >
                                <X size={15} />
                            </HoverButton>
                        </div>

                        <div class="p-4 border-b border-(--border) shrink-0 bg-(--bg-subtle)/30">
                            <div class="stack-h gap-sm mb-3">
                                <HoverButton
                                    type="button"
                                    class={`btn-ghost h-7! px-3! text-[11px]! font-bold! uppercase! tracking-wider! ${composeMode === 'direct' ? 'bg-(--accent-subtle)! text-(--accent)! border-(--accent)/20!' : ''}`}
                                    onClick={() => setComposeMode('direct')}
                                >
                                    Direct
                                </HoverButton>
                                <HoverButton
                                    type="button"
                                    class={`btn-ghost h-7! px-3! text-[11px]! font-bold! uppercase! tracking-wider! ${composeMode === 'group' ? 'bg-(--accent-subtle)! text-(--accent)! border-(--accent)/20!' : ''}`}
                                    onClick={() => setComposeMode('group')}
                                >
                                    Group
                                </HoverButton>
                            </div>
                            <div class="stack-h gap-sm px-3 h-11 border border-(--border) rounded-xl bg-(--surface) focus-within:border-(--accent) transition-colors shadow-sm">
                                <Search size={14} class="text-(--text-tertiary) shrink-0" />
                                <input
                                    id="chat-user-search"
                                    value={query}
                                    onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                                    placeholder="Search by name…"
                                    class="flex-1 border-none outline-none bg-transparent text-(--text) text-sm font-medium"
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
                                    <HoverButton
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
                                            <UserAvatar
                                                userId={user.id}
                                                fallbackSrc={
                                                    user.avatar || avatarFallback(user.name)
                                                }
                                                alt={`${user.name} profile picture`}
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
                                                {selectedComposeIds.includes(user.id) ? (
                                                    <Check size={12} />
                                                ) : (
                                                    '+'
                                                )}
                                            </span>
                                        ) : (
                                            <span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:600;color:var(--accent);white-space:nowrap;">
                                                {startingUserId === user.id ? 'Opening…' : 'Chat'}
                                                <ChevronRight size={12} />
                                            </span>
                                        )}
                                    </HoverButton>
                                ))
                            )}
                        </div>
                        {composeMode === 'group' && (
                            <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
                                <HoverButton type="button" class="btn-ghost" onClick={resetCompose}>
                                    Cancel
                                </HoverButton>
                                <HoverButton
                                    type="button"
                                    class="btn-primary"
                                    onClick={handleCreateGroupChat}
                                    disabled={creatingGroup || selectedComposeIds.length < 1}
                                >
                                    {creatingGroup ? 'Creating…' : 'Create Group Chat'}
                                </HoverButton>
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
    onThreadDeleted,
    onThreadRefresh,
}: {
    thread: ChatThread;
    onBack: () => void;
    onThreadUpdate: (t: ChatThread) => void;
    onThreadDeleted: (id: string) => void;
    onThreadRefresh: (threadId: string) => Promise<ChatThread>;
}) {
    const [, setLocation] = useLocation();
    const [messages, setMessages] = useState<ChatMessage[]>(() => [...thread.messages]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [threadSubscribed, setThreadSubscribed] = useState(false);
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState('');
    const [savingEditMessageId, setSavingEditMessageId] = useState<string | null>(null);
    const [editError, setEditError] = useState<string | null>(null);
    const [contextMenuMessageId, setContextMenuMessageId] = useState<string | null>(null);
    const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
        null
    );
    const [participantActionBusy, setParticipantActionBusy] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<null | {
        title: string;
        message: string;
        confirmLabel: string;
        destructive?: boolean;
        onConfirm: () => Promise<void>;
    }>(null);
    const [reportingMessage, setReportingMessage] = useState<ChatMessage | null>(null);
    const [memberActionConfirm, setMemberActionConfirm] = useState<null | {
        title: string;
        message: string;
        confirmLabel: string;
        destructive?: boolean;
        onConfirm: () => Promise<void>;
    }>(null);
    const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
    const [participantProfiles, setParticipantProfiles] = useState<Record<string, AppUser>>({});
    const [areaSelection, setAreaSelection] = useState<{
        lat: number;
        lng: number;
        radius: number;
    } | null>(null);
    const [showAddMembers, setShowAddMembers] = useState(false);
    const [addMemberQuery, setAddMemberQuery] = useState('');
    const [addMemberResults, setAddMemberResults] = useState<AppUser[]>([]);
    const [searchingAddMembers, setSearchingAddMembers] = useState(false);
    const [addingMembers, setAddingMembers] = useState(false);
    const [showSidebar, setShowSidebar] = useState(false);
    const [sidebarTab, setSidebarTab] = useState<'info' | 'participants'>('info');
    const [selectedColor, setSelectedColor] = useState<string>('#6366f1');
    const [isRenamingChatName, setIsRenamingChatName] = useState(false);
    const [chatNameDraft, setChatNameDraft] = useState(thread.name ?? '');
    const [chatNameError, setChatNameError] = useState<string | null>(null);
    const [savingChatName, setSavingChatName] = useState(false);
    const [wideChatView, setWideChatView] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('wide-chat-view') === 'true';
    });
    const [isMobileViewport, setIsMobileViewport] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.innerWidth < 900;
    });
    const [connectionStatus, setConnectionStatus] = useState<
        'connected' | 'connecting' | 'disconnected'
    >(() => getChatConnectionStatus());
    const [sendError, setSendError] = useState<string | null>(null);
    const [copyNotice, setCopyNotice] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    useEffect(() => {
        return onChatConnectionStatusChange(setConnectionStatus);
    }, []);

    useEffect(() => {
        let cancelled = false;

        void fetchCurrentUserAreaSelection()
            .then((selection) => {
                if (!cancelled) {
                    setAreaSelection(selection);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAreaSelection(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        localStorage.setItem('wide-chat-view', wideChatView.toString());
    }, [wideChatView]);

    useEffect(() => {
        const updateViewport = () => {
            setIsMobileViewport(window.innerWidth < 900);
        };

        updateViewport();
        window.addEventListener('resize', updateViewport);

        return () => {
            window.removeEventListener('resize', updateViewport);
        };
    }, []);
    const sendingRef = useRef(false);
    const copyNoticeTimerRef = useRef<number | null>(null);
    const replyHighlightTimerRef = useRef<number | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const messageElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
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

    const getParticipantLabel = (participantId: string, fallbackName?: string | null) => {
        if (participantId === currentUserId) {
            return currentUserName;
        }

        const profile = participantProfiles[participantId];
        if (profile?.deletionRequestedAt) {
            return 'Deleted user';
        }

        if (profile?.role?.toLowerCase() === 'banned') {
            return 'Banned user';
        }

        const profileName = profile?.name?.trim();
        if (profileName) {
            return profileName;
        }

        const normalizedFallback = fallbackName?.trim();
        if (normalizedFallback) {
            return normalizedFallback;
        }

        return `Neighbor ${participantId.slice(0, 6)}`;
    };

    const participantNameById = useMemo(() => {
        const nameMap = new Map<string, string>();
        thread.participants.forEach((participantId, index) => {
            nameMap.set(
                participantId,
                getParticipantLabel(participantId, thread.participantNames[index])
            );
        });
        nameMap.set(currentUserId, currentUserName);
        return nameMap;
    }, [
        thread.participants,
        thread.participantNames,
        currentUserId,
        currentUserName,
        participantProfiles,
    ]);

    useEffect(() => {
        threadRef.current = thread;
    }, [thread]);

    useEffect(() => {
        setEditingMessageId(null);
        setEditDraft('');
        setSavingEditMessageId(null);
        setEditError(null);
        setReplyingTo(null);
        setHighlightedMessageId(null);
        setIsRenamingChatName(false);
        setChatNameDraft(thread.name ?? '');
        setChatNameError(null);
        setSavingChatName(false);
        messageElementMapRef.current.clear();
    }, [thread.id]);

    useEffect(() => {
        if (!isRenamingChatName) {
            setChatNameDraft(thread.name ?? '');
            setChatNameError(null);
        }
    }, [thread.name, isRenamingChatName]);

    useEffect(() => {
        return () => {
            if (copyNoticeTimerRef.current !== null) {
                window.clearTimeout(copyNoticeTimerRef.current);
            }

            if (replyHighlightTimerRef.current !== null) {
                window.clearTimeout(replyHighlightTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        if (connectionStatus !== 'connected') {
            setThreadSubscribed(false);
            return () => {
                cancelled = true;
            };
        }

        setThreadSubscribed(false);
        void waitForChatThreadSubscription(thread.id)
            .then(() => {
                if (!cancelled) {
                    setThreadSubscribed(true);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setThreadSubscribed(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [thread.id, connectionStatus]);

    useEffect(() => {
        let cancelled = false;

        const loadParticipantProfiles = async () => {
            const entries = await Promise.all(
                Array.from(new Set(thread.participants)).map(async (participantId) => {
                    try {
                        const users = await fetchUsers({ id: participantId, limit: 1 });
                        return users[0] ? ([participantId, users[0]] as const) : null;
                    } catch {
                        return null;
                    }
                })
            );

            if (!cancelled) {
                setParticipantProfiles(
                    Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, AppUser]>)
                );
            }
        };

        void loadParticipantProfiles();

        return () => {
            cancelled = true;
        };
    }, [thread.id, thread.participants]);

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

        fetchUsers({
            displayName: addMemberQuery.trim() || undefined,
            limit: 30,
            ...(areaSelection
                ? {
                      radius: areaSelection.radius,
                      location: { lat: areaSelection.lat, lng: areaSelection.lng },
                  }
                : {}),
        })
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
    }, [showAddMembers, addMemberQuery, currentUserId, thread.participants, areaSelection]);

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
        setReplyingTo((previous) => {
            if (!previous) {
                return null;
            }

            return normalized.find((message) => message.id === previous.id) ?? null;
        });
    }, [thread.id, thread.messages, participantNameById]);

    useEffect(() => {
        const handleChatSocket = (event: {
            event: string;
            message?: {
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
                timestamp: number;
            };
            messageId?: string;
            senderName?: string;
            threadName?: string;
            threadId?: string;
            name?: string;
        }) => {
            if (event.event === 'message.deleted' && typeof event.messageId === 'string') {
                setReplyingTo((previous) => (previous?.id === event.messageId ? null : previous));
                setHighlightedMessageId((previous) =>
                    previous === event.messageId ? null : previous
                );

                setMessages((prev) => {
                    const messageId = event.messageId;
                    if (!messageId) {
                        return prev;
                    }
                    const next = removeMessageById(prev, messageId);
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

            if (event.event === 'chat.deleted' && event.threadId === thread.id) {
                onThreadDeleted(thread.id);
                return;
            }

            if (event.event === 'chat.updated' && event.threadId === thread.id) {
                if (typeof event.name === 'string' && event.name.trim().length > 0) {
                    const normalizedName = event.name.trim();
                    onThreadUpdate({
                        ...threadRef.current,
                        name: normalizedName,
                    });
                    setIsRenamingChatName(false);
                    setChatNameError(null);
                    setSavingChatName(false);
                    return;
                }

                void onThreadRefresh(thread.id).catch(() => {});
                return;
            }

            if (
                event.event !== 'message.created' &&
                event.event !== 'notification.message' &&
                event.event !== 'message.updated'
            ) {
                return;
            }

            if (!event.message || event.message.threadId !== thread.id) {
                return;
            }

            const senderIndex = thread.participants.indexOf(event.message?.senderId);
            const isMe = event.message.senderId === currentUserId;
            const senderName = isMe
                ? currentUserName
                : event.event === 'notification.message' && event.senderName
                  ? event.senderName
                  : getParticipantLabel(
                        event.message.senderId,
                        senderIndex >= 0 ? thread.participantNames[senderIndex] : null
                    );

            const mappedMessage: ChatMessage = {
                id: event.message.id,
                senderId: event.message.senderId,
                senderName,
                content: event.message.content,
                isEdited: Boolean(event.message.isEdited),
                type: (event.message.messageType as 'text' | 'notice') ?? 'text',
                replyToId: event.message.replyToId ?? null,
                replyTo: event.message.replyTo ?? null,
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
        onThreadRefresh,
    ]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || sendingRef.current) return;
        const content = input.trim();
        sendingRef.current = true;
        setSending(true);
        setSendError(null);
        try {
            const msg = await sendMessage(thread.id, content, replyingTo?.id);
            setMessages((prev) => {
                const mappedMessage: ChatMessage = {
                    ...msg,
                    isEdited: Boolean(msg.isEdited),
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
            setReplyingTo(null);
        } catch (error) {
            setSendError(error instanceof Error ? error.message : 'Could not send message.');
            console.error(error);
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
            setReplyingTo((previous) => (previous?.id === message.id ? null : previous));
            setHighlightedMessageId((previous) => (previous === message.id ? null : previous));

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

    const handleStartMessageEdit = (message: ChatMessage) => {
        if (savingEditMessageId) {
            return;
        }

        setEditingMessageId(message.id);
        setEditDraft(message.content);
        setEditError(null);
        setContextMenuMessageId(null);
        setContextMenuPosition(null);
    };

    const handleCancelMessageEdit = () => {
        if (savingEditMessageId) {
            return;
        }

        setEditingMessageId(null);
        setEditDraft('');
        setEditError(null);
    };

    const handleSaveMessageEdit = async (message: ChatMessage) => {
        const nextContent = editDraft.trim();

        if (!nextContent || savingEditMessageId !== null) {
            return;
        }

        setSavingEditMessageId(message.id);
        setEditError(null);

        try {
            const updatedMessage = await editChatMessage(message.id, nextContent);
            const mappedMessage: ChatMessage = {
                ...updatedMessage,
                senderName:
                    participantNameById.get(updatedMessage.senderId) ||
                    updatedMessage.senderName ||
                    `Neighbor ${updatedMessage.senderId.slice(0, 6)}`,
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

            setEditingMessageId(null);
            setEditDraft('');
            setContextMenuMessageId(null);
            setContextMenuPosition(null);
        } catch (error) {
            setEditError(error instanceof Error ? error.message : 'Could not update message.');
            console.error(error);
        } finally {
            setSavingEditMessageId(null);
        }
    };

    const handleCopyMessage = async (content: string) => {
        const showCopyNotice = (message: string) => {
            setCopyNotice(message);
            if (copyNoticeTimerRef.current !== null) {
                window.clearTimeout(copyNoticeTimerRef.current);
            }
            copyNoticeTimerRef.current = window.setTimeout(() => {
                setCopyNotice(null);
                copyNoticeTimerRef.current = null;
            }, 1800);
        };

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(content);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = content;
                textarea.setAttribute('readonly', 'true');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }

            showCopyNotice('Message copied');
        } catch (error) {
            showCopyNotice('Could not copy message');
            console.error(error);
        } finally {
            setContextMenuMessageId(null);
            setContextMenuPosition(null);
        }
    };

    const handleContextMenu = (e: MouseEvent, messageId: string) => {
        e.preventDefault();
        const screenWidth = window.innerWidth;
        const menuWidth = 170; // approximate width of the context menu
        let x = e.clientX;
        const y = e.clientY;

        if (x + menuWidth > screenWidth) {
            x = screenWidth - menuWidth - 12;
        }

        setContextMenuMessageId(messageId);
        setContextMenuPosition({ x, y });
    };

    const handleStartReply = (message: ChatMessage) => {
        if (savingEditMessageId !== null) {
            return;
        }

        setReplyingTo(message);
        setContextMenuMessageId(null);
        setContextMenuPosition(null);
    };

    const setMessageElementRef = (messageId: string, element: HTMLDivElement | null) => {
        if (element) {
            messageElementMapRef.current.set(messageId, element);
            return;
        }

        messageElementMapRef.current.delete(messageId);
    };

    const highlightMessageById = (messageId: string) => {
        const target = messageElementMapRef.current.get(messageId);
        if (!target) {
            return;
        }

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedMessageId(messageId);

        if (replyHighlightTimerRef.current !== null) {
            window.clearTimeout(replyHighlightTimerRef.current);
        }

        replyHighlightTimerRef.current = window.setTimeout(() => {
            setHighlightedMessageId((current) => (current === messageId ? null : current));
            replyHighlightTimerRef.current = null;
        }, 1400);
    };

    const handleReplySnippetClick = (message: ChatMessage) => {
        if (!message.replyToId) {
            return;
        }

        highlightMessageById(message.replyToId);
    };

    const getAvatarUrl = (userId: string) => avatarFallback(userId);

    const openProfile = (userId: string) => {
        setLocation(`/profile?userId=${encodeURIComponent(userId)}`);
    };

    const otherNames = thread.participantNames.filter(
        (_name, idx) => thread.participants[idx] !== currentUserId
    );
    const isGroup = thread.isGroup;
    const canRenameGroupName = isGroup && thread.ownerId === currentUserId;
    const fallbackChatTitle = otherNames.filter(Boolean).join(', ') || 'Chat';
    const chatTitle = thread.name || fallbackChatTitle;
    const connectionStatusNotice =
        connectionStatus === 'connected' && threadSubscribed
            ? null
            : connectionStatus === 'disconnected'
              ? 'Live updates unavailable. Check your connection.'
              : 'Reconnecting to live updates...';
    const headerMetaText = copyNotice || connectionStatusNotice;
    const headerMetaColor = copyNotice
        ? 'var(--accent)'
        : connectionStatusNotice
          ? 'var(--warning)'
          : 'var(--text-tertiary)';

    const startRenamingChatName = () => {
        if (!canRenameGroupName || savingChatName) {
            return;
        }

        setChatNameDraft(thread.name ?? fallbackChatTitle);
        setChatNameError(null);
        setIsRenamingChatName(true);
    };

    const cancelRenamingChatName = () => {
        if (savingChatName) {
            return;
        }

        setIsRenamingChatName(false);
        setChatNameDraft(thread.name ?? '');
        setChatNameError(null);
    };

    const handleSaveChatName = async () => {
        if (!canRenameGroupName || savingChatName) {
            return;
        }

        const nextName = chatNameDraft.trim();
        if (!nextName || nextName.length > 50) {
            setChatNameError('Group name must be between 1 and 50 characters.');
            return;
        }

        const currentName = (threadRef.current.name ?? '').trim();
        if (currentName === nextName) {
            setIsRenamingChatName(false);
            setChatNameError(null);
            return;
        }

        setSavingChatName(true);
        setChatNameError(null);
        try {
            const updated = await updateChatName(thread.id, nextName);
            const resolvedName = updated.name.trim() || nextName;

            onThreadUpdate({
                ...threadRef.current,
                name: resolvedName,
            });

            setChatNameDraft(resolvedName);
            setIsRenamingChatName(false);
        } catch (error) {
            setChatNameError(
                error instanceof Error ? error.message : 'Could not update group chat name.'
            );
        } finally {
            setSavingChatName(false);
        }
    };

    const directCounterpartProfile = directCounterpartId
        ? participantProfiles[directCounterpartId]
        : null;
    const groupPreviewParticipants = thread.participants.slice(0, 4).map((participantId, index) => {
        const profile = participantProfiles[participantId];
        return {
            id: participantId,
            name:
                profile?.name ||
                thread.participantNames[index] ||
                participantNameById.get(participantId) ||
                `Neighbor ${participantId.slice(0, 6)}`,
            avatar: profile?.avatar || getAvatarUrl(participantId),
        };
    });

    return (
        <div
            style={`height:100dvh;display:flex;flex-direction:column;background:var(--bg); --accent: ${selectedColor}; overflow:hidden;`}
        >
            {/* Chat header */}
            <header
                class="header-bar"
                style="position:relative;z-index:40;height:var(--header-h);display:flex;align-items:center;gap:10px;padding:0 12px;flex-shrink:0;"
            >
                <HoverButton
                    type="button"
                    class="btn-icon"
                    onClick={() => onBack()}
                    aria-label="Back to messages"
                    style="color:var(--text-secondary);"
                    id="chat-back-btn"
                >
                    <ArrowLeft size={18} />
                </HoverButton>
                <div
                    style={`width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;background:var(--bg-muted);`}
                >
                    {isGroup ? (
                        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--accent-subtle);color:var(--accent);">
                            <Users size={15} />
                        </div>
                    ) : (
                        <UserAvatar
                            userId={
                                thread.participants.find((p) => p !== currentUserId) ||
                                thread.participants[0]
                            }
                            fallbackSrc={avatarFallback(
                                thread.participants.find((p) => p !== currentUserId) ||
                                    thread.participants[0]
                            )}
                            alt={`${chatTitle} profile picture`}
                            style="width:100%;height:100%;object-fit:cover;"
                        />
                    )}
                </div>
                <div style="flex:1;min-width:0;">
                    {isRenamingChatName ? (
                        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                            <input
                                type="text"
                                className="input-field max-w-[200px]"
                                value={chatNameDraft}
                                maxLength={50}
                                onInput={(event) => {
                                    setChatNameDraft((event.target as HTMLInputElement).value);
                                    if (chatNameError) {
                                        setChatNameError(null);
                                    }
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void handleSaveChatName();
                                        return;
                                    }

                                    if (event.key === 'Escape') {
                                        event.preventDefault();
                                        cancelRenamingChatName();
                                    }
                                }}
                                style="height:32px;max-width:200px;background:var(--surface-overlay);color:var(--text);border-color:var(--border-focus);"
                            />
                            <HoverButton
                                type="button"
                                class="btn-primary"
                                onClick={() => void handleSaveChatName()}
                                disabled={savingChatName}
                                style="height:30px;padding:0 10px;font-size:12px;"
                            >
                                {savingChatName ? 'Saving…' : 'Save'}
                            </HoverButton>
                            <HoverButton
                                type="button"
                                class="btn-ghost"
                                onClick={cancelRenamingChatName}
                                disabled={savingChatName}
                                style="height:30px;padding:0 10px;font-size:12px;"
                            >
                                Cancel
                            </HoverButton>
                        </div>
                    ) : (
                        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                            <p style="font-size:14px;font-weight:700;color:var(--text);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em;">
                                {chatTitle}
                            </p>
                            {canRenameGroupName && (
                                <HoverButton
                                    type="button"
                                    class="btn-icon"
                                    onClick={startRenamingChatName}
                                    aria-label="Rename group chat"
                                    style="color:var(--text-secondary);width:24px;height:24px;"
                                >
                                    <Edit2 size={13} />
                                </HoverButton>
                            )}
                        </div>
                    )}
                    {chatNameError && (
                        <p style="font-size:11px;color:var(--danger);margin:3px 0 0;">
                            {chatNameError}
                        </p>
                    )}
                    {headerMetaText ? (
                        <p style={`font-size:11px;color:${headerMetaColor};margin:0;`}>
                            {headerMetaText}
                        </p>
                    ) : isGroup ? (
                        <p style="font-size:11px;color:var(--text-tertiary);margin:0;">
                            {thread.participants.length} members
                        </p>
                    ) : null}
                </div>
                <HoverButton
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
                </HoverButton>
            </header>

            <div style="flex:1;display:flex;overflow:hidden;position:relative;">
                <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;">
                    {/* Messages */}
                    <div style="flex:1;overflow-y:auto;padding:12px 0;display:flex;flex-direction:column;padding-bottom:100px;">
                        <div
                            style={`width:100%;max-width:${wideChatView ? '100%' : '680px'};margin:0 auto;padding:0 16px;display:flex;flex-direction:column;gap:10px;`}
                        >
                            <div style="height:4px;" />
                            {messages.map((msg) => {
                                const isMe = msg.senderId === currentUserId;
                                const isContextMenuOpen = contextMenuMessageId === msg.id;
                                const isEditingMessage = editingMessageId === msg.id;
                                const isHighlightedMessage = highlightedMessageId === msg.id;

                                if (msg.type === 'notice') {
                                    return (
                                        <div
                                            key={msg.id}
                                            className="animate-fade-in"
                                            ref={(element) => setMessageElementRef(msg.id, element)}
                                            style={`display:flex;justify-content:center;align-items:center;gap:8px;margin:16px 0 8px;border-radius:10px;padding:3px 6px;${isHighlightedMessage ? 'box-shadow:0 0 0 1.5px var(--accent);background:var(--accent-subtle);' : ''}`}
                                        >
                                            <div style="background:var(--type-update-bg);color:var(--type-update-text);font-size:11px;font-weight:600;padding:5px 14px;border-radius:20px;border:1px solid var(--type-update-border);box-shadow:0 2px 6px rgba(0,0,0,0.02);display:flex;align-items:center;gap:6px;">
                                                <Info size={12} style="opacity:0.8;" />
                                                {msg.content}
                                            </div>
                                            <HoverButton
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleStartReply(msg);
                                                }}
                                                aria-label={`Reply to message from ${msg.senderName}`}
                                                title="Reply"
                                                class="message-reply-trigger"
                                                style="width:24px;height:24px;border-radius:999px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text-tertiary);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;"
                                            >
                                                <Reply size={12} />
                                            </HoverButton>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={msg.id}
                                        className="message-row"
                                        ref={(element) => setMessageElementRef(msg.id, element)}
                                    >
                                        <div
                                            class={`stack-h gap-sm items-end relative rounded-xl p-1 transition-all ${isMe ? 'justify-end' : 'justify-start'} ${isHighlightedMessage ? 'shadow-[0_0_0_2px_var(--accent)] bg-(--accent-subtle)' : ''}`}
                                        >
                                            {!isMe && (
                                                <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border-2 border-(--border) bg-(--bg-subtle) shadow-sm">
                                                    <UserAvatar
                                                        userId={msg.senderId}
                                                        fallbackSrc={getAvatarUrl(msg.senderId)}
                                                        alt={`${msg.senderName} profile picture`}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            )}
                                            <HoverButton
                                                type="button"
                                                onClick={(e: MouseEvent) => {
                                                    if (isEditingMessage) return;
                                                    handleContextMenu(
                                                        e as unknown as MouseEvent,
                                                        msg.id
                                                    );
                                                }}
                                                onContextMenu={(e: MouseEvent) => {
                                                    if (isEditingMessage) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                    handleContextMenu(
                                                        e as unknown as MouseEvent,
                                                        msg.id
                                                    );
                                                }}
                                                class={`relative p-3.5 rounded-2xl text-[13px] leading-relaxed border-none text-left flex flex-col transition-transform active:scale-[0.99] ${
                                                    isMe
                                                        ? 'bg-(--accent) text-white rounded-br-none shadow-md'
                                                        : 'bg-(--surface-raised) text-(--text) border border-(--border) rounded-bl-none shadow-sm'
                                                }`}
                                                style={`max-width:${wideChatView ? 'min(85%, 900px)' : '80%'}; cursor:${isEditingMessage ? 'default' : isMe || thread.ownerId === currentUserId || (thread.participantRoles?.[currentUserId]?.includes('admin') ?? false) ? 'pointer' : 'default'}`}
                                            >
                                                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px;">
                                                    {!isMe ? (
                                                        <HoverButton
                                                            type="button"
                                                            onClick={() =>
                                                                setLocation(
                                                                    `/profile?userId=${encodeURIComponent(msg.senderId)}`
                                                                )
                                                            }
                                                            style="font-size:11px;font-weight:700;color:var(--accent);margin:0;padding:0;background:none;border:none;cursor:pointer;"
                                                        >
                                                            {msg.senderName}
                                                        </HoverButton>
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
                                                        {msg.isEdited && (
                                                            <span
                                                                style={`margin-left:4px;opacity:${isMe ? 0.72 : 0.62};font-size:10px;`}
                                                            >
                                                                (edited)
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                {isEditingMessage ? (
                                                    <form
                                                        class="stack-v gap-sm"
                                                        aria-label="Edit message"
                                                        onClick={(event) => event.stopPropagation()}
                                                        onSubmit={(event) => {
                                                            event.preventDefault();
                                                            void handleSaveMessageEdit(msg);
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Escape') {
                                                                handleCancelMessageEdit();
                                                            }
                                                        }}
                                                    >
                                                        <input
                                                            value={editDraft}
                                                            onInput={(event) => {
                                                                setEditDraft(
                                                                    (
                                                                        event.target as HTMLInputElement
                                                                    ).value
                                                                );
                                                                if (editError) {
                                                                    setEditError(null);
                                                                }
                                                            }}
                                                            onKeyDown={(event) => {
                                                                if (
                                                                    event.key === 'Enter' &&
                                                                    !event.repeat
                                                                ) {
                                                                    event.preventDefault();
                                                                    void handleSaveMessageEdit(msg);
                                                                }
                                                            }}
                                                            maxLength={5000}
                                                            style={`width:100%;padding:8px 10px;border-radius:8px;border:1px solid ${isMe ? 'rgba(255,255,255,0.45)' : 'var(--border)'};background:${isMe ? 'rgba(15,23,42,0.2)' : 'var(--bg-subtle)'};color:inherit;font-size:13px;outline:none;`}
                                                        />
                                                        <div style="display:flex;justify-content:flex-end;gap:8px;">
                                                            <HoverButton
                                                                type="button"
                                                                onClick={handleCancelMessageEdit}
                                                                disabled={
                                                                    savingEditMessageId === msg.id
                                                                }
                                                                style={`height:28px;padding:0 10px;border-radius:7px;font-size:11px;font-weight:600;border:1px solid ${isMe ? 'rgba(255,255,255,0.35)' : 'var(--border)'};background:${isMe ? 'rgba(255,255,255,0.08)' : 'var(--bg-subtle)'};color:inherit;`}
                                                            >
                                                                Cancel
                                                            </HoverButton>
                                                            <HoverButton
                                                                type="button"
                                                                onClick={() =>
                                                                    void handleSaveMessageEdit(msg)
                                                                }
                                                                disabled={
                                                                    !editDraft.trim() ||
                                                                    savingEditMessageId === msg.id
                                                                }
                                                                style={`height:28px;padding:0 11px;border-radius:7px;font-size:11px;font-weight:700;border:1px solid transparent;background:${isMe ? '#fff' : 'var(--accent)'};color:${isMe ? 'var(--accent)' : '#fff'};`}
                                                            >
                                                                {savingEditMessageId === msg.id
                                                                    ? 'Saving…'
                                                                    : 'Save'}
                                                            </HoverButton>
                                                        </div>
                                                        {editError && (
                                                            <p
                                                                style={`margin:0;font-size:11px;line-height:1.35;color:${isMe ? 'rgba(255,255,255,0.86)' : 'var(--danger)'};`}
                                                            >
                                                                {editError}
                                                            </p>
                                                        )}
                                                    </form>
                                                ) : (
                                                    <>
                                                        {(msg.replyToId || msg.replyTo) && (
                                                            <HoverButton
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    handleReplySnippetClick(msg);
                                                                }}
                                                                onContextMenu={(event) => {
                                                                    event.stopPropagation();
                                                                }}
                                                                disabled={!msg.replyToId}
                                                                aria-label="Open replied message"
                                                                style={`margin:0 0 6px;padding:7px 9px;border-radius:8px;border-left:2px solid ${isMe ? 'rgba(255,255,255,0.65)' : 'var(--accent)'};background:${isMe ? 'rgba(255,255,255,0.14)' : 'var(--bg-subtle)'};opacity:0.9;display:flex;flex-direction:column;gap:2px;text-align:left;cursor:${msg.replyToId ? 'pointer' : 'default'};`}
                                                            >
                                                                <span
                                                                    style={`font-size:10px;font-weight:700;${isMe ? 'color:rgba(255,255,255,0.88);' : 'color:var(--text-secondary);'}`}
                                                                >
                                                                    Replying to{' '}
                                                                    {msg.replyTo?.senderName ||
                                                                        'Unknown user'}
                                                                </span>
                                                                <span
                                                                    style={`font-size:11px;line-height:1.35;word-break:break-word;${isMe ? 'color:rgba(255,255,255,0.78);' : 'color:var(--text-tertiary);'}`}
                                                                >
                                                                    {msg.replyTo?.isUnavailable
                                                                        ? 'Original message unavailable'
                                                                        : msg.replyTo?.snippet ||
                                                                          'Original message unavailable'}
                                                                </span>
                                                            </HoverButton>
                                                        )}
                                                        <p style="margin:0;word-break:break-word;white-space:pre-wrap;">
                                                            {msg.content}
                                                        </p>
                                                    </>
                                                )}
                                            </HoverButton>

                                            <div class="stack-v gap-sm">
                                                <HoverButton
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleStartReply(msg);
                                                    }}
                                                    aria-label={`Reply to message from ${msg.senderName}`}
                                                    title="Reply"
                                                    class="message-reply-trigger"
                                                    disabled={savingEditMessageId !== null}
                                                    style="width:24px;height:24px;border-radius:999px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text-tertiary);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;"
                                                >
                                                    <Reply size={12} />
                                                </HoverButton>

                                                {!isMe && (
                                                    <HoverButton
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setReportingMessage(msg);
                                                        }}
                                                        aria-label={`Report message from ${msg.senderName}`}
                                                        title="Report message"
                                                        style="width:24px;height:24px;border-radius:999px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text-tertiary);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;"
                                                    >
                                                        <Flag size={12} />
                                                    </HoverButton>
                                                )}
                                            </div>

                                            {isContextMenuOpen && contextMenuPosition && (
                                                <>
                                                    <HoverButton
                                                        type="button"
                                                        aria-label="Close menu"
                                                        class="fixed inset-0 z-49 bg-none border-none p-0 w-full h-full cursor-default"
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
                                                        class="fixed z-50 bg-(--surface-raised) border border-(--border) rounded-xl shadow-lg overflow-hidden min-w-[160px]"
                                                        style={`left:${contextMenuPosition.x}px;top:${contextMenuPosition.y}px;`}
                                                        role="menu"
                                                    >
                                                        <HoverButton
                                                            type="button"
                                                            onClick={() =>
                                                                void handleCopyMessage(msg.content)
                                                            }
                                                            role="menuitem"
                                                            key="copy-text"
                                                            class="w-full px-3 py-2.5 border-none bg-none cursor-pointer text-[13px] text-(--text) stack-h gap-sm text-left hover:bg-(--bg-muted) transition-colors"
                                                        >
                                                            <Copy size={14} />
                                                            Copy text
                                                        </HoverButton>

                                                        {isMe && (
                                                            <HoverButton
                                                                type="button"
                                                                onClick={() =>
                                                                    handleStartMessageEdit(msg)
                                                                }
                                                                role="menuitem"
                                                                key="edit-message"
                                                                class="w-full px-3 py-2.5 border-none bg-none cursor-pointer text-[13px] text-(--text) stack-h gap-sm text-left hover:bg-(--bg-muted) transition-colors"
                                                            >
                                                                <Pencil size={14} />
                                                                Edit message
                                                            </HoverButton>
                                                        )}

                                                        <div class="h-px bg-(--border) mx-1 my-1" />

                                                        <HoverButton
                                                            type="button"
                                                            onClick={() => {
                                                                setContextMenuMessageId(null);
                                                                setContextMenuPosition(null);
                                                                handleDeleteMessage(msg, 'me');
                                                            }}
                                                            disabled={deletingMessageId !== null}
                                                            role="menuitem"
                                                            key="delete-me"
                                                            class="w-full px-3 py-2.5 border-none bg-none cursor-pointer text-[13px] text-(--text) stack-h gap-sm text-left hover:bg-(--bg-muted) transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                            Delete for me
                                                        </HoverButton>

                                                        {!isMe && (
                                                            <HoverButton
                                                                type="button"
                                                                onClick={() => {
                                                                    setContextMenuMessageId(null);
                                                                    setContextMenuPosition(null);
                                                                    setReportingMessage(msg);
                                                                }}
                                                                role="menuitem"
                                                                key="report-message"
                                                                class="w-full px-3 py-2.5 border-none bg-none cursor-pointer text-[13px] text-(--text) stack-h gap-sm text-left hover:bg-(--bg-muted) transition-colors"
                                                            >
                                                                <Flag size={14} />
                                                                Report message
                                                            </HoverButton>
                                                        )}

                                                        {(isMe ||
                                                            (thread.isGroup &&
                                                                (thread.ownerId === currentUserId ||
                                                                    (thread.participantRoles?.[
                                                                        currentUserId
                                                                    ]?.includes('admin') ??
                                                                        false)))) && (
                                                            <>
                                                                <div class="h-px bg-(--border) mx-1" />
                                                                <HoverButton
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setContextMenuMessageId(
                                                                            null
                                                                        );
                                                                        setContextMenuPosition(
                                                                            null
                                                                        );
                                                                        handleDeleteMessage(
                                                                            msg,
                                                                            'everyone'
                                                                        );
                                                                    }}
                                                                    disabled={
                                                                        deletingMessageId !== null
                                                                    }
                                                                    role="menuitem"
                                                                    key="delete-everyone"
                                                                    class="w-full px-3 py-2.5 border-none bg-none cursor-pointer text-[13px] text-(--danger) stack-h gap-sm text-left hover:bg-(--danger-subtle) transition-colors"
                                                                >
                                                                    <Trash2 size={14} />
                                                                    Delete for everyone
                                                                </HoverButton>
                                                            </>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={bottomRef} />
                        </div>
                    </div>

                    {/* Input bar */}
                    <div
                        class="nav-bar"
                        style="position:absolute;bottom:0;left:0;right:0;padding:8px 12px;z-index:20;"
                    >
                        <div
                            style={`max-width:${wideChatView ? '100%' : '680px'};width:100%;margin:0 auto;display:flex;flex-direction:column;gap:8px;`}
                        >
                            {replyingTo && (
                                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 11px;border:1px solid var(--border);border-radius:10px;background:var(--surface-raised);box-shadow:var(--shadow-sm);">
                                    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
                                        <span style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;">
                                            Replying to {replyingTo.senderName}
                                        </span>
                                        <span style="font-size:12px;color:var(--text-tertiary);line-height:1.35;word-break:break-word;">
                                            {replyingTo.content.length > 180
                                                ? `${replyingTo.content.slice(0, 180)}...`
                                                : replyingTo.content}
                                        </span>
                                    </div>
                                    <HoverButton
                                        type="button"
                                        onClick={() => setReplyingTo(null)}
                                        class="btn-icon"
                                        aria-label="Cancel reply"
                                        title="Cancel reply"
                                        style="width:24px;height:24px;flex-shrink:0;color:var(--text-tertiary);"
                                    >
                                        <X size={14} />
                                    </HoverButton>
                                </div>
                            )}
                            <div style="display:flex;align-items:center;gap:8px;">
                                <input
                                    value={input}
                                    onInput={(e) => {
                                        setInput((e.target as HTMLInputElement).value);
                                        if (sendError) {
                                            setSendError(null);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === 'Enter' &&
                                            !e.repeat &&
                                            !isBlockedConversation &&
                                            connectionStatus === 'connected' &&
                                            threadSubscribed
                                        )
                                            handleSend();
                                    }}
                                    disabled={
                                        isBlockedConversation ||
                                        connectionStatus !== 'connected' ||
                                        !threadSubscribed
                                    }
                                    placeholder={
                                        isBlockedConversation
                                            ? 'You have blocked this user'
                                            : connectionStatus !== 'connected' || !threadSubscribed
                                              ? 'Connecting…'
                                              : 'Message…'
                                    }
                                    style="flex:1;padding:9px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color 0.15s,box-shadow 0.15s;"
                                    onFocus={(e) => {
                                        if (isBlockedConversation) return;
                                        (e.target as HTMLElement).style.borderColor =
                                            'var(--border-focus)';
                                        (e.target as HTMLElement).style.boxShadow =
                                            '0 0 0 3px var(--accent-muted)';
                                    }}
                                    onBlur={(e) => {
                                        if (isBlockedConversation) return;
                                        (e.target as HTMLElement).style.borderColor =
                                            'var(--border)';
                                        (e.target as HTMLElement).style.boxShadow = 'none';
                                    }}
                                />
                                <HoverButton
                                    type="button"
                                    id="send-message-btn"
                                    onClick={handleSend}
                                    disabled={
                                        !input.trim() ||
                                        sending ||
                                        isBlockedConversation ||
                                        connectionStatus !== 'connected' ||
                                        !threadSubscribed
                                    }
                                    class="btn-primary"
                                    style="height:38px;width:38px;padding:0;background:var(--accent);border-radius:8px;flex-shrink:0;"
                                    aria-label="Send"
                                >
                                    <Send size={15} />
                                </HoverButton>
                            </div>
                        </div>
                        {sendError && (
                            <div
                                style={`max-width:${wideChatView ? '100%' : '680px'};width:100%;margin:8px auto 0;padding:8px 10px;border:1px solid var(--danger-muted);border-radius:10px;background:var(--danger-subtle);color:var(--danger);font-size:12px;line-height:1.4;`}
                            >
                                {sendError}
                            </div>
                        )}
                    </div>
                </div>

                {showSidebar && (
                    <>
                        {isMobileViewport && (
                            <HoverButton
                                type="button"
                                aria-label="Close sidebar"
                                onClick={() => setShowSidebar(false)}
                                style="position:absolute;inset:0;z-index:29;background:rgba(0,0,0,0.35);border:none;padding:0;cursor:default;"
                            />
                        )}
                        <aside
                            class="animate-slide-in-right"
                            style={`width:min(320px, 86vw);background:var(--surface);border-left:1px solid var(--border);display:flex;flex-direction:column;z-index:30;flex-shrink:0;overflow:hidden;${isMobileViewport ? 'position:absolute;top:0;right:0;bottom:0;' : ''}`}
                        >
                            <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;">
                                <div>
                                    <p style="margin:0;font-size:14px;font-weight:700;color:var(--text);">
                                        {sidebarTab === 'info' ? 'Chat Info' : 'Participants'}
                                    </p>
                                </div>
                                <HoverButton
                                    type="button"
                                    class="btn-icon"
                                    onClick={() => setShowSidebar(false)}
                                    aria-label="Close sidebar"
                                >
                                    <X size={14} />
                                </HoverButton>
                            </div>

                            {sidebarTab === 'info' ? (
                                <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:20px;">
                                    <div style="padding:16px;border:1px solid var(--border);border-radius:18px;background:linear-gradient(180deg,var(--bg-subtle),var(--surface));box-shadow:var(--shadow-sm);display:flex;flex-direction:column;align-items:center;gap:14px;">
                                        <div style="display:flex;align-items:center;justify-content:center;">
                                            {isGroup ? (
                                                <div style="display:flex;align-items:center;justify-content:center;">
                                                    {groupPreviewParticipants.map(
                                                        (participant, index) => (
                                                            <HoverButton
                                                                key={participant.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    openProfile(participant.id)
                                                                }
                                                                aria-label={`Open ${participant.name}'s profile`}
                                                                style={`width:42px;height:42px;border-radius:14px;overflow:hidden;border:2px solid var(--surface);background:var(--bg-muted);margin-left:${index === 0 ? 0 : -10}px;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,0.12);padding:0;`}
                                                            >
                                                                <UserAvatar
                                                                    userId={participant.id}
                                                                    fallbackSrc={participant.avatar}
                                                                    alt={`${participant.name} profile picture`}
                                                                    style="width:100%;height:100%;object-fit:cover;"
                                                                />
                                                            </HoverButton>
                                                        )
                                                    )}
                                                    {thread.participants.length > 4 && (
                                                        <div style="width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-left:-10px;border:2px solid var(--surface);background:var(--accent-subtle);color:var(--accent);font-size:12px;font-weight:700;box-shadow:0 6px 18px rgba(15,23,42,0.12);">
                                                            +{thread.participants.length - 4}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <HoverButton
                                                    type="button"
                                                    onClick={() =>
                                                        directCounterpartId &&
                                                        openProfile(directCounterpartId)
                                                    }
                                                    aria-label="Open profile"
                                                    style="width:72px;height:72px;border-radius:22px;overflow:hidden;border:2px solid var(--border);background:var(--bg-muted);padding:0;cursor:pointer;box-shadow:0 10px 26px rgba(15,23,42,0.14);"
                                                >
                                                    <UserAvatar
                                                        userId={
                                                            directCounterpartId ||
                                                            thread.participants[0]
                                                        }
                                                        fallbackSrc={
                                                            directCounterpartProfile?.avatar ||
                                                            avatarFallback(
                                                                directCounterpartId ||
                                                                    thread.participants[0]
                                                            )
                                                        }
                                                        alt={`${chatTitle} profile picture`}
                                                        style="width:100%;height:100%;object-fit:cover;"
                                                    />
                                                </HoverButton>
                                            )}
                                        </div>
                                        <div style="text-align:center;">
                                            <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">
                                                {chatTitle}
                                            </h3>
                                            <p style="margin:4px 0 0;font-size:12px;color:var(--text-tertiary);">
                                                {isGroup
                                                    ? `${thread.participants.length} members`
                                                    : 'Direct message'}
                                            </p>
                                        </div>
                                        {!isGroup && directCounterpartId && (
                                            <HoverButton
                                                type="button"
                                                class="btn-secondary"
                                                onClick={() => openProfile(directCounterpartId)}
                                                style="height:32px;padding:0 14px;font-size:12px;gap:6px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:10px;color:var(--text);display:flex;align-items:center;justify-content:center;font-weight:600;"
                                            >
                                                View profile
                                                <ChevronRight size={12} />
                                            </HoverButton>
                                        )}
                                    </div>

                                    {isGroup && (
                                        <HoverButton
                                            type="button"
                                            class="btn-secondary"
                                            onClick={() => setSidebarTab('participants')}
                                            style="width:100%;height:38px;font-size:13px;gap:8px;display:flex;align-items:center;justify-content:center;background:var(--bg-subtle);border:1px solid var(--border);border-radius:8px;color:var(--text);"
                                        >
                                            <Users size={14} />
                                            View Members ({thread.participants.length})
                                        </HoverButton>
                                    )}

                                    <div style="border-top:1px solid var(--border);padding-top:20px;">
                                        <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">
                                            Chat Styles
                                        </p>

                                        <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:8px 12px;background:var(--bg-subtle);border-radius:10px;border:1px solid var(--border);margin-bottom:16px;">
                                            <span style="font-size:13px;font-weight:600;color:var(--text);">
                                                Wide chat view
                                            </span>
                                            <div style="position:relative;display:flex;align-items:center;">
                                                <input
                                                    type="checkbox"
                                                    checked={wideChatView}
                                                    onChange={() => setWideChatView(!wideChatView)}
                                                    style="opacity:0;position:absolute;width:0;height:0;"
                                                />
                                                <div
                                                    style={`width:36px;height:20px;background:${wideChatView ? 'var(--accent)' : 'var(--border-strong)'};border-radius:20px;position:relative;transition:all 0.2s;`}
                                                >
                                                    <div
                                                        style={`width:14px;height:14px;background:#fff;border-radius:50%;position:absolute;top:3px;left:${wideChatView ? '19px' : '3px'};transition:all 0.2s;box-shadow:var(--shadow-sm);`}
                                                    />
                                                </div>
                                            </div>
                                        </label>

                                        <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">
                                            Chat Color
                                        </p>
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
                                                '#22c55e', // green
                                            ].map((color) => (
                                                <HoverButton
                                                    key={color}
                                                    type="button"
                                                    onClick={() => setSelectedColor(color)}
                                                    style={`
                                                    aspect-ratio:1;border-radius:8px;border:2px solid ${selectedColor === color ? 'var(--text)' : 'transparent'};
                                                    background:${color};cursor:pointer;transition:transform 0.1s;
                                                `}
                                                    onMouseEnter={(e) =>
                                                        (e.currentTarget.style.transform =
                                                            'scale(1.1)')
                                                    }
                                                    onMouseLeave={(e) =>
                                                        (e.currentTarget.style.transform =
                                                            'scale(1)')
                                                    }
                                                    aria-label={`Select color ${color}`}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div style="border-top:1px solid var(--border);padding-top:20px;display:flex;flex-direction:column;gap:10px;">
                                        {isGroup &&
                                            (thread.ownerId === currentUserId ? (
                                                <HoverButton
                                                    type="button"
                                                    class="btn-ghost"
                                                    onClick={() =>
                                                        setConfirmAction({
                                                            title: 'Delete group chat',
                                                            message:
                                                                'Are you sure you want to delete this group chat? This cannot be undone.',
                                                            confirmLabel: 'Delete group',
                                                            destructive: true,
                                                            onConfirm: async () => {
                                                                await deleteGroupChat(thread.id);
                                                                onThreadDeleted(thread.id);
                                                            },
                                                        })
                                                    }
                                                    style="width:100%;height:38px;font-size:13px;color:var(--danger);justify-content:center;gap:8px;background:var(--danger-subtle);border-radius:8px;"
                                                >
                                                    <Trash2 size={14} />
                                                    Delete Group
                                                </HoverButton>
                                            ) : (
                                                <HoverButton
                                                    type="button"
                                                    class="btn-ghost"
                                                    onClick={() =>
                                                        setConfirmAction({
                                                            title: 'Leave group chat',
                                                            message:
                                                                'Are you sure you want to leave this group?',
                                                            confirmLabel: 'Leave group',
                                                            destructive: true,
                                                            onConfirm: async () => {
                                                                await removeGroupChatParticipant(
                                                                    thread.id,
                                                                    currentUserId
                                                                );
                                                                onThreadDeleted(thread.id);
                                                            },
                                                        })
                                                    }
                                                    style="width:100%;height:38px;font-size:13px;justify-content:center;gap:8px;background:var(--bg-subtle);border-radius:8px;"
                                                >
                                                    <ArrowLeft size={14} />
                                                    Leave Group
                                                </HoverButton>
                                            ))}
                                    </div>
                                </div>
                            ) : (
                                <div style="flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
                                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                                        <HoverButton
                                            type="button"
                                            class="btn-icon"
                                            onClick={() => setSidebarTab('info')}
                                            style="width:28px;height:28px;"
                                        >
                                            <ArrowLeft size={14} />
                                        </HoverButton>
                                        <HoverButton
                                            type="button"
                                            class="btn-ghost"
                                            onClick={() => setShowAddMembers((current) => !current)}
                                            style="height:30px;padding:0 10px;font-size:11px;"
                                        >
                                            Add members
                                        </HoverButton>
                                    </div>

                                    {showAddMembers && (
                                        <div style="padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--bg-subtle);display:flex;flex-direction:column;gap:8px;">
                                            <input
                                                value={addMemberQuery}
                                                onInput={(e) =>
                                                    setAddMemberQuery(
                                                        (e.target as HTMLInputElement).value
                                                    )
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
                                                    <HoverButton
                                                        key={user.id}
                                                        type="button"
                                                        class="btn-ghost"
                                                        disabled={addingMembers}
                                                        onClick={async () => {
                                                            setAddingMembers(true);
                                                            try {
                                                                await addGroupChatParticipants(
                                                                    thread.id,
                                                                    [user.id]
                                                                );
                                                                await onThreadRefresh(thread.id);
                                                                setShowAddMembers(false);
                                                            } finally {
                                                                setAddingMembers(false);
                                                            }
                                                        }}
                                                        style="justify-content:space-between;height:32px;padding:0 10px;font-size:12px;"
                                                    >
                                                        <span>{user.name}</span>
                                                        <span>+</span>
                                                    </HoverButton>
                                                ))
                                            )}
                                        </div>
                                    )}
                                    {thread.participants.map((participantId, index) => {
                                        const profile = participantProfiles[participantId];
                                        const name =
                                            profile?.name ||
                                            thread.participantNames[index] ||
                                            participantNameById.get(participantId) ||
                                            `Neighbor ${participantId.slice(0, 6)}`;
                                        const avatar =
                                            profile?.avatar || getAvatarUrl(participantId);
                                        const roles =
                                            thread.participantRoles?.[participantId] ?? [];
                                        const isOwner =
                                            thread.ownerId === participantId ||
                                            roles.includes('owner');
                                        const isAdmin = roles.includes('admin');
                                        const isSelf = participantId === currentUserId;
                                        return (
                                            <div key={participantId} class="participant-card">
                                                <HoverButton
                                                    type="button"
                                                    onClick={() => openProfile(participantId)}
                                                    style="background:none;border:none;padding:0;display:flex;align-items:center;gap:10px;min-width:0;flex:1;cursor:pointer;text-align:left;"
                                                >
                                                    <div style="width:40px;height:40px;border-radius:14px;overflow:hidden;flex-shrink:0;border:1px solid var(--border);background:var(--bg-muted);box-shadow:inset 0 1px 0 rgba(255,255,255,0.3);">
                                                        <UserAvatar
                                                            userId={participantId}
                                                            fallbackSrc={avatar}
                                                            alt={`${name} profile picture`}
                                                            style="width:100%;height:100%;object-fit:cover;"
                                                        />
                                                    </div>
                                                    <div style="min-width:0;flex:1;">
                                                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                                            <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                                                {isSelf ? `${name} (You)` : name}
                                                            </div>
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
                                                        <div style="margin-top:4px;font-size:11px;color:var(--text-tertiary);">
                                                            {isSelf
                                                                ? 'Open your profile'
                                                                : 'Open profile'}
                                                        </div>
                                                    </div>
                                                </HoverButton>
                                                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
                                                    {thread.ownerId === currentUserId &&
                                                        !isOwner && (
                                                            <HoverButton
                                                                type="button"
                                                                class="btn-ghost"
                                                                disabled={
                                                                    participantActionBusy ===
                                                                    participantId
                                                                }
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setMemberActionConfirm({
                                                                        title: 'Promote member',
                                                                        message: `Promote ${name} to admin?`,
                                                                        confirmLabel: 'Promote',
                                                                        onConfirm: async () => {
                                                                            setParticipantActionBusy(
                                                                                participantId
                                                                            );
                                                                            try {
                                                                                await promoteGroupChatParticipant(
                                                                                    thread.id,
                                                                                    participantId
                                                                                );
                                                                                const updated =
                                                                                    await onThreadRefresh(
                                                                                        thread.id
                                                                                    );
                                                                                onThreadUpdate(
                                                                                    updated
                                                                                );
                                                                            } finally {
                                                                                setParticipantActionBusy(
                                                                                    null
                                                                                );
                                                                            }
                                                                        },
                                                                    });
                                                                }}
                                                                aria-label="Promote to admin"
                                                                title="Promote to admin"
                                                                style="width:30px;height:30px;padding:0;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--accent-subtle);color:var(--accent);border:1px solid var(--accent-muted);"
                                                            >
                                                                <ShieldCheck size={14} />
                                                            </HoverButton>
                                                        )}
                                                    {(thread.ownerId === currentUserId ||
                                                        (thread.participantRoles?.[
                                                            currentUserId
                                                        ]?.includes('admin') ??
                                                            false)) &&
                                                        !isOwner && (
                                                            <HoverButton
                                                                type="button"
                                                                class="btn-ghost"
                                                                disabled={
                                                                    participantActionBusy ===
                                                                    participantId
                                                                }
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setMemberActionConfirm({
                                                                        title: 'Remove member',
                                                                        message: `Remove ${name} from this group?`,
                                                                        confirmLabel: 'Remove',
                                                                        destructive: true,
                                                                        onConfirm: async () => {
                                                                            setParticipantActionBusy(
                                                                                participantId
                                                                            );
                                                                            try {
                                                                                await removeGroupChatParticipant(
                                                                                    thread.id,
                                                                                    participantId
                                                                                );
                                                                                const updated =
                                                                                    await onThreadRefresh(
                                                                                        thread.id
                                                                                    );
                                                                                onThreadUpdate(
                                                                                    updated
                                                                                );
                                                                            } finally {
                                                                                setParticipantActionBusy(
                                                                                    null
                                                                                );
                                                                            }
                                                                        },
                                                                    });
                                                                }}
                                                                aria-label="Remove from group"
                                                                title="Remove from group"
                                                                style="width:30px;height:30px;padding:0;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--danger-subtle);color:var(--danger);border:1px solid var(--danger-muted);"
                                                            >
                                                                <UserMinus size={14} />
                                                            </HoverButton>
                                                        )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </aside>
                    </>
                )}
            </div>
            <ConfirmDialog
                open={confirmAction !== null}
                title={confirmAction?.title ?? ''}
                message={confirmAction?.message ?? ''}
                confirmLabel={confirmAction?.confirmLabel}
                destructive={confirmAction?.destructive}
                busy={false}
                onCancel={() => setConfirmAction(null)}
                onConfirm={async () => {
                    if (!confirmAction) return;
                    try {
                        await confirmAction.onConfirm();
                    } finally {
                        setConfirmAction(null);
                    }
                }}
            />
            <ConfirmDialog
                open={memberActionConfirm !== null}
                title={memberActionConfirm?.title ?? ''}
                message={memberActionConfirm?.message ?? ''}
                confirmLabel={memberActionConfirm?.confirmLabel}
                destructive={memberActionConfirm?.destructive}
                busy={participantActionBusy !== null}
                onCancel={() => setMemberActionConfirm(null)}
                onConfirm={async () => {
                    if (!memberActionConfirm) return;
                    try {
                        await memberActionConfirm.onConfirm();
                    } finally {
                        setMemberActionConfirm(null);
                    }
                }}
            />
            {reportingMessage && (
                <ReportModal
                    targetId={reportingMessage.id}
                    targetType="message"
                    contentSnippet={reportingMessage.content}
                    offender={{
                        id: reportingMessage.senderId,
                        name: reportingMessage.senderName,
                    }}
                    onClose={() => setReportingMessage(null)}
                />
            )}
        </div>
    );
}

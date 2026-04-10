import { ArrowLeft, Plus, Search, Send, User, Users, X } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import {
    connectChatWebSocket,
    disconnectChatWebSocket,
    fetchChats,
    sendMessage,
    startDirectConversation,
    subscribeChatThread,
    unsubscribeChatThread,
} from '../lib/chatApi';
import { readStoredAuthSession } from '../lib/auth';
import type { ChatMessage, ChatThread, User as AppUser } from '../lib/types';
import { fetchUsers } from '../lib/userApi';

function timeAgo(ts: number) {
    const d = Date.now() - ts;
    if (d < 60000) return 'just now';
    if (d < 3600000) return `${Math.floor(d / 60000)}m`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
    return `${Math.floor(d / 86400000)}d`;
}

function upsertMessageById(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
    const existingIndex = messages.findIndex((message) => message.id === incoming.id);

    if (existingIndex >= 0) {
        const next = [...messages];
        next[existingIndex] = incoming;
        return next;
    }

    return [...messages, incoming];
}

function uniqueMessagesById(messages: ChatMessage[]): ChatMessage[] {
    const map = new Map<string, ChatMessage>();
    for (const message of messages) {
        map.set(message.id, message);
    }

    return Array.from(map.values());
}

export function Messages() {
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

    const handleThreadUpdate = (updated: ChatThread) => {
        setThreads((p) => p.map((t) => (t.id === updated.id ? updated : t)));
        setActiveThread(updated);
    };

    useEffect(() => {
        fetchChats().then((data) => {
            setThreads(data);
            setLoading(false);
        });
    }, []);

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
            setComposeError(error instanceof Error ? error.message : 'Could not start conversation');
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
            <div style="padding:16px;display:flex;flex-direction:column;gap:8px;">
                {loading ? (
                    [1, 2].map((i) => (
                        <div
                            key={i}
                            style="height:64px;border-radius:10px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                        />
                    ))
                ) : threads.length === 0 ? (
                    <div style="padding:56px 24px;text-align:center;border:1px solid var(--border);border-radius:10px;background:var(--surface);">
                        <Users size={28} style="color:var(--text-tertiary);margin:0 auto 8px;" />
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
                                style={`width:100%;padding:12px 14px;display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;transition:background 0.15s;animation-delay:${i * 50}ms;`}
                            >
                                {/* Avatar */}
                                <div
                                    style={`width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${isGroup ? 'var(--accent-subtle)' : 'var(--type-item-bg)'};color:${isGroup ? 'var(--accent)' : 'var(--type-item-text)'};`}
                                >
                                    {isGroup ? <Users size={16} /> : <User size={16} />}
                                </div>
                                <div style="flex:1;min-width:0;">
                                    <p style="font-size:13px;font-weight:600;color:var(--text);margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                        {displayName}
                                    </p>
                                    {thread.lastMessage && (
                                        <p style="font-size:11px;color:var(--text-tertiary);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                            {thread.lastMessage.senderName}:{' '}
                                            {thread.lastMessage.content}
                                        </p>
                                    )}
                                </div>
                                {thread.lastMessage && (
                                    <span style="font-size:10px;color:var(--text-tertiary);flex-shrink:0;font-variant-numeric:tabular-nums;">
                                        {timeAgo(thread.lastMessage.timestamp)}
                                    </span>
                                )}
                            </button>
                        );
                    })
                )}
            </div>

            {showCompose && (
                <div
                    role="dialog"
                    aria-modal="true"
                    style="position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;padding:14px;background:rgba(15,17,23,0.48);backdrop-filter:blur(4px);"
                >
                    <div
                        class="animate-slide-up"
                        style="width:100%;max-width:640px;max-height:80dvh;display:flex;flex-direction:column;border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden;"
                    >
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border);">
                            <p style="margin:0;font-size:13px;font-weight:700;color:var(--text);">
                                Start a conversation
                            </p>
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

                        <div style="padding:12px 14px;border-bottom:1px solid var(--border);">
                            <label
                                for="chat-user-search"
                                style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;"
                            >
                                Search users
                            </label>
                            <div style="display:flex;align-items:center;gap:8px;padding:0 10px;height:38px;border:1px solid var(--border);border-radius:8px;background:var(--bg-subtle);">
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

                        <div style="overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;">
                            {searching ? (
                                [1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        style="height:52px;border-radius:8px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                                    />
                                ))
                            ) : queryResults.length === 0 ? (
                                <div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px;">
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
                                        style="padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;text-align:left;"
                                    >
                                        <img
                                            src={user.avatar}
                                            alt=""
                                            style="width:34px;height:34px;border-radius:50%;border:1px solid var(--border);object-fit:cover;background:var(--bg-muted);"
                                        />
                                        <div style="flex:1;min-width:0;">
                                            <p style="margin:0;font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                                {user.name}
                                            </p>
                                            <p style="margin:1px 0 0;font-size:11px;color:var(--text-tertiary);">
                                                Trust {user.trustScore}
                                            </p>
                                        </div>
                                        <span style="font-size:11px;font-weight:600;color:var(--accent);">
                                            {startingUserId === user.id ? 'Opening...' : 'Chat'}
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
    const [messages, setMessages] = useState<ChatMessage[]>(() => [...thread.messages]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const sendingRef = useRef(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const currentUser = readStoredAuthSession()?.user;
    const currentUserId = currentUser?.id ?? 'me';
    const currentUserName = currentUser?.displayName ?? currentUser?.email ?? 'You';

    useEffect(() => {
        setMessages(uniqueMessagesById([...thread.messages]));
    }, [thread.id, thread.messages]);

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
        }) => {
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
                senderName:
                    isMe
                        ? currentUserName
                        : senderIndex >= 0
                            ? thread.participantNames[senderIndex] || 'Neighbor'
                            : 'Neighbor',
                content: event.message.content,
                timestamp: Number(event.message.timestamp),
            };

            setMessages((prev) => {
                const next = upsertMessageById(prev, mappedMessage);
                if (next.length === prev.length) {
                    return prev;
                }

                onThreadUpdate({ ...thread, messages: next, lastMessage: mappedMessage });
                return next;
            });
        };

        connectChatWebSocket(handleChatSocket);
        subscribeChatThread(thread.id);

        return () => {
            unsubscribeChatThread(thread.id);
            disconnectChatWebSocket(handleChatSocket);
        };
    }, [thread, onThreadUpdate]);

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
                const next = upsertMessageById(prev, msg);
                if (next.length === prev.length) {
                    return prev;
                }

                onThreadUpdate({ ...thread, messages: next, lastMessage: msg });
                return next;
            });
            setInput('');
        } finally {
            sendingRef.current = false;
            setSending(false);
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
                    <p style="font-size:14px;font-weight:700;color:var(--text);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        {title}
                    </p>
                    <p style="font-size:11px;color:var(--text-tertiary);margin:0;">
                        {thread.participantNames.length} members
                    </p>
                </div>
            </header>

            {/* Messages */}
            <div style="flex:1;overflow-y:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:8px;padding-bottom:72px;">
                {messages.map((msg) => {
                    const isMe = msg.senderId === currentUserId;
                    return (
                        <div
                            key={msg.id}
                            style={`display:flex;justify-content:${isMe ? 'flex-end' : 'flex-start'};`}
                        >
                            <div
                                style={`
                                    max-width:78%;padding:9px 13px;border-radius:12px;font-size:13px;line-height:1.5;
                                    ${isMe
                                        ? 'background:var(--accent);color:#fff;border-bottom-right-radius:4px;'
                                        : 'background:var(--surface-raised);color:var(--text);border:1px solid var(--border);border-bottom-left-radius:4px;'
                                    }
                                `}
                            >
                                {!isMe && (
                                    <p style="font-size:10px;font-weight:700;color:var(--accent);margin:0 0 3px;">
                                        {msg.senderName}
                                    </p>
                                )}
                                <p style="margin:0;">{msg.content}</p>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div
                class="nav-bar"
                style="position:fixed;bottom:0;left:0;right:0;padding:8px 12px;display:flex;align-items:center;gap:8px;"
            >
                <div style="max-width:680px;width:100%;margin:0 auto;display:flex;align-items:center;gap:8px;">
                    <input
                        value={input}
                        onInput={(e) => setInput((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.repeat) {
                                handleSend();
                            }
                        }}
                        placeholder="Message…"
                        style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color 0.15s,box-shadow 0.15s;"
                        onFocus={(e) => {
                            (e.target as HTMLElement).style.borderColor = 'var(--border-focus)';
                            (e.target as HTMLElement).style.boxShadow =
                                '0 0 0 3px var(--accent-muted)';
                        }}
                        onBlur={(e) => {
                            (e.target as HTMLElement).style.borderColor = 'var(--border)';
                            (e.target as HTMLElement).style.boxShadow = 'none';
                        }}
                    />
                    <button
                        type="button"
                        id="send-message-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || sending}
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

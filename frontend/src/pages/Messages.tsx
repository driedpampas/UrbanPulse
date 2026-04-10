import { ArrowLeft, Send, User, Users } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import {
    connectChatWebSocket,
    disconnectChatWebSocket,
    fetchChats,
    sendMessage,
    subscribeChatThread,
    unsubscribeChatThread,
} from '../lib/chatApi';
import { readStoredAuthSession } from '../lib/auth';
import type { ChatMessage, ChatThread } from '../lib/types';

function timeAgo(ts: number) {
    const d = Date.now() - ts;
    if (d < 60000) return 'just now';
    if (d < 3600000) return `${Math.floor(d / 60000)}m`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
    return `${Math.floor(d / 86400000)}d`;
}

export function Messages() {
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
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
        <AppLayout title="Messages">
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
    const bottomRef = useRef<HTMLDivElement>(null);
    const currentUser = readStoredAuthSession()?.user;
    const currentUserId = currentUser?.id ?? 'me';
    const currentUserName = currentUser?.displayName ?? currentUser?.email ?? 'You';

    useEffect(() => {
        setMessages([...thread.messages]);
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
                if (prev.some((existing) => existing.id === mappedMessage.id)) {
                    return prev;
                }

                const next = [...prev, mappedMessage];
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
        if (!input.trim() || sending) return;
        const content = input.trim();
        setSending(true);
        try {
            const msg = await sendMessage(thread.id, content);
            setMessages((prev) => {
                const next = [...prev, msg];
                onThreadUpdate({ ...thread, messages: next, lastMessage: msg });
                return next;
            });
            setInput('');
        } finally {
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
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
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

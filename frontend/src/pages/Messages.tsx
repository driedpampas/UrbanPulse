import { ArrowLeft, Send, User, Users } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { fetchChats, sendMessage } from '../lib/mockApi';
import type { ChatMessage, ChatThread } from '../lib/types';

export function Messages() {
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeThread, setActiveThread] = useState<ChatThread | null>(null);

    useEffect(() => {
        fetchChats().then((data) => {
            setThreads(data);
            setLoading(false);
        });
    }, []);

    if (activeThread) {
        return <ChatView thread={activeThread} onBack={() => setActiveThread(null)} />;
    }

    return (
        <AppLayout title="Messages">
            <div class="p-4 space-y-2">
                {loading ? (
                    [1, 2].map((i) => (
                        <div key={i} class="glass rounded-2xl p-4 animate-pulse h-16" />
                    ))
                ) : threads.length === 0 ? (
                    <div class="text-center py-16 text-text-secondary">
                        <Users size={32} class="mx-auto mb-2 opacity-40" />
                        <p class="text-sm">No conversations yet</p>
                    </div>
                ) : (
                    threads.map((thread, i) => {
                        const otherNames = thread.participantNames.filter(
                            (n) => n !== 'Alex Rivera'
                        );
                        const displayName = thread.name || otherNames.join(', ');
                        return (
                            <button
                                type="button"
                                key={thread.id}
                                onClick={() => setActiveThread(thread)}
                                class="w-full glass rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-primary/5 transition-colors animate-fade-up"
                                style={{ animationDelay: `${i * 60}ms` }}
                            >
                                <div
                                    class={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${thread.isGroup ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}
                                >
                                    {thread.isGroup ? <Users size={18} /> : <User size={18} />}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="font-semibold text-sm truncate">{displayName}</p>
                                    {thread.lastMessage && (
                                        <p class="text-xs text-text-secondary truncate mt-0.5">
                                            {thread.lastMessage.senderName}:{' '}
                                            {thread.lastMessage.content}
                                        </p>
                                    )}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </AppLayout>
    );
}

function ChatView({ thread, onBack }: { thread: ChatThread; onBack: () => void }) {
    const [messages, setMessages] = useState<ChatMessage[]>(thread.messages);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || sending) return;
        setSending(true);
        const msg = await sendMessage(thread.id, input.trim());
        setMessages((prev) => [...prev, msg]);
        setInput('');
        setSending(false);
    };

    const otherNames = thread.participantNames.filter((n) => n !== 'Alex Rivera');
    const title = thread.name || otherNames.join(', ');

    return (
        <div class="min-h-dvh flex flex-col bg-surface-dim/30">
            <header class="sticky top-0 z-40 glass px-3 py-3 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    class="p-1.5 rounded-xl hover:bg-surface-dim transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <p class="font-semibold text-sm">{title}</p>
                    <p class="text-[10px] text-text-secondary">
                        {thread.participantNames.length} members
                    </p>
                </div>
            </header>

            <div class="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {messages.map((msg) => {
                    const isMe = msg.senderId === 'me';
                    return (
                        <div key={msg.id} class={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div
                                class={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                                    isMe
                                        ? 'bg-linear-to-r from-primary to-primary-dark text-white rounded-br-md'
                                        : 'glass rounded-bl-md'
                                }`}
                            >
                                {!isMe && (
                                    <p class="text-[10px] font-semibold text-primary mb-0.5">
                                        {msg.senderName}
                                    </p>
                                )}
                                <p>{msg.content}</p>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            <div class="sticky bottom-0 glass p-3 flex items-center gap-2">
                <input
                    value={input}
                    onInput={(e) => setInput((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type a message…"
                    class="flex-1 bg-white/60 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    class="bg-linear-to-r from-primary to-primary-dark text-white p-2.5 rounded-xl disabled:opacity-50 shadow-lg"
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
}

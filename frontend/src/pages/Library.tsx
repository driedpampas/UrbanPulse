import { Package, Plus, Search, Tag, Wrench, X } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { fetchLibrary, postLibraryItem } from '../lib/mockApi';
import type { LibraryItem } from '../lib/types';

export function Library() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'item' | 'skill'>('all');
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);

    useEffect(() => {
        fetchLibrary().then((data) => {
            setItems(data);
            setLoading(false);
        });
    }, []);

    const filtered = items.filter((i) => {
        if (filter !== 'all' && i.type !== filter) return false;
        if (
            search &&
            !i.title.toLowerCase().includes(search.toLowerCase()) &&
            !i.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
        )
            return false;
        return true;
    });

    return (
        <AppLayout title="Library">
            <div class="p-4 space-y-3">
                <div class="glass rounded-2xl px-3 py-2 flex items-center gap-2">
                    <Search size={16} class="text-text-secondary shrink-0" />
                    <input
                        value={search}
                        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                        placeholder="Search items or skills…"
                        class="flex-1 bg-transparent text-sm focus:outline-none"
                    />
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex gap-1.5">
                        {(['all', 'item', 'skill'] as const).map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFilter(f)}
                                class={`text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                                    filter === f
                                        ? 'bg-primary text-white'
                                        : 'glass text-text-secondary hover:text-text'
                                }`}
                            >
                                {f === 'all' ? 'All' : f === 'item' ? '📦 Items' : '🛠️ Skills'}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowAdd(true)}
                        class="bg-linear-to-r from-primary to-primary-dark text-white rounded-xl p-2 shadow-lg"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                {loading ? (
                    <div class="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} class="glass rounded-2xl p-4 animate-pulse h-24" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div class="text-center py-12 text-text-secondary">
                        <Package size={32} class="mx-auto mb-2 opacity-40" />
                        <p class="text-sm">No items found</p>
                    </div>
                ) : (
                    <div class="space-y-3">
                        {filtered.map((item, i) => (
                            <div
                                key={item.id}
                                class="glass rounded-2xl p-4 animate-fade-up"
                                style={{ animationDelay: `${i * 50}ms` }}
                            >
                                <div class="flex items-start gap-3">
                                    <div
                                        class={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                            item.type === 'item'
                                                ? 'bg-secondary/10 text-secondary'
                                                : 'bg-primary/10 text-primary'
                                        }`}
                                    >
                                        {item.type === 'item' ? (
                                            <Package size={18} />
                                        ) : (
                                            <Wrench size={18} />
                                        )}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <h3 class="font-semibold text-sm">{item.title}</h3>
                                            <span
                                                class={`w-2 h-2 rounded-full shrink-0 ${item.available ? 'bg-secondary' : 'bg-gray-300'}`}
                                            />
                                        </div>
                                        <p class="text-xs text-text-secondary mt-0.5">
                                            {item.userName}
                                        </p>
                                        <p class="text-xs mt-1.5 text-text/80">
                                            {item.description}
                                        </p>
                                        <div class="flex gap-1.5 mt-2">
                                            {item.tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    class="text-[10px] bg-surface-dim px-2 py-0.5 rounded-full flex items-center gap-0.5"
                                                >
                                                    <Tag size={8} />
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showAdd && (
                <AddItemModal
                    onClose={() => setShowAdd(false)}
                    onAdd={(item) => {
                        setItems((prev) => [...prev, item]);
                        setShowAdd(false);
                    }}
                />
            )}
        </AppLayout>
    );
}

function AddItemModal({
    onClose,
    onAdd,
}: {
    onClose: () => void;
    onAdd: (item: LibraryItem) => void;
}) {
    const [type, setType] = useState<'item' | 'skill'>('item');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSubmitting(true);
        const item = await postLibraryItem({
            userId: 'me',
            userName: 'Alex Rivera',
            type,
            title: title.trim(),
            description: description.trim(),
            tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            available: true,
        });
        onAdd(item);
        setSubmitting(false);
    };

    return (
        <div
            class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
        >
            <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 animate-fade-up shadow-2xl">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-lg font-bold">Add to Library</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        class="p-1 rounded-full hover:bg-surface-dim"
                    >
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} class="space-y-3">
                    <div class="flex gap-2">
                        {(['item', 'skill'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setType(t)}
                                class={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                                    type === t
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border text-text-secondary'
                                }`}
                            >
                                {t === 'item' ? '📦 Item' : '🛠️ Skill'}
                            </button>
                        ))}
                    </div>
                    <input
                        value={title}
                        onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                        placeholder="Title"
                        class="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <textarea
                        value={description}
                        onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
                        placeholder="Description"
                        class="w-full border border-border rounded-xl px-3 py-2.5 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <input
                        value={tags}
                        onInput={(e) => setTags((e.target as HTMLInputElement).value)}
                        placeholder="Tags (comma-separated)"
                        class="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                        type="submit"
                        disabled={!title.trim() || submitting}
                        class="w-full bg-linear-to-r from-primary to-primary-dark text-white py-3 rounded-2xl font-semibold disabled:opacity-50 shadow-lg"
                    >
                        {submitting ? 'Adding…' : 'Add'}
                    </button>
                </form>
            </div>
        </div>
    );
}

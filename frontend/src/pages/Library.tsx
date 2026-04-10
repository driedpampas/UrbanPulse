import { Package, Plus, Search, Tag, Wrench, X } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { fetchLibrary, postLibraryItem } from '../lib/mockApi';
import type { LibraryItem } from '../lib/types';

const TAB_BTN = (active: boolean) => `
    font-size:12px;font-weight:600;padding:4px 12px;border-radius:6px;border:none;
    cursor:pointer;font-family:inherit;transition:all 0.15s;
    ${active
        ? 'background:var(--accent-subtle);color:var(--accent);'
        : 'background:transparent;color:var(--text-tertiary);'}
`;

export function Library() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'item' | 'skill'>('all');
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);

    useEffect(() => {
        fetchLibrary().then((data) => { setItems(data); setLoading(false); });
    }, []);

    const filtered = items.filter((i) => {
        if (filter !== 'all' && i.type !== filter) return false;
        if (search && !i.title.toLowerCase().includes(search.toLowerCase()) &&
            !i.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))) return false;
        return true;
    });

    return (
        <AppLayout
            title="Library"
            headerRight={
                <button
                    type="button"
                    id="add-library-btn"
                    class="btn-primary"
                    onClick={() => setShowAdd(true)}
                    style="height:30px;font-size:12px;"
                >
                    <Plus size={13} />Add
                </button>
            }
        >
            <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
                {/* Search */}
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);">
                    <Search size={14} style="color:var(--text-tertiary);flex-shrink:0;" />
                    <input
                        value={search}
                        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                        placeholder="Search items or skills…"
                        style="flex:1;background:transparent;border:none;outline:none;font-size:13px;color:var(--text);font-family:inherit;"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            class="btn-icon"
                            style="width:20px;height:20px;color:var(--text-tertiary);"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* Filter tabs */}
                <div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);align-self:flex-start;">
                    {(['all', 'item', 'skill'] as const).map((f) => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => setFilter(f)}
                            style={TAB_BTN(filter === f)}
                        >
                            {f === 'all' ? 'All' : f === 'item' ? '📦 Items' : '🛠️ Skills'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {loading ? (
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        {[1, 2, 3].map((i) => (
                            <div key={i} style="height:88px;border-radius:10px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div style="padding:48px 24px;text-align:center;border:1px solid var(--border);border-radius:10px;background:var(--surface);">
                        <Package size={28} style="color:var(--text-tertiary);margin:0 auto 8px;" />
                        <p style="font-size:13px;color:var(--text-secondary);margin:0;">
                            {search ? `No results for "${search}"` : 'No items yet'}
                        </p>
                    </div>
                ) : (
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        {filtered.map((item, i) => {
                            const isItem = item.type === 'item';
                            return (
                                <div
                                    key={item.id}
                                    class="card animate-slide-up"
                                    style={`padding:14px 16px;animation-delay:${i * 40}ms;`}
                                >
                                    <div style="display:flex;align-items:flex-start;gap:12px;">
                                        {/* Icon */}
                                        <div style={`width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${isItem ? 'var(--type-item-bg)' : 'var(--type-skill-bg)'};color:${isItem ? 'var(--type-item-text)' : 'var(--type-skill-text)'};`}>
                                            {isItem ? <Package size={16} /> : <Wrench size={16} />}
                                        </div>

                                        <div style="flex:1;min-width:0;">
                                            {/* Title row */}
                                            <div style="display:flex;align-items:center;gap:8px;">
                                                <span style="font-size:13px;font-weight:600;color:var(--text);">{item.title}</span>
                                                <span
                                                    title={item.available ? 'Available' : 'Unavailable'}
                                                    style={`width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${item.available ? 'var(--success)' : 'var(--text-tertiary)'};`}
                                                />
                                            </div>
                                            {/* Owner */}
                                            <p style="font-size:11px;color:var(--text-tertiary);margin:2px 0 6px;">{item.userName}</p>
                                            {/* Description */}
                                            <p style="font-size:12px;color:var(--text-secondary);margin:0 0 8px;line-height:1.5;">{item.description}</p>
                                            {/* Tags */}
                                            <div style="display:flex;flex-wrap:wrap;gap:4px;">
                                                {item.tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:500;padding:2px 7px;border-radius:4px;background:var(--bg-muted);color:var(--text-tertiary);"
                                                    >
                                                        <Tag size={8} />{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {showAdd && (
                <AddItemModal
                    onClose={() => setShowAdd(false)}
                    onAdd={(item) => { setItems((p) => [...p, item]); setShowAdd(false); }}
                />
            )}
        </AppLayout>
    );
}

function AddItemModal({ onClose, onAdd }: { onClose: () => void; onAdd: (item: LibraryItem) => void }) {
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
            userId: 'me', userName: 'Alex Rivera', type,
            title: title.trim(), description: description.trim(),
            tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
            available: true,
        });
        onAdd(item);
        setSubmitting(false);
    };

    const focusIn = (e: Event) => { const el = e.target as HTMLElement; el.style.borderColor = 'var(--border-focus)'; el.style.boxShadow = '0 0 0 3px var(--accent-muted)'; };
    const focusOut = (e: Event) => { const el = e.target as HTMLElement; el.style.borderColor = 'var(--border)'; el.style.boxShadow = 'none'; };
    const fieldStyle = 'width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;transition:border-color 0.15s,box-shadow 0.15s;';

    return (
        <div
            role="dialog"
            aria-modal="true"
            style="position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);"
        >
            <div style="position:absolute;inset:0;" onClick={onClose} aria-hidden="true" />
            <div
                class="animate-slide-up"
                style="position:relative;width:100%;max-width:680px;background:var(--surface);border:1px solid var(--border);border-bottom:none;border-radius:14px 14px 0 0;padding:20px 20px 32px;box-shadow:0 -8px 40px rgba(0,0,0,0.15);"
            >
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                    <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.01em;">Add to Library</p>
                    <button type="button" class="btn-icon" onClick={onClose} aria-label="Close" style="color:var(--text-secondary);">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} style="display:flex;flex-direction:column;gap:10px;">
                    {/* Type */}
                    <div style="display:flex;gap:6px;">
                        {(['item', 'skill'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setType(t)}
                                style={`flex:1;padding:7px;border-radius:8px;border:1px solid;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;${type === t ? 'background:var(--accent-subtle);color:var(--accent);border-color:var(--accent-muted);' : 'background:transparent;color:var(--text-secondary);border-color:var(--border);'}`}
                            >
                                {t === 'item' ? '📦 Item' : '🛠️ Skill'}
                            </button>
                        ))}
                    </div>
                    <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="Title" style={fieldStyle} onFocus={focusIn} onBlur={focusOut} />
                    <textarea value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} placeholder="Description" style={`${fieldStyle}height:80px;resize:none;`} onFocus={focusIn} onBlur={focusOut} />
                    <input value={tags} onInput={(e) => setTags((e.target as HTMLInputElement).value)} placeholder="Tags, comma-separated" style={fieldStyle} onFocus={focusIn} onBlur={focusOut} />
                    <button
                        type="submit"
                        disabled={!title.trim() || submitting}
                        class="btn-primary"
                        style="height:40px;background:var(--accent);border-radius:8px;width:100%;margin-top:2px;font-size:13px;opacity:1;"
                    >
                        {submitting ? 'Adding…' : 'Add to Library'}
                    </button>
                </form>
            </div>
        </div>
    );
}

import { Package, Plus, X } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { LibraryFilterTabs } from '../components/Library/LibraryFilterTabs';
import { LibraryItemsList } from '../components/Library/LibraryItemsList';
import { LibrarySearchBar } from '../components/Library/LibrarySearchBar';
import { HoverButton } from '../components/ui/HoverButton';
import { useLibraryData } from '../hooks/useLibraryData';
import type { LibraryItem } from '../types';

export function Library() {
    const {
        loading,
        filter,
        setFilter,
        search,
        setSearch,
        showAdd,
        setShowAdd,
        editingItem,
        setEditingItem,
        deletingItem,
        setDeletingItem,
        actionError,
        setActionError,
        busyItemId,
        filteredItems,
        canManageItem,
        createItem,
        saveItemUpdates,
        removeItem,
    } = useLibraryData();

    return (
        <AppLayout title="Library">
            <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
                {actionError && (
                    <div style="padding:10px 12px;border-radius:10px;border:1px solid var(--danger-muted);background:var(--danger-subtle);color:var(--danger);font-size:12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
                        <span>{actionError}</span>
                        <HoverButton
                            type="button"
                            class="btn-icon"
                            onClick={() => setActionError(null)}
                            aria-label="Dismiss error"
                            style="width:20px;height:20px;color:var(--danger);"
                            onMouseEnter={(e) =>
                                ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                            }
                            onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                        >
                            <X size={12} />
                        </HoverButton>
                    </div>
                )}

                <LibrarySearchBar
                    search={search}
                    onSearchChange={setSearch}
                    onClear={() => setSearch('')}
                />
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <LibraryFilterTabs filter={filter} onFilterChange={setFilter} />
                    <HoverButton
                        type="button"
                        id="add-library-btn"
                        class="btn-primary"
                        onClick={() => setShowAdd(true)}
                        style="height:34px;padding:0 12px;font-size:12px;background:var(--accent);display:flex;align-items:center;gap:6px;"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <Plus size={14} />
                        Add
                    </HoverButton>
                </div>
                {loading ? (
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                style="height:88px;border-radius:10px;background:var(--bg-muted);animation:pulse 1.5s ease-in-out infinite;"
                            />
                        ))}
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div style="padding:48px 24px;text-align:center;border:1px solid var(--border);border-radius:10px;background:var(--surface);">
                        <Package size={28} style="color:var(--text-tertiary);margin:0 auto 8px;" />
                        <p style="font-size:13px;color:var(--text-secondary);margin:0;">
                            {search ? `No results for "${search}"` : 'No items yet'}
                        </p>
                    </div>
                ) : (
                    <LibraryItemsList
                        items={filteredItems}
                        canManageItem={canManageItem}
                        onEdit={(item) => {
                            setActionError(null);
                            setEditingItem(item);
                        }}
                        onDelete={(item) => {
                            setActionError(null);
                            setDeletingItem(item);
                        }}
                    />
                )}
            </div>

            {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdd={createItem} />}

            {editingItem && (
                <EditItemModal
                    item={editingItem}
                    onClose={() => setEditingItem(null)}
                    onSave={(updates) => saveItemUpdates(editingItem.id, updates)}
                    busy={busyItemId === editingItem.id}
                />
            )}

            {deletingItem && (
                <DeleteItemModal
                    item={deletingItem}
                    onClose={() => setDeletingItem(null)}
                    onDelete={() => removeItem(deletingItem.id)}
                    busy={busyItemId === deletingItem.id}
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
    onAdd: (input: {
        type: 'item' | 'skill';
        title: string;
        description: string;
        tags: string[];
    }) => void | Promise<void>;
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
        await onAdd({
            type,
            title: title.trim(),
            description: description.trim(),
            tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
        });
        setSubmitting(false);
    };

    const focusIn = (e: Event) => {
        const el = e.target as HTMLElement;
        el.style.borderColor = 'var(--border-focus)';
        el.style.boxShadow = '0 0 0 3px var(--accent-muted)';
    };
    const focusOut = (e: Event) => {
        const el = e.target as HTMLElement;
        el.style.borderColor = 'var(--border)';
        el.style.boxShadow = 'none';
    };
    const fieldStyle =
        'width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;transition:border-color 0.15s,box-shadow 0.15s;';

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
                    <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.01em;">
                        Add to Library
                    </p>
                    <HoverButton
                        type="button"
                        class="btn-icon"
                        onClick={onClose}
                        aria-label="Close"
                        style="color:var(--text-secondary);"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <X size={16} />
                    </HoverButton>
                </div>
                <form onSubmit={handleSubmit} style="display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;gap:6px;">
                        {(['item', 'skill'] as const).map((t) => (
                            <HoverButton
                                key={t}
                                type="button"
                                onClick={() => setType(t)}
                                style={`flex:1;padding:7px;border-radius:8px;border:1px solid;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;${type === t ? 'background:var(--accent-subtle);color:var(--accent);border-color:var(--accent-muted);' : 'background:transparent;color:var(--text-secondary);border-color:var(--border);'}`}
                                onMouseEnter={(e) => {
                                    (e.target as HTMLElement).style.filter =
                                        'var(--hover-brightness)';
                                    (e.target as HTMLElement).style.background = 'var(--bg-muted)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.target as HTMLElement).style.filter = 'none';
                                    (e.target as HTMLElement).style.background = 'transparent';
                                }}
                            >
                                {t === 'item' ? '📦 Item' : '🛠️ Skill'}
                            </HoverButton>
                        ))}
                    </div>
                    <input
                        value={title}
                        onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                        placeholder="Title"
                        style={fieldStyle}
                        onFocus={focusIn}
                        onBlur={focusOut}
                    />
                    <textarea
                        value={description}
                        onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
                        placeholder="Description"
                        style={`${fieldStyle}height:80px;resize:none;`}
                        onFocus={focusIn}
                        onBlur={focusOut}
                    />
                    <input
                        value={tags}
                        onInput={(e) => setTags((e.target as HTMLInputElement).value)}
                        placeholder="Tags, comma-separated"
                        style={fieldStyle}
                        onFocus={focusIn}
                        onBlur={focusOut}
                    />
                    <HoverButton
                        type="submit"
                        disabled={!title.trim() || submitting}
                        class="btn-primary"
                        style="height:40px;background:var(--accent);border-radius:8px;width:100%;margin-top:2px;font-size:13px;opacity:1;"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        {submitting ? 'Adding…' : 'Add to Library'}
                    </HoverButton>
                </form>
            </div>
        </div>
    );
}

function EditItemModal({
    item,
    onClose,
    onSave,
    busy,
}: {
    item: LibraryItem;
    onClose: () => void;
    onSave: (updates: {
        title: string;
        description: string;
        tags: string[];
        isAvailable: boolean;
    }) => Promise<void>;
    busy: boolean;
}) {
    const [title, setTitle] = useState(item.title);
    const [description, setDescription] = useState(item.description);
    const [tags, setTags] = useState(item.tags.join(', '));
    const [isAvailable, setIsAvailable] = useState(item.available);
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        const nextTitle = title.trim();
        if (!nextTitle) {
            setLocalError('Title is required.');
            return;
        }

        setLocalError(null);
        await onSave({
            title: nextTitle,
            description: description.trim(),
            tags: tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            isAvailable,
        });
    };

    const focusIn = (e: Event) => {
        const el = e.target as HTMLElement;
        el.style.borderColor = 'var(--border-focus)';
        el.style.boxShadow = '0 0 0 3px var(--accent-muted)';
    };
    const focusOut = (e: Event) => {
        const el = e.target as HTMLElement;
        el.style.borderColor = 'var(--border)';
        el.style.boxShadow = 'none';
    };
    const fieldStyle =
        'width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text);font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;transition:border-color 0.15s,box-shadow 0.15s;';

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
                    <div style="display:flex;flex-direction:column;gap:2px;">
                        <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.01em;">
                            Edit Library Item
                        </p>
                        <p style="font-size:11px;color:var(--text-tertiary);margin:0;">
                            Type stays {item.type}.
                        </p>
                    </div>
                    <HoverButton
                        type="button"
                        class="btn-icon"
                        onClick={onClose}
                        aria-label="Close"
                        style="color:var(--text-secondary);"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <X size={16} />
                    </HoverButton>
                </div>
                <form onSubmit={handleSubmit} style="display:flex;flex-direction:column;gap:10px;">
                    <input
                        value={title}
                        onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                        placeholder="Title"
                        style={fieldStyle}
                        onFocus={focusIn}
                        onBlur={focusOut}
                    />
                    <textarea
                        value={description}
                        onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
                        placeholder="Description"
                        style={`${fieldStyle}height:80px;resize:none;`}
                        onFocus={focusIn}
                        onBlur={focusOut}
                    />
                    <input
                        value={tags}
                        onInput={(e) => setTags((e.target as HTMLInputElement).value)}
                        placeholder="Tags, comma-separated"
                        style={fieldStyle}
                        onFocus={focusIn}
                        onBlur={focusOut}
                    />
                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);">
                        <input
                            type="checkbox"
                            checked={isAvailable}
                            onChange={(e) => setIsAvailable((e.target as HTMLInputElement).checked)}
                        />
                        Available
                    </label>
                    {localError && (
                        <p style="margin:0;font-size:12px;color:var(--danger);">{localError}</p>
                    )}
                    <HoverButton
                        type="submit"
                        disabled={!title.trim() || busy}
                        class="btn-primary"
                        style="height:40px;background:var(--accent);border-radius:8px;width:100%;margin-top:2px;font-size:13px;opacity:1;"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        {busy ? 'Saving…' : 'Save changes'}
                    </HoverButton>
                </form>
            </div>
        </div>
    );
}

function DeleteItemModal({
    item,
    onClose,
    onDelete,
    busy,
}: {
    item: LibraryItem;
    onClose: () => void;
    onDelete: () => Promise<void>;
    busy: boolean;
}) {
    return (
        <div
            role="dialog"
            aria-modal="true"
            style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);padding:16px;"
        >
            <div style="position:absolute;inset:0;" onClick={onClose} aria-hidden="true" />
            <div
                class="animate-slide-up"
                style="position:relative;width:100%;max-width:420px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 18px 20px;box-shadow:var(--shadow-lg);"
            >
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;">
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;">
                            Delete item?
                        </p>
                        <p style="font-size:12px;color:var(--text-secondary);margin:0;line-height:1.5;">
                            This will permanently remove <strong>{item.title}</strong> from the
                            library.
                        </p>
                    </div>
                    <HoverButton
                        type="button"
                        class="btn-icon"
                        onClick={onClose}
                        aria-label="Close"
                        style="color:var(--text-secondary);"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        <X size={16} />
                    </HoverButton>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <HoverButton
                        type="button"
                        class="btn-ghost"
                        onClick={onClose}
                        style="height:36px;padding:0 12px;font-size:12px;"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        Cancel
                    </HoverButton>
                    <HoverButton
                        type="button"
                        class="btn-primary"
                        onClick={onDelete}
                        disabled={busy}
                        style="height:36px;padding:0 12px;font-size:12px;background:var(--danger);"
                        onMouseEnter={(e) =>
                            ((e.target as HTMLElement).style.filter = 'var(--hover-brightness)')
                        }
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.filter = 'none')}
                    >
                        {busy ? 'Deleting…' : 'Delete'}
                    </HoverButton>
                </div>
            </div>
        </div>
    );
}

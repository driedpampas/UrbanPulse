import { Package, Pencil, Tag, Trash2, Wrench } from 'lucide-preact';
import { memo } from 'preact/compat';
import type { LibraryItem } from '../../types';
import { HoverButton } from '../ui/HoverButton';

type Props = {
    items: LibraryItem[];
    canManageItem: (item: LibraryItem) => boolean;
    onEdit: (item: LibraryItem) => void;
    onDelete: (item: LibraryItem) => void;
};

function LibraryItemsListComponent({ items, canManageItem, onEdit, onDelete }: Props) {
    return (
        <div id="library-items-list" style="display:flex;flex-direction:column;gap:8px;">
            {items.map((item, index) => {
                const isItem = item.type === 'item';
                const canManage = canManageItem(item);
                return (
                    <div
                        key={item.id}
                        class="card animate-slide-up"
                        style={`padding:14px 16px;animation-delay:${index * 40}ms;`}
                    >
                        <div style="display:flex;align-items:flex-start;gap:12px;">
                            <div
                                style={`width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${isItem ? 'var(--type-item-bg)' : 'var(--type-skill-bg)'};color:${isItem ? 'var(--type-item-text)' : 'var(--type-skill-text)'};`}
                            >
                                {isItem ? <Package size={16} /> : <Wrench size={16} />}
                            </div>

                            <div style="flex:1;min-width:0;">
                                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
                                    <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                                        <span style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                            {item.title}
                                        </span>
                                        <span
                                            title={item.available ? 'Available' : 'Unavailable'}
                                            style={`width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${item.available ? 'var(--success)' : 'var(--text-tertiary)'};`}
                                        />
                                    </div>
                                    {canManage && (
                                        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                                            <HoverButton
                                                type="button"
                                                class="btn-ghost"
                                                onClick={() => onEdit(item)}
                                                style="height:26px;padding:0 9px;font-size:11px;gap:4px;"
                                            >
                                                <Pencil size={11} />
                                                Edit
                                            </HoverButton>
                                            <HoverButton
                                                type="button"
                                                class="btn-ghost"
                                                onClick={() => onDelete(item)}
                                                style="height:26px;padding:0 9px;font-size:11px;gap:4px;color:var(--danger);border-color:var(--danger-muted);"
                                            >
                                                <Trash2 size={11} />
                                                Delete
                                            </HoverButton>
                                        </div>
                                    )}
                                </div>
                                <p style="font-size:11px;color:var(--text-tertiary);margin:2px 0 6px;">
                                    {item.userName}
                                </p>
                                <p style="font-size:12px;color:var(--text-secondary);margin:0 0 8px;line-height:1.5;">
                                    {item.description}
                                </p>
                                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                                    {(Array.isArray(item.tags) ? item.tags : []).map((tag) => (
                                        <span
                                            key={tag}
                                            style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:500;padding:2px 7px;border-radius:4px;background:var(--bg-muted);color:var(--text-tertiary);"
                                        >
                                            <Tag size={8} />
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export const LibraryItemsList = memo(LibraryItemsListComponent);

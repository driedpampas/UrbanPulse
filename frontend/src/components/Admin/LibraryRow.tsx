import { memo } from 'preact/compat';
import type { LibraryItem } from '../../types';
import { HoverButton } from '../ui/HoverButton';

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

type Props = {
    item: LibraryItem;
    busy?: boolean;
    onEdit?: (item: LibraryItem) => void | Promise<void>;
    onDelete?: (item: LibraryItem) => void | Promise<void>;
};

function LibraryRowComponent({ item, busy = false, onEdit, onDelete }: Props) {
    return (
        <div
            style={`${surfaceCard};padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;`}
        >
            <div style="min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--bg-muted);color:var(--text-tertiary);text-transform:uppercase;">
                        {item.type}
                    </span>
                    <span
                        style={`font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:${item.available ? 'var(--success-subtle)' : 'var(--bg-muted)'};color:${item.available ? 'var(--success)' : 'var(--text-tertiary)'};`}
                    >
                        {item.available ? 'Available' : 'Hidden'}
                    </span>
                </div>
                <h3 style="margin:8px 0 4px;font-size:14px;font-weight:700;color:var(--text);">
                    {item.title}
                </h3>
                <p style="margin:0;font-size:12px;color:var(--text-secondary);">{item.userName}</p>
                <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">
                    {item.tags.map((tag) => (
                        <span
                            key={tag}
                            style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:500;padding:2px 7px;border-radius:4px;background:var(--bg-muted);color:var(--text-tertiary);"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;max-width:18rem;">
                <p style="margin:0;font-size:12px;color:var(--text-secondary);text-align:right;">
                    {item.description}
                </p>
                {(onEdit || onDelete) && (
                    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                        {onEdit && (
                            <HoverButton
                                type="button"
                                disabled={busy}
                                onClick={() => onEdit(item)}
                                style="padding:6px 10px;border-radius:8px;border:none;background:var(--accent-subtle);color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;"
                            >
                                Edit
                            </HoverButton>
                        )}
                        {onDelete && (
                            <HoverButton
                                type="button"
                                disabled={busy}
                                onClick={() => onDelete(item)}
                                style="padding:6px 10px;border-radius:8px;border:none;background:var(--danger-subtle);color:var(--danger);font-size:11px;font-weight:700;cursor:pointer;"
                            >
                                Delete
                            </HoverButton>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export const LibraryRow = memo(LibraryRowComponent);

import { memo } from 'preact/compat';
import type { LibraryItem } from '../../types';

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

type Props = {
    item: LibraryItem;
};

function LibraryRowComponent({ item }: Props) {
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
            </div>
            <div style="text-align:right;flex-shrink:0;max-width:18rem;">
                <p style="margin:0;font-size:12px;color:var(--text-secondary);">
                    {item.description}
                </p>
            </div>
        </div>
    );
}

export const LibraryRow = memo(LibraryRowComponent);

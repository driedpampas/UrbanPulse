import { memo } from 'preact/compat';
import { HoverButton } from '../ui/HoverButton';

type LibraryFilter = 'all' | 'item' | 'skill';

type Props = {
    filter: LibraryFilter;
    onFilterChange: (value: LibraryFilter) => void;
};

const TAB_BTN = (active: boolean) => `
    font-size:12px;font-weight:600;padding:4px 12px;border-radius:6px;border:none;
    cursor:pointer;font-family:inherit;transition:all 0.15s;
    ${
        active
            ? 'background:var(--accent-subtle);color:var(--accent);'
            : 'background:transparent;color:var(--text-tertiary);'
    }
`;

function LibraryFilterTabsComponent({ filter, onFilterChange }: Props) {
    return (
        <div style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);align-self:flex-start;">
            {(['all', 'item', 'skill'] as const).map((tab) => (
                <HoverButton
                    key={tab}
                    type="button"
                    onClick={() => onFilterChange(tab)}
                    style={TAB_BTN(filter === tab)}
                >
                    {tab === 'all' ? 'All' : tab === 'item' ? '📦 Items' : '🛠️ Skills'}
                </HoverButton>
            ))}
        </div>
    );
}

export const LibraryFilterTabs = memo(LibraryFilterTabsComponent);

import { Search, X } from 'lucide-preact';
import { memo } from 'preact/compat';
import { HoverButton } from '../ui/HoverButton';

type Props = {
    search: string;
    onSearchChange: (value: string) => void;
    onClear: () => void;
};

function LibrarySearchBarComponent({ search, onSearchChange, onClear }: Props) {
    return (
        <div id="library-search-bar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);">
            <Search size={14} style="color:var(--text-tertiary);flex-shrink:0;" />
            <input
                value={search}
                onInput={(event) => onSearchChange((event.target as HTMLInputElement).value)}
                placeholder="Search items or skills…"
                style="flex:1;background:transparent;border:none;outline:none;font-size:13px;color:var(--text);font-family:inherit;"
            />
            {search && (
                <HoverButton
                    type="button"
                    onClick={onClear}
                    class="btn-icon"
                    style="width:20px;height:20px;color:var(--text-tertiary);"
                >
                    <X size={12} />
                </HoverButton>
            )}
        </div>
    );
}

export const LibrarySearchBar = memo(LibrarySearchBarComponent);

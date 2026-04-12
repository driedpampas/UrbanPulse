import type { ComponentType } from 'preact';
import { memo } from 'preact/compat';
import { HoverButton } from '../ui/HoverButton';

type Props = {
    active: boolean;
    label: string;
    icon: ComponentType<{ size?: number | string }>;
    onClick: () => void;
};

function SectionButtonComponent({ active, label, icon: Icon, onClick }: Props) {
    return (
        <HoverButton
            type="button"
            onClick={onClick}
            style={`display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border-radius:12px;border:1px solid ${active ? 'var(--border-strong)' : 'var(--border)'};background:${active ? 'var(--surface-raised)' : 'var(--bg-subtle)'};color:${active ? 'var(--text)' : 'var(--text-tertiary)'};font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s ease;flex-shrink:0;white-space:nowrap;`}
        >
            <Icon size={13} />
            {label}
        </HoverButton>
    );
}

export const SectionButton = memo(SectionButtonComponent);

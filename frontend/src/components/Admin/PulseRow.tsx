import { memo, useState } from 'preact/compat';
import type { Pulse } from '../../types';
import { HoverButton } from '../ui/HoverButton';

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

type Props = {
    pulse: Pulse;
    onDelete: (pulseId: string) => void | Promise<void>;
};

function PulseRowComponent({ pulse, onDelete }: Props) {
    const [busy, setBusy] = useState(false);

    const handleDelete = async () => {
        setBusy(true);
        try {
            await onDelete(pulse.id);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            style={`${surfaceCard};padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;`}
        >
            <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--bg-muted);color:var(--text-tertiary);text-transform:uppercase;">
                        {pulse.type}
                    </span>
                    <span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--accent-subtle);color:var(--accent);text-transform:uppercase;">
                        {pulse.userName}
                    </span>
                </div>
                <p style="margin:8px 0 0;font-size:13px;color:var(--text);line-height:1.45;">
                    {pulse.content}
                </p>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--text-tertiary);">
                    <span>{new Date(pulse.timestamp).toLocaleString()}</span>
                    <span>ID: {pulse.id}</span>
                </div>
            </div>
            <HoverButton
                type="button"
                disabled={busy}
                onClick={() => void handleDelete()}
                style="padding:6px 10px;border-radius:8px;border:none;background:var(--danger-subtle);color:var(--danger);font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;"
            >
                Delete
            </HoverButton>
        </div>
    );
}

export const PulseRow = memo(PulseRowComponent);

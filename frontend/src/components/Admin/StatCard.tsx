import { memo } from 'preact/compat';

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

type Props = {
    label: string;
    value: string | number;
    hint?: string;
};

function StatCardComponent({ label, value, hint }: Props) {
    return (
        <div style={`${surfaceCard};padding:18px;display:flex;flex-direction:column;gap:8px;`}>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-tertiary);">
                {label}
            </span>
            <span style="font-size:24px;font-weight:700;color:var(--text);line-height:1;">
                {value}
            </span>
            {hint && <span style="font-size:12px;color:var(--text-secondary);">{hint}</span>}
        </div>
    );
}

export const StatCard = memo(StatCardComponent);

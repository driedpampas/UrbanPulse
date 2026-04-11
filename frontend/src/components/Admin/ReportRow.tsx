import { memo, useState } from 'preact/compat';
import type { AdminFlag } from '../../types';
import { HoverButton } from '../ui/HoverButton';

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

type Props = {
    report: AdminFlag;
    onUpdate: (id: string, status: 'resolved' | 'dismissed') => Promise<void>;
};

function ReportRowComponent({ report, onUpdate }: Props) {
    const [updating, setUpdating] = useState(false);

    const handleAction = async (status: 'resolved' | 'dismissed') => {
        setUpdating(true);
        try {
            await onUpdate(report.id, status);
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div
            style={`${surfaceCard};padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;opacity:${report.status === 'pending' ? 1 : 0.6};`}
        >
            <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span
                        style={`font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:${report.status === 'pending' ? 'var(--warning-subtle)' : 'var(--bg-muted)'};color:${report.status === 'pending' ? 'var(--warning)' : 'var(--text-tertiary)'};text-transform:uppercase;`}
                    >
                        {report.status}
                    </span>
                    <span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--bg-muted);color:var(--text-tertiary);text-transform:uppercase;">
                        {report.targetType}
                    </span>
                </div>
                <h3 style="margin:8px 0 4px;font-size:14px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px;">
                    {report.reason}
                </h3>
                <p style="margin:0;font-size:12px;color:var(--text-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;">
                    "{report.content}"
                </p>
                <div style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-tertiary);">
                    <span>{new Date(report.timestamp).toLocaleString()}</span>
                    <span>•</span>
                    <span>ID: {report.targetId.slice(0, 8)}...</span>
                </div>
            </div>

            {report.status === 'pending' && (
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <HoverButton
                        type="button"
                        disabled={updating}
                        onClick={() => void handleAction('resolved')}
                        style="padding:6px 10px;border-radius:8px;border:none;background:var(--success-subtle);color:var(--success);font-size:11px;font-weight:700;cursor:pointer;"
                    >
                        Resolve
                    </HoverButton>
                    <HoverButton
                        type="button"
                        disabled={updating}
                        onClick={() => void handleAction('dismissed')}
                        style="padding:6px 10px;border-radius:8px;border:none;background:var(--bg-muted);color:var(--text-tertiary);font-size:11px;font-weight:700;cursor:pointer;"
                    >
                        Dismiss
                    </HoverButton>
                </div>
            )}
        </div>
    );
}

export const ReportRow = memo(ReportRowComponent);

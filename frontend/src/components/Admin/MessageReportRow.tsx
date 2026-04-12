import { memo, useState } from 'preact/compat';
import type { AdminMessageReport, MessageReportAction } from '../../types';
import { HoverButton } from '../ui/HoverButton';

const surfaceCard =
    'border:1px solid var(--border);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm);';

type Props = {
    report: AdminMessageReport;
    onAction: (reportId: string, action: MessageReportAction) => void | Promise<void>;
};

function MessageReportRowComponent({ report, onAction }: Props) {
    const [busyAction, setBusyAction] = useState<MessageReportAction | null>(null);

    const handleAction = async (action: MessageReportAction) => {
        setBusyAction(action);
        try {
            await onAction(report.id, action);
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <div
            style={`${surfaceCard};padding:14px 16px;display:flex;flex-direction:column;gap:12px;opacity:${report.status === 'pending' ? 1 : 0.7};`}
        >
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span
                    style={`font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:${report.status === 'pending' ? 'var(--warning-subtle)' : report.status === 'action_taken' ? 'var(--danger-subtle)' : 'var(--bg-muted)'};color:${report.status === 'pending' ? 'var(--warning)' : report.status === 'action_taken' ? 'var(--danger)' : 'var(--text-tertiary)'};text-transform:uppercase;`}
                >
                    {report.status.replace('_', ' ')}
                </span>
                <span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--bg-muted);color:var(--text-tertiary);text-transform:uppercase;">
                    message
                </span>
                <span style="font-size:11px;color:var(--text-tertiary);">
                    {new Date(report.timestamp).toLocaleString()}
                </span>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">
                <div style="padding:8px 10px;border-radius:10px;background:var(--bg-subtle);border:1px solid var(--border);">
                    <p style="margin:0;font-size:10px;font-weight:800;color:var(--text-tertiary);text-transform:uppercase;">
                        Reporter
                    </p>
                    <p style="margin:4px 0 0;font-size:12px;font-weight:700;color:var(--text);">
                        {report.reporter.name}
                    </p>
                </div>
                <div style="padding:8px 10px;border-radius:10px;background:var(--bg-subtle);border:1px solid var(--border);">
                    <p style="margin:0;font-size:10px;font-weight:800;color:var(--text-tertiary);text-transform:uppercase;">
                        Offender
                    </p>
                    <p style="margin:4px 0 0;font-size:12px;font-weight:700;color:var(--text);">
                        {report.offender.name}
                    </p>
                </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;">
                <p style="margin:0;font-size:12px;font-weight:700;color:var(--text-secondary);">Reason</p>
                <p style="margin:0;font-size:13px;color:var(--text);">{report.reason}</p>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;">
                <p style="margin:0;font-size:12px;font-weight:700;color:var(--text-secondary);">
                    Flagged Message
                </p>
                <p style="margin:0;font-size:13px;color:var(--text-secondary);line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;">
                    "{report.messageContent}"
                </p>
            </div>

            {report.status === 'pending' && (
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <HoverButton
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => void handleAction('delete_message')}
                        style="height:32px;padding:0 10px;border-radius:8px;border:none;background:var(--danger-subtle);color:var(--danger);font-size:11px;font-weight:700;cursor:pointer;"
                    >
                        {busyAction === 'delete_message' ? 'Deleting...' : 'Delete Message'}
                    </HoverButton>
                    <HoverButton
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => void handleAction('ban_user')}
                        style="height:32px;padding:0 10px;border-radius:8px;border:none;background:var(--warning-subtle);color:var(--warning);font-size:11px;font-weight:700;cursor:pointer;"
                    >
                        {busyAction === 'ban_user' ? 'Banning...' : 'Ban Offender'}
                    </HoverButton>
                    <HoverButton
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => void handleAction('dismiss')}
                        style="height:32px;padding:0 10px;border-radius:8px;border:none;background:var(--bg-muted);color:var(--text-tertiary);font-size:11px;font-weight:700;cursor:pointer;"
                    >
                        {busyAction === 'dismiss' ? 'Dismissing...' : 'Dismiss'}
                    </HoverButton>
                </div>
            )}
        </div>
    );
}

export const MessageReportRow = memo(MessageReportRowComponent);

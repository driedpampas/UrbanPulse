import type { ComponentChildren } from 'preact';
import { HoverButton } from './HoverButton';

type Props = {
    open: boolean;
    title: string;
    message: ComponentChildren;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    busy?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
};

export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    busy = false,
    onConfirm,
    onCancel,
}: Props) {
    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style="position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);padding:16px;"
        >
            <div style="position:absolute;inset:0;" onClick={onCancel} aria-hidden="true" />
            <div
                class="animate-scale-in"
                style="position:relative;width:100%;max-width:420px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:14px;"
            >
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text);">
                        {title}
                    </h3>
                    <div style="font-size:13px;color:var(--text-secondary);line-height:1.55;">
                        {message}
                    </div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
                    <HoverButton
                        type="button"
                        class="btn-ghost"
                        onClick={onCancel}
                        style="height:36px;padding:0 12px;font-size:12px;"
                    >
                        {cancelLabel}
                    </HoverButton>
                    <HoverButton
                        type="button"
                        class="btn-primary"
                        disabled={busy}
                        onClick={() => void onConfirm()}
                        style={`height:36px;padding:0 12px;font-size:12px;${destructive ? 'background:var(--danger);' : ''}`}
                    >
                        {busy ? 'Working…' : confirmLabel}
                    </HoverButton>
                </div>
            </div>
        </div>
    );
}

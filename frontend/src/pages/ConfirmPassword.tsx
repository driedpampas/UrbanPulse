import { AlertTriangle, CheckCircle2, KeyRound } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { HoverButton } from '../components/ui/HoverButton';
import { useAuth } from '../lib/auth';
import { confirmPasswordChange } from '../lib/settingsApi';

type ConfirmState = 'idle' | 'success' | 'error';

export function ConfirmPassword() {
    const { isAuthenticated } = useAuth();
    const [, setLocation] = useLocation();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [state, setState] = useState<ConfirmState>('idle');
    const [message, setMessage] = useState('Set your new password to complete this request.');

    const token = useMemo(() => {
        if (typeof window === 'undefined') {
            return '';
        }

        return new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
    }, []);

    const handleSubmit = async (event: Event) => {
        event.preventDefault();

        if (!token) {
            setState('error');
            setMessage('Password reset token is missing from the link.');
            return;
        }

        if (password.length < 8) {
            setState('error');
            setMessage('Password must contain at least 8 characters.');
            return;
        }

        if (password !== confirmPassword) {
            setState('error');
            setMessage('Passwords do not match.');
            return;
        }

        setSubmitting(true);
        setState('idle');
        setMessage('Confirming your password change…');

        try {
            const response = await confirmPasswordChange(token, password);
            setState('success');
            setMessage(response.message || 'Password updated successfully.');
            setPassword('');
            setConfirmPassword('');
        } catch (error) {
            setState('error');
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Unable to confirm password change. Please request a new link.'
            );
        } finally {
            setSubmitting(false);
        }
    };

    const nextPath = isAuthenticated ? '/settings' : '/auth';

    return (
        <div class="min-h-[100dvh] bg-[var(--bg)] px-4 py-10">
            <div class="mx-auto w-full max-w-xl">
                <div class="mb-6 text-center">
                    <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                        UrbanPulse Security
                    </p>
                    <h1 class="mt-2 text-2xl font-bold tracking-[-0.03em] text-[var(--text)]">
                        Confirm Password Change
                    </h1>
                </div>

                <div class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-lg)] sm:p-6">
                    <div class="mb-4 flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                        <div class="rounded-full bg-[var(--accent-muted)] p-2">
                            <KeyRound class="h-4 w-4 text-[var(--accent)]" />
                        </div>
                        <p class="text-sm leading-6 text-[var(--text-secondary)]">{message}</p>
                    </div>

                    {state === 'success' && (
                        <div class="mb-4 flex items-center gap-2 rounded-xl border border-[var(--success)]/30 bg-[var(--success-subtle)] px-3 py-2 text-xs font-semibold text-[var(--success)]">
                            <CheckCircle2 class="h-4 w-4" />
                            Password changed successfully.
                        </div>
                    )}

                    {state === 'error' && (
                        <div class="mb-4 flex items-center gap-2 rounded-xl border border-[var(--danger-muted)] bg-[var(--danger-subtle)] px-3 py-2 text-xs font-semibold text-[var(--danger)]">
                            <AlertTriangle class="h-4 w-4" />
                            Unable to complete password update.
                        </div>
                    )}

                    <form class="space-y-3" onSubmit={handleSubmit}>
                        <div>
                            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                                New password
                            </label>
                            <input
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onInput={(event) =>
                                    setPassword((event.target as HTMLInputElement).value)
                                }
                                class="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--border-focus)]"
                                placeholder="Minimum 8 characters"
                            />
                        </div>

                        <div>
                            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                                Confirm new password
                            </label>
                            <input
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onInput={(event) =>
                                    setConfirmPassword((event.target as HTMLInputElement).value)
                                }
                                class="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--border-focus)]"
                                placeholder="Repeat new password"
                            />
                        </div>

                        <HoverButton
                            type="submit"
                            class="btn-primary"
                            disabled={submitting}
                            style="height:40px;width:100%;"
                        >
                            {submitting ? 'Applying password update…' : 'Confirm Password Update'}
                        </HoverButton>
                    </form>

                    <HoverButton
                        type="button"
                        class="btn-ghost"
                        onClick={() => setLocation(nextPath)}
                        style="margin-top:10px;height:40px;width:100%;"
                    >
                        Return to Account
                    </HoverButton>
                </div>
            </div>
        </div>
    );
}

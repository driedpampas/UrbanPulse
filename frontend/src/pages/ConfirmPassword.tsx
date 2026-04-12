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
        <div class="page-shell bg-[var(--bg)] px-4" style="justify-content: center;">
            <div class="app-container max-w-[440px] animate-slide-up">
                <div class="mb-8 text-center animate-slide-up">
                    <p class="label-caps !mb-1">UrbanPulse Security</p>
                    <h1 class="text-2xl font-bold tracking-tight text-[var(--text)]">
                        Confirm Password Change
                    </h1>
                </div>

                <div class="section animate-slide-up shadow-lg" style="animation-delay: 0.1s;">
                    <div class="section-header bg-[var(--bg-subtle)]">
                        <div class="stack-h gap-sm">
                            <KeyRound class="h-4 w-4 text-[var(--accent)]" />
                            <p class="text-sm font-semibold text-[var(--text)]">
                                Security Verification
                            </p>
                        </div>
                    </div>

                    <div class="section-body p-6">
                        <p class="text-sm leading-relaxed text-[var(--text-secondary)] mb-6">
                            {message}
                        </p>

                        {state === 'success' && (
                            <div class="stack-h gap-sm rounded-xl border border-[var(--success)]/30 bg-[var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[var(--success)] animate-fade-in mb-6">
                                <CheckCircle2 class="h-4 w-4" />
                                Password changed successfully.
                            </div>
                        )}

                        {state === 'error' && (
                            <div class="stack-h gap-sm rounded-xl border border-[var(--danger-muted)] bg-[var(--danger-subtle)] px-4 py-3 text-sm font-semibold text-[var(--danger)] animate-fade-in mb-6">
                                <AlertTriangle class="h-4 w-4" />
                                Unable to complete password update.
                            </div>
                        )}

                        <form class="stack-v gap-lg" onSubmit={handleSubmit}>
                            <div class="stack-v gap-sm">
                                <label class="label-caps">New password</label>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    value={password}
                                    onInput={(event) =>
                                        setPassword((event.target as HTMLInputElement).value)
                                    }
                                    class="input-field h-11"
                                    placeholder="Minimum 8 characters"
                                />
                            </div>

                            <div class="stack-v gap-sm">
                                <label class="label-caps">Confirm new password</label>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onInput={(event) =>
                                        setConfirmPassword((event.target as HTMLInputElement).value)
                                    }
                                    class="input-field h-11"
                                    placeholder="Repeat new password"
                                />
                            </div>

                            <div class="stack-v gap-md mt-2">
                                <HoverButton
                                    type="submit"
                                    class="btn-primary h-11 w-full"
                                    disabled={submitting}
                                >
                                    {submitting
                                        ? 'Applying password update…'
                                        : 'Confirm Password Update'}
                                </HoverButton>

                                <HoverButton
                                    type="button"
                                    class="btn-ghost h-11 w-full"
                                    onClick={() => setLocation(nextPath)}
                                >
                                    Return to Account
                                </HoverButton>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

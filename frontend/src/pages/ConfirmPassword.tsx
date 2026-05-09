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
        <div class="page-shell bg-(--bg) min-h-screen">
            {/* Header / Logo */}
            <div class="stack-h flex-between w-full app-container px-6 py-5">
                <div class="flex-1">
                    <p class="text-sm font-bold tracking-tight text-(--text)">UrbanPulse</p>
                </div>
                <div class="flex-1" />
            </div>

            <div class="flex-1 flex items-center justify-center p-5">
                <div class="w-full max-w-[400px] animate-slide-up">
                    <div class="mb-7 text-center stack-v gap-xs">
                        <p class="text-[11px] font-bold text-(--accent) uppercase tracking-widest">
                            Security
                        </p>
                        <h1 class="text-[32px] font-bold tracking-tight text-(--text)">
                            Reset Password
                        </h1>
                    </div>

                    <div
                        class="section animate-slide-up shadow-xl border-(--border)"
                        style="animation-delay: 0.1s;"
                    >
                        <div class="section-header bg-(--bg-subtle)/50 border-b border-(--border) h-10 px-4">
                            <div class="stack-h gap-sm">
                                <KeyRound class="h-3.5 w-3.5 text-(--accent)" />
                                <p class="text-[13px] font-semibold text-(--text)">
                                    Identity Verification
                                </p>
                            </div>
                        </div>

                        <div class="section-body p-6">
                            <p class="text-sm leading-relaxed text-(--text-secondary) mb-6">
                                {message}
                            </p>

                            {state === 'success' && (
                                <div class="stack-h gap-sm rounded-xl border border-(--success)/30 bg-(--success-subtle) px-4 py-3 text-sm font-semibold text-(--success) animate-fade-in mb-6">
                                    <CheckCircle2 class="h-4 w-4" />
                                    Password changed successfully.
                                </div>
                            )}

                            {state === 'error' && (
                                <div class="stack-h gap-sm rounded-xl border border-(--danger-muted) bg-(--danger-subtle) px-4 py-3 text-sm font-semibold text-(--danger) animate-fade-in mb-6">
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
                                            setConfirmPassword(
                                                (event.target as HTMLInputElement).value
                                            )
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
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Back Link */}
                <HoverButton
                    onClick={() => setLocation(nextPath)}
                    class="section bg-(--bg-subtle) p-3 mt-6 hover:bg-(--bg-muted) transition-all cursor-pointer border-none shadow-sm group"
                >
                    <div class="flex-between w-full px-1">
                        <span class="text-sm text-(--text-secondary)">Changed your mind?</span>
                        <span class="text-sm font-bold text-(--accent) group-hover:-translate-x-1 transition-transform">
                            ← Back to Account
                        </span>
                    </div>
                </HoverButton>
            </div>
        </div>
    );
}

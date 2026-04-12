import { KeyRound, Mail, ShieldCheck } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AppLayout } from '../components/Layout/AppLayout';
import { HoverButton } from '../components/ui/HoverButton';
import { useAuth } from '../lib/auth';
import { requestPasswordChangeLink, updateEmailAddress } from '../lib/settingsApi';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Settings() {
    const { session, updateLocalUser } = useAuth();
    const [email, setEmail] = useState(session?.user.email ?? '');
    const [emailSubmitting, setEmailSubmitting] = useState(false);
    const [passwordSubmitting, setPasswordSubmitting] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

    useEffect(() => {
        setEmail(session?.user.email ?? '');
    }, [session?.user.email]);

    const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

    const handleEmailUpdate = async (event: Event) => {
        event.preventDefault();
        setEmailError(null);
        setEmailSuccess(null);

        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            setEmailError('Enter a valid email address.');
            return;
        }

        if (normalizedEmail === (session?.user.email ?? '').toLowerCase()) {
            setEmailError('Use a different email address to perform an update.');
            return;
        }

        setEmailSubmitting(true);
        try {
            const response = await updateEmailAddress(normalizedEmail);
            updateLocalUser({
                email: response.email,
                isEmailVerified: false,
            });
            setEmailSuccess(
                response.message ||
                    'Email updated. Please verify your new address to unlock high-trust features.'
            );
        } catch (error) {
            setEmailError(error instanceof Error ? error.message : 'Unable to update email.');
        } finally {
            setEmailSubmitting(false);
        }
    };

    const handlePasswordRequest = async () => {
        setPasswordError(null);
        setPasswordSuccess(null);
        setPasswordSubmitting(true);

        try {
            const response = await requestPasswordChangeLink();
            setPasswordSuccess(
                response.message ||
                    'Password change link sent to your current inbox. Follow the email to continue.'
            );
        } catch (error) {
            setPasswordError(
                error instanceof Error ? error.message : 'Unable to send password change link.'
            );
        } finally {
            setPasswordSubmitting(false);
        }
    };

    return (
        <AppLayout title="Account Settings" headerRight={null}>
            <div class="space-y-4 p-4">
                <section class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
                    <div class="mb-4 flex items-center gap-3">
                        <div class="rounded-xl bg-[var(--accent-muted)] p-2">
                            <Mail class="h-4 w-4 text-[var(--accent)]" />
                        </div>
                        <div>
                            <h2 class="text-sm font-semibold text-[var(--text)]">Email Address</h2>
                            <p class="text-xs text-[var(--text-secondary)]">
                                Changing your email resets verification until you confirm the new inbox.
                            </p>
                        </div>
                    </div>

                    <form class="space-y-3" onSubmit={handleEmailUpdate}>
                        <label class="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                            New email address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onInput={(event) =>
                                setEmail((event.target as HTMLInputElement).value)
                            }
                            autoComplete="email"
                            class="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--border-focus)]"
                            placeholder="you@domain.com"
                        />
                        {emailError && (
                            <p class="rounded-xl border border-[var(--danger-muted)] bg-[var(--danger-subtle)] px-3 py-2 text-xs text-[var(--danger)]">
                                {emailError}
                            </p>
                        )}
                        {emailSuccess && (
                            <p class="rounded-xl border border-[var(--success)]/30 bg-[var(--success-subtle)] px-3 py-2 text-xs text-[var(--success)]">
                                {emailSuccess}
                            </p>
                        )}

                        <HoverButton
                            type="submit"
                            class="btn-primary"
                            disabled={emailSubmitting}
                            style="height:40px;width:100%;"
                        >
                            {emailSubmitting ? 'Updating email…' : 'Update Email'}
                        </HoverButton>
                    </form>
                </section>

                <section class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
                    <div class="mb-4 flex items-center gap-3">
                        <div class="rounded-xl bg-[var(--warning-subtle)] p-2">
                            <KeyRound class="h-4 w-4 text-[var(--warning)]" />
                        </div>
                        <div>
                            <h2 class="text-sm font-semibold text-[var(--text)]">Password Security</h2>
                            <p class="text-xs text-[var(--text-secondary)]">
                                Password updates require a secure email confirmation token.
                            </p>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <p class="text-xs text-[var(--text-secondary)]">
                            We will send a password change link to
                            <span class="ml-1 font-semibold text-[var(--text)]">
                                {session?.user.email || 'your current email'}
                            </span>
                            .
                        </p>

                        {passwordError && (
                            <p class="rounded-xl border border-[var(--danger-muted)] bg-[var(--danger-subtle)] px-3 py-2 text-xs text-[var(--danger)]">
                                {passwordError}
                            </p>
                        )}

                        {passwordSuccess && (
                            <p class="rounded-xl border border-[var(--success)]/30 bg-[var(--success-subtle)] px-3 py-2 text-xs text-[var(--success)]">
                                {passwordSuccess}
                            </p>
                        )}

                        <HoverButton
                            type="button"
                            class="btn-ghost"
                            disabled={passwordSubmitting}
                            onClick={handlePasswordRequest}
                            style="height:40px;width:100%;"
                        >
                            {passwordSubmitting ? 'Sending secure link…' : 'Send Password Change Link'}
                        </HoverButton>
                    </div>
                </section>

                <section class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
                    <div class="flex items-center gap-3">
                        <div class="rounded-xl bg-[var(--accent-muted)] p-2">
                            <ShieldCheck class="h-4 w-4 text-[var(--accent)]" />
                        </div>
                        <p class="text-xs text-[var(--text-secondary)]">
                            UrbanPulse enforces token-based confirmation for sensitive account changes.
                        </p>
                    </div>
                </section>
            </div>
        </AppLayout>
    );
}

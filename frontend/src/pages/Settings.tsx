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
        <AppLayout id="page-settings" title="Account Settings" headerRight={null}>
            <div class="stack-v gap-lg p-4">
                <section class="section">
                    <div class="section-header bg-(--bg-subtle)">
                        <div class="stack-h gap-sm">
                            <Mail class="h-4 w-4 text-(--accent)" />
                            <h2 class="text-sm font-semibold text-(--text)">Email Address</h2>
                        </div>
                    </div>

                    <div class="section-body">
                        <p class="text-xs text-(--text-secondary)">
                            Changing your email resets verification until you confirm the new inbox.
                        </p>

                        <form class="stack-v gap-md" onSubmit={handleEmailUpdate}>
                            <div class="stack-v gap-sm">
                                <label class="label-caps">New email address</label>
                                <input
                                    type="email"
                                    value={email}
                                    onInput={(event) =>
                                        setEmail((event.target as HTMLInputElement).value)
                                    }
                                    autoComplete="email"
                                    class="input-field"
                                    placeholder="you@domain.com"
                                />
                            </div>

                            {emailError && (
                                <p class="rounded-xl border border-(--danger-muted) bg-(--danger-subtle) px-3 py-2 text-xs text-(--danger)">
                                    {emailError}
                                </p>
                            )}
                            {emailSuccess && (
                                <p class="rounded-xl border border-(--success)/30 bg-(--success-subtle) px-3 py-2 text-xs text-(--success)">
                                    {emailSuccess}
                                </p>
                            )}

                            <HoverButton
                                type="submit"
                                class="btn-primary"
                                disabled={emailSubmitting}
                                style="height:44px;width:100%;"
                            >
                                {emailSubmitting ? 'Updating email…' : 'Update Email'}
                            </HoverButton>
                        </form>
                    </div>
                </section>

                <section class="section">
                    <div class="section-header bg-(--bg-subtle)">
                        <div class="stack-h gap-sm">
                            <KeyRound class="h-4 w-4 text-(--warning)" />
                            <h2 class="text-sm font-semibold text-(--text)">Password Security</h2>
                        </div>
                    </div>

                    <div class="section-body">
                        <p class="text-xs text-(--text-secondary)">
                            Password updates require a secure email confirmation token.
                        </p>

                        <div class="rounded-xl border border-(--border) bg-(--bg-subtle) p-4">
                            <p class="text-xs text-(--text-secondary)">
                                We will send a password change link to
                                <span class="ml-1 font-semibold text-(--text)">
                                    {session?.user.email || 'your current email'}
                                </span>
                                .
                            </p>
                        </div>

                        {passwordError && (
                            <p class="rounded-xl border border-(--danger-muted) bg-(--danger-subtle) px-3 py-2 text-xs text-(--danger)">
                                {passwordError}
                            </p>
                        )}

                        {passwordSuccess && (
                            <p class="rounded-xl border border-(--success)/30 bg-(--success-subtle) px-3 py-2 text-xs text-(--success)">
                                {passwordSuccess}
                            </p>
                        )}

                        <HoverButton
                            type="button"
                            class="btn-ghost"
                            disabled={passwordSubmitting}
                            onClick={handlePasswordRequest}
                            style="height:44px;width:100%;"
                        >
                            {passwordSubmitting
                                ? 'Sending secure link…'
                                : 'Send Password Change Link'}
                        </HoverButton>
                    </div>
                </section>

                <section class="section p-4 bg-(--bg-subtle)">
                    <div class="stack-h gap-sm">
                        <ShieldCheck class="h-4 w-4 text-(--accent)" />
                        <p class="text-xs text-(--text-secondary)">
                            UrbanPulse enforces token-based confirmation for sensitive account
                            changes.
                        </p>
                    </div>
                </section>
            </div>
        </AppLayout>
    );
}

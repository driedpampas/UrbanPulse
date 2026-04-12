import { AlertTriangle, CheckCircle2, LoaderCircle, MailCheck } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { HoverButton } from '../components/ui/HoverButton';
import { API_BASE_URL } from '../lib/api';
import { useAuth } from '../lib/auth';

type VerifyState = 'loading' | 'success' | 'error';

type VerifyResponse = {
    error?: string;
    message?: string;
};

export function VerifyEmail() {
    const [, setLocation] = useLocation();
    const { isAuthenticated, updateLocalUser } = useAuth();
    const [state, setState] = useState<VerifyState>('loading');
    const [message, setMessage] = useState('Verifying your email. This should only take a moment.');

    const token = useMemo(() => {
        if (typeof window === 'undefined') {
            return '';
        }

        return new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
    }, []);

    useEffect(() => {
        let cancelled = false;

        const verifyEmail = async () => {
            if (!token) {
                setState('error');
                setMessage('Verification token is missing. Please open the verification link from your inbox.');
                return;
            }

            try {
                const response = await fetch(
                    `${API_BASE_URL}/auth/verify?token=${encodeURIComponent(token)}`,
                    {
                        method: 'GET',
                    }
                );

                let payload: VerifyResponse | null = null;
                try {
                    payload = (await response.json()) as VerifyResponse;
                } catch {
                    payload = null;
                }

                if (cancelled) {
                    return;
                }

                if (!response.ok) {
                    setState('error');
                    setMessage(
                        payload?.error ||
                            'Verification link is invalid or expired. Request a fresh email and try again.'
                    );
                    return;
                }

                setState('success');
                setMessage(payload?.message || 'Your email has been verified successfully.');

                if (isAuthenticated) {
                    updateLocalUser({ isEmailVerified: true });
                }
            } catch {
                if (cancelled) {
                    return;
                }

                setState('error');
                setMessage('Unable to contact the verification service right now. Please retry in a minute.');
            }
        };

        void verifyEmail();

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, token]);

    const nextPath = isAuthenticated ? '/' : '/auth';

    return (
        <div class="min-h-[100dvh] bg-[var(--bg)] px-4 py-10">
            <div class="mx-auto w-full max-w-xl">
                <div class="mb-6 text-center">
                    <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                        UrbanPulse Account Security
                    </p>
                    <h1 class="mt-2 text-2xl font-bold tracking-[-0.03em] text-[var(--text)]">
                        Email Verification
                    </h1>
                </div>

                <div class="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
                    <div class="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-4">
                        {state === 'loading' && (
                            <LoaderCircle class="h-5 w-5 animate-spin text-[var(--accent)]" />
                        )}
                        {state === 'success' && <CheckCircle2 class="h-5 w-5 text-[var(--success)]" />}
                        {state === 'error' && <AlertTriangle class="h-5 w-5 text-[var(--danger)]" />}
                        <p class="text-sm font-semibold text-[var(--text)]">
                            {state === 'loading' && 'Checking your verification token'}
                            {state === 'success' && 'Verification complete'}
                            {state === 'error' && 'Verification failed'}
                        </p>
                    </div>

                    <div class="p-5 sm:p-6">
                        <div class="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                            <div class="flex items-start gap-3">
                                <div class="mt-0.5 rounded-full bg-[var(--accent-muted)] p-2">
                                    <MailCheck class="h-4 w-4 text-[var(--accent)]" />
                                </div>
                                <p class="text-sm leading-6 text-[var(--text-secondary)]">{message}</p>
                            </div>
                        </div>

                        <div class="mt-5 flex flex-col gap-3 sm:flex-row">
                            <HoverButton
                                type="button"
                                class="btn-primary"
                                onClick={() => setLocation(nextPath)}
                                style="height:40px;flex:1;"
                            >
                                Proceed to Dashboard
                            </HoverButton>
                            <HoverButton
                                type="button"
                                class="btn-ghost"
                                onClick={() => {
                                    if (typeof window !== 'undefined') {
                                        window.location.reload();
                                    }
                                }}
                                style="height:40px;flex:1;"
                            >
                                Retry Verification
                            </HoverButton>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

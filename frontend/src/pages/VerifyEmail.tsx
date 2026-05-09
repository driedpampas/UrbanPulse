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
                setMessage(
                    'Verification token is missing. Please open the verification link from your inbox.'
                );
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
                setMessage(
                    'Unable to contact the verification service right now. Please retry in a minute.'
                );
            }
        };

        void verifyEmail();

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, token]);

    const nextPath = isAuthenticated ? '/' : '/auth';

    return (
        <div id="page-verify-email" class="page-shell bg-(--bg) px-4 py-10">
            <div class="app-container">
                <div class="mb-8 text-center animate-slide-up">
                    <p class="label-caps" style="margin-bottom: 4px;">
                        UrbanPulse Security
                    </p>
                    <h1 class="text-2xl font-bold tracking-[-0.03em] text-(--text)">
                        Email Verification
                    </h1>
                </div>

                <div
                    class="section animate-slide-up shadow-(--shadow-lg)"
                    style="animation-delay: 0.1s;"
                >
                    <div class="section-header bg-(--bg-subtle)">
                        <div class="stack-h gap-sm">
                            {state === 'loading' && (
                                <LoaderCircle class="h-5 w-5 animate-spin text-(--accent)" />
                            )}
                            {state === 'success' && (
                                <CheckCircle2 class="h-5 w-5 text-(--success)" />
                            )}
                            {state === 'error' && <AlertTriangle class="h-5 w-5 text-(--danger)" />}
                            <p class="text-sm font-semibold text-(--text)">
                                {state === 'loading' && 'Checking verification token…'}
                                {state === 'success' && 'Verification complete'}
                                {state === 'error' && 'Verification failed'}
                            </p>
                        </div>
                    </div>

                    <div class="section-body p-6">
                        <div class="rounded-xl border border-(--border) bg-(--bg-subtle) p-5">
                            <div class="stack-h gap-md items-start">
                                <div class="mt-0.5 rounded-full bg-(--accent-muted) p-2">
                                    <MailCheck class="h-5 w-5 text-(--accent)" />
                                </div>
                                <p class="text-sm leading-6 text-(--text-secondary)">{message}</p>
                            </div>
                        </div>

                        <div class="mt-5 grid gap-3 sm:grid-cols-2">
                            <HoverButton
                                type="button"
                                class="btn-primary"
                                onClick={() => setLocation(nextPath)}
                                style="height:50px;width:100%;font-size:14px;font-weight:700;border-radius:12px;"
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
                                style="height:50px;width:100%;font-size:14px;font-weight:600;border-radius:12px;"
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

import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    Eye,
    EyeOff,
    KeyRound,
    LoaderCircle,
    LogIn,
    Moon,
    Sun,
    UserPlus,
} from 'lucide-preact';
import { useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { HoverButton } from '../components/ui/HoverButton';
import { API_BASE_URL } from '../lib/api';
import { AuthApiError, useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

type AuthMode = 'login' | 'register' | 'forgot-password';
type FormErrors = Partial<{
    displayName: string;
    email: string;
    password: string;
    confirmPassword: string;
    form: string;
}>;

export function Auth() {
    const [, setLocation] = useLocation();
    const { login, register } = useAuth();
    const { theme, toggle } = useTheme();

    const [mode, setMode] = useState<AuthMode>('login');
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [showCPw, setShowCPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errors, setErrors] = useState<FormErrors>({});

    const validate = () => {
        const e: FormErrors = {};
        if (mode === 'register' && !displayName.trim()) e.displayName = 'Display name is required';
        if (!email.trim()) e.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email';

        if (mode !== 'forgot-password') {
            if (!password) e.password = 'Password is required';
            else if (password.length < 8) e.password = 'Minimum 8 characters';
            if (mode === 'register' && password !== confirmPassword)
                e.confirmPassword = 'Passwords do not match';
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const reset = (m: AuthMode) => {
        setMode(m);
        setErrors({});
        setSuccessMsg('');
        setPassword('');
        setConfirmPassword('');
        setShowPw(false);
        setShowCPw(false);
    };

    const mapErr = (err: unknown): FormErrors => {
        if (!(err instanceof AuthApiError)) return { form: 'Cannot reach server. Try again.' };
        if (err.status === 409) return { email: err.message };
        if (err.status === 401) return { form: err.message || 'Invalid credentials' };
        return { form: err.message || 'Something went wrong' };
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        setErrors({});
        setSuccessMsg('');

        try {
            if (mode === 'forgot-password') {
                const response = await fetch(`${API_BASE_URL}/auth/password-reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.trim() }),
                });
                const data = (await response.json()) as { message?: string; error?: string };
                if (!response.ok) {
                    throw new AuthApiError(
                        data.error || 'Failed to request reset',
                        response.status
                    );
                }
                setSuccessMsg(data.message || 'Check your inbox for a reset link.');
            } else if (mode === 'login') {
                await login({ email: email.trim(), password });
                setLocation('/');
            } else {
                await register({ displayName: displayName.trim(), email: email.trim(), password });
                setLocation('/profile?setup=1');
            }
        } catch (err) {
            setErrors(mapErr(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="page-shell bg-[var(--bg)] min-h-screen flex flex-col">
            <div class="stack-h flex-between app-container px-5 py-4">
                <p class="text-base font-bold text-[var(--text)] m-0 tracking-tight">
                    UrbanPulse
                </p>
                <HoverButton
                    type="button"
                    class="btn-icon"
                    onClick={toggle}
                    aria-label="Toggle theme"
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </HoverButton>
            </div>

            <div class="flex-1 flex items-center justify-center p-5">
                <div class="w-full max-w-[400px] animate-slide-up">
                    <div class="mb-7 text-center stack-v gap-2">
                        <h1 class="text-2xl font-bold tracking-tight text-[var(--text)]">
                            {mode === 'login' && 'Welcome back'}
                            {mode === 'register' && 'Join UrbanPulse'}
                            {mode === 'forgot-password' && 'Reset Password'}
                        </h1>
                        <p class="text-sm text-[var(--text-secondary)]">
                            {mode === 'login' && 'Sign in to access your neighborhood feed.'}
                            {mode === 'register' && 'Create an account to connect with neighbors.'}
                            {mode === 'forgot-password' &&
                                'Enter your email to receive a secure reset link.'}
                        </p>
                    </div>

                    <div class="animate-slide-up" style="animation-delay: 0.1s;">
                        {mode === 'forgot-password' && (
                            <div class="mb-6">
                                <HoverButton
                                    type="button"
                                    class="btn-ghost border-none h-8 px-0 text-xs text-[var(--text-secondary)] hover:text-[var(--text)]"
                                    onClick={() => reset('login')}
                                >
                                    <ArrowLeft size={14} />
                                    Back to Sign In
                                </HoverButton>
                            </div>
                        )}

                        <div class="py-2">
                            <form onSubmit={handleSubmit} class="stack-v gap-lg">
                                {mode === 'register' && (
                                    <div class="stack-v gap-sm">
                                        <label class="label-caps">Display name</label>
                                        <input
                                            class={`input-field ${errors.displayName ? 'border-[var(--danger)]' : ''}`}
                                            value={displayName}
                                            onInput={(e) =>
                                                setDisplayName((e.target as HTMLInputElement).value)
                                            }
                                            placeholder="Alex Neighbor"
                                            autoComplete="name"
                                        />
                                        {errors.displayName && (
                                            <p class="text-[11px] text-[var(--danger)] mt-1">
                                                {errors.displayName}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div class="stack-v gap-sm">
                                    <label class="label-caps">Email</label>
                                    <input
                                        type="email"
                                        class={`input-field ${errors.email ? 'border-[var(--danger)]' : ''}`}
                                        value={email}
                                        onInput={(e) =>
                                            setEmail((e.target as HTMLInputElement).value)
                                        }
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                    />
                                    {errors.email && (
                                        <p class="text-[11px] text-[var(--danger)] mt-1">
                                            {errors.email}
                                        </p>
                                    )}
                                </div>

                                {mode !== 'forgot-password' && (
                                    <div class="stack-v gap-sm">
                                        <div class="stack-h flex-between">
                                            <label class="label-caps !m-0">Password</label>
                                            {mode === 'login' && (
                                                <HoverButton
                                                    type="button"
                                                    onClick={() => reset('forgot-password')}
                                                    class="text-[11px] font-bold text-[var(--accent)] bg-transparent border-none p-0 h-auto uppercase tracking-wide hover:underline"
                                                >
                                                    Forgot?
                                                </HoverButton>
                                            )}
                                        </div>
                                        <div class="relative">
                                            <input
                                                type={showPw ? 'text' : 'password'}
                                                class={`input-field pr-10 ${errors.password ? 'border-[var(--danger)]' : ''}`}
                                                value={password}
                                                onInput={(e) =>
                                                    setPassword(
                                                        (e.target as HTMLInputElement).value
                                                    )
                                                }
                                                placeholder="8+ characters"
                                                autoComplete={
                                                    mode === 'login'
                                                        ? 'current-password'
                                                        : 'new-password'
                                                }
                                            />
                                            <HoverButton
                                                type="button"
                                                onClick={() => setShowPw((v) => !v)}
                                                class="btn-icon absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8"
                                                aria-label={showPw ? 'Hide' : 'Show'}
                                            >
                                                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </HoverButton>
                                        </div>
                                        {errors.password && (
                                            <p class="text-[11px] text-[var(--danger)] mt-1">
                                                {errors.password}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {mode === 'register' && (
                                    <div class="stack-v gap-sm">
                                        <label class="label-caps">Confirm password</label>
                                        <div class="relative">
                                            <input
                                                type={showCPw ? 'text' : 'password'}
                                                class={`input-field pr-10 ${errors.confirmPassword ? 'border-[var(--danger)]' : ''}`}
                                                value={confirmPassword}
                                                onInput={(e) =>
                                                    setConfirmPassword(
                                                        (e.target as HTMLInputElement).value
                                                    )
                                                }
                                                placeholder="Repeat password"
                                                autoComplete="new-password"
                                            />
                                            <HoverButton
                                                type="button"
                                                onClick={() => setShowCPw((v) => !v)}
                                                class="btn-icon absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8"
                                                aria-label={showCPw ? 'Hide' : 'Show'}
                                            >
                                                {showCPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </HoverButton>
                                        </div>
                                        {errors.confirmPassword && (
                                            <p class="text-[11px] text-[var(--danger)] mt-1">
                                                {errors.confirmPassword}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {errors.form && (
                                    <div class="stack-h gap-sm rounded-xl border border-[var(--danger-muted)] bg-[var(--danger-subtle)] p-3">
                                        <AlertCircle
                                            size={14}
                                            class="text-[var(--danger)] shrink-0 mt-0.5"
                                        />
                                        <p class="text-xs text-[var(--danger)] leading-tight">
                                            {errors.form}
                                        </p>
                                    </div>
                                )}

                                {successMsg && (
                                    <div class="stack-h gap-sm rounded-xl border border-[var(--success)]/30 bg-[var(--success-subtle)] p-3">
                                        <CheckCircle2
                                            size={14}
                                            class="text-[var(--success)] shrink-0 mt-0.5"
                                        />
                                        <p class="text-xs text-[var(--success)] leading-tight">
                                            {successMsg}
                                        </p>
                                    </div>
                                )}

                                <div class="stack-v gap-4 mt-2">
                                    <HoverButton
                                        type="submit"
                                        disabled={loading}
                                        class="btn-primary h-12 text-[15px] w-full"
                                    >
                                        {loading ? (
                                            <LoaderCircle size={18} class="animate-spin" />
                                        ) : (
                                            <>
                                                {mode === 'login' && <LogIn size={18} />}
                                                {mode === 'register' && <UserPlus size={18} />}
                                                {mode === 'forgot-password' && (
                                                    <KeyRound size={18} />
                                                )}
                                                {mode === 'login'
                                                    ? 'Sign In'
                                                    : mode === 'register'
                                                      ? 'Create Account'
                                                      : 'Send Reset Link'}
                                            </>
                                        )}
                                    </HoverButton>

                                    {mode !== 'forgot-password' && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                reset(mode === 'login' ? 'register' : 'login')
                                            }
                                            class="text-sm text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors py-2"
                                        >
                                            {mode === 'login'
                                                ? "Don't have an account? "
                                                : 'Already have an account? '}
                                            <span class="font-bold text-[var(--accent)]">
                                                {mode === 'login' ? 'Register' : 'Sign In'}
                                            </span>
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>

                    <div class="mt-12 text-center">
                        <span class="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest opacity-50">
                            UrbanPulse Version {__COMMIT_HASH__}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}


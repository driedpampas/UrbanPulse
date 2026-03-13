import { AlertCircle, ArrowRight, Eye, EyeOff, LoaderCircle, LogIn, UserPlus } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { AuthApiError, useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

type AuthMode = 'login' | 'register';

type FormErrors = Partial<{
    displayName: string;
    email: string;
    password: string;
    confirmPassword: string;
    form: string;
}>;

export function Auth() {
    const [, setLocation] = useLocation();
    const { login, register, debugSignIn } = useAuth();
    const [mode, setMode] = useState<AuthMode>('login');
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});

    const validate = () => {
        const nextErrors: FormErrors = {};

        if (mode === 'register' && !displayName.trim()) {
            nextErrors.displayName = 'Display name is required';
        }

        if (!email.trim()) {
            nextErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            nextErrors.email = 'Enter a valid email address';
        }

        if (!password) {
            nextErrors.password = 'Password is required';
        } else if (password.length < 8) {
            nextErrors.password = 'Password must be at least 8 characters';
        }

        if (mode === 'register' && password !== confirmPassword) {
            nextErrors.confirmPassword = 'Passwords do not match';
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const resetForMode = (nextMode: AuthMode) => {
        setMode(nextMode);
        setErrors({});
        setPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setShowConfirmPassword(false);
    };

    const mapApiError = (error: unknown): FormErrors => {
        if (!(error instanceof AuthApiError)) {
            return {
                form: 'Unable to reach UrbanPulse right now. Check the API and try again.',
            };
        }

        if (error.status === 409) {
            return { email: error.message };
        }

        if (error.status === 401) {
            return { form: error.message || 'Invalid credentials' };
        }

        if (error.status === 400) {
            return { form: error.message || 'Invalid request body' };
        }

        if (error.status === 403) {
            return { form: error.message || 'You are already authenticated. Sign out first.' };
        }

        return { form: error.message || 'Something went wrong' };
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!validate()) {
            return;
        }

        setLoading(true);
        setErrors({});

        try {
            if (mode === 'login') {
                await login({ email: email.trim(), password });
            } else {
                await register({
                    displayName: displayName.trim(),
                    email: email.trim(),
                    password,
                });
            }

            setLocation('/');
        } catch (error) {
            setErrors(mapApiError(error));
        } finally {
            setLoading(false);
        }
    };

    const handleDebugAccess = () => {
        setErrors({});
        debugSignIn();
        setLocation('/');
    };

    const inputClassName = (hasError: boolean) =>
        cn(
            'w-full rounded-2xl border bg-white/80 px-4 py-3 text-sm text-text shadow-sm transition-all placeholder:text-text-secondary/70',
            'focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40',
            hasError ? 'border-danger/60 focus:ring-danger/20' : 'border-white/70'
        );

    return (
        <div class="relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.18),_transparent_28%),linear-gradient(135deg,_#f8fafc_0%,_#ffffff_48%,_#f0fdf4_100%)] px-4 py-8 sm:px-6 lg:px-8">
            <div class="pointer-events-none absolute inset-0 overflow-hidden">
                <div class="absolute left-[8%] top-10 h-32 w-32 rounded-full bg-primary/12 blur-3xl" />
                <div class="absolute bottom-0 right-[12%] h-40 w-40 rounded-full bg-secondary/12 blur-3xl" />
            </div>

            <div class="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl items-center justify-center">
                <div class="grid w-full overflow-hidden rounded-[32px] border border-white/60 bg-white/65 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
                    {/* <section class="hidden bg-[linear-gradient(160deg,rgba(124,58,237,0.96),rgba(16,185,129,0.86))] px-8 py-10 text-white lg:flex lg:flex-col lg:justify-between">
                        <div class="space-y-4 animate-fade-up">
                            <span class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
                                UrbanPulse Access
                            </span>
                            <div>
                                <h1 class="max-w-sm text-4xl font-black leading-tight">
                                    Your block, your signal, one secure login.
                                </h1>
                                <p class="mt-4 max-w-md text-sm leading-6 text-white/80">
                                    Sign in to post verified updates, lend skills, and respond to
                                    urgent neighborhood requests without leaving the live feed.
                                </p>
                            </div>
                        </div>

                        <div class="grid gap-3 text-sm">
                            <div class="rounded-2xl border border-white/15 bg-white/10 p-4">
                                <div class="flex items-center gap-2 font-semibold">
                                    <ShieldCheck size={18} /> Backend-aligned auth
                                </div>
                                <p class="mt-2 text-white/75">
                                    Uses the live register and login endpoints from the UrbanPulse
                                    API contract.
                                </p>
                            </div>
                            <div class="rounded-2xl border border-white/15 bg-white/10 p-4">
                                <div class="font-semibold">What the session stores</div>
                                <p class="mt-2 text-white/75">
                                    JWT token plus the returned user id and role, kept locally so
                                    protected screens stay gated after refresh.
                                </p>
                            </div>
                        </div>
                    </section> */}

                    <section class="px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
                        <div class="mx-auto w-full max-w-md animate-fade-up">
                            {/* <div class="mb-8 lg:hidden">
                                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                                    UrbanPulse Access
                                </p>
                                <h1 class="mt-3 text-3xl font-black text-text">
                                    Secure access for your neighborhood network.
                                </h1>
                                <p class="mt-3 text-sm leading-6 text-text-secondary">
                                    Use the live backend auth endpoints to enter the app or create a
                                    new account.
                                </p>
                            </div> */}

                            {/* Tab switcher
                            <div class="mb-6 flex rounded-2xl bg-surface-dim p-1">
                                <button
                                    type="button"
                                    onClick={() => resetForMode('login')}
                                    class={cn(
                                        'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all',
                                        mode === 'login'
                                            ? 'bg-white text-text shadow-sm'
                                            : 'text-text-secondary hover:text-text'
                                    )}
                                >
                                    <LogIn size={16} /> Sign In
                                </button>
                                <button
                                    type="button"
                                    onClick={() => resetForMode('register')}
                                    class={cn(
                                        'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all',
                                        mode === 'register'
                                            ? 'bg-white text-text shadow-sm'
                                            : 'text-text-secondary hover:text-text'
                                    )}
                                >
                                    <UserPlus size={16} /> Register
                                </button>
                            </div>
                            */}

                            {/* Info blurb
                            <div class="mb-6 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-text-secondary">
                                <p class="font-semibold text-text">
                                    {mode === 'login'
                                        ? 'Welcome back to the live civic feed.'
                                        : 'Create a verified presence in your area.'}
                                </p>
                                <p class="mt-1 leading-6">
                                    {mode === 'login'
                                        ? 'Use the same email and password accepted by the backend login route.'
                                        : 'Registration requires display name, email, and a password with at least 8 characters.'}
                                </p>
                            </div>
                            */}

                            <form onSubmit={handleSubmit} class="space-y-4">
                                {mode === 'register' && (
                                    <label class="block">
                                        <span class="mb-2 block text-sm font-semibold text-text">
                                            Display name
                                        </span>
                                        <input
                                            value={displayName}
                                            onInput={(e) =>
                                                setDisplayName((e.target as HTMLInputElement).value)
                                            }
                                            placeholder="Alex Slanina"
                                            autoComplete="name"
                                            class={inputClassName(Boolean(errors.displayName))}
                                        />
                                        {errors.displayName && (
                                            <p class="mt-2 text-xs font-medium text-danger">
                                                {errors.displayName}
                                            </p>
                                        )}
                                    </label>
                                )}

                                <label class="block">
                                    <span class="mb-2 block text-sm font-semibold text-text">
                                        Email
                                    </span>
                                    <input
                                        type="email"
                                        value={email}
                                        onInput={(e) =>
                                            setEmail((e.target as HTMLInputElement).value)
                                        }
                                        placeholder="neighbor@iasi.ro"
                                        autoComplete="email"
                                        class={inputClassName(Boolean(errors.email))}
                                    />
                                    {errors.email && (
                                        <p class="mt-2 text-xs font-medium text-danger">
                                            {errors.email}
                                        </p>
                                    )}
                                </label>

                                <label class="block">
                                    <span class="mb-2 block text-sm font-semibold text-text">
                                        Password
                                    </span>
                                    <div class="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onInput={(e) =>
                                                setPassword((e.target as HTMLInputElement).value)
                                            }
                                            placeholder="securePassword123"
                                            autoComplete={
                                                mode === 'login'
                                                    ? 'current-password'
                                                    : 'new-password'
                                            }
                                            class={cn(
                                                inputClassName(Boolean(errors.password)),
                                                'pr-12'
                                            )}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((current) => !current)}
                                            class="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-text-secondary"
                                            aria-label={
                                                showPassword ? 'Hide password' : 'Show password'
                                            }
                                        >
                                            {showPassword ? (
                                                <EyeOff size={18} />
                                            ) : (
                                                <Eye size={18} />
                                            )}
                                        </button>
                                    </div>
                                    {errors.password && (
                                        <p class="mt-2 text-xs font-medium text-danger">
                                            {errors.password}
                                        </p>
                                    )}
                                </label>

                                {mode === 'register' && (
                                    <label class="block">
                                        <span class="mb-2 block text-sm font-semibold text-text">
                                            Confirm password
                                        </span>
                                        <div class="relative">
                                            <input
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                value={confirmPassword}
                                                onInput={(e) =>
                                                    setConfirmPassword(
                                                        (e.target as HTMLInputElement).value
                                                    )
                                                }
                                                placeholder="Repeat your password"
                                                autoComplete="new-password"
                                                class={cn(
                                                    inputClassName(Boolean(errors.confirmPassword)),
                                                    'pr-12'
                                                )}
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowConfirmPassword((current) => !current)
                                                }
                                                class="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-text-secondary"
                                                aria-label={
                                                    showConfirmPassword
                                                        ? 'Hide confirmation password'
                                                        : 'Show confirmation password'
                                                }
                                            >
                                                {showConfirmPassword ? (
                                                    <EyeOff size={18} />
                                                ) : (
                                                    <Eye size={18} />
                                                )}
                                            </button>
                                        </div>
                                        {errors.confirmPassword && (
                                            <p class="mt-2 text-xs font-medium text-danger">
                                                {errors.confirmPassword}
                                            </p>
                                        )}
                                    </label>
                                )}

                                {errors.form && (
                                    <div class="flex items-start gap-3 rounded-2xl border border-danger/15 bg-danger/6 px-4 py-3 text-sm text-danger">
                                        <AlertCircle size={18} class="mt-0.5 shrink-0" />
                                        <p>{errors.form}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    class="flex w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-primary to-primary-dark px-4 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
                                >
                                    {loading ? (
                                        <>
                                            <LoaderCircle size={18} class="animate-spin" />
                                            Working...
                                        </>
                                    ) : (
                                        <>
                                            {mode === 'login' ? (
                                                <LogIn size={18} />
                                            ) : (
                                                <UserPlus size={18} />
                                            )}
                                            {mode === 'login'
                                                ? 'Sign In to UrbanPulse'
                                                : 'Create Account'}
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={handleDebugAccess}
                                    class="flex w-full items-center justify-center gap-2 rounded-2xl border border-secondary/35 bg-secondary/10 px-4 py-3 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/15 disabled:opacity-60"
                                >
                                    Skip auth (debug) and open dashboard
                                </button>
                            </form>

                            <div class="mt-6 flex items-center justify-between rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-text-secondary">
                                <span>
                                    {mode === 'login'
                                        ? 'Need an account first?'
                                        : 'Already have an account?'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        resetForMode(mode === 'login' ? 'register' : 'login')
                                    }
                                    class="inline-flex items-center gap-1 font-semibold text-primary"
                                >
                                    {mode === 'login' ? 'Register' : 'Sign In'}{' '}
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

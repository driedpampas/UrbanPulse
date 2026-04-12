    AlertCircle,
    ArrowLeft,
    ArrowRight,
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
import { AuthApiError, useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { HoverButton } from '../components/ui/HoverButton';
import { API_BASE_URL } from '../lib/api';

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
                    throw new AuthApiError(data.error || 'Failed to request reset', response.status);
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


    const pwWrap = { position: 'relative' as const };
    const eyeBtn = `
		position:absolute;right:0;top:0;bottom:0;width:38px;
		display:flex;align-items:center;justify-content:center;
		background:none;border:none;cursor:pointer;color:var(--text-tertiary);
	`;

    return (
        <div class="page-shell bg-[var(--bg)]">
            <div class="stack-h flex-between app-container" style="padding:16px 20px;">
                <p style="font-size:16px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.03em;">
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

            <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;">
                <div style="width:100%;max-width:400px;" class="animate-slide-up">
                    <div style="margin-bottom:28px;text-align:center;">
                        <h1 style="font-size:24px;font-weight:700;color:var(--text);margin:0 0 8px;letter-spacing:-0.03em;">
                            {mode === 'login' && 'Welcome back'}
                            {mode === 'register' && 'Join UrbanPulse'}
                            {mode === 'forgot-password' && 'Reset Password'}
                        </h1>
                        <p style="font-size:14px;color:var(--text-secondary);margin:0;">
                            {mode === 'login' && 'Sign in to access your neighborhood feed.'}
                            {mode === 'register' && 'Create an account to connect with neighbors.'}
                            {mode === 'forgot-password' && 'Enter your email to receive a secure reset link.'}
                        </p>
                    </div>

                    <div class="section animate-slide-up shadow-[var(--shadow-lg)]" style="animation-delay: 0.1s;">
                        {mode !== 'forgot-password' && (
                            <div class="section-header bg-[var(--bg-subtle)]" style="padding: 6px;">
                                <div class="tab-switcher" style="width: 100%; border: none; background: transparent;">
                                    {(['login', 'register'] as AuthMode[]).map((m) => (
                                        <HoverButton
                                            key={m}
                                            type="button"
                                            onClick={() => reset(m)}
                                            class={`tab-btn ${mode === m ? 'active' : ''}`}
                                            style="flex:1; justify-content: center; height: 36px;"
                                        >
                                            {m === 'login' ? <LogIn size={14} /> : <UserPlus size={14} />}
                                            {m === 'login' ? 'Sign In' : 'Register'}
                                        </HoverButton>
                                    ))}
                                </div>
                            </div>
                        )}

                        {mode === 'forgot-password' && (
                            <div class="section-header bg-[var(--bg-subtle)]">
                                <HoverButton
                                    type="button"
                                    class="btn-ghost"
                                    onClick={() => reset('login')}
                                    style="border:none; height: 32px; padding: 0 8px; font-size: 12px;"
                                >
                                    <ArrowLeft size={14} />
                                    Back to Sign In
                                </HoverButton>
                            </div>
                        )}

                        <div class="section-body p-6">
                            <form onSubmit={handleSubmit} class="stack-v gap-lg">
                                {mode === 'register' && (
                                    <div class="stack-v gap-sm">
                                        <label class="label-caps">Display name</label>
                                        <input
                                            class="input-field"
                                            value={displayName}
                                            onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                                            placeholder="Alex Neighbor"
                                            autoComplete="name"
                                            style={errors.displayName ? 'border-color:var(--danger);' : ''}
                                        />
                                        {errors.displayName && (
                                            <p class="text-[11px] text-[var(--danger)] mt-1">{errors.displayName}</p>
                                        )}
                                    </div>
                                )}

                                <div class="stack-v gap-sm">
                                    <label class="label-caps">Email address</label>
                                    <input
                                        type="email"
                                        class="input-field"
                                        value={email}
                                        onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        style={errors.email ? 'border-color:var(--danger);' : ''}
                                    />
                                    {errors.email && (
                                        <p class="text-[11px] text-[var(--danger)] mt-1">{errors.email}</p>
                                    )}
                                </div>

                                {mode !== 'forgot-password' && (
                                    <div class="stack-v gap-sm">
                                        <div class="stack-h flex-between">
                                            <label class="label-caps" style="margin:0;">Password</label>
                                            {mode === 'login' && (
                                                <HoverButton
                                                    type="button"
                                                    onClick={() => reset('forgot-password')}
                                                    style="font-size:11px; font-weight:700; color:var(--accent); background:none; border:none; padding:0; height:auto; text-transform:uppercase; letter-spacing:0.02em;"
                                                >
                                                    Forgot?
                                                </HoverButton>
                                            )}
                                        </div>
                                        <div style="position:relative;">
                                            <input
                                                type={showPw ? 'text' : 'password'}
                                                class="input-field"
                                                value={password}
                                                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                                                placeholder="8+ characters"
                                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                                style={`${errors.password ? 'border-color:var(--danger);' : ''} padding-right:40px;`}
                                            />
                                            <HoverButton
                                                type="button"
                                                onClick={() => setShowPw((v) => !v)}
                                                class="btn-icon"
                                                style="position:absolute; right:4px; top:50%; transform:translateY(-50%); width:32px; height:32px;"
                                                aria-label={showPw ? 'Hide' : 'Show'}
                                            >
                                                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </HoverButton>
                                        </div>
                                        {errors.password && (
                                            <p class="text-[11px] text-[var(--danger)] mt-1">{errors.password}</p>
                                        )}
                                    </div>
                                )}

                                {mode === 'register' && (
                                    <div class="stack-v gap-sm">
                                        <label class="label-caps">Confirm password</label>
                                        <div style="position:relative;">
                                            <input
                                                type={showCPw ? 'text' : 'password'}
                                                class="input-field"
                                                value={confirmPassword}
                                                onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
                                                placeholder="Repeat password"
                                                autoComplete="new-password"
                                                style={`${errors.confirmPassword ? 'border-color:var(--danger);' : ''} padding-right:40px;`}
                                            />
                                            <HoverButton
                                                type="button"
                                                onClick={() => setShowCPw((v) => !v)}
                                                class="btn-icon"
                                                style="position:absolute; right:4px; top:50%; transform:translateY(-50%); width:32px; height:32px;"
                                                aria-label={showCPw ? 'Hide' : 'Show'}
                                            >
                                                {showCPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </HoverButton>
                                        </div>
                                        {errors.confirmPassword && (
                                            <p class="text-[11px] text-[var(--danger)] mt-1">{errors.confirmPassword}</p>
                                        )}
                                    </div>
                                )}

                                {errors.form && (
                                    <div class="stack-h gap-sm rounded-xl border border-[var(--danger-muted)] bg-[var(--danger-subtle)] p-3">
                                        <AlertCircle size={14} class="text-[var(--danger)] shrink-0 mt-0.5" />
                                        <p class="text-xs text-[var(--danger)] leading-tight">{errors.form}</p>
                                    </div>
                                )}

                                {successMsg && (
                                    <div class="stack-h gap-sm rounded-xl border border-[var(--success)]/30 bg-[var(--success-subtle)] p-3">
                                        <CheckCircle2 size={14} class="text-[var(--success)] shrink-0 mt-0.5" />
                                        <p class="text-xs text-[var(--success)] leading-tight">{successMsg}</p>
                                    </div>
                                )}

                                <HoverButton
                                    type="submit"
                                    disabled={loading}
                                    class="btn-primary"
                                    style="height:48px; font-size:15px; width:100%; margin-top:8px;"
                                >
                                    {loading ? (
                                        <LoaderCircle size={18} class="animate-spin" />
                                    ) : (
                                        <>
                                            {mode === 'login' && <LogIn size={18} />}
                                            {mode === 'register' && <UserPlus size={18} />}
                                            {mode === 'forgot-password' && <KeyRound size={18} />}
                                            {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
                                        </>
                                    )}
                                </HoverButton>
                            </form>
                        </div>
                    </div>

                    <div class="mt-8 text-center stack-v gap-md">
                        {mode !== 'forgot-password' ? (
                            <p class="text-sm text-[var(--text-secondary)]">
                                {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
                                <button
                                    type="button"
                                    onClick={() => reset(mode === 'login' ? 'register' : 'login')}
                                    class="ml-2 font-bold text-[var(--accent)] hover:underline"
                                >
                                    {mode === 'login' ? 'Join Neighbor' : 'Sign In'}
                                </button>
                            </p>
                        ) : (
                            <p class="text-sm text-[var(--text-secondary)]">
                                Remember your password?
                                <button
                                    type="button"
                                    onClick={() => reset('login')}
                                    class="ml-2 font-bold text-[var(--accent)] hover:underline"
                                >
                                    Sign In
                                </button>
                            </p>
                        )}
                        <span class="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest opacity-50">
                            UrbanPulse Version {__COMMIT_HASH__}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
    );
}

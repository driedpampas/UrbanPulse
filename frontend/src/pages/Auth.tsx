import {
    AlertCircle,
    ArrowRight,
    Eye,
    EyeOff,
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
    const [errors, setErrors] = useState<FormErrors>({});

    const validate = () => {
        const e: FormErrors = {};
        if (mode === 'register' && !displayName.trim()) e.displayName = 'Display name is required';
        if (!email.trim()) e.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email';
        if (!password) e.password = 'Password is required';
        else if (password.length < 8) e.password = 'Minimum 8 characters';
        if (mode === 'register' && password !== confirmPassword)
            e.confirmPassword = 'Passwords do not match';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const reset = (m: AuthMode) => {
        setMode(m);
        setErrors({});
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
        try {
            if (mode === 'login') await login({ email: email.trim(), password });
            else await register({ displayName: displayName.trim(), email: email.trim(), password });
            setLocation(mode === 'login' ? '/' : '/profile?setup=1');
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
            {/* Top bar */}
            <div class="stack-h flex-between" style="padding:16px 20px;max-width:680px;width:100%;margin:0 auto;">
                <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.02em;">
                    UrbanPulse
                </p>
                <HoverButton
                    type="button"
                    class="btn-icon"
                    onClick={toggle}
                    aria-label="Toggle theme"
                >
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </HoverButton>
            </div>

            {/* Centered card */}
            <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;">
                <div style="width:100%;max-width:380px;" class="animate-slide-up">
                    {/* Heading */}
                    <div style="margin-bottom:24px;">
                        <h1 style="font-size:22px;font-weight:700;color:var(--text);margin:0 0 6px;letter-spacing:-0.03em;">
                            {mode === 'login' ? 'Welcome back' : 'Create an account'}
                        </h1>
                        <p style="font-size:13px;color:var(--text-secondary);margin:0;">
                            {mode === 'login'
                                ? 'Sign in to access your neighborhood feed.'
                                : 'Join your neighborhood network today.'}
                        </p>
                    </div>

                    {/* Tab strip */}
                    <div class="tab-switcher" style="margin-bottom:20px;">
                        {(['login', 'register'] as AuthMode[]).map((m) => (
                            <HoverButton
                                key={m}
                                type="button"
                                id={`auth-tab-${m}`}
                                onClick={() => reset(m)}
                                class={`tab-btn ${mode === m ? 'active' : ''}`}
                                style="flex:1;"
                            >
                                {m === 'login' ? <LogIn size={13} /> : <UserPlus size={13} />}
                                {m === 'login' ? 'Sign In' : 'Register'}
                            </HoverButton>
                        ))}
                    </div>

                    {/* Form */}
                    <form
                        onSubmit={handleSubmit}
                        class="stack-v gap-md"
                    >
                        {mode === 'register' && (
                            <div>
                                <label class="label-caps">
                                    Display name
                                </label>
                                <input
                                    class="input-field"
                                    value={displayName}
                                    onInput={(e) =>
                                        setDisplayName((e.target as HTMLInputElement).value)
                                    }
                                    placeholder="Alex Neighbor"
                                    autoComplete="name"
                                    style={errors.displayName ? 'border-color:var(--danger);' : ''}
                                />
                                {errors.displayName && (
                                    <p style="font-size:11px;color:var(--danger);margin:4px 0 0;">
                                        {errors.displayName}
                                    </p>
                                )}
                            </div>
                        )}

                        <div>
                            <label class="label-caps">
                                Email
                            </label>
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
                                <p style="font-size:11px;color:var(--danger);margin:4px 0 0;">
                                    {errors.email}
                                </p>
                            )}
                        </div>

                        <div>
                            <label class="label-caps">
                                Password
                            </label>
                            <div style={pwWrap}>
                                <input
                                    type={showPw ? 'text' : 'password'}
                                    class="input-field"
                                    value={password}
                                    onInput={(e) =>
                                        setPassword((e.target as HTMLInputElement).value)
                                    }
                                    placeholder="8+ characters"
                                    autoComplete={
                                        mode === 'login' ? 'current-password' : 'new-password'
                                    }
                                    style={`${errors.password ? 'border-color:var(--danger);' : ''}padding-right:38px;`}
                                />
                                <HoverButton
                                    type="button"
                                    onClick={() => setShowPw((v) => !v)}
                                    style={eyeBtn}
                                    aria-label={showPw ? 'Hide' : 'Show'}
                                >
                                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                </HoverButton>
                            </div>
                            {errors.password && (
                                <p style="font-size:11px;color:var(--danger);margin:4px 0 0;">
                                    {errors.password}
                                </p>
                            )}
                        </div>

                        {mode === 'register' && (
                            <div>
                                <label class="label-caps">
                                    Confirm password
                                </label>
                                <div style={pwWrap}>
                                    <input
                                        type={showCPw ? 'text' : 'password'}
                                        class="input-field"
                                        value={confirmPassword}
                                        onInput={(e) =>
                                            setConfirmPassword((e.target as HTMLInputElement).value)
                                        }
                                        placeholder="Repeat password"
                                        autoComplete="new-password"
                                        style={`${errors.confirmPassword ? 'border-color:var(--danger);' : ''}padding-right:38px;`}
                                    />
                                    <HoverButton
                                        type="button"
                                        onClick={() => setShowCPw((v) => !v)}
                                        style={eyeBtn}
                                        aria-label={showCPw ? 'Hide' : 'Show'}
                                    >
                                        {showCPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </HoverButton>
                                </div>
                                {errors.confirmPassword && (
                                    <p style="font-size:11px;color:var(--danger);margin:4px 0 0;">
                                        {errors.confirmPassword}
                                    </p>
                                )}
                            </div>
                        )}

                        {errors.form && (
                            <div style="padding:10px 12px;border-radius:10px;background:var(--danger-subtle);border:1px solid var(--danger-muted);display:flex;align-items:flex-start;gap:8px;">
                                <AlertCircle
                                    size={14}
                                    style="color:var(--danger);flex-shrink:0;margin-top:1px;"
                                />
                                <p style="font-size:12px;color:var(--danger);margin:0;">
                                    {errors.form}
                                </p>
                            </div>
                        )}

                        <HoverButton
                            type="submit"
                            id="auth-submit-btn"
                            disabled={loading}
                            class="btn-primary"
                            style="height:44px;font-size:14px;width:100%;margin-top:4px;"
                        >
                            {loading ? (
                                <>
                                    <LoaderCircle size={15} class="animate-spin" />
                                    Working…
                                </>
                            ) : (
                                <>
                                    {mode === 'login' ? (
                                        <LogIn size={15} />
                                    ) : (
                                        <UserPlus size={15} />
                                    )}
                                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                                </>
                            )}
                        </HoverButton>
                    </form>

                    {/* Switch mode */}
                    <div class="stack-h flex-between" style="margin-top:20px;padding:12px 16px;border-radius:10px;border:1px solid var(--border);background:var(--bg-subtle);">
                        <span style="font-size:12px;color:var(--text-secondary);">
                            {mode === 'login' ? 'No account?' : 'Already registered?'}
                        </span>
                        <HoverButton
                            type="button"
                            onClick={() => reset(mode === 'login' ? 'register' : 'login')}
                            style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;"
                        >
                            {mode === 'login' ? 'Register' : 'Sign In'}
                            <ArrowRight size={12} />
                        </HoverButton>
                    </div>
                </div>
            </div>

            {/* Version indicator */}
            <div style="padding:16px;text-align:center;">
                <span style="font-size:10px;color:var(--text-tertiary);letter-spacing:0.04em;text-transform:uppercase;opacity:0.6;">
                    Version: {__COMMIT_HASH__}
                </span>
            </div>
        </div>
    );
}

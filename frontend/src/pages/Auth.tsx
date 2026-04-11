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

    const fieldStyle = (hasErr: boolean) => `
		width:100%;padding:9px 12px;border-radius:8px;border:1px solid;
		font-size:13px;font-family:inherit;outline:none;
		background:var(--bg-subtle);color:var(--text);
		border-color:${hasErr ? 'var(--danger)' : 'var(--border)'};
		transition:border-color 0.15s,box-shadow 0.15s;
	`;

    const pwWrap = { position: 'relative' as const };
    const eyeBtn = `
		position:absolute;right:0;top:0;bottom:0;width:38px;
		display:flex;align-items:center;justify-content:center;
		background:none;border:none;cursor:pointer;color:var(--text-tertiary);
	`;

    return (
        <div style="min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);">
            {/* Top bar */}
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;max-width:680px;width:100%;margin:0 auto;">
                <p style="font-size:15px;font-weight:700;color:var(--text);margin:0;letter-spacing:-0.02em;">
                    UrbanPulse
                </p>
                <button
                    type="button"
                    class="btn-icon"
                    onClick={toggle}
                    aria-label="Toggle theme"
                    style="color:var(--text-secondary);"
                >
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
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
                    <div style="display:flex;gap:0;border:1px solid var(--border);border-radius:8px;padding:3px;margin-bottom:20px;background:var(--bg-subtle);">
                        {(['login', 'register'] as AuthMode[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                id={`auth-tab-${m}`}
                                onClick={() => reset(m)}
                                style={`
									flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
									padding:6px 12px;border-radius:6px;border:none;
									font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
									transition:all 0.15s;
									${
                                        mode === m
                                            ? 'background:var(--surface-raised);color:var(--text);box-shadow:var(--shadow-sm);'
                                            : 'background:transparent;color:var(--text-tertiary);'
                                    }
								`}
                            >
                                {m === 'login' ? <LogIn size={13} /> : <UserPlus size={13} />}
                                {m === 'login' ? 'Sign In' : 'Register'}
                            </button>
                        ))}
                    </div>

                    {/* Form */}
                    <form
                        onSubmit={handleSubmit}
                        style="display:flex;flex-direction:column;gap:14px;"
                    >
                        {mode === 'register' && (
                            <div>
                                <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;">
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
                                    style={fieldStyle(Boolean(errors.displayName))}
                                    onFocus={(e) => {
                                        (e.target as HTMLElement).style.borderColor =
                                            'var(--border-focus)';
                                        (e.target as HTMLElement).style.boxShadow =
                                            '0 0 0 3px var(--accent-muted)';
                                    }}
                                    onBlur={(e) => {
                                        (e.target as HTMLElement).style.borderColor =
                                            errors.displayName ? 'var(--danger)' : 'var(--border)';
                                        (e.target as HTMLElement).style.boxShadow = 'none';
                                    }}
                                />
                                {errors.displayName && (
                                    <p style="font-size:11px;color:var(--danger);margin:4px 0 0;">
                                        {errors.displayName}
                                    </p>
                                )}
                            </div>
                        )}

                        <div>
                            <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;">
                                Email
                            </label>
                            <input
                                type="email"
                                class="input-field"
                                value={email}
                                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                                placeholder="you@example.com"
                                autoComplete="email"
                                style={fieldStyle(Boolean(errors.email))}
                                onFocus={(e) => {
                                    (e.target as HTMLElement).style.borderColor =
                                        'var(--border-focus)';
                                    (e.target as HTMLElement).style.boxShadow =
                                        '0 0 0 3px var(--accent-muted)';
                                }}
                                onBlur={(e) => {
                                    (e.target as HTMLElement).style.borderColor = errors.email
                                        ? 'var(--danger)'
                                        : 'var(--border)';
                                    (e.target as HTMLElement).style.boxShadow = 'none';
                                }}
                            />
                            {errors.email && (
                                <p style="font-size:11px;color:var(--danger);margin:4px 0 0;">
                                    {errors.email}
                                </p>
                            )}
                        </div>

                        <div>
                            <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;">
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
                                    style={`${fieldStyle(Boolean(errors.password))}padding-right:38px;`}
                                    onFocus={(e) => {
                                        (e.target as HTMLElement).style.borderColor =
                                            'var(--border-focus)';
                                        (e.target as HTMLElement).style.boxShadow =
                                            '0 0 0 3px var(--accent-muted)';
                                    }}
                                    onBlur={(e) => {
                                        (e.target as HTMLElement).style.borderColor =
                                            errors.password ? 'var(--danger)' : 'var(--border)';
                                        (e.target as HTMLElement).style.boxShadow = 'none';
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw((v) => !v)}
                                    style={eyeBtn}
                                    aria-label={showPw ? 'Hide' : 'Show'}
                                >
                                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                            {errors.password && (
                                <p style="font-size:11px;color:var(--danger);margin:4px 0 0;">
                                    {errors.password}
                                </p>
                            )}
                        </div>

                        {mode === 'register' && (
                            <div>
                                <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;">
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
                                        style={
                                            fieldStyle(Boolean(errors.confirmPassword)) +
                                            'padding-right:38px;'
                                        }
                                        onFocus={(e) => {
                                            (e.target as HTMLElement).style.borderColor =
                                                'var(--border-focus)';
                                            (e.target as HTMLElement).style.boxShadow =
                                                '0 0 0 3px var(--accent-muted)';
                                        }}
                                        onBlur={(e) => {
                                            (e.target as HTMLElement).style.borderColor =
                                                errors.confirmPassword
                                                    ? 'var(--danger)'
                                                    : 'var(--border)';
                                            (e.target as HTMLElement).style.boxShadow = 'none';
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCPw((v) => !v)}
                                        style={eyeBtn}
                                        aria-label={showCPw ? 'Hide' : 'Show'}
                                    >
                                        {showCPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                {errors.confirmPassword && (
                                    <p style="font-size:11px;color:var(--danger);margin:4px 0 0;">
                                        {errors.confirmPassword}
                                    </p>
                                )}
                            </div>
                        )}

                        {errors.form && (
                            <div style="padding:10px 12px;border-radius:8px;background:var(--danger-subtle);border:1px solid var(--type-emergency-border);display:flex;align-items:flex-start;gap:8px;">
                                <AlertCircle
                                    size={14}
                                    style="color:var(--danger);flex-shrink:0;margin-top:1px;"
                                />
                                <p style="font-size:12px;color:var(--danger);margin:0;">
                                    {errors.form}
                                </p>
                            </div>
                        )}

                        <button
                            type="submit"
                            id="auth-submit-btn"
                            disabled={loading}
                            class="btn-primary"
                            style="height:40px;font-size:13px;width:100%;background:var(--accent);border-radius:8px;opacity:1;margin-top:2px;"
                        >
                            {loading ? (
                                <>
                                    <LoaderCircle size={14} class="animate-spin" />
                                    Working…
                                </>
                            ) : (
                                <>
                                    {mode === 'login' ? (
                                        <LogIn size={14} />
                                    ) : (
                                        <UserPlus size={14} />
                                    )}
                                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                                </>
                            )}
                        </button>
                    </form>

                    {/* Switch mode */}
                    <div style="margin-top:16px;padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-subtle);display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-size:12px;color:var(--text-secondary);">
                            {mode === 'login' ? 'No account?' : 'Already registered?'}
                        </span>
                        <button
                            type="button"
                            onClick={() => reset(mode === 'login' ? 'register' : 'login')}
                            style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;"
                        >
                            {mode === 'login' ? 'Register' : 'Sign In'}
                            <ArrowRight size={12} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Version indicator */}
            <div style="padding:12px;text-align:center;">
                <span style="font-size:10px;color:var(--text-tertiary);letter-spacing:0.02em;">
                    Version: {__COMMIT_HASH__}
                </span>
            </div>
        </div>
    );
}

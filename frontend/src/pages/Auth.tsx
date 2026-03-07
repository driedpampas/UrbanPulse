import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { login, register } from '../lib/mockApi';

export function Auth() {
    const [, setLocation] = useLocation();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const e: Record<string, string> = {};
        if (mode === 'register' && !name.trim()) e.name = 'Name is required';
        if (!email.trim()) e.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email format';
        if (!password) e.password = 'Password is required';
        else if (password.length < 6) e.password = 'Min 6 characters';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        try {
            if (mode === 'login') await login(email, password);
            else await register(name, email, password);
            setLocation('/');
        } catch {
            setErrors({ form: 'Something went wrong' });
        }
        setLoading(false);
    };

    return (
        <div class="min-h-dvh flex items-center justify-center p-4">
            <div class="w-full max-w-sm animate-fade-up">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-extrabold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent">
                        UrbanPulse
                    </h1>
                    <p class="text-sm text-text-secondary mt-1">Your hyper-local community</p>
                </div>

                <div class="glass rounded-3xl p-6">
                    <div class="flex glass rounded-xl p-0.5 gap-0.5 mb-6">
                        <button
                            type="button"
                            onClick={() => setMode('login')}
                            class={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary'}`}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('register')}
                            class={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'register' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary'}`}
                        >
                            Register
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} class="space-y-3">
                        {mode === 'register' && (
                            <div>
                                <input
                                    value={name}
                                    onInput={(e) => setName((e.target as HTMLInputElement).value)}
                                    placeholder="Full Name"
                                    class={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.name ? 'border-danger' : 'border-border'}`}
                                />
                                {errors.name && (
                                    <p class="text-[10px] text-danger mt-1">{errors.name}</p>
                                )}
                            </div>
                        )}
                        <div>
                            <input
                                type="email"
                                value={email}
                                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                                placeholder="Email"
                                class={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.email ? 'border-danger' : 'border-border'}`}
                            />
                            {errors.email && (
                                <p class="text-[10px] text-danger mt-1">{errors.email}</p>
                            )}
                        </div>
                        <div class="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                                placeholder="Password"
                                class={`w-full border rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.password ? 'border-danger' : 'border-border'}`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            {errors.password && (
                                <p class="text-[10px] text-danger mt-1">{errors.password}</p>
                            )}
                        </div>

                        {errors.form && (
                            <p class="text-xs text-danger text-center">{errors.form}</p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            class="w-full bg-linear-to-r from-primary to-primary-dark text-white py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg"
                        >
                            {mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
                            {loading
                                ? 'Please wait…'
                                : mode === 'login'
                                  ? 'Sign In'
                                  : 'Create Account'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

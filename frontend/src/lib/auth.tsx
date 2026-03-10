import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';

const AUTH_STORAGE_KEY = 'urbanpulse.auth.session';
const API_BASE_URL = (
    ((import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ??
        '') as string
).replace(/\/$/, '');

interface AuthApiUser {
    id: string;
    role: string;
}

export interface AuthSessionUser extends AuthApiUser {
    email: string;
    displayName?: string;
}

export interface AuthSession {
    token: string;
    user: AuthSessionUser;
}

interface AuthResponse {
    token: string;
    user: AuthApiUser;
}

interface LoginInput {
    email: string;
    password: string;
}

interface RegisterInput extends LoginInput {
    displayName: string;
}

interface AuthContextValue {
    isReady: boolean;
    isAuthenticated: boolean;
    session: AuthSession | null;
    login: (input: LoginInput) => Promise<AuthSession>;
    register: (input: RegisterInput) => Promise<AuthSession>;
    debugSignIn: () => AuthSession;
    logout: () => void;
    updateLocalUser: (updates: Partial<Pick<AuthSessionUser, 'displayName' | 'email'>>) => void;
}

type ErrorPayload = {
    error?: string;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export class AuthApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'AuthApiError';
        this.status = status;
    }
}

function isStoredSession(value: unknown): value is AuthSession {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const session = value as Partial<AuthSession>;
    const user = session.user as Partial<AuthSessionUser> | undefined;

    return Boolean(
        typeof session.token === 'string' &&
            typeof user?.id === 'string' &&
            typeof user.role === 'string' &&
            typeof user.email === 'string'
    );
}

function createFallbackDisplayName(email: string) {
    const [localPart] = email.split('@');
    return localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ');
}

function createDebugSession(): AuthSession {
    return {
        token: 'debug-mock-token',
        user: {
            id: 'me',
            role: 'resident',
            email: 'debug@urbanpulse.local',
            displayName: 'Alex Rivera',
        },
    };
}

async function readErrorPayload(response: Response): Promise<ErrorPayload> {
    try {
        return (await response.json()) as ErrorPayload;
    } catch {
        return {};
    }
}

async function postAuth<RequestBody extends Record<string, string>>(
    path: string,
    body: RequestBody
): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const payload = await readErrorPayload(response);
        throw new AuthApiError(payload.error || 'Authentication failed', response.status);
    }

    return (await response.json()) as AuthResponse;
}

export function readStoredAuthSession(): AuthSession | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const rawValue = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!rawValue) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue) as unknown;
        if (isStoredSession(parsed)) {
            return parsed;
        }
    } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    return null;
}

function writeStoredAuthSession(session: AuthSession) {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredAuthSession() {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ComponentChildren }) {
    const [session, setSession] = useState<AuthSession | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        setSession(readStoredAuthSession());
        setIsReady(true);
    }, []);

    const persistSession = (nextSession: AuthSession | null) => {
        if (nextSession) {
            writeStoredAuthSession(nextSession);
        } else {
            clearStoredAuthSession();
        }

        setSession(nextSession);
        return nextSession;
    };

    const login = async ({ email, password }: LoginInput) => {
        const existingSession = readStoredAuthSession();
        const response = await postAuth('/auth/login', { email, password });
        const nextSession: AuthSession = {
            token: response.token,
            user: {
                ...response.user,
                email,
                displayName:
                    existingSession?.user.email === email
                        ? existingSession.user.displayName
                        : createFallbackDisplayName(email),
            },
        };

        return persistSession(nextSession) as AuthSession;
    };

    const register = async ({ displayName, email, password }: RegisterInput) => {
        const response = await postAuth('/auth/register', {
            displayName,
            email,
            password,
        });

        const nextSession: AuthSession = {
            token: response.token,
            user: {
                ...response.user,
                email,
                displayName: displayName.trim(),
            },
        };

        return persistSession(nextSession) as AuthSession;
    };

    const debugSignIn = () => persistSession(createDebugSession()) as AuthSession;

    const logout = () => {
        persistSession(null);
    };

    const updateLocalUser = (updates: Partial<Pick<AuthSessionUser, 'displayName' | 'email'>>) => {
        setSession((currentSession) => {
            if (!currentSession) {
                return currentSession;
            }

            const nextSession = {
                ...currentSession,
                user: {
                    ...currentSession.user,
                    ...updates,
                },
            };

            writeStoredAuthSession(nextSession);
            return nextSession;
        });
    };

    return (
        <AuthContext.Provider
            value={{
                isReady,
                isAuthenticated: Boolean(session?.token),
                session,
                login,
                register,
                debugSignIn,
                logout,
                updateLocalUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
}

import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { API_BASE_URL } from './api';

const AUTH_STORAGE_KEY = 'urbanpulse.auth.session';

interface AuthApiUser {
    id: string;
    role: string;
    isEmailVerified: boolean;
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
    logout: () => void;
    updateLocalUser: (
        updates: Partial<Pick<AuthSessionUser, 'displayName' | 'email' | 'isEmailVerified'>>
    ) => void;
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
            typeof user.email === 'string' &&
            (typeof user.isEmailVerified === 'boolean' || user.isEmailVerified === undefined)
    );
}

function createFallbackDisplayName(email: string) {
    const [localPart] = email.split('@');
    return (localPart || 'Neighbor')
        .split(/[._-]+/)
        .filter(Boolean)
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ');
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
        if (response.status === 409) {
            throw new AuthApiError('Email already exists', 409);
        }
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
            const normalizedSession: AuthSession = {
                ...parsed,
                user: {
                    ...parsed.user,
                    isEmailVerified: Boolean(parsed.user.isEmailVerified),
                },
            };

            if (parsed.user.isEmailVerified === undefined) {
                writeStoredAuthSession(normalizedSession);
            }

            return normalizedSession;
        }
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
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

    useEffect(() => {
        const handleUnauthorized = () => {
            logout();
        };

        window.addEventListener('urbanpulse:auth:unauthorized', handleUnauthorized);
        return () => {
            window.removeEventListener('urbanpulse:auth:unauthorized', handleUnauthorized);
        };
    }, []);

    function persistSession(nextSession: AuthSession): AuthSession;
    function persistSession(nextSession: null): null;
    function persistSession(nextSession: AuthSession | null) {
        if (nextSession) {
            writeStoredAuthSession(nextSession);
        } else {
            clearStoredAuthSession();
        }

        setSession(nextSession);
        return nextSession;
    }

    const login = async ({ email, password }: LoginInput) => {
        const normalizedEmail = email.trim();
        const existingSession = readStoredAuthSession();
        const response = await postAuth('/auth/login', { email: normalizedEmail, password });
        const nextSession: AuthSession = {
            token: response.token,
            user: {
                ...response.user,
                email: normalizedEmail,
                displayName:
                    existingSession?.user.email === normalizedEmail
                        ? existingSession.user.displayName
                        : createFallbackDisplayName(normalizedEmail),
            },
        };

        return persistSession(nextSession);
    };

    const register = async ({ displayName, email, password }: RegisterInput) => {
        const normalizedEmail = email.trim();
        const normalizedDisplayName = displayName.trim();
        const response = await postAuth('/auth/register', {
            displayName: normalizedDisplayName,
            email: normalizedEmail,
            password,
        });

        const nextSession: AuthSession = {
            token: response.token,
            user: {
                ...response.user,
                email: normalizedEmail,
                displayName: normalizedDisplayName,
            },
        };

        return persistSession(nextSession);
    };

    const logout = () => {
        persistSession(null);
    };

    const updateLocalUser = (
        updates: Partial<Pick<AuthSessionUser, 'displayName' | 'email' | 'isEmailVerified'>>
    ) => {
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

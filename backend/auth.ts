import * as bun from 'bun';
import { randomBytes } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';
import * as db from './db';

function getJwtSecret(): string {
    const jwtSecret = bun.env.JWT_SECRET;

    if (jwtSecret === undefined) {
        console.error('JWT_SECRET environment variable MUST be defined.');
        process.exit(1);
    }

    return jwtSecret;
}

const JWT_SECRET = getJwtSecret();
const AUTH_MAILER_URL = bun.env.AUTH_MAILER_URL?.trim() ?? '';
const FRONTEND_URL = (bun.env.FRONTEND_URL?.trim() || 'https://urbanpulse.syu.nl.eu.org').replace(
    /\/$/,
    ''
);
const verificationTokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);

const authTokenPayloadSchema = z.object({
    id: z.string().uuid(),
});

export type AuthTokenPayload = z.infer<typeof authTokenPayloadSchema>;

export type AuthResult =
    | { success: true; token: string; user: { id: string; role: string; isEmailVerified: boolean } }
    | { success: false; status: number };

export type VerifyEmailResult = { success: true } | { success: false; status: number };

export type RegisterUser = {
    email: string;
    password: string;
    displayName: string;
};

export type LoginUser = {
    email: string;
    password: string;
};

export async function registerUser(user: RegisterUser): Promise<AuthResult> {
    const [existingId] = await db.selectId(user.email);

    if (existingId) {
        return {
            success: false,
            status: 409,
        };
    }

    const hashedPass = await bun.password.hash(user.password);
    const verificationToken = randomBytes(32).toString('hex');
    const [dbUser] = await db.insertUser(
        user.email,
        hashedPass,
        user.displayName,
        verificationToken
    );

    const token = createAuthToken(dbUser.id);

    try {
        await triggerVerificationEmail(user.email, verificationToken);
    } catch (error) {
        console.error('Failed to enqueue verification email:', error);
    }

    return {
        success: true,
        token,
        user: {
            id: dbUser.id,
            role: dbUser.role,
            isEmailVerified: Boolean(dbUser.is_email_verified),
        },
    };
}

export async function loginUser(user: LoginUser): Promise<AuthResult> {
    const [dbUser] = await db.selectUserAuth(user.email);
    if (!dbUser) {
        return { success: false, status: 401 };
    }

    if (dbUser.role?.toLowerCase() === 'banned') {
        return { success: false, status: 403 };
    }

    const matches = await bun.password.verify(user.password, dbUser.password_hash);

    if (!matches) {
        return { success: false, status: 401 };
    }

    const token = createAuthToken(dbUser.id);

    return {
        success: true,
        token,
        user: {
            id: dbUser.id,
            role: dbUser.role,
            isEmailVerified: Boolean(dbUser.is_email_verified),
        },
    };
}

export async function verifyEmailToken(token: string): Promise<VerifyEmailResult> {
    const parsedToken = verificationTokenSchema.safeParse(token.trim());
    if (!parsedToken.success) {
        return { success: false, status: 400 };
    }

    const verified = await db.verifyUserEmailByToken(parsedToken.data);

    if (!verified) {
        return { success: false, status: 404 };
    }

    return { success: true };
}

function createAuthToken(userId: string) {
    return jwt.sign({ id: userId }, JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: '7d',
    });
}

function verifyAuthToken(token: string): AuthTokenPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'],
        });

        const parsed = authTokenPayloadSchema.safeParse(decoded);
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export function verifyToken(req: Request): AuthTokenPayload | null {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (token.length === 0) return null;

    return verifyAuthToken(token);
}

export function verifyBearerToken(token: string): AuthTokenPayload | null {
    return verifyAuthToken(token);
}

async function triggerVerificationEmail(email: string, verificationToken: string): Promise<void> {
    if (!AUTH_MAILER_URL) {
        console.warn('AUTH_MAILER_URL is not configured. Verification email trigger skipped.');
        return;
    }

    const verificationLink = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    const response = await fetch(AUTH_MAILER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email,
            verification_link: verificationLink,
        }),
    });

    if (!response.ok) {
        throw new Error(`Mailer worker returned ${response.status}`);
    }
}

import { randomBytes } from 'node:crypto';
import * as bun from 'bun';
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
const PASSWORD_RESET_TTL_MS = 20 * 60 * 1000;

const authTokenPayloadSchema = z.object({
    id: z.string().uuid(),
});

export type AuthTokenPayload = z.infer<typeof authTokenPayloadSchema>;

export type AuthResult =
    | { success: true; token: string; user: { id: string; role: string; isEmailVerified: boolean } }
    | { success: false; status: number };

export type VerifyEmailResult = { success: true } | { success: false; status: number };
export type PasswordResetRequestResult = { success: true } | { success: false; status: number };
export type PasswordResetConfirmResult = { success: true } | { success: false; status: number };
export type UpdateEmailResult =
    | { success: true; email: string; isEmailVerified: false }
    | { success: false; status: number };

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

export async function requestPasswordChange(userId: string): Promise<PasswordResetRequestResult> {
    const email = await db.selectUserEmailById(userId);
    if (!email) {
        return { success: false, status: 404 };
    }

    return await performPasswordChangeTrigger(userId, email);
}

export async function requestPasswordResetByEmail(
    email: string
): Promise<PasswordResetRequestResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await db.selectId(normalizedEmail);
    if (!user) {
        // Return success even if user not found to prevent email enumeration
        return { success: true };
    }

    return await performPasswordChangeTrigger(user.id, normalizedEmail);
}

async function performPasswordChangeTrigger(
    userId: string,
    email: string
): Promise<PasswordResetRequestResult> {
    const resetToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    const stored = await db.storePasswordResetToken(userId, resetToken, expiresAt);

    if (!stored) {
        return { success: false, status: 404 };
    }

    try {
        await triggerPasswordChangeEmail(email, resetToken);
    } catch (error) {
        console.error('Failed to enqueue password reset email:', error);
        await db.clearPasswordResetToken(userId);
        return { success: false, status: 502 };
    }

    return { success: true };
}

export async function confirmPasswordChange(
    token: string,
    newPassword: string
): Promise<PasswordResetConfirmResult> {
    const parsedToken = verificationTokenSchema.safeParse(token.trim());
    if (!parsedToken.success) {
        return { success: false, status: 400 };
    }

    const resetRecord = await db.selectPasswordResetRecord(parsedToken.data);
    if (!resetRecord) {
        return { success: false, status: 404 };
    }

    const expiresAt = resetRecord.password_reset_expires
        ? new Date(resetRecord.password_reset_expires).getTime()
        : NaN;

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        await db.clearPasswordResetTokenByToken(parsedToken.data);
        return { success: false, status: 410 };
    }

    const hashedPass = await bun.password.hash(newPassword);
    const consumed = await db.consumePasswordResetToken(parsedToken.data, hashedPass, new Date());

    if (!consumed) {
        return { success: false, status: 410 };
    }

    return { success: true };
}

export async function changeUserEmail(userId: string, email: string): Promise<UpdateEmailResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const currentEmail = await db.selectUserEmailById(userId);

    if (!currentEmail) {
        return { success: false, status: 404 };
    }

    if (currentEmail.toLowerCase() === normalizedEmail) {
        return { success: false, status: 400 };
    }

    const [existingUser] = await db.selectId(normalizedEmail);
    if (existingUser && existingUser.id !== userId) {
        return { success: false, status: 409 };
    }

    const verificationToken = randomBytes(32).toString('hex');

    try {
        const updated = await db.updateUserEmailWithVerificationToken(
            userId,
            normalizedEmail,
            verificationToken
        );

        if (!updated) {
            return { success: false, status: 404 };
        }
    } catch (error) {
        if (isUniqueViolation(error)) {
            return { success: false, status: 409 };
        }

        throw error;
    }

    try {
        await triggerVerificationEmail(normalizedEmail, verificationToken);
    } catch (error) {
        console.error('Failed to enqueue email verification after email update:', error);
        return { success: false, status: 502 };
    }

    return { success: true, email: normalizedEmail, isEmailVerified: false };
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
    const verificationLink = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    await triggerAuthMailerRequest({
        action: 'verification',
        email,
        verification_link: verificationLink,
    });
}

async function triggerPasswordChangeEmail(email: string, resetToken: string): Promise<void> {
    const passwordChangeLink = `${FRONTEND_URL}/confirm-password?token=${encodeURIComponent(resetToken)}`;

    await triggerAuthMailerRequest({
        action: 'password_change',
        email,
        password_change_link: passwordChangeLink,
    });
}

async function triggerAuthMailerRequest(payload: AuthMailerRequestPayload): Promise<void> {
    if (!AUTH_MAILER_URL) {
        throw new Error('AUTH_MAILER_URL is not configured.');
    }

    const response = await fetch(AUTH_MAILER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Mailer worker returned ${response.status}`);
    }
}

function isUniqueViolation(error: unknown): boolean {
    const value = error as {
        code?: unknown;
        cause?: {
            code?: unknown;
        };
    } | null;

    return String(value?.code ?? value?.cause?.code ?? '') === '23505';
}

type AuthMailerRequestPayload =
    | {
          action: 'verification';
          email: string;
          verification_link: string;
      }
    | {
          action: 'password_change';
          email: string;
          password_change_link: string;
      };

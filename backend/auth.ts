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

const authTokenPayloadSchema = z.object({
    id: z.string().uuid(),
});

export type AuthTokenPayload = z.infer<typeof authTokenPayloadSchema>;

export type AuthResult =
    | { success: true; token: string; user: { id: string; role: string } }
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
    const [dbUser] = await db.insertUser(user.email, hashedPass, user.displayName);

    const token = createAuthToken(dbUser.id);

    return { success: true, token, user: dbUser };
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

    return { success: true, token, user: { id: dbUser.id, role: dbUser.role } };
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

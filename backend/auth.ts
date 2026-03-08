import * as bun from "bun";
import * as db from "./db";
import * as jwt from "jsonwebtoken";

const JWT_SECRET: string | undefined = bun.env.JWT_SECRET;

if (JWT_SECRET == undefined) {
    console.error("JWT_SECRET environment variable MUST be defined.");
    process.exit(1);
}

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
    const dbUser = await db.insertUser(
        user.email,
        hashedPass,
        user.displayName,
    );

    const token = jwt.sign({ id: dbUser.id, role: dbUser.role }, JWT_SECRET!, {
        expiresIn: "7d",
    });

    return { success: true, token: token, user: dbUser };
}

export async function loginUser(user: LoginUser): Promise<AuthResult> {
    const [dbUser] = await db.selectUserAuth(user.email);
    if (!dbUser) {
        return { success: false, status: 401 };
    }

    const matches = await bun.password.verify(
        user.password,
        dbUser.password_hash,
    );

    if (!matches) {
        return { success: false, status: 401 };
    }

    const token = jwt.sign({ id: dbUser.id, role: dbUser.role }, JWT_SECRET!, {
        expiresIn: "7d",
    });

    return { success: true, token, user: { id: dbUser.id, role: dbUser.role } };
}

export function verifyToken(req: Request) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.split(" ")[1];
    if (token == undefined) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET!);
        return decoded;
    } catch (err) {
        return null;
    }
}

import { sql } from "bun";

export async function insertUser(
    email: string,
    hashedPass: string,
    displayname: string,
) {
    return await sql`
    INSERT INTO users (email, display_name, password_hash)
    VALUES (${email}, ${displayname}, ${hashedPass})
    RETURNING id, role
    `;
}

export async function selectId(email: string) {
    return await sql`
    SELECT id FROM users WHERE email = ${email}
    `;
}

export async function selectUser(email: string) {
    return await sql`
    SELECT id, password_hash, role FROM users WHERE email = ${email}
    `;
}

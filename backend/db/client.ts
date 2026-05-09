import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required.');
}

export const sql = postgres(databaseUrl, {
    prepare: false, // Recommended for some Postgres environments (like Neon/Supabase)
});

/**
 * Convenience helper to return exactly one row.
 * Throws an error if zero or multiple rows are returned.
 */
export function one<T>(rows: T[]): T {
    if (rows.length === 0) {
        throw new Error('Expected exactly one row, but got zero.');
    }
    if (rows.length > 1) {
        throw new Error(`Expected exactly one row, but got ${rows.length}.`);
    }
    return rows[0] as T;
}

/**
 * Convenience helper to return the first row or null if none exist.
 * Throws an error if multiple rows are returned.
 */
export function maybeOne<T>(rows: T[]): T | null {
    if (rows.length === 0) {
        return null;
    }
    if (rows.length > 1) {
        throw new Error(`Expected at most one row, but got ${rows.length}.`);
    }
    return (rows[0] as T) ?? null;
}

/**
 * Checks if the error is a Postgres unique constraint violation (code 23505).
 */
export function isUniqueViolation(error: unknown): boolean {
    const value = error as {
        code?: unknown;
        cause?: {
            code?: unknown;
        };
    } | null;

    return String(value?.code ?? value?.cause?.code ?? '') === '23505';
}

export type Sql = typeof sql;

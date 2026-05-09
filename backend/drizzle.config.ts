import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required for Drizzle.');
}

console.log(databaseUrl);

export default defineConfig({
    schema: './drizzle/schema.ts',
    out: './drizzle/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: databaseUrl,
    },
    schemaFilter: ['app'],
    strict: true,
    verbose: true,
});

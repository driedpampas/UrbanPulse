import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL as string, { prepare: false });
const db = drizzle(sql);

try {
    console.log('Running drizzle migrations...');
    migrate(db, { migrationsFolder: './drizzle/migrations' });
    console.log('Migrations complete!');
} catch (err) {
    console.error('Drizzle migrations Failed: ', err);
}

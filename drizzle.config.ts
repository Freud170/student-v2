// oxlint-disable-next-line import/no-unassigned-import
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import process from 'node:process';

const { DATABASE_URL } = process.env;
if (DATABASE_URL === undefined || DATABASE_URL.trim() === '') {
    throw new Error('DATABASE_URL muss fuer Drizzle Kit gesetzt sein.');
}

// oxlint-disable-next-line import/no-default-export
export default defineConfig({
    dialect: 'postgresql',
    dbCredentials: { url: DATABASE_URL },
    schemaFilter: ['student'],
    out: './drizzle',
    schema: 'src/db/schema.mts',
});

import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { type DbConfig } from './db-config.mts';
import { type Logger } from 'pino';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { relations } from '../db/relations.mts';
import { sql } from 'drizzle-orm';

export type Database = {
    db: NodePgDatabase<typeof relations>;
    check: () => Promise<void>;
    close: () => Promise<void>;
};

/** Pool mit TLS fuer einen DB-User; das Passwort wird aus der angegebenen Datei gelesen. */
export const createPool = async (
    config: DbConfig,
    user: string,
    passwordFile: string,
): Promise<Pool> => {
    const [passwordText, ca] = await Promise.all([
        readFile(passwordFile, 'utf8'),
        readFile(config.caFile),
    ]);
    const password = passwordText.trim();
    if (password === '') {
        throw new Error('Die DB-Passwortdatei ist leer.');
    }
    return new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user,
        password,
        ssl: { ca, rejectUnauthorized: true, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' },
        sslnegotiation: 'direct',
        max: config.poolMax,
        idleTimeoutMillis: config.poolIdleTimeoutMillis,
        connectionTimeoutMillis: config.poolConnectionTimeoutMillis,
        query_timeout: config.queryTimeoutMillis,
    });
};

/** Ein Pool pro Anwendung; Verbindungen entstehen erst bei der ersten Abfrage. */
export const createDatabase = async (config: DbConfig, logger: Logger): Promise<Database> => {
    const pool = await createPool(config, config.user, config.passwordFile);
    // Idle-Verbindungsfehler duerfen weder den Prozess beenden noch Zugangsdaten loggen.
    pool.on('error', () => logger.error('Fehler einer unbenutzten DB-Verbindung.'));
    const db = drizzle({ client: pool, relations, logger: false });
    let closing: Promise<void> | undefined;
    return {
        db,
        check: async () => {
            await db.execute(sql`select 1`);
        },
        close: () => {
            closing ??= pool.end();
            return closing;
        },
    };
};

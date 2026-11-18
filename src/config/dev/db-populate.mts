// Neuladen der Test-DB in der Entwicklung, angelehnt an db-populate.mts im Beispiel der
// Vorlesung: Tabellen loeschen und neu anlegen (DB-User student), danach die CSV-Dateien
// importieren (Superuser, weil COPY ... FROM Dateien auf dem DB-Server liest).

import { type Database, createPool } from '../db.mts';
import { type DbConfig } from '../db-config.mts';
import { type Logger } from 'pino';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';

// Dieselben SQL-Skripte wie bei der Einrichtung von PostgreSQL
const sqlURL = new URL('../../../extras/compose/postgres/init/student/sql/', import.meta.url);

const readScript = (name: string): Promise<string> => readFile(new URL(name, sqlURL), 'utf8');

export type DbPopulate = () => Promise<void>;

export const createDbPopulate =
    (database: Pick<Database, 'db'>, config: DbConfig, logger: Logger): DbPopulate =>
    async () => {
        logger.warn('Die DB wird neu geladen');
        const [dropStatements, createStatements, copyStatements] = await Promise.all([
            readScript('drop-table.sql'),
            readScript('create-table.sql'),
            readScript('copy-csv.sql'),
        ]);

        // sql.raw: der Inhalt der Skripte wird unveraendert an PostgreSQL geschickt
        await database.db.transaction(async (tx) => {
            await tx.execute(sql.raw(dropStatements));
            await tx.execute(sql.raw(createStatements));
        });

        // Eigener, kurzlebiger Pool fuer den Superuser: nur fuer das Neuladen geoeffnet
        const adminPool = await createPool(config, config.admin, config.adminPasswordFile);
        try {
            await drizzle({ client: adminPool }).transaction(async (tx) => {
                await tx.execute(sql.raw(copyStatements));
            });
        } finally {
            await adminPool.end();
        }
        logger.warn('Die DB wurde neu geladen');
    };

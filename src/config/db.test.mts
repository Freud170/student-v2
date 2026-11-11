import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DbConfigSchema } from './db-config.mts';
import { Pool } from 'pg';
import { createDatabase } from './db.mts';
import { pino } from 'pino';
import { type readFile } from 'node:fs/promises';

const mocks = vi.hoisted(() => {
    return {
        readFile: vi.fn<typeof readFile>(),
        end: vi.fn<() => Promise<void>>(),
        on: vi.fn<(event: string, handler: (err: Error) => void) => void>(),
    };
});
vi.mock(import('node:fs/promises'), async (importOriginal) => {
    return { ...(await importOriginal()), readFile: mocks.readFile as typeof readFile };
});
vi.mock(import('pg'), async (importOriginal) => {
    class TestPool {
        end = mocks.end;
        on = mocks.on;
    }
    return {
        ...(await importOriginal()),
        // Fuer diese Tests genuegen Event-Registrierung und Pool-Ende.
        Pool: vi.fn<typeof TestPool>(TestPool) as unknown as typeof Pool,
    };
});
const config = DbConfigSchema.parse({ passwordFile: 'test-password', caFile: 'test-ca' });
const logger = pino({ level: 'silent' });

const resetMocks = () => {
    vi.clearAllMocks();
    mocks.readFile.mockReset();
    mocks.readFile
        .mockResolvedValueOnce('fixture-secret\n')
        .mockResolvedValueOnce(Buffer.from('CA'));
    mocks.end.mockReset().mockResolvedValue(undefined);
};

describe('DB-Pool ohne echte Verbindung', () => {
    beforeEach(resetMocks);

    test('TLS-Vertrauen und Poolgrenzen werden explizit uebergeben', async () => {
        const database = await createDatabase(config, logger);
        expect(Pool).toHaveBeenCalledExactlyOnceWith({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: 'fixture-secret',
            ssl: {
                ca: Buffer.from('CA'),
                rejectUnauthorized: true,
                minVersion: 'TLSv1.3',
                maxVersion: 'TLSv1.3',
            },
            sslnegotiation: 'direct',
            max: config.poolMax,
            idleTimeoutMillis: config.poolIdleTimeoutMillis,
            connectionTimeoutMillis: config.poolConnectionTimeoutMillis,
            query_timeout: config.queryTimeoutMillis,
        });
        const first = database.close();
        expect(database.close()).toBe(first);
        await first;
        expect(mocks.end).toHaveBeenCalledOnce();
    });

    test('Fehler beim Schliessen werden weitergegeben und nicht erneut ausgefuehrt', async () => {
        mocks.end.mockRejectedValue(new Error('Pool kann nicht schliessen'));
        const database = await createDatabase(config, logger);
        await expect(database.close()).rejects.toThrow('Pool kann nicht schliessen');
        await expect(database.close()).rejects.toThrow('Pool kann nicht schliessen');
        expect(mocks.end).toHaveBeenCalledOnce();
    });
});

describe('DB-Konfigurationsfehler', () => {
    beforeEach(resetMocks);

    test('fehlende Ressource erzeugt keinen Pool', async () => {
        mocks.readFile.mockReset().mockRejectedValue(new Error('Datei fehlt'));
        await expect(createDatabase(config, logger)).rejects.toThrow('Datei fehlt');
        expect(Pool).not.toHaveBeenCalled();
    });

    test('leeres Passwort erzeugt keinen Pool', async () => {
        mocks.readFile
            .mockReset()
            .mockResolvedValueOnce(' \n')
            .mockResolvedValueOnce(Buffer.from('CA'));
        await expect(createDatabase(config, logger)).rejects.toThrow('DB-Passwortdatei ist leer');
        expect(Pool).not.toHaveBeenCalled();
    });

    test('Idle-Fehler loggen keine internen Fehlerdetails', async () => {
        const lines: string[] = [];
        const log = pino({}, { write: (line) => lines.push(line) });
        const database = await createDatabase(config, log);
        const handler = mocks.on.mock.calls[0]?.[1] as (err: Error) => void;
        handler(new Error('fixture-secret'));
        expect(lines.join('')).toContain('Fehler einer unbenutzten DB-Verbindung');
        expect(lines.join('')).not.toContain('fixture-secret');
        await database.close();
    });
});

import { describe, expect, test, vi } from 'vitest';
import { ConfigSchema } from '../config.mts';
import { createApp } from '../../app.mts';
import { createContainer } from '../../container.mts';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pino } from 'pino';
import { relations } from '../../db/relations.mts';

const NOT_FOUND = 404;

// App ohne Datenbank; populate steuert, ob /dev eingehaengt wird
const setup = (populate: boolean, role = 'admin') => {
    const config = ConfigSchema.parse({ server: {}, db: { populate } });
    const database = {
        db: drizzle.mock({ relations }),
        close: vi.fn<() => Promise<void>>(),
        check: vi.fn<() => Promise<void>>(),
    };
    const container = createContainer(config, database, pino({ level: 'silent' }));
    const verify = vi.spyOn(container.tokenVerifier, 'verify').mockResolvedValue({
        resource_access: { 'student-client': { roles: [role] } },
    });
    const dbPopulate = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const app = createApp({ ...container, dbPopulate });
    return { app, dbPopulate, verify };
};

const headers = { Authorization: 'Bearer test-token' };

describe('QUERY /dev/db_populate', () => {
    test('mit populate = true wird die DB neu geladen', async () => {
        const { app, dbPopulate } = setup(true);
        const response = await app.request('/dev/db_populate', { method: 'QUERY', headers });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toStrictEqual({ db_populate: 'ok' });
        expect(dbPopulate).toHaveBeenCalledOnce();
    });

    test('ohne populate gibt es den Dev-Router nicht', async () => {
        const { app, dbPopulate } = setup(false);
        const response = await app.request('/dev/db_populate', { method: 'QUERY', headers });

        expect(response.status).toBe(NOT_FOUND);
        expect(dbPopulate).not.toHaveBeenCalled();
    });

    test('Fehler beim Neuladen liefern 500 ohne Details', async () => {
        const { app, dbPopulate } = setup(true);
        dbPopulate.mockRejectedValue(new Error('COPY fehlgeschlagen'));
        const response = await app.request('/dev/db_populate', { method: 'QUERY', headers });

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toStrictEqual({ msg: 'Interner Serverfehler' });
    });
});

describe('Dev-Berechtigungen', () => {
    test('ohne Token wird die DB nicht neu geladen', async () => {
        const { app, dbPopulate, verify } = setup(true);
        const response = await app.request('/dev/db_populate', { method: 'QUERY' });
        expect(response.status).toBe(401);
        expect(dbPopulate).not.toHaveBeenCalled();
        expect(verify).not.toHaveBeenCalled();
    });

    test('student darf die DB nicht neu laden', async () => {
        const { app, dbPopulate, verify } = setup(true, 'student');
        const response = await app.request('/dev/db_populate', { method: 'QUERY', headers });
        expect(response.status).toBe(403);
        expect(dbPopulate).not.toHaveBeenCalled();
        expect(verify).toHaveBeenCalledExactlyOnceWith('test-token');
    });

    test('mit populate=false wird auch ein Token nicht ausgewertet', async () => {
        const { app, dbPopulate, verify } = setup(false);
        const response = await app.request('/dev/db_populate', { method: 'QUERY', headers });
        expect(response.status).toBe(404);
        expect(dbPopulate).not.toHaveBeenCalled();
        expect(verify).not.toHaveBeenCalled();
    });
});

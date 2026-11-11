import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ConfigSchema } from './config/config.mts';
import { EventEmitter } from 'node:events';
import { type ServerType } from '@hono/node-server';
import { createContainer } from './container.mts';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pino } from 'pino';
import { relations } from './db/relations.mts';
import { startServer } from './server.mts';

const mocks = vi.hoisted(() => {
    return { createServer: vi.fn<() => ServerType>() };
});
vi.mock(import('@hono/node-server'), async (importOriginal) => {
    return { ...(await importOriginal()), createAdaptorServer: mocks.createServer };
});

const setup = (listenError = false) => {
    const server = new EventEmitter();
    let finishHttp = (): void => undefined;
    // Die Node-close-API wird mit kontrolliertem Abschluss nachgebildet.
    // oxlint-disable-next-line promise/prefer-await-to-callbacks
    const close = vi.fn<(callback: (err?: Error) => void) => void>((callback) => {
        finishHttp = callback;
    });
    const listen = () =>
        queueMicrotask(() => {
            if (listenError) {
                server.emit('error', new Error('Port belegt'));
            } else {
                server.emit('listening');
            }
        });
    mocks.createServer.mockReturnValue(
        Object.assign(server, { listen, close }) as unknown as ServerType,
    );
    const database = {
        db: drizzle.mock({ relations }),
        close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const container = createContainer(
        ConfigSchema.parse({ server: {} }),
        database,
        pino({ level: 'silent' }),
    );
    return { server, close, finishHttp: () => finishHttp(), container, database };
};

describe('Server-Lebenszyklus ohne Port oder Datenbank', () => {
    beforeEach(() => vi.clearAllMocks());

    test('HTTP-Anfragen und HTTP/2-Sessions werden vor dem Pool beendet', async () => {
        const { server, close, finishHttp, container, database } = setup();
        const running = await startServer(container);
        const session = Object.assign(new EventEmitter(), { close: vi.fn<() => void>() });
        server.emit('session', session);
        const first = running.close();
        expect(running.close()).toBe(first);
        expect(session.close).toHaveBeenCalledOnce();
        expect(database.close).not.toHaveBeenCalled();
        finishHttp();
        await first;
        expect(close).toHaveBeenCalledOnce();
        expect(database.close).toHaveBeenCalledOnce();
    });

    test('ein Listen-Fehler gibt den Pool frei', async () => {
        const { container, database } = setup(true);
        await expect(startServer(container)).rejects.toThrow('Port belegt');
        expect(database.close).toHaveBeenCalledOnce();
    });

    test('eine fehlende TLS-Datei gibt den Pool frei', async () => {
        const { container, database } = setup();
        container.config.server.keyFile = 'temp/nicht-vorhanden/server.key';
        await expect(startServer(container)).rejects.toThrow('ENOENT');
        expect(mocks.createServer).not.toHaveBeenCalled();
        expect(database.close).toHaveBeenCalledOnce();
    });
});

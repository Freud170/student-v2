import { type Http2Session, createSecureServer } from 'node:http2';
import { type ServerType, createAdaptorServer } from '@hono/node-server';
import { type Container } from './container.mts';
import { createApp } from './app.mts';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

// Node erwartet fuer close einen Callback; HTTP/2-Sessions separat auslaufen lassen.
const closeHttp = (server: ServerType, sessions: Set<Http2Session>): Promise<void> =>
    // Callback-API von Node in eine abwartbare Freigabe umwandeln.
    // oxlint-disable-next-line promise/avoid-new
    new Promise((resolve, reject) => {
        // oxlint-disable-next-line promise/prefer-await-to-callbacks
        server.close((err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
        for (const session of sessions) {
            session.close();
        }
    });

const closeResources = async (
    server: ServerType,
    sessions: Set<Http2Session>,
    database: Container['database'],
): Promise<void> => {
    try {
        await closeHttp(server, sessions);
    } finally {
        await database.close();
    }
};

/** Start und Freigabe der Ressourcen; auch ein fehlgeschlagener Start schliesst den Pool. */
export const startServer = async (container: Container) => {
    const { port, keyFile, certFile, allowHTTP1 } = container.config.server;
    try {
        const [key, cert] = await Promise.all([readFile(keyFile), readFile(certFile)]);
        const server = createAdaptorServer({
            fetch: createApp(container).fetch,
            createServer: createSecureServer,
            serverOptions: { key, cert, allowHTTP1, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' },
        });
        const sessions = new Set<Http2Session>();
        server.on('session', (session: Http2Session) => {
            sessions.add(session);
            session.once('close', () => sessions.delete(session));
        });
        const listening = once(server, 'listening');
        server.listen(port);
        await listening;
        container.logger.info(`Der Server ist mit HTTPS gestartet: https://localhost:${port}`);
        let closing: Promise<void> | undefined;
        return {
            server,
            close: () => {
                closing ??= closeResources(server, sessions, container.database);
                return closing;
            },
        };
    } catch (err) {
        await container.database.close();
        throw err;
    }
};

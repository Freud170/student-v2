import { describe, expect, test } from 'vitest';
import { type AddressInfo } from 'node:net';
import { type RequestListener } from 'node:http';
import { createJwksFetch } from './jwks-fetch.mts';
import { createServer } from 'node:https';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

const caFile = fileURLToPath(new URL('../config/tls/certificate.crt', import.meta.url));
const TIMEOUT = 2000;
const options = () => {
    return {
        headers: new Headers({ Accept: 'application/json' }),
        method: 'GET' as const,
        redirect: 'manual' as const,
        signal: AbortSignal.timeout(TIMEOUT),
    };
};

const withServer = async (handler: RequestListener, run: (url: string) => Promise<void>) => {
    const [key, cert] = await Promise.all([
        readFile(new URL('../config/tls/key.pem', import.meta.url)),
        readFile(caFile),
    ]);
    const server = createServer(
        { key, cert, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' },
        handler,
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    try {
        await run(`https://127.0.0.1:${port}/certs`);
    } finally {
        server.closeAllConnections();
        // Callback-API von Node fuer den lokalen Testserver.
        // oxlint-disable-next-line promise/avoid-new
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
    }
};

describe('JWKS ueber HTTPS', () => {
    test('vertraut der konfigurierten CA und liefert die JSON-Antwort', async () => {
        await withServer(
            (_request, response) => response.end('{"keys":[]}'),
            async (url) => {
                const response = await createJwksFetch(caFile)(url, options());
                expect(response.status).toBe(200);
                await expect(response.json()).resolves.toStrictEqual({ keys: [] });
            },
        );
    });

    test('lehnt eine fremde CA auch bei global deaktivierter TLS-Pruefung ab', async () => {
        const wrongCa = fileURLToPath(
            new URL('../../extras/compose/postgres/init/tls/server.crt', import.meta.url),
        );
        await withServer(
            (_request, response) => response.end('{"keys":[]}'),
            async (url) => {
                await expect(createJwksFetch(wrongCa)(url, options())).rejects.toThrow(
                    /self-signed certificate/iu,
                );
            },
        );
    });

    test('lehnt einen fehlenden Vertrauensanker ab', async () => {
        await expect(
            createJwksFetch(`${caFile}.missing`)('https://localhost/certs', options()),
        ).rejects.toMatchObject({ code: 'ENOENT' });
    });
});

const FOUND = 302;
const SERVICE_UNAVAILABLE = 503;
describe('JWKS-Transportgrenzen', () => {
    test.each([FOUND, SERVICE_UNAVAILABLE])(
        'akzeptiert HTTP %i nicht und folgt keinen Redirects',
        async (status) => {
            await withServer(
                (_request, response) => {
                    response.writeHead(status, { Location: 'https://unreachable.invalid/certs' });
                    response.end();
                },
                async (url) => {
                    await expect(createJwksFetch(caFile)(url, options())).rejects.toThrow(
                        'HTTP 200',
                    );
                },
            );
        },
    );

    test('bricht auch eine unvollstaendige Antwort nach dem Timeout ab', async () => {
        let responseStarted = false;
        await withServer(
            (_request, response) => {
                responseStarted = true;
                response.writeHead(200);
                response.write('{');
            },
            async (url) => {
                const timeout = 250;
                await expect(
                    createJwksFetch(caFile)(url, {
                        ...options(),
                        signal: AbortSignal.timeout(timeout),
                    }),
                ).rejects.toThrow(/abort/iu);
                expect(responseStarted).toBe(true);
            },
        );
    });

    test('begrenzt die Antwortgroesse', async () => {
        const oversized = 1_048_577;
        await withServer(
            (_request, response) => response.end('x'.repeat(oversized)),
            async (url) => {
                await expect(createJwksFetch(caFile)(url, options())).rejects.toThrow('zu gross');
            },
        );
    });
});

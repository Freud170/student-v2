import { describe, expect, test, vi } from 'vitest';
import { ConfigSchema } from './config/config.mts';
import { createApp } from './app.mts';
import { createContainer } from './container.mts';
import { pino } from 'pino';

const origin = 'https://localhost:5173';

const setup = (level = 'debug') => {
    const lines: string[] = [];
    const logger = pino({ level }, { write: (line) => lines.push(line) });
    const config = ConfigSchema.parse({ server: {}, cors: { origins: [origin] } });
    const container = createContainer(config, logger);
    return { app: createApp(container), container, lines };
};

describe('App und manuelle DI', () => {
    test('bestehender Einstieg und Student-Router sind getrennt erreichbar', async () => {
        const { app } = setup();
        const hello = await app.request('/');
        const student = await app.request('/rest');

        expect(hello.status).toBe(200);
        await expect(hello.json()).resolves.toStrictEqual({ msg: 'Hello World' });
        expect(student.status).toBe(200);
        await expect(student.json()).resolves.toStrictEqual({ msg: 'Hello Student' });
    });

    test('Requests verwenden dieselbe injizierte Service-Instanz', async () => {
        const { app, container } = setup();
        const hello = vi.spyOn(container.studentService, 'hello');
        hello.mockReturnValue({ msg: 'Injizierter Service' });

        const first = await app.request('/rest');
        const second = await app.request('/rest');

        await expect(first.json()).resolves.toStrictEqual({ msg: 'Injizierter Service' });
        await expect(second.json()).resolves.toStrictEqual({ msg: 'Injizierter Service' });
        const requestCount = 2;
        expect(hello).toHaveBeenCalledTimes(requestCount);
    });

    test('unbekannte Routen liefern JSON mit Status 404', async () => {
        const { app } = setup();
        const response = await app.request('/unbekannt');

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toStrictEqual({ msg: 'Nicht gefunden' });
    });
});

describe('Health-Endpunkte', () => {
    test.each(['/health/liveness', '/health/readiness'])(
        'GET %s liefert den Anwendungsstatus als JSON',
        async (path) => {
            const { app, lines } = setup();
            const response = await app.request(path);

            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Type')).toContain('application/json');
            await expect(response.json()).resolves.toStrictEqual({ status: 'up' });
            expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=');
            expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
            expect(response.headers.get('X-Response-Time')).toMatch(/^\d+\.\d{3}ms$/u);
            expect(lines.map((line): unknown => JSON.parse(line))).toContainEqual(
                expect.objectContaining({ method: 'GET', path, status: 200, msg: 'HTTP request' }),
            );
        },
    );

    test.each(['/health/liveness', '/health/readiness'])(
        'HEAD %s liefert Status und JSON-Header ohne Body',
        async (path) => {
            const { app } = setup();
            const response = await app.request(path, { method: 'HEAD' });

            expect(response.status).toBe(200);
            expect(response.headers.get('Content-Type')).toContain('application/json');
            await expect(response.text()).resolves.toBe('');
        },
    );
});

// Die Faelle pruefen die gemeinsame Middleware-Kette einschliesslich Kurzschluessen.
describe('HTTP-Middleware', () => {
    test.each([
        { method: 'GET', path: '/', status: 200 },
        { method: 'GET', path: '/unbekannt', status: 404 },
        { method: 'OPTIONS', path: '/rest', status: 204 },
    ])('Header und Logging fuer $method $path', async ({ method, path, status }) => {
        const { app, lines } = setup();
        const response = await app.request(path, { method, headers: { Origin: origin } });

        expect(response.status).toBe(status);
        expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=');
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
        expect(response.headers.get('X-Powered-By')).toBeNull();
        expect(response.headers.get('X-Response-Time')).toMatch(/^\d+\.\d{3}ms$/u);
        expect(lines.map((line): unknown => JSON.parse(line))).toContainEqual(
            expect.objectContaining({ method, path, status, msg: 'HTTP request' }),
        );
    });

    test('Fehler bleiben intern und durchlaufen dieselbe Middleware', async () => {
        const { app, container, lines } = setup();
        vi.spyOn(container.studentService, 'hello').mockImplementation(() => {
            throw new Error('Interne Fehlerdetails');
        });
        const response = await app.request('/rest', { headers: { Origin: origin } });

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toStrictEqual({ msg: 'Interner Serverfehler' });
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(response.headers.get('X-Response-Time')).toMatch(/^\d+\.\d{3}ms$/u);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        expect(lines.map((line): unknown => JSON.parse(line))).toContainEqual(
            expect.objectContaining({ status: 500, msg: 'HTTP request' }),
        );
    });

    test('sensible Request-Inhalte erscheinen nicht im Log', async () => {
        const { app, lines } = setup();
        await app.request('/rest?token=query-secret', {
            method: 'POST',
            headers: { Authorization: 'Bearer auth-secret', Cookie: 'session=cookie-secret' },
            body: 'body-secret',
        });

        expect(lines.join('')).not.toContain('secret');
        expect(lines.map((line): unknown => JSON.parse(line))).toContainEqual(
            expect.objectContaining({ method: 'POST', path: '/rest', status: 404 }),
        );
    });

    test('Antwortzeit bleibt bei abgeschaltetem Logging verfuegbar', async () => {
        const { app, lines } = setup('silent');
        const response = await app.request('/rest');

        expect(response.headers.get('X-Response-Time')).toMatch(/^\d+\.\d{3}ms$/u);
        expect(lines).toHaveLength(0);
    });
});

describe('CORS', () => {
    test('freigegebene Origin und sichtbare Response-Header', async () => {
        const { app } = setup();
        const response = await app.request('/rest', { headers: { Origin: origin } });

        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        expect(response.headers.get('Access-Control-Expose-Headers')).toContain('X-Response-Time');
        expect(response.headers.get('Vary')).toContain('Origin');
    });

    test.each(['https://example.org', `${origin}.example.org`, 'null'])(
        'keine Browserfreigabe fuer %s',
        async (untrustedOrigin) => {
            const { app } = setup();
            const response = await app.request('/rest', { headers: { Origin: untrustedOrigin } });

            expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
            expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
        },
    );

    test('Preflight verwendet die expliziten Methoden und Header', async () => {
        const { app } = setup();
        const response = await app.request('/rest', {
            method: 'OPTIONS',
            headers: {
                Origin: origin,
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'Authorization,X-Untrusted',
            },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET,HEAD');
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
        expect(response.headers.get('Access-Control-Allow-Headers')).not.toContain('X-Untrusted');
        await expect(response.text()).resolves.toBe('');
    });
});

describe('Kompression', () => {
    test('gzip-Antwort bleibt nach dem Entpacken lesbares JSON', async () => {
        const { app } = setup();
        const response = await app.request('/rest', {
            headers: { 'Accept-Encoding': 'gzip', Origin: origin },
        });
        const compressed = new Blob([await response.arrayBuffer()]);
        const decoded = new Response(
            compressed.stream().pipeThrough(new DecompressionStream('gzip')),
        );

        expect(response.headers.get('Content-Encoding')).toBe('gzip');
        expect(response.headers.get('Vary')).toContain('Accept-Encoding');
        expect(response.headers.get('Vary')).toContain('Origin');
        await expect(decoded.json()).resolves.toStrictEqual({ msg: 'Hello Student' });
    });

    test.each(['identity', 'gzip;q=0'])('keine Kompression bei %s', async (encoding) => {
        const { app } = setup();
        const response = await app.request('/rest', { headers: { 'Accept-Encoding': encoding } });

        expect(response.headers.get('Content-Encoding')).toBeNull();
        await expect(response.json()).resolves.toStrictEqual({ msg: 'Hello Student' });
    });

    test('HEAD liefert auch bei gzip keinen Body', async () => {
        const { app } = setup();
        const response = await app.request('/rest', {
            method: 'HEAD',
            headers: { 'Accept-Encoding': 'gzip' },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Encoding')).toBeNull();
        await expect(response.text()).resolves.toBe('');
    });
});

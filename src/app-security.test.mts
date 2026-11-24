import { KeycloakUnavailableError, UnauthorizedError } from './security/errors.mts';
import { describe, expect, test, vi } from 'vitest';
import { ConfigSchema } from './config/config.mts';
import { createApp } from './app.mts';
import { createContainer } from './container.mts';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pino } from 'pino';
import { relations } from './db/relations.mts';

const origin = 'https://localhost:5173';
const headers = { Origin: origin, Authorization: 'Bearer private-test-token' };
const studentNeu = {
    matrikelnummer: '111111',
    nachname: 'Test',
    vorname: 'Theo',
    email: 'theo.test@h-ka.de',
    username: 'theo',
    adresse: { plz: '76133', ort: 'Karlsruhe' },
    pruefungsleistungen: [],
};

const setup = () => {
    const lines: string[] = [];
    const config = ConfigSchema.parse({ server: {}, db: { populate: true } });
    const database = {
        db: drizzle.mock({ relations }),
        check: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        close: vi.fn<() => Promise<void>>(),
    };
    const container = createContainer(
        config,
        database,
        pino(
            { level: 'debug' },
            {
                write: (line) => lines.push(line),
            },
        ),
    );
    const verify = vi.spyOn(container.tokenVerifier, 'verify').mockResolvedValue({
        resource_access: { 'student-client': { roles: ['student'] } },
    });
    const studentId = 1000;
    const create = vi.spyOn(container.studentWriteService, 'create').mockResolvedValue(studentId);
    const update = vi.spyOn(container.studentWriteService, 'update').mockResolvedValue(1);
    const populate = vi.spyOn(container, 'dbPopulate').mockResolvedValue(undefined);
    vi.spyOn(container.studentService, 'find').mockResolvedValue([]);
    return { app: createApp(container), verify, create, update, populate, lines };
};

describe('Berechtigungsmatrix der zusammengesetzten App', () => {
    test.each(['/', '/rest', '/health/liveness', '/health/readiness'])(
        'GET und HEAD %s sind ohne Keycloak erreichbar',
        async (path) => {
            const { app, verify } = setup();
            const response = await app.request(path);
            const head = await app.request(path, { method: 'HEAD' });
            expect(response.status).toBe(200);
            expect(head.status).toBe(200);
            expect(verify).not.toHaveBeenCalled();
        },
    );

    test('POST erreicht nach Rollenpruefung den injizierten Schreibservice', async () => {
        const { app, verify, create, populate } = setup();
        const response = await app.request('/rest', {
            method: 'POST',
            headers,
            body: JSON.stringify(studentNeu),
        });
        expect(response.status).toBe(201);
        expect(verify).toHaveBeenCalledExactlyOnceWith('private-test-token');
        expect(create).toHaveBeenCalledExactlyOnceWith(studentNeu);
        expect(populate).not.toHaveBeenCalled();
    });

    test.each(['POST', 'PUT'])('Preflight gibt %s ohne Token frei', async (method) => {
        const { app, verify, create, update } = setup();
        const response = await app.request('/rest/1', {
            method: 'OPTIONS',
            headers: {
                Origin: origin,
                'Access-Control-Request-Method': method,
                'Access-Control-Request-Headers': 'Authorization,Content-Type,If-Match',
            },
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('If-Match');
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain(method);
        expect(verify).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });
});

const unavailable = 503;
describe('PUT in der zusammengesetzten App', () => {
    test('PUT erreicht den Schreibservice und legt den ETag fuer CORS offen', async () => {
        const { app, verify, update, create } = setup();
        const response = await app.request('/rest/1', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': '"0"' },
            body: JSON.stringify(studentNeu),
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('ETag')).toBe('"1"');
        expect(response.headers.get('Access-Control-Expose-Headers')).toContain('ETag');
        expect(verify).toHaveBeenCalledExactlyOnceWith('private-test-token');
        expect(update).toHaveBeenCalledExactlyOnceWith(1, studentNeu, '"0"');
        expect(create).not.toHaveBeenCalled();
    });
});

describe('Abgelehnte Anfragen in der gemeinsamen Middleware-Kette', () => {
    test.each([
        { path: '/rest', method: 'POST', status: 401, error: new UnauthorizedError() },
        { path: '/rest/1', method: 'PUT', status: 401, error: new UnauthorizedError() },
        {
            path: '/rest/1',
            method: 'PUT',
            status: unavailable,
            error: new KeycloakUnavailableError(),
        },
        {
            path: '/rest',
            method: 'POST',
            status: unavailable,
            error: new KeycloakUnavailableError(),
        },
        { path: '/dev/db_populate', method: 'QUERY', status: 403, error: undefined },
    ])(
        '$method $path: $status ohne Nebenwirkung oder sensible Logs',
        async ({ path, method, status, error }) => {
            const { app, verify, create, update, populate, lines } = setup();
            if (error) {
                verify.mockRejectedValue(error);
            }
            const response = await app.request(path, { method, headers, body: 'private-body' });
            expect(response.status).toBe(status);
            expect(response.headers.get('Content-Type')).toBe('application/problem+json');
            expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
            expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
            expect(response.headers.get('X-Response-Time')).toMatch(/^\d+\.\d{3}ms$/u);
            expect(lines.join('')).not.toContain('private-');
            expect(lines.map((line): unknown => JSON.parse(line))).toContainEqual(
                expect.objectContaining({ method, path, status, msg: 'HTTP request' }),
            );
            expect(create).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
            expect(populate).not.toHaveBeenCalled();
        },
    );
});

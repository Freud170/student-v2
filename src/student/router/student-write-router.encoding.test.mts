import { describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import { type StudentWriteService } from '../service/student-write-service.mts';
import { type TokenVerifier } from '../../security/token-verifier.mts';
import { createErrorHandler } from '../../error-handler.mts';
import { createRolesRequired } from '../../security/roles-required.mts';
import { createStudentWriteRouter } from './student-write-router.mts';
import { gzip } from 'node:zlib';
import { pino } from 'pino';
import { promisify } from 'node:util';

const compress = promisify(gzip);
const UNSUPPORTED_MEDIA_TYPE = 415;

const daten = {
    matrikelnummer: '111111',
    nachname: 'Test',
    vorname: 'Theo',
    email: 'theo.test@h-ka.de',
    username: 'theo',
    adresse: { plz: '76133', ort: 'Karlsruhe' },
    pruefungsleistungen: [],
};
const body = JSON.stringify(daten);
const setup = (role = 'student') => {
    const service = {
        create: vi.fn<StudentWriteService['create']>().mockResolvedValue(1),
        update: vi.fn<StudentWriteService['update']>().mockResolvedValue(1),
    };
    const verifier = {
        verify: vi.fn<TokenVerifier['verify']>().mockResolvedValue({
            resource_access: { 'student-client': { roles: [role] } },
        }),
    };
    const router = createStudentWriteRouter(
        service,
        createRolesRequired(verifier, 'student-client'),
    );
    const app = new Hono().route('/rest', router);
    app.onError(createErrorHandler(pino({ level: 'silent' })));
    return { app, service };
};

const routes = [
    { method: 'POST', path: '/rest', success: 201, operation: 'create' },
    { method: 'PUT', path: '/rest/1', success: 204, operation: 'update' },
] as const;
const headers = {
    Authorization: 'Bearer test-token',
    'Content-Type': 'application/json',
    'If-Match': '"0"',
};

describe.each(routes)('$method: abgelehntes Content-Encoding', ({ method, path, operation }) => {
    test.each(['gzip', 'br', 'deflate', 'unknown', 'gzip, identity', 'identity, gzip', ''])(
        '%j liefert 415 ohne Body-Lesen oder Service-Aufruf',
        async (encoding) => {
            const { app, service } = setup();
            const request = new Request(`https://localhost${path}`, {
                method,
                headers: { ...headers, 'Content-Encoding': encoding },
                body,
            });
            const response = await app.request(request);
            expect(response.status).toBe(UNSUPPORTED_MEDIA_TYPE);
            expect(response.headers.get('Accept-Encoding')).toBe('identity');
            await expect(response.json()).resolves.toStrictEqual({
                title: 'Unsupported Media Type',
                statusCode: 415,
                detail: 'Nur unkomprimierte Request-Bodies sind erlaubt.',
            });
            expect(request.bodyUsed).toBe(false);
            expect(service.create).not.toHaveBeenCalled();
            expect(service.update).not.toHaveBeenCalled();
        },
    );

    test('echte gzip-Bytes werden vor dem JSON-Parser abgelehnt', async () => {
        const { app, service } = setup();
        const request = new Request(`https://localhost${path}`, {
            method,
            headers: { ...headers, 'Content-Encoding': 'gzip' },
            body: new Uint8Array(await compress(body)),
        });
        expect((await app.request(request)).status).toBe(UNSUPPORTED_MEDIA_TYPE);
        expect(request.bodyUsed).toBe(false);
        expect(service[operation]).not.toHaveBeenCalled();
    });
});

describe.each(routes)(
    '$method: unkomprimiert und Berechtigungen',
    ({ method, path, success, operation }) => {
        test.each([undefined, 'identity', ' IdEnTiTy '])(
            '%j erlaubt normalen JSON-Body',
            async (encoding) => {
                const { app, service } = setup();
                const response = await app.request(path, {
                    method,
                    body,
                    headers: {
                        ...headers,
                        ...(encoding === undefined ? {} : { 'Content-Encoding': encoding }),
                    },
                });
                expect(response.status).toBe(success);
                expect(service[operation]).toHaveBeenCalledOnce();
            },
        );

        test.each([
            { token: false, role: 'student', status: 401 },
            { token: true, role: 'reader', status: 403 },
        ])('Berechtigungsfehler $status hat Vorrang vor 415', async ({ token, role, status }) => {
            const { app, service } = setup(role);
            const request = new Request(`https://localhost${path}`, {
                method,
                body: new Uint8Array(await compress(body)),
                headers: {
                    'Content-Encoding': 'gzip',
                    ...(token ? { Authorization: headers.Authorization } : {}),
                },
            });
            expect((await app.request(request)).status).toBe(status);
            expect(request.bodyUsed).toBe(false);
            expect(service[operation]).not.toHaveBeenCalled();
        });
    },
);

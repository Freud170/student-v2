import { KeycloakUnavailableError, UnauthorizedError } from './errors.mts';
import { describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import { type JWTPayload } from 'jose';
import { type TokenVerifier } from './token-verifier.mts';
import { createErrorHandler } from '../error-handler.mts';
import { createRolesRequired } from './roles-required.mts';
import { pino } from 'pino';

const adminClaims = { resource_access: { 'student-client': { roles: ['admin'] } } };
const setup = (payload: JWTPayload = adminClaims) => {
    const verifier = { verify: vi.fn<TokenVerifier['verify']>().mockResolvedValue(payload) };
    const rolesRequired = createRolesRequired(verifier, 'student-client');
    const reached = vi.fn<() => void>();
    const app = new Hono();
    const lines: string[] = [];
    app.get('/', rolesRequired('admin'), (c) => {
        reached();
        return c.json({ ok: true });
    });
    app.onError(createErrorHandler(pino({}, { write: (line) => lines.push(line) })));
    const request = (authorization = 'Bearer test-token') =>
        app.request('/', { headers: { Authorization: authorization } });
    return { app, request, verifier, reached, lines };
};

describe('Bearer-Authentifizierung', () => {
    test.each([
        '',
        'Basic abc',
        'Bearer',
        'Bearer token extra',
        'Bearer a, Bearer b',
        'Bearer\ttoken',
    ])('lehnt ungueltigen Authorization-Header ab: %j', async (header) => {
        const { request, verifier, reached } = setup();
        const response = await request(header);
        expect(response.status).toBe(401);
        expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
        expect(verifier.verify).not.toHaveBeenCalled();
        expect(reached).not.toHaveBeenCalled();
    });

    test('fehlender Header ergibt 401 mit Bearer-Challenge', async () => {
        const { app, reached } = setup();
        const response = await app.request('/');
        expect(response.status).toBe(401);
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
        await expect(response.json()).resolves.toMatchObject({
            title: 'Unauthorized',
            statusCode: 401,
        });
        expect(reached).not.toHaveBeenCalled();
    });

    test('Schema ist case-insensitive, Token bleibt unveraendert', async () => {
        const { request, verifier, reached } = setup();
        const response = await request('bEaReR  CaseSensitiveToken');
        expect(response.status).toBe(200);
        expect(verifier.verify).toHaveBeenCalledExactlyOnceWith('CaseSensitiveToken');
        expect(reached).toHaveBeenCalledOnce();
    });
});

describe('Client-Rollen', () => {
    test.each([
        {},
        { realm_access: { roles: ['admin'] } },
        { resource_access: { other: { roles: ['admin'] } } },
        { resource_access: null },
        { resource_access: [] },
        { resource_access: { 'student-client': null } },
        { resource_access: { 'student-client': { roles: 'admin' } } },
        { resource_access: { 'student-client': { roles: ['admin', 1] } } },
        { resource_access: { 'student-client': { roles: [] } } },
        { resource_access: { 'student-client': { roles: ['ADMIN'] } } },
        { resource_access: { 'student-client': { roles: ['student'] } } },
        { resource_access: { 'student-client': { roles: ['user'] } } },
    ])('ungueltige oder unpassende Rollen ergeben 403: %j', async (payload) => {
        const { request, verifier, reached } = setup(payload);
        const response = await request();
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            title: 'Forbidden',
            statusCode: 403,
        });
        expect(response.headers.get('WWW-Authenticate')).toBeNull();
        expect(verifier.verify).toHaveBeenCalledOnce();
        expect(reached).not.toHaveBeenCalled();
    });

    test('ignoriert unbenoetigte Rollen und Claims anderer Clients', async () => {
        const { request, reached } = setup({
            resource_access: { 'student-client': { roles: ['other', 'admin'] }, other: null },
        });
        expect((await request()).status).toBe(200);
        expect(reached).toHaveBeenCalledOnce();
    });
});

describe('Fehler des Verifiers', () => {
    test('ungueltige Signatur erreicht den Handler auch mit passenden Rollen nicht', async () => {
        const { request, verifier, reached, lines } = setup();
        verifier.verify.mockRejectedValue(new UnauthorizedError());
        const response = await request();
        expect(response.status).toBe(401);
        expect(reached).not.toHaveBeenCalled();
        expect(lines).toHaveLength(0);
    });

    test('nicht verfuegbare JWKS ergeben 503 und keinen Authentifizierungsfehler', async () => {
        const { request, verifier, reached, lines } = setup();
        verifier.verify.mockRejectedValueOnce(new KeycloakUnavailableError());
        const response = await request();
        const unavailable = 503;
        expect(response.status).toBe(unavailable);
        await expect(response.json()).resolves.toMatchObject({ title: 'Service Unavailable' });
        expect(response.headers.get('WWW-Authenticate')).toBeNull();
        expect(reached).not.toHaveBeenCalled();
        expect(lines.join('')).not.toContain('test-token');
        expect((await request()).status).toBe(200);
        expect(reached).toHaveBeenCalledOnce();
    });
});

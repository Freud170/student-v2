import { describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import { type StudentWriteService } from '../service/student-write-service.mts';
import { type TokenVerifier } from '../../security/token-verifier.mts';
import { UniqueError } from '../service/errors.mts';
import { createErrorHandler } from '../../error-handler.mts';
import { createRolesRequired } from '../../security/roles-required.mts';
import { createStudentWriteRouter } from './student-write-router.mts';
import { pino } from 'pino';

const NEUE_ID = 1000;
const CREATED = 201;
const BAD_REQUEST = 400;
const UNPROCESSABLE_CONTENT = 422;

const studentNeu = {
    matrikelnummer: '111111',
    nachname: 'Test',
    vorname: 'Theo',
    email: 'theo.test@h-ka.de',
    username: 'theo',
    adresse: { plz: '76133', ort: 'Karlsruhe' },
    pruefungsleistungen: [{ modul: 'Softwareengineering', note: 1.3, semester: 'WS 2026/27' }],
};

// Router unter /rest mit derselben globalen Fehlerbehandlung wie in app.mts
const setup = (role = 'admin') => {
    const service = {
        create: vi.fn<StudentWriteService['create']>().mockResolvedValue(NEUE_ID),
    };
    const verifier = {
        verify: vi.fn<TokenVerifier['verify']>().mockResolvedValue({
            resource_access: { 'student-client': { roles: [role] } },
        }),
    };
    const rolesRequired = createRolesRequired(verifier, 'student-client');
    const app = new Hono().route('/rest', createStudentWriteRouter(service, rolesRequired));
    app.onError(createErrorHandler(pino({ level: 'silent' })));
    const post = (body: string) =>
        app.request('https://localhost:3000/rest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
            body,
        });
    return { service, post, app, verifier };
};

describe('POST /rest', () => {
    test('gueltige Daten liefern 201 mit Location und ohne Body', async () => {
        const { service, post } = setup();
        const response = await post(JSON.stringify(studentNeu));

        expect(response.status).toBe(CREATED);
        expect(response.headers.get('Location')).toBe(`https://localhost:3000/rest/${NEUE_ID}`);
        await expect(response.text()).resolves.toBe('');
        expect(service.create).toHaveBeenCalledExactlyOnceWith(studentNeu);
    });

    test('kein gueltiges JSON liefert 400 als Problem Details', async () => {
        const { service, post } = setup();
        const response = await post('{ kaputt');

        expect(response.status).toBe(BAD_REQUEST);
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
        await expect(response.json()).resolves.toMatchObject({ title: 'Bad Request' });
        expect(service.create).not.toHaveBeenCalled();
    });

    test('ungueltige Daten liefern 422 mit den fehlerhaften Feldern', async () => {
        const { service, post } = setup();
        const response = await post(JSON.stringify({ ...studentNeu, matrikelnummer: '12' }));

        expect(response.status).toBe(UNPROCESSABLE_CONTENT);
        await expect(response.json()).resolves.toMatchObject({
            title: 'Unprocessable Content',
            detail: [expect.objectContaining({ path: ['matrikelnummer'] })],
        });
        expect(service.create).not.toHaveBeenCalled();
    });

    test('vergebene Email liefert 422 mit Meldung', async () => {
        const { service, post } = setup();
        service.create.mockRejectedValue(new UniqueError('email', 'theo.test@h-ka.de'));
        const response = await post(JSON.stringify(studentNeu));

        expect(response.status).toBe(UNPROCESSABLE_CONTENT);
        await expect(response.json()).resolves.toMatchObject({
            detail: expect.stringContaining('theo.test@h-ka.de'),
        });
    });
});

describe('POST-Berechtigungen', () => {
    test.each(['admin', 'student'])('%s darf einen Studierenden anlegen', async (role) => {
        const { service, post, verifier } = setup(role);
        const response = await post(JSON.stringify(studentNeu));
        expect(response.status).toBe(CREATED);
        expect(verifier.verify).toHaveBeenCalledExactlyOnceWith('test-token');
        expect(service.create).toHaveBeenCalledExactlyOnceWith(studentNeu);
    });

    test('fehlendes Token wird vor dem Parsen des Bodys abgelehnt', async () => {
        const { app, service, verifier } = setup();
        const response = await app.request('/rest', { method: 'POST', body: '{ kaputt' });
        expect(response.status).toBe(401);
        expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
        expect(service.create).not.toHaveBeenCalled();
        expect(verifier.verify).not.toHaveBeenCalled();
    });

    test('fehlende Client-Rolle verhindert den Service-Aufruf', async () => {
        const { service, post } = setup('reader');
        const response = await post('{ kaputt');
        expect(response.status).toBe(403);
        expect(service.create).not.toHaveBeenCalled();
    });
});

import { describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import { type StudentWriteService } from '../service/student-write-service.mts';
import { UniqueError } from '../service/errors.mts';
import { createErrorHandler } from '../../error-handler.mts';
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
const setup = () => {
    const service = {
        create: vi.fn<StudentWriteService['create']>().mockResolvedValue(NEUE_ID),
    };
    const app = new Hono().route('/rest', createStudentWriteRouter(service));
    app.onError(createErrorHandler(pino({ level: 'silent' })));
    const post = (body: string) =>
        app.request('https://localhost:3000/rest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
    return { service, post };
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

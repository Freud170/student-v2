import { describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import { type Student } from '../entity/student.mts';
import { type StudentRepository } from '../repository/student-repository.mts';
import { StudentWriteService } from '../service/student-write-service.mts';
import { type TokenVerifier } from '../../security/token-verifier.mts';
import { createErrorHandler } from '../../error-handler.mts';
import { createRolesRequired } from '../../security/roles-required.mts';
import { createStudentWriteRouter } from './student-write-router.mts';
import { pino } from 'pino';

const ID = 1000;
const daten = {
    matrikelnummer: '111111',
    nachname: 'Test',
    vorname: 'Theo',
    email: 'theo.test@h-ka.de',
    username: 'theo',
    adresse: { plz: '76133', ort: 'Karlsruhe' },
    pruefungsleistungen: [],
};
const gespeichert: Student = {
    ...daten,
    id: ID,
    version: 0,
    erzeugt: new Date('2026-11-01T10:00:00Z'),
    aktualisiert: new Date('2026-11-01T10:00:00Z'),
    adresse: { ...daten.adresse, id: ID, studentId: ID },
};

// Echte Router-/Service-Kette; nur Repository und Token-Verifier sind ersetzt.
const setup = (role = 'admin') => {
    const repository = {
        create: vi.fn<StudentRepository['create']>(),
        existsBy: vi.fn<StudentRepository['existsBy']>().mockResolvedValue(false),
        findById: vi.fn<StudentRepository['findById']>().mockResolvedValue(gespeichert),
        update: vi.fn<StudentRepository['update']>().mockResolvedValue(1),
    };
    const verifier = {
        verify: vi.fn<TokenVerifier['verify']>().mockResolvedValue({
            resource_access: { 'student-client': { roles: [role] } },
        }),
    };
    const logger = pino({ level: 'silent' });
    const service = new StudentWriteService(logger, repository);
    const router = createStudentWriteRouter(
        service,
        createRolesRequired(verifier, 'student-client'),
    );
    const app = new Hono().route('/rest', router);
    app.notFound((c) => c.json({ msg: 'Nicht gefunden' }, 404));
    app.onError(createErrorHandler(logger));
    const put = (body = JSON.stringify(daten), version: string | null = '"0"', id = String(ID)) =>
        app.request(`/rest/${id}`, {
            method: 'PUT',
            headers: {
                Authorization: 'Bearer test-token',
                'Content-Type': 'application/json',
                ...(version === null ? {} : { 'If-Match': version }),
            },
            body,
        });
    return { repository, verifier, app, put };
};

describe('PUT /rest/:id: Erfolg und Berechtigungen', () => {
    test.each(['admin', 'student'])(
        '%s erhaelt 204 mit neuem ETag und leerem Body',
        async (role) => {
            const { put, repository, verifier } = setup(role);
            const response = await put();
            expect(response.status).toBe(204);
            expect(response.headers.get('ETag')).toBe('"1"');
            expect(response.headers.get('Location')).toBeNull();
            await expect(response.text()).resolves.toBe('');
            expect(verifier.verify).toHaveBeenCalledExactlyOnceWith('test-token');
            const { adresse, pruefungsleistungen, ...student } = daten;
            expect(repository.update).toHaveBeenCalledExactlyOnceWith(ID, 0, {
                student,
                adresse,
                pruefungsleistungen,
            });
            expect(repository.create).not.toHaveBeenCalled();
        },
    );

    test('ohne Token kommt 401 vor Header-/Body-Validierung', async () => {
        const { app, repository, verifier } = setup();
        const response = await app.request(`/rest/${ID}`, { method: 'PUT', body: '{ kaputt' });
        expect(response.status).toBe(401);
        expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
        expect(repository.findById).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
        expect(verifier.verify).not.toHaveBeenCalled();
    });

    test('falsche Rolle liefert 403 vor Header-/Body-Validierung', async () => {
        const { put, repository } = setup('reader');
        const response = await put('{ kaputt', null);
        expect(response.status).toBe(403);
        expect(repository.findById).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
    });
});

describe('PUT /rest/:id: Vorbedingungen', () => {
    test('fehlendes If-Match liefert 428 ohne Cache oder DB-Zugriff', async () => {
        const { put, repository } = setup();
        const response = await put('{ kaputt', null);
        expect(response.status).toBe(428);
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        await expect(response.json()).resolves.toMatchObject({
            title: 'Precondition Required',
            statusCode: 428,
        });
        expect(repository.findById).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
    });

    test.each(['', '0', 'W/"0"', '"1"'])(
        'ungueltiges oder nicht aktuelles If-Match %j liefert 412',
        async (version) => {
            const { put, repository } = setup();
            const response = await put(JSON.stringify(daten), version);
            expect(response.status).toBe(412);
            expect(response.headers.get('Content-Type')).toBe('application/problem+json');
            expect(response.headers.get('ETag')).toBeNull();
            await expect(response.json()).resolves.toMatchObject({
                title: 'Precondition Failed',
                statusCode: 412,
            });
            expect(repository.update).not.toHaveBeenCalled();
        },
    );

    test('veraltete Version nach Vorpruefung liefert ebenfalls 412', async () => {
        const { put, repository } = setup();
        repository.update.mockResolvedValue(undefined);
        const response = await put();
        expect(response.status).toBe(412);
        expect(response.headers.get('ETag')).toBeNull();
        expect(repository.update).toHaveBeenCalledOnce();
    });
});

describe('PUT /rest/:id: ID und Body', () => {
    test.each(['abc', '1abc', '1e3', '-1', '0', '2147483648'])(
        'ungueltige ID %s erreicht das Repository nicht',
        async (id) => {
            const { put, repository } = setup();
            const response = await put(JSON.stringify(daten), '"0"', id);
            expect(response.status).toBe(404);
            await expect(response.json()).resolves.toStrictEqual({ msg: 'Nicht gefunden' });
            expect(repository.findById).not.toHaveBeenCalled();
            expect(repository.update).not.toHaveBeenCalled();
        },
    );

    test('unbekannter Student liefert 404 ohne Neuanlegen', async () => {
        const { put, repository } = setup();
        repository.findById.mockResolvedValue(undefined);
        expect((await put()).status).toBe(404);
        expect(repository.update).not.toHaveBeenCalled();
        expect(repository.create).not.toHaveBeenCalled();
    });

    test.each([
        { body: '{ kaputt', status: 400 },
        { body: '{}', status: 422 },
        { body: JSON.stringify({ ...daten, version: 0 }), status: 422 },
    ])('Body $body liefert $status ohne DB-Zugriff', async ({ body, status }) => {
        const { put, repository } = setup();
        const response = await put(body);
        expect(response.status).toBe(status);
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
        expect(repository.findById).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
    });

    test('vergebene Email liefert 422 ohne Schreiben', async () => {
        const { put, repository } = setup();
        repository.existsBy.mockImplementation((spalte) => Promise.resolve(spalte === 'email'));
        const response = await put();
        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toMatchObject({
            title: 'Unprocessable Content',
            detail: expect.stringContaining('email'),
        });
        expect(repository.update).not.toHaveBeenCalled();
    });
});

import { describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import { NotFoundError } from '../service/errors.mts';
import { type Student } from '../entity/student.mts';
import { type StudentService } from '../service/student-service.mts';
import { createErrorHandler } from '../../error-handler.mts';
import { createStudentRouter } from './student-router.mts';
import { pino } from 'pino';

const NOT_MODIFIED = 304;
const NOT_FOUND = 404;
const NOT_ACCEPTABLE = 406;

const student: Student = {
    id: 1,
    version: 2,
    matrikelnummer: '123456',
    nachname: 'Mustermann',
    vorname: 'Max',
    email: 'max.mustermann@h-ka.de',
    username: 'admin',
    erzeugt: new Date('2026-10-01T00:00:00Z'),
    aktualisiert: new Date('2026-10-02T00:00:00Z'),
    adresse: { id: 10, plz: '76133', ort: 'Karlsruhe', studentId: 1 },
    pruefungsleistungen: [
        { id: 20, modul: 'Softwareengineering', note: '1.3', semester: 'WS 2026', studentId: 1 },
    ],
};

// Der Router wird ohne Datenbank mit einem Service-Mock getestet, eingehaengt in eine
// kleine App mit derselben globalen Fehlerbehandlung wie in app.mts.
const setup = () => {
    const service = {
        findById: vi.fn<StudentService['findById']>().mockResolvedValue(student),
        find: vi.fn<StudentService['find']>().mockResolvedValue([student]),
    };
    const router = new Hono().route('/', createStudentRouter(service));
    router.onError(createErrorHandler(pino({ level: 'silent' })));
    return { service, router };
};

describe('GET /:id', () => {
    test('vorhandene ID liefert das DTO mit Status 200', async () => {
        const { router, service } = setup();
        const response = await router.request('/1');

        expect(response.status).toBe(200);
        expect(service.findById).toHaveBeenCalledExactlyOnceWith(1);
        await expect(response.json()).resolves.toStrictEqual({
            id: 1,
            version: 2,
            matrikelnummer: '123456',
            nachname: 'Mustermann',
            vorname: 'Max',
            email: 'max.mustermann@h-ka.de',
            username: 'admin',
            erzeugt: '2026-10-01T00:00:00.000Z',
            aktualisiert: '2026-10-02T00:00:00.000Z',
            adresse: { plz: '76133', ort: 'Karlsruhe' },
            pruefungsleistungen: [{ modul: 'Softwareengineering', note: 1.3, semester: 'WS 2026' }],
        });
    });

    test('NotFoundError aus dem Service liefert 404', async () => {
        const { router, service } = setup();
        service.findById.mockRejectedValue(new NotFoundError('unbekannt'));
        const response = await router.request('/999');

        expect(response.status).toBe(NOT_FOUND);
    });

    test.each(['abc', '-1', '1e3', '1.5'])(
        'keine gueltige ID "%s" liefert 404 ohne Service-Aufruf',
        async (id) => {
            const { router, service } = setup();
            const response = await router.request(`/${id}`);

            expect(response.status).toBe(NOT_FOUND);
            expect(service.findById).not.toHaveBeenCalled();
        },
    );

    test('Accept ohne JSON liefert 406', async () => {
        const { router, service } = setup();
        const response = await router.request('/1', { headers: { Accept: 'text/plain' } });

        expect(response.status).toBe(NOT_ACCEPTABLE);
        expect(service.findById).not.toHaveBeenCalled();
    });
});

describe('GET /:id mit ETag', () => {
    test('Antwort enthaelt die Version als ETag', async () => {
        const { router } = setup();
        const response = await router.request('/1');

        expect(response.status).toBe(200);
        expect(response.headers.get('ETag')).toBe('"2"');
    });

    test('If-None-Match mit aktueller Version liefert 304 ohne Body', async () => {
        const { router } = setup();
        const response = await router.request('/1', { headers: { 'If-None-Match': '"2"' } });

        expect(response.status).toBe(NOT_MODIFIED);
        expect(response.headers.get('ETag')).toBe('"2"');
        await expect(response.text()).resolves.toBe('');
    });

    test.each(['"1"', '2', '"3"'])(
        'If-None-Match %s passt nicht zur Version: 200 mit Body',
        async (ifNoneMatch) => {
            const { router } = setup();
            const response = await router.request('/1', {
                headers: { 'If-None-Match': ifNoneMatch },
            });

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toMatchObject({ id: 1, version: 2 });
        },
    );

    test('unbekannte ID liefert auch mit If-None-Match 404', async () => {
        const { router, service } = setup();
        service.findById.mockRejectedValue(new NotFoundError('unbekannt'));
        const response = await router.request('/999', { headers: { 'If-None-Match': '"2"' } });

        expect(response.status).toBe(NOT_FOUND);
        expect(response.headers.get('ETag')).toBeNull();
    });
});

describe('GET / mit Query-Parametern', () => {
    test('Suchparameter werden an den Service weitergegeben', async () => {
        const { router, service } = setup();
        const response = await router.request('/?nachname=muster&plz=76133');

        expect(response.status).toBe(200);
        expect(service.find).toHaveBeenCalledExactlyOnceWith({ nachname: 'muster', plz: '76133' });
        await expect(response.json()).resolves.toMatchObject([{ id: 1, nachname: 'Mustermann' }]);
    });

    test('ohne Suchparameter werden alle Studierenden gesucht', async () => {
        const { router, service } = setup();
        const response = await router.request('/');

        expect(response.status).toBe(200);
        expect(service.find).toHaveBeenCalledExactlyOnceWith({});
    });

    test('NotFoundError aus dem Service liefert 404', async () => {
        const { router, service } = setup();
        service.find.mockRejectedValue(new NotFoundError('keine Treffer'));
        const response = await router.request('/?nachname=gibtsnicht');

        expect(response.status).toBe(NOT_FOUND);
    });

    test('andere Fehler werden nicht als 404 verschleiert', async () => {
        const { router, service } = setup();
        service.find.mockRejectedValue(new Error('DB weg'));
        const response = await router.request('/');

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toStrictEqual({ msg: 'Interner Serverfehler' });
    });

    test('Accept ohne JSON liefert 406', async () => {
        const { router } = setup();
        const response = await router.request('/', { headers: { Accept: 'text/csv' } });

        expect(response.status).toBe(NOT_ACCEPTABLE);
    });
});

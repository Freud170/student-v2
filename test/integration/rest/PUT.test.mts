import { beforeAll, beforeEach, describe, expect, inject, test } from 'vitest';
import { createStudentFixture } from '../student-fixture.mts';
import { restURL } from '../constants.mts';

const BAD_REQUEST = 400;
const ERSTE_MATRIKELNUMMER = 660000;
let matrikelnummer: number;
let fixture: Awaited<ReturnType<typeof createStudentFixture>>;

const put = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(fixture.location, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${inject('adminToken')}`,
            'If-Match': '"0"',
            ...headers,
        },
        body: JSON.stringify(body),
    });

const read = async () => {
    const response = await fetch(fixture.location, { headers: { 'Accept-Encoding': 'identity' } });
    expect(response.status).toBe(200);
    return { etag: response.headers.get('ETag'), body: (await response.json()) as unknown };
};

// oxlint-disable-next-line max-lines-per-function
describe('PUT /rest/:id mit echtem Backend', () => {
    beforeAll(() => {
        matrikelnummer = ERSTE_MATRIKELNUMMER;
    });
    beforeEach(async () => {
        matrikelnummer++;
        fixture = await createStudentFixture(String(matrikelnummer));
    });

    test.each(['adminToken', 'studentToken'] as const)(
        'ersetzt das Aggregate mit %s und liefert die neue Version',
        async (token) => {
            const vorher = await read();
            expect(vorher.etag).toBe('"0"');
            const daten = {
                ...fixture.daten,
                vorname: 'Tina',
                adresse: { plz: '53113', ort: 'Bonn' },
                pruefungsleistungen: [
                    { modul: 'Netze', note: 1, semester: 'WS 2026/27' },
                    { modul: 'Mathematik', note: 3, semester: 'SS 2026' },
                ],
            };
            // Unveraenderte eigene E-Mail, Matrikelnummer und Username bleiben erlaubt.
            const response = await put(daten, { Authorization: `Bearer ${inject(token)}` });
            expect(response.status).toBe(204);
            expect(response.headers.get('ETag')).toBe('"1"');
            await expect(response.text()).resolves.toBe('');
            const nachher = await read();
            expect(nachher.etag).toBe('"1"');
            expect(nachher.body).toMatchObject({ ...daten, version: 1 });

            const leer = { ...daten, pruefungsleistungen: [] };
            const zweiteAntwort = await put(leer, { 'If-Match': '"1"' });
            expect(zweiteAntwort.status).toBe(204);
            expect(zweiteAntwort.headers.get('ETag')).toBe('"2"');
            expect((await read()).body).toMatchObject({ ...leer, version: 2 });
        },
    );

    test('zwei gleichzeitige PUTs mit derselben Version haben genau einen Gewinner', async () => {
        const kandidaten = [
            { ...fixture.daten, vorname: 'Anna', adresse: { plz: '53113', ort: 'Bonn' } },
            { ...fixture.daten, vorname: 'Lena', pruefungsleistungen: [] },
        ];
        const responses = await Promise.all(kandidaten.map((daten) => put(daten)));
        expect(responses.map(({ status }) => status).toSorted()).toStrictEqual([204, 412]);
        const gewinner = responses.findIndex(({ status }) => status === 204);
        expect(responses[gewinner]?.headers.get('ETag')).toBe('"1"');
        const gespeichert = await read();
        expect(gespeichert.etag).toBe('"1"');
        expect(gespeichert.body).toMatchObject({ ...kandidaten[gewinner], version: 1 });
        const veraltet = await put(fixture.daten);
        expect(veraltet.status).toBe(412);
        expect(veraltet.headers.get('Content-Type')).toBe('application/problem+json');
        await expect(read()).resolves.toStrictEqual(gespeichert);
    });

    test('fehlendes If-Match liefert 428 und no-store', async () => {
        const vorher = await read();
        const response = await fetch(fixture.location, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${inject('adminToken')}` },
            body: JSON.stringify(fixture.daten),
        });
        expect(response.status).toBe(428);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
        await expect(read()).resolves.toStrictEqual(vorher);
    });

    test.each(['W/"0"', '*', '"0", "1"', '"01"', '"-1"'])(
        'ungueltiges If-Match %s liefert 412',
        async (version) => {
            const vorher = await read();
            const response = await put(fixture.daten, { 'If-Match': version });
            expect(response.status).toBe(412);
            expect(response.headers.get('Content-Type')).toBe('application/problem+json');
            await expect(read()).resolves.toStrictEqual(vorher);
        },
    );

    test.each([
        { matrikelnummer: '123456' },
        { email: 'max.mustermann@h-ka.de' },
        { username: 'admin' },
        { adresse: { plz: '1234', ort: 'Bonn' } },
        { version: 0 },
    ])('Duplikate oder ungueltige Daten liefern 422: %j', async (aenderung) => {
        const vorher = await read();
        const response = await put({ ...fixture.daten, ...aenderung });
        expect(response.status).toBe(422);
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
        await expect(read()).resolves.toStrictEqual(vorher);
    });

    test('ungueltiges JSON liefert 400', async () => {
        const vorher = await read();
        const response = await fetch(fixture.location, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${inject('adminToken')}`, 'If-Match': '"0"' },
            body: '{ kaputt',
        });
        expect(response.status).toBe(BAD_REQUEST);
        await expect(read()).resolves.toStrictEqual(vorher);
    });

    test.each(['999999', 'abc', '-1', '1e3'])(
        'unbekannte oder ungueltige ID %s liefert 404',
        async (id) => {
            const response = await fetch(`${restURL}/${id}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${inject('adminToken')}`, 'If-Match': '"0"' },
                body: JSON.stringify(fixture.daten),
            });
            expect(response.status).toBe(404);
        },
    );

    test.each(['', 'Bearer invalid-token', 'Basic invalid-token'])(
        'fehlende oder ungueltige Anmeldung liefert 401: %j',
        async (authorization) => {
            const vorher = await read();
            const response = await put(fixture.daten, { Authorization: authorization });
            expect(response.status).toBe(401);
            expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
            await expect(read()).resolves.toStrictEqual(vorher);
        },
    );
});

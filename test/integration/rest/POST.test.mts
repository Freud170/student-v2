import { CONTENT_TYPE, LOCATION, restURL } from '../constants.mts';
import { describe, expect, test } from 'vitest';

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
// Neue Werte duerfen keine Suche aus GET-queryparam.test.mts treffen, weil die Testdateien
// parallel laufen (Nachname ohne "er", "muster" oder "mann", PLZ nicht 76133).
const neuerStudent = {
    matrikelnummer: '777777',
    nachname: 'Neu',
    vorname: 'Nora',
    email: 'nora.neu@h-ka.de',
    username: 'nora',
    adresse: { plz: '76185', ort: 'Karlsruhe' },
    pruefungsleistungen: [{ modul: 'Softwareengineering', note: 1.3, semester: 'WS 2026/27' }],
};

const CREATED = 201;
const BAD_REQUEST = 400;
const UNPROCESSABLE_CONTENT = 422;
const ANZAHL_FEHLER = 5;

const PROBLEM_JSON = 'application/problem+json';

const post = (body: string) =>
    fetch(restURL, {
        method: 'POST',
        headers: { [CONTENT_TYPE]: 'application/json' },
        body,
    });

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
describe('POST /rest', () => {
    test('neuer Studierender wird angelegt und ist danach lesbar', async () => {
        // given
        // when
        const response = await post(JSON.stringify(neuerStudent));

        // then
        expect(response.status).toBe(CREATED);
        const location = response.headers.get(LOCATION) ?? '';
        expect(location).toMatch(/\/rest\/[1-9]\d*$/u);
        await expect(response.text()).resolves.toBe('');

        // Der neue Datensatz ist unter der URL aus dem Location-Header abrufbar
        const neu = await fetch(location);
        expect(neu.status).toBe(200);
        await expect(neu.json()).resolves.toMatchObject({
            matrikelnummer: '777777',
            version: 0,
            adresse: { plz: '76185', ort: 'Karlsruhe' },
            pruefungsleistungen: [{ modul: 'Softwareengineering', note: 1.3 }],
        });
    });
});

describe('POST /rest mit Fehlern', () => {
    test.concurrent.each([
        {
            feld: 'email',
            student: { ...neuerStudent, matrikelnummer: '888888', email: 'max.mustermann@h-ka.de' },
        },
        {
            feld: 'matrikelnummer',
            student: { ...neuerStudent, matrikelnummer: '123456', email: 'andere@h-ka.de' },
        },
    ])('vorhandene $feld liefert 422', async ({ feld, student }) => {
        // given
        // when
        const response = await post(JSON.stringify(student));

        // then
        expect(response.status).toBe(UNPROCESSABLE_CONTENT);
        expect(response.headers.get(CONTENT_TYPE)).toBe(PROBLEM_JSON);
        const body = (await response.json()) as { detail: string };
        expect(body.detail).toContain(feld);
    });

    test.concurrent('ungueltige Daten liefern 422 mit allen fehlerhaften Feldern', async () => {
        // given
        const student = {
            ...neuerStudent,
            matrikelnummer: '12',
            nachname: 'neu',
            email: 'keine-email',
            adresse: { plz: '7613', ort: 'Karlsruhe' },
            pruefungsleistungen: [{ modul: 'X', note: 1.5, semester: 'WS 2026/27' }],
        };

        // when
        const response = await post(JSON.stringify(student));

        // then
        expect(response.status).toBe(UNPROCESSABLE_CONTENT);
        expect(response.headers.get(CONTENT_TYPE)).toBe(PROBLEM_JSON);
        const body = (await response.json()) as { detail: unknown[] };
        expect(body.detail).toHaveLength(ANZAHL_FEHLER);
    });

    test.concurrent('kein JSON liefert 400', async () => {
        // given
        // when
        const response = await post('FALSCHES JSON');

        // then
        expect(response.status).toBe(BAD_REQUEST);
        expect(response.headers.get(CONTENT_TYPE)).toBe(PROBLEM_JSON);
    });
});

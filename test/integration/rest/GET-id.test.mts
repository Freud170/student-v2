import { CONTENT_TYPE, ETAG, IF_NONE_MATCH, restURL } from '../constants.mts';
import { describe, expect, test } from 'vitest';

// -----------------------------------------------------------------------------
// T e s t d a t e n   (aus den CSV-Dateien, siehe setup.global.mts)
// -----------------------------------------------------------------------------
// oxlint-disable no-magic-numbers
const ids = [1, 20];
const idNichtVorhanden = 999_999;
const idsFalsch = ['abc', '-1', '1e3'];
const NOT_MODIFIED = 304;
const NOT_FOUND = 404;
const NOT_ACCEPTABLE = 406;
// oxlint-enable no-magic-numbers

type StudentResponse = {
    id: number;
    nachname: string;
    adresse: { plz: string; ort: string } | null;
    pruefungsleistungen: { modul: string; note: number; semester: string }[];
};

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
describe('GET /rest/:id', () => {
    test.concurrent.each(ids)('Studierender zu vorhandener ID %i', async (id) => {
        // given
        // when
        const response = await fetch(`${restURL}/${id}`);

        // then
        expect(response.status).toBe(200);
        expect(response.headers.get(CONTENT_TYPE)).toMatch(/json/iu);
        const body = (await response.json()) as StudentResponse;
        expect(body.id).toBe(id);
        expect(body.adresse?.ort).toBe('Karlsruhe');
    });

    test.concurrent('Pruefungsleistungen mit Noten als Zahl', async () => {
        // given
        // when
        const response = await fetch(`${restURL}/1`);

        // then
        const body = (await response.json()) as StudentResponse;
        expect(body.nachname).toBe('Mustermann');
        expect(body.pruefungsleistungen).toStrictEqual([
            { modul: 'Softwareengineering', note: 1.3, semester: 'WS 2026/27' },
            { modul: 'Datenbanken', note: 2, semester: 'SS 2026' },
        ]);
    });

    test.concurrent('kein Studierender zu nicht-vorhandener ID', async () => {
        // given
        // when
        const response = await fetch(`${restURL}/${idNichtVorhanden}`);

        // then
        expect(response.status).toBe(NOT_FOUND);
    });

    test.concurrent.each(idsFalsch)('kein Studierender zu falscher ID %s', async (id) => {
        // given
        // when
        const response = await fetch(`${restURL}/${id}`);

        // then
        expect(response.status).toBe(NOT_FOUND);
    });

    test.concurrent('Accept ohne JSON liefert 406', async () => {
        // given
        const headers = { Accept: 'text/plain' };

        // when
        const response = await fetch(`${restURL}/1`, { headers });

        // then
        expect(response.status).toBe(NOT_ACCEPTABLE);
    });
});

describe('GET /rest/:id mit ETag', () => {
    test.concurrent.each(ids)(`Studierender zu ID %i mit ${IF_NONE_MATCH}`, async (id) => {
        // given
        const headers = { [IF_NONE_MATCH]: '"0"' };

        // when
        const response = await fetch(`${restURL}/${id}`, { headers });

        // then
        expect(response.status).toBe(NOT_MODIFIED);
        expect(response.headers.get(ETAG)).toBe('"0"');
        await expect(response.text()).resolves.toBe('');
    });

    test.concurrent('andere Version liefert den Studierenden mit ETag', async () => {
        // given
        const headers = { [IF_NONE_MATCH]: '"99"' };

        // when
        const response = await fetch(`${restURL}/1`, { headers });

        // then
        expect(response.status).toBe(200);
        // fetch fordert gzip an, dadurch ist das ETag schwach: W/"0"
        expect(response.headers.get(ETAG)).toMatch(/^(?:W\/)?"0"$/u);
    });
});

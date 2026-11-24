import { describe, expect, inject, test } from 'vitest';
import { createStudentFixture } from '../student-fixture.mts';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { restURL } from '../constants.mts';

const UNSUPPORTED_MEDIA_TYPE = 415;
const compress = promisify(gzip);

describe('Content-Encoding bei echten HTTP-Schreibzugriffen', () => {
    test.each(['POST', 'PUT'])('%s lehnt gzip-Bytes ohne Datenveraenderung ab', async (method) => {
        const matrikelnummer = method === 'POST' ? '670001' : '670002';
        const { daten, location } = await createStudentFixture(matrikelnummer);
        const vorher = await (await fetch(location)).json();
        const abgelehnteDaten = {
            ...daten,
            matrikelnummer: method === 'POST' ? '670003' : matrikelnummer,
            email: 'encoding.rejected@h-ka.de',
            username: 'encoding-rejected',
            vorname: 'Tina',
        };
        const response = await fetch(method === 'POST' ? restURL : location, {
            method,
            headers: {
                Authorization: `Bearer ${inject('adminToken')}`,
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip',
                'If-Match': '"0"',
            },
            body: await compress(JSON.stringify(abgelehnteDaten)),
        });
        expect(response.status).toBe(UNSUPPORTED_MEDIA_TYPE);
        expect(response.headers.get('Accept-Encoding')).toBe('identity');
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
        await expect((await fetch(location)).json()).resolves.toStrictEqual(vorher);
        const suche = await fetch(`${restURL}?email=encoding.rejected%40h-ka.de`);
        expect(suche.status).toBe(404);
    });

    test('identity erlaubt POST und PUT', async () => {
        const { daten } = await createStudentFixture('670004');
        const body = JSON.stringify({
            ...daten,
            matrikelnummer: '670005',
            email: 'encoding.identity@h-ka.de',
            username: 'encoding-identity',
        });
        const headers = {
            Authorization: `Bearer ${inject('studentToken')}`,
            'Content-Type': 'application/json',
            'Content-Encoding': 'IdEnTiTy',
            'If-Match': '"0"',
        };
        const post = await fetch(restURL, { method: 'POST', headers, body });
        expect(post.status).toBe(201);
        const put = await fetch(post.headers.get('Location') ?? '', {
            method: 'PUT',
            headers,
            body,
        });
        expect(put.status).toBe(204);
        expect(put.headers.get('ETag')).toBe('"1"');
    });
});

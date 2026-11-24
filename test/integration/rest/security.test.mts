import { describe, expect, inject, test } from 'vitest';
import { devURL, restURL } from '../constants.mts';

const student = {
    matrikelnummer: '999998',
    nachname: 'Zugriff',
    vorname: 'Tina',
    email: 'zugriff.test@h-ka.de',
    username: 'zugriff',
    adresse: { plz: '53111', ort: 'Bonn' },
    pruefungsleistungen: [],
};

describe('Keycloak-Endpunktschutz', () => {
    test.each(['', 'Bearer invalid-token', 'Basic invalid-token'])(
        'POST mit fehlendem oder ungueltigem Token liefert 401: %j',
        async (authorization) => {
            const response = await fetch(restURL, {
                method: 'POST',
                headers: { Authorization: authorization },
                body: '{ kaputt',
            });
            expect(response.status).toBe(401);
            expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
        },
    );

    test('auch die Client-Rolle student darf anlegen', async () => {
        const response = await fetch(restURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${inject('studentToken')}`,
            },
            body: JSON.stringify(student),
        });
        expect(response.status).toBe(201);
        const created = await fetch(response.headers.get('Location') ?? '');
        expect(created.status).toBe(200);
        await expect(created.json()).resolves.toMatchObject({
            matrikelnummer: student.matrikelnummer,
        });
    });

    test('student darf die DB nicht neu laden', async () => {
        const response = await fetch(`${devURL}/db_populate`, {
            method: 'QUERY',
            headers: { Authorization: `Bearer ${inject('studentToken')}` },
        });
        expect(response.status).toBe(403);
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    });

    test('ohne Token ist auch DB-Neuladen verboten', async () => {
        const response = await fetch(`${devURL}/db_populate`, { method: 'QUERY' });
        expect(response.status).toBe(401);
    });
});

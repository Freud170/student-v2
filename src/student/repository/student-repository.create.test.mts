import { type Pool, type QueryConfig } from 'pg';
import { type StudentCreate, StudentRepository } from './student-repository.mts';
import { describe, expect, test, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { relations } from '../../db/relations.mts';

const NEUE_ID = 1000;
const zeitpunkt = new Date('2026-11-16T10:00:00Z');

const neu: StudentCreate = {
    student: {
        matrikelnummer: '111111',
        nachname: 'Test',
        vorname: 'Theo',
        email: 'theo.test@h-ka.de',
        username: 'theo',
        erzeugt: zeitpunkt,
        aktualisiert: zeitpunkt,
    },
    adresse: { plz: '76133', ort: 'Karlsruhe' },
    pruefungsleistungen: [
        { modul: 'Softwareengineering', note: '1.3', semester: 'WS 2026/27' },
        { modul: 'Datenbanken', note: '2.0', semester: 'SS 2026' },
    ],
};

// Wie in student-repository.test.mts nur den Treiber ersetzen: Drizzle erzeugt das SQL.
// Jedes INSERT ... RETURNING liefert die neue ID, BEGIN/COMMIT keine Zeilen.
const setup = (rows: unknown[][] = [[NEUE_ID]]) => {
    const query = vi
        .fn<(config: QueryConfig | string, params?: unknown[]) => Promise<{ rows: unknown[][] }>>()
        .mockResolvedValue({ rows });
    const db = drizzle({ client: { query } as unknown as Pool, relations });
    const texte = () =>
        query.mock.calls.map(([config]) => (typeof config === 'string' ? config : config.text));
    return { repository: new StudentRepository(db), query, texte };
};

describe('StudentRepository: create', () => {
    test('Student, Adresse und Leistungen werden in einer Transaktion angelegt', async () => {
        const { repository, texte } = setup();
        await expect(repository.create(neu)).resolves.toBe(NEUE_ID);

        const sql = texte();
        expect(sql[0]?.toLowerCase()).toBe('begin');
        expect(sql[1]).toContain('insert into "student"."student"');
        expect(sql[1]).toContain('returning "id"');
        expect(sql[2]).toContain('insert into "student"."adresse"');
        expect(sql[3]).toContain('insert into "student"."pruefungsleistung"');
        expect(sql.at(-1)?.toLowerCase()).toBe('commit');
    });

    test('Adresse und Leistungen erhalten die neue ID als Fremdschluessel', async () => {
        const { repository, query } = setup();
        await repository.create(neu);

        const adresseParams = query.mock.calls[2]?.[1];
        const leistungenParams = query.mock.calls[3]?.[1];
        expect(adresseParams).toContain(NEUE_ID);
        expect(leistungenParams?.filter((param) => param === NEUE_ID)).toHaveLength(
            neu.pruefungsleistungen.length,
        );
    });

    test('ohne Pruefungsleistungen gibt es kein leeres INSERT', async () => {
        const { repository, texte } = setup();
        await repository.create({ ...neu, pruefungsleistungen: [] });

        expect(texte().some((sql) => sql.includes('"pruefungsleistung"'))).toBe(false);
    });

    test('bei einem DB-Fehler wird die Transaktion zurueckgerollt', async () => {
        const { repository, query, texte } = setup();
        const cause = new Error('PLZ verletzt CHECK-Constraint');
        query.mockImplementation((config) => {
            const text = typeof config === 'string' ? config : config.text;
            if (text.includes('"adresse"')) {
                return Promise.reject(cause);
            }
            return Promise.resolve({ rows: [[NEUE_ID]] });
        });

        // Drizzle verpackt den Treiberfehler und haengt ihn als "cause" an
        await expect(repository.create(neu)).rejects.toMatchObject({ cause });
        expect(texte().at(-1)?.toLowerCase()).toBe('rollback');
    });
});

describe('StudentRepository: existsBy', () => {
    test.each(['email', 'matrikelnummer', 'username'] as const)(
        '%s wird als Parameter verglichen',
        async (spalte) => {
            const { repository, query } = setup([[1]]);
            await expect(repository.existsBy(spalte, 'wert')).resolves.toBe(true);
            expect(query).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ text: expect.stringContaining(`"${spalte}" = $1`) }),
                ['wert', 1],
            );
        },
    );

    test('ohne Treffer liefert existsBy false', async () => {
        const { repository } = setup([]);
        await expect(repository.existsBy('email', 'neu@h-ka.de')).resolves.toBe(false);
    });
});

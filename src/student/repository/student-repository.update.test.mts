import { type Pool, type QueryConfig } from 'pg';
import { StudentRepository, type StudentUpdate } from './student-repository.mts';
import { describe, expect, test, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { relations } from '../../db/relations.mts';

const ID = 1000;
const VERSION = 7;
const NEUE_VERSION = VERSION + 1;
const LETZTE_ZWEI = -2;
const aenderung: StudentUpdate = {
    student: {
        matrikelnummer: '111111',
        nachname: 'Test',
        vorname: 'Theo',
        email: 'theo.test@h-ka.de',
        username: 'theo',
    },
    adresse: { plz: '76133', ort: 'Karlsruhe' },
    pruefungsleistungen: [
        { modul: 'Softwareengineering', note: '1.3', semester: 'WS 2026/27' },
        { modul: 'Datenbanken', note: '2.0', semester: 'SS 2026' },
    ],
};

// Echter Drizzle-Client mit ersetztem pg-Treiber: SQL und Transaktionssteuerung bleiben erhalten.
// Diese Tests pruefen keine Sperren oder Rollbacks eines laufenden PostgreSQL-Servers.
const setup = (rows: unknown[][] = [[NEUE_VERSION]]) => {
    const query = vi
        .fn<(config: QueryConfig | string, params?: unknown[]) => Promise<{ rows: unknown[][] }>>()
        .mockImplementation((config) => {
            const text = typeof config === 'string' ? config : config.text;
            return Promise.resolve({ rows: text.startsWith('update ') ? rows : [] });
        });
    const db = drizzle({ client: { query } as unknown as Pool, relations });
    const statements = () =>
        query.mock.calls.map(([config, params]) => {
            return { text: typeof config === 'string' ? config : config.text, params };
        });
    return { repository: new StudentRepository(db), query, statements };
};

describe('StudentRepository: Versionsschutz beim Update', () => {
    test('ID und Version schuetzen dasselbe UPDATE; Version und Zeitstempel entstehen in SQL', async () => {
        const { repository, statements } = setup();
        await expect(repository.update(ID, VERSION, aenderung)).resolves.toBe(NEUE_VERSION);

        const update = statements().find(({ text }) => text.startsWith('update '));
        expect(update?.text).toMatch(
            /where \(\("student"\."student"\."id" = \$\d+\) and \("student"\."student"\."version" = \$\d+\)\)/u,
        );
        expect(update?.params?.slice(LETZTE_ZWEI)).toStrictEqual([ID, VERSION]);
        expect(update?.text).toContain('"version" = "student"."student"."version" + 1');
        expect(update?.text).toContain('"aktualisiert" = now()');
        expect(update?.text).toContain('returning "version"');
        expect(update?.text).not.toContain('"erzeugt"');
        expect(statements().some(({ text }) => text.startsWith('select '))).toBe(false);
    });

    test('alle Schreiboperationen liegen zwischen BEGIN und COMMIT', async () => {
        const { repository, statements } = setup();
        await repository.update(ID, VERSION, aenderung);

        expect(statements().map(({ text }) => text.split(' ')[0])).toStrictEqual([
            'begin',
            'update',
            'insert',
            'delete',
            'insert',
            'commit',
        ]);
    });

    test('kein passendes ID-/Versionspaar: keine Aenderung an Adresse oder Leistungen', async () => {
        const { repository, statements } = setup([]);
        await expect(repository.update(ID, VERSION, aenderung)).resolves.toBeUndefined();

        expect(statements().map(({ text }) => text.split(' ')[0])).toStrictEqual([
            'begin',
            'update',
            'commit',
        ]);
    });
});

describe('StudentRepository: Kinddaten beim Update', () => {
    test('Adress-Upsert verwendet den Student-Fremdschluessel und aendert keine Adress-ID', async () => {
        const { repository, statements } = setup();
        await repository.update(ID, VERSION, aenderung);

        const adresse = statements().find(({ text }) => text.includes('"student"."adresse"'));
        expect(adresse?.text).toContain('on conflict ("student_id") do update set');
        expect(adresse?.text.split('do update set')[1]).not.toContain('"id"');
        expect(adresse?.params).toStrictEqual(['76133', 'Karlsruhe', ID, '76133', 'Karlsruhe']);
    });

    test('nur die Leistungen dieses Studenten werden entfernt und durch die neue Liste ersetzt', async () => {
        const { repository, statements } = setup();
        await repository.update(ID, VERSION, aenderung);

        const entfernen = statements().find(({ text }) => text.startsWith('delete '));
        expect(entfernen?.text).toContain('where "student"."pruefungsleistung"."student_id" = $1');
        expect(entfernen?.params).toStrictEqual([ID]);
        const einfuegen = statements().find(({ text }) =>
            text.startsWith('insert into "student"."pruefungsleistung"'),
        );
        expect(einfuegen?.params).toStrictEqual([
            'Softwareengineering',
            '1.3',
            'WS 2026/27',
            ID,
            'Datenbanken',
            '2.0',
            'SS 2026',
            ID,
        ]);
    });

    test('eine leere Leistungsliste entfernt die bisherigen Leistungen ohne leeres INSERT', async () => {
        const { repository, statements } = setup();
        await expect(
            repository.update(ID, VERSION, { ...aenderung, pruefungsleistungen: [] }),
        ).resolves.toBe(NEUE_VERSION);

        const leistungen = statements().filter(({ text }) => text.includes('"pruefungsleistung"'));
        expect(leistungen).toHaveLength(1);
        expect(leistungen[0]?.text).toMatch(/^delete /u);
        expect(leistungen[0]?.params).toStrictEqual([ID]);
        expect(statements().at(-1)?.text).toBe('commit');
    });
});

describe('StudentRepository: Parameter und Fehler beim Update', () => {
    test('fachliche Werte werden als Parameter und nicht als SQL uebergeben', async () => {
        const { repository, statements } = setup();
        const nachname = "Test' WHERE true; --";
        await repository.update(ID, VERSION, {
            ...aenderung,
            student: { ...aenderung.student, nachname },
        });
        const update = statements().find(({ text }) => text.startsWith('update '));
        expect(update?.text).not.toContain(nachname);
        expect(update?.params).toContain(nachname);
    });

    test.each([
        'update "student"."student"',
        'insert into "student"."adresse"',
        'delete from "student"."pruefungsleistung"',
        'insert into "student"."pruefungsleistung"',
    ])('Fehler bei %s fuehrt zu ROLLBACK ohne weitere Schreiboperationen', async (sqlAnfang) => {
        const { repository, query, statements } = setup();
        const cause = new Error('DB-Schreibfehler');
        query.mockImplementation((config) => {
            const text = typeof config === 'string' ? config : config.text;
            if (text.startsWith(sqlAnfang)) {
                return Promise.reject(cause);
            }
            return Promise.resolve({ rows: text.startsWith('update ') ? [[NEUE_VERSION]] : [] });
        });

        await expect(repository.update(ID, VERSION, aenderung)).rejects.toMatchObject({ cause });
        const sql = statements().map(({ text }) => text);
        expect(sql[0]).toBe('begin');
        expect(sql.at(LETZTE_ZWEI)?.startsWith(sqlAnfang)).toBe(true);
        expect(sql.at(-1)).toBe('rollback');
        expect(sql).not.toContain('commit');
    });
});

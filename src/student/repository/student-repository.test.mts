import { type Pool, type QueryConfig } from 'pg';
import { describe, expect, test, vi } from 'vitest';
import { type Student } from '../entity/student.mts';
import { StudentRepository } from './student-repository.mts';
import { drizzle } from 'drizzle-orm/node-postgres';
import { relations } from '../../db/relations.mts';

// Treiberzeilen in der Reihenfolge der ausgewaehlten Tabellenspalten.
const studentColumns = [
    1,
    0,
    '012345',
    'Test',
    'Alex',
    'alex@example.test',
    'alex',
    '2026-11-01 10:00:00',
    '2026-11-01 10:00:00',
];
const ADDRESS_ID = 11;
const FIRST_GRADE_ID = 21;
const SECOND_GRADE_ID = 22;
const adresseColumns = [ADDRESS_ID, '01234', 'Testort', 1];
const firstGrade = [FIRST_GRADE_ID, 'Software Engineering', '1.3', 'WS 2026/27', 1];
const secondGrade = [SECOND_GRADE_ID, 'Datenbanken', '2.0', 'WS 2026/27', 1];
const noChild = [null, null, null, null, null];

const expectedStudent: Student = {
    id: 1,
    version: 0,
    matrikelnummer: '012345',
    nachname: 'Test',
    vorname: 'Alex',
    email: 'alex@example.test',
    username: 'alex',
    erzeugt: new Date('2026-11-01T10:00:00Z'),
    aktualisiert: new Date('2026-11-01T10:00:00Z'),
    adresse: { id: 11, plz: '01234', ort: 'Testort', studentId: 1 },
    pruefungsleistungen: [
        {
            id: 21,
            modul: 'Software Engineering',
            note: '1.3',
            semester: 'WS 2026/27',
            studentId: 1,
        },
        { id: 22, modul: 'Datenbanken', note: '2.0', semester: 'WS 2026/27', studentId: 1 },
    ],
};

const setup = (rows: unknown[][]) => {
    const query = vi
        .fn<(config: QueryConfig, params: unknown[]) => Promise<{ rows: unknown[][] }>>()
        .mockResolvedValue({ rows });
    // Nur die Treibergrenze ersetzen; SQL-Erzeugung und Mapping kommen von Drizzle.
    const db = drizzle({ client: { query } as unknown as Pool, relations });
    return { repository: new StudentRepository(db), query };
};

describe('StudentRepository: Aggregate per ID', () => {
    test('mehrere Join-Zeilen ergeben ein vollstaendiges Aggregate', async () => {
        const { repository, query } = setup([
            [...studentColumns, ...adresseColumns, ...firstGrade],
            [...studentColumns, ...adresseColumns, ...secondGrade],
        ]);
        await expect(repository.findById(1)).resolves.toStrictEqual(expectedStudent);
        expect(query).toHaveBeenCalledOnce();
    });

    test('ein Student ohne Leistungen erhaelt ein leeres Array', async () => {
        const { repository } = setup([[...studentColumns, ...adresseColumns, ...noChild]]);
        await expect(repository.findById(1)).resolves.toStrictEqual({
            ...expectedStudent,
            pruefungsleistungen: [],
        });
    });

    test('eine fehlende Adresse laesst den Studenten und seine Leistungen bestehen', async () => {
        const { repository } = setup([[...studentColumns, null, null, null, null, ...firstGrade]]);
        await expect(repository.findById(1)).resolves.toStrictEqual({
            ...expectedStudent,
            adresse: null,
            pruefungsleistungen: expectedStudent.pruefungsleistungen.slice(0, 1),
        });
    });

    test('eine unbekannte ID liefert undefined', async () => {
        const { repository } = setup([]);
        await expect(repository.findById(1)).resolves.toBeUndefined();
    });
});

describe('StudentRepository: SQL und Fehler', () => {
    test('eine parametrisierte Abfrage mit zwei LEFT JOINs ohne Abschneiden der Leistungen', async () => {
        const { repository, query } = setup([]);
        const id = 20;
        await repository.findById(id);
        expect(query).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                text: expect.stringContaining('where "student"."student"."id" = $1'),
            }),
            [id],
        );
        const sql = query.mock.calls[0]?.[0].text ?? '';
        expect(sql).toContain('left join "student"."adresse"');
        expect(sql).toContain('left join "student"."pruefungsleistung"');
        expect(sql).toContain(
            'order by "student"."student"."id" asc, "student"."pruefungsleistung"."id" asc',
        );
        expect(sql).not.toContain('limit');
    });

    test('ein DB-Fehler wird nicht als fehlender Student ausgegeben', async () => {
        const { repository, query } = setup([]);
        const cause = new Error('DB nicht erreichbar');
        query.mockRejectedValue(cause);
        await expect(repository.findById(1)).rejects.toMatchObject({ cause });
    });
});

describe('StudentRepository: Suchergebnisse', () => {
    test('mehrere Aggregate bleiben getrennt und behalten alle Leistungen', async () => {
        const otherId = 20;
        const { repository, query } = setup([
            [...studentColumns, ...adresseColumns, ...firstGrade],
            [...studentColumns, ...adresseColumns, ...secondGrade],
            [otherId, ...studentColumns.slice(1), null, null, null, null, ...noChild],
        ]);
        await expect(repository.find()).resolves.toStrictEqual([
            expectedStudent,
            { ...expectedStudent, id: otherId, adresse: null, pruefungsleistungen: [] },
        ]);
        expect(query).toHaveBeenCalledOnce();
        expect(query.mock.calls[0]?.[0].text).not.toContain('where');
    });

    test('keine Treffer ergeben ein leeres Array', async () => {
        const { repository } = setup([]);
        await expect(repository.find({ nachname: 'Niemand' })).resolves.toStrictEqual([]);
    });
});

describe('StudentRepository: optionale Suchfilter', () => {
    test.each([
        { filter: { nachname: 'Test' }, column: 'nachname', operator: 'ilike', value: '%Test%' },
        { filter: { vorname: 'Alex' }, column: 'vorname', operator: 'ilike', value: '%Alex%' },
        {
            filter: { matrikelnummer: '012345' },
            column: 'matrikelnummer',
            operator: '=',
            value: '012345',
        },
        {
            filter: { email: 'alex@example.test' },
            column: 'email',
            operator: '=',
            value: 'alex@example.test',
        },
        { filter: { plz: '01234' }, column: 'plz', operator: '=', value: '01234' },
        { filter: { ort: 'Testort' }, column: 'ort', operator: 'ilike', value: '%Testort%' },
    ])('$column wird als Parameter verglichen', async ({ filter, column, operator, value }) => {
        const { repository, query } = setup([]);
        await repository.find(filter);
        expect(query).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                text: expect.stringContaining(`"${column}" ${operator} $1`),
            }),
            [value],
        );
    });

    test('kombinierte Bedingungen werden mit AND verbunden', async () => {
        const { repository, query } = setup([]);
        await repository.find({ nachname: 'Test', matrikelnummer: '012345', plz: '01234' });
        expect(query.mock.calls[0]?.[1]).toStrictEqual(['%Test%', '012345', '01234']);
        expect(query.mock.calls[0]?.[0].text).toContain(' and ');
    });

    test('LIKE-Sonderzeichen bleiben woertlich und SQL-Text bleibt parametrisiert', async () => {
        const { repository, query } = setup([]);
        const value = String.raw`%_\' OR 1=1 --`;
        await repository.find({ nachname: value });
        expect(query.mock.calls[0]?.[1]).toStrictEqual([String.raw`%\%\_\\' OR 1=1 --%`]);
        expect(query.mock.calls[0]?.[0].text).not.toContain('OR 1=1');
    });
});

import {
    IfMatchSchema,
    type StudentNeu,
    StudentNeuSchema,
    StudentUpdateSchema,
} from './student-validation.mts';
import { describe, expect, test } from 'vitest';

const gueltig: StudentNeu = {
    matrikelnummer: '111111',
    nachname: 'Test',
    vorname: 'Theo',
    email: 'theo.test@h-ka.de',
    username: 'theo',
    adresse: { plz: '76133', ort: 'Karlsruhe' },
    pruefungsleistungen: [{ modul: 'Softwareengineering', note: 1.3, semester: 'WS 2026/27' }],
};

describe('IfMatchSchema', () => {
    test.each([
        { header: '"0"', version: 0 },
        { header: '"1"', version: 1 },
        { header: '"1000"', version: 1000 },
        { header: '"2147483647"', version: 2_147_483_647 },
    ])('$header ergibt die Versionsnummer $version', ({ header, version }) => {
        expect(IfMatchSchema.parse(header)).toBe(version);
    });

    test.each([
        '',
        '0',
        '"01"',
        '"-1"',
        '"1.5"',
        'W/"0"',
        '*',
        '"0", "1"',
        '"0"rest',
        ' "0"',
        '"0"\n',
        '"2147483648"',
        '"9007199254740993"',
        undefined,
        null,
        0,
    ])('ungueltige Versionsangabe %j wird abgelehnt', (header) => {
        expect(IfMatchSchema.safeParse(header).success).toBe(false);
    });
});

describe.each([
    ['POST', StudentNeuSchema],
    ['PUT', StudentUpdateSchema],
] as const)('Student-Schema: %s', (_name, schema) => {
    test('gueltige Daten werden akzeptiert', () => {
        expect(schema.parse(gueltig)).toStrictEqual(gueltig);
    });

    test('Doppelnamen, Umlaute und leere Pruefungsleistungen sind erlaubt', () => {
        const student = {
            ...gueltig,
            nachname: 'Müller-Lüdenscheidt',
            vorname: 'Jürgen',
            pruefungsleistungen: [],
        };
        expect(schema.safeParse(student).success).toBe(true);
    });

    test.each([
        ['matrikelnummer', { matrikelnummer: '12345' }],
        ['nachname', { nachname: 'test' }],
        ['vorname', { vorname: '' }],
        ['email', { email: 'keine-email' }],
        ['username', { username: '' }],
        ['adresse', { adresse: { plz: '1234', ort: 'Karlsruhe' } }],
        ['adresse', { adresse: { plz: '76133', ort: ' ' } }],
        [
            'pruefungsleistungen',
            { pruefungsleistungen: [{ modul: 'X', note: 1.5, semester: 'SS 2026' }] },
        ],
        [
            'pruefungsleistungen',
            { pruefungsleistungen: [{ modul: 'X', note: 2, semester: 'WS 26' }] },
        ],
    ])('ungueltiges Feld %s wird abgelehnt: %j', (feld, aenderung) => {
        const result = schema.safeParse({ ...gueltig, ...aenderung });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path[0]).toBe(feld);
    });

    test.each(['matrikelnummer', 'adresse', 'pruefungsleistungen'])(
        'fehlendes Pflichtfeld %s wird abgelehnt',
        (feld) => {
            const { [feld]: _, ...ohneFeld } = gueltig as Record<string, unknown>;
            expect(schema.safeParse(ohneFeld).success).toBe(false);
        },
    );

    test.each(['id', 'version', 'erzeugt', 'aktualisiert'])(
        'technisches Feld %s darf nicht im Body stehen',
        (feld) => {
            expect(schema.safeParse({ ...gueltig, [feld]: 0 }).success).toBe(false);
        },
    );
});

import { type StudentNeu, StudentNeuSchema } from './student-validation.mts';
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

describe('StudentNeuSchema', () => {
    test('gueltige Daten werden akzeptiert', () => {
        expect(StudentNeuSchema.parse(gueltig)).toStrictEqual(gueltig);
    });

    test('Doppelnamen, Umlaute und leere Pruefungsleistungen sind erlaubt', () => {
        const student = {
            ...gueltig,
            nachname: 'Müller-Lüdenscheidt',
            vorname: 'Jürgen',
            pruefungsleistungen: [],
        };
        expect(StudentNeuSchema.safeParse(student).success).toBe(true);
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
        const result = StudentNeuSchema.safeParse({ ...gueltig, ...aenderung });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path[0]).toBe(feld);
    });

    test.each(['matrikelnummer', 'adresse', 'pruefungsleistungen'])(
        'fehlendes Pflichtfeld %s wird abgelehnt',
        (feld) => {
            const { [feld]: _, ...ohneFeld } = gueltig as Record<string, unknown>;
            expect(StudentNeuSchema.safeParse(ohneFeld).success).toBe(false);
        },
    );

    test('unbekannte Felder wie id oder version werden abgelehnt', () => {
        expect(StudentNeuSchema.safeParse({ ...gueltig, id: 1 }).success).toBe(false);
        expect(StudentNeuSchema.safeParse({ ...gueltig, version: 0 }).success).toBe(false);
    });
});

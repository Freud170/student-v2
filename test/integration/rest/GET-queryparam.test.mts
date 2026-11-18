import { describe, expect, test } from 'vitest';
import { restURL } from '../constants.mts';

// -----------------------------------------------------------------------------
// T e s t d a t e n   (aus den CSV-Dateien, siehe setup.global.mts)
// -----------------------------------------------------------------------------
// IDs der 5 Studierenden in student.csv
// oxlint-disable-next-line no-magic-numbers
const IDS_TESTDATEN = [1, 20, 30, 40, 50];
const NOT_FOUND = 404;
const teilNachnamen = [
    { suche: 'muster', anzahl: 2 },
    { suche: 'MANN', anzahl: 1 },
    { suche: 'er', anzahl: 4 },
];

type StudentResponse = {
    id: number;
    nachname: string;
    vorname: string;
    email: string;
    adresse: { plz: string; ort: string } | null;
};

const suche = async (query: string) => {
    const response = await fetch(`${restURL}?${query}`);
    return { status: response.status, response };
};

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
describe('GET /rest mit Query-Parametern', () => {
    test.concurrent('ohne Suchparameter alle Studierenden', async () => {
        // given
        // when
        const response = await fetch(restURL);

        // then
        expect(response.status).toBe(200);
        const body = (await response.json()) as StudentResponse[];
        // POST.test.mts laeuft parallel und kann einen weiteren Datensatz anlegen
        expect(body.map((student) => student.id)).toStrictEqual(
            expect.arrayContaining(IDS_TESTDATEN),
        );
    });

    test.concurrent.each(teilNachnamen)(
        'Teil des Nachnamens "$suche" ohne Gross-/Kleinschreibung',
        async ({ suche: teil, anzahl }) => {
            // given
            expect.hasAssertions();

            // when
            const { status, response } = await suche(`nachname=${teil}`);

            // then
            expect(status).toBe(200);
            const body = (await response.json()) as StudentResponse[];
            expect(body).toHaveLength(anzahl);
            for (const { nachname } of body) {
                expect(nachname.toLowerCase()).toContain(teil.toLowerCase());
            }
        },
    );

    test.concurrent('vorhandene Email', async () => {
        // given
        const email = 'erika.musterfrau@h-ka.de';

        // when
        const { status, response } = await suche(`email=${email}`);

        // then
        expect(status).toBe(200);
        const body = (await response.json()) as StudentResponse[];
        expect(body.map((student) => student.vorname)).toStrictEqual(['Erika']);
    });

    test.concurrent('PLZ und Nachname werden mit UND verknuepft', async () => {
        // given
        // when
        const { status, response } = await suche('plz=76133&nachname=muster');

        // then
        expect(status).toBe(200);
        const body = (await response.json()) as StudentResponse[];
        expect(body.map((student) => student.id)).toStrictEqual([1]);
    });
});

describe('GET /rest ohne Treffer', () => {
    test.concurrent.each(['nachname=xyz', 'matrikelnummer=12', 'plz=1234', 'farbe=blau'])(
        'keine Treffer oder ungueltige Suchparameter bei %s',
        async (query) => {
            // given
            // when
            const { status } = await suche(query);

            // then
            expect(status).toBe(NOT_FOUND);
        },
    );
});

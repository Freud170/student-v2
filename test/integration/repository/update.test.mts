import { describe, expect, test } from 'vitest';
import { StudentRepository } from '../../../src/student/repository/student-repository.mts';
import { config } from '../constants.mts';
import { createDatabase } from '../../../src/config/db.mts';
import { createStudentFixture } from '../student-fixture.mts';
import { pino } from 'pino';

// oxlint-disable-next-line max-lines-per-function
describe('StudentRepository.update mit PostgreSQL', () => {
    test('Fehler bei einer Leistung rollt das gesamte Aggregate zurueck', async () => {
        const { daten, location } = await createStudentFixture('680001');
        const id = Number(new URL(location).pathname.split('/').at(-1));
        const database = await createDatabase(config.db, pino({ level: 'silent' }));
        try {
            const repository = new StudentRepository(database.db);
            const vorher = await repository.findById(id);
            expect(vorher).toBeDefined();
            const { adresse, pruefungsleistungen, ...student } = daten;
            const aenderung = {
                student: { ...student, vorname: 'Tina' },
                adresse: { ...adresse, plz: '53113' },
                // Der DB-Constraint wird erst nach Root-/Adress-UPDATE und DELETE verletzt.
                pruefungsleistungen: pruefungsleistungen.map((leistung) => {
                    return { ...leistung, note: '1.5' };
                }),
            };
            await expect(repository.update(id, 0, aenderung)).rejects.toMatchObject({
                cause: { code: '23514', constraint: 'pruefungsleistung_note_check' },
            });
            // Einschliesslich technischer IDs, Zeitstempel und alter Leistungsliste.
            await expect(repository.findById(id)).resolves.toStrictEqual(vorher);

            const gueltig = {
                ...aenderung,
                pruefungsleistungen: [{ modul: 'Netze', note: '1.0', semester: 'SS 2026' }],
            };
            await expect(repository.update(id, 0, gueltig)).resolves.toBe(1);
            const nachher = await repository.findById(id);
            expect(nachher).toMatchObject({
                ...gueltig.student,
                version: 1,
                erzeugt: vorher?.erzeugt,
                adresse: { ...gueltig.adresse, id: vorher?.adresse?.id },
                pruefungsleistungen: gueltig.pruefungsleistungen,
            });
            expect(nachher?.aktualisiert.getTime()).toBeGreaterThan(
                vorher?.aktualisiert.getTime() ?? 0,
            );
            expect(nachher?.pruefungsleistungen[0]?.id).not.toBe(
                vorher?.pruefungsleistungen[0]?.id,
            );
            await expect(repository.update(id, 0, aenderung)).resolves.toBeUndefined();
            await expect(repository.findById(id)).resolves.toStrictEqual(nachher);
        } finally {
            await database.close();
        }
    });

    test('parallele Transaktionen mit derselben Version schreiben genau einmal', async () => {
        const { daten, location } = await createStudentFixture('680002');
        const id = Number(new URL(location).pathname.split('/').at(-1));
        const database = await createDatabase(config.db, pino({ level: 'silent' }));
        try {
            const repository = new StudentRepository(database.db);
            const { adresse, pruefungsleistungen, ...student } = daten;
            const kandidaten = [
                {
                    student: { ...student, vorname: 'Anna' },
                    adresse: { ...adresse, plz: '53113' },
                    pruefungsleistungen: [],
                },
                {
                    student: { ...student, vorname: 'Lena' },
                    adresse: { ...adresse, plz: '53115' },
                    pruefungsleistungen: pruefungsleistungen.map((leistung) => {
                        return { ...leistung, note: '1.0' };
                    }),
                },
            ];
            // Beide Transaktionen erreichen das SQL-UPDATE ohne vorherigen Service-Vergleich.
            const versionen = await Promise.all(
                kandidaten.map((datenNeu) => repository.update(id, 0, datenNeu)),
            );
            expect(versionen).toStrictEqual(expect.arrayContaining([1, undefined]));
            const gewinner = kandidaten[versionen.indexOf(1)];
            const gespeichert = await repository.findById(id);
            expect(gespeichert).toMatchObject({
                ...gewinner?.student,
                version: 1,
                adresse: gewinner?.adresse,
                pruefungsleistungen: gewinner?.pruefungsleistungen,
            });
        } finally {
            await database.close();
        }
    });
});

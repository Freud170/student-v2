import {
    NotFoundError,
    UniqueError,
    VersionInvalidError,
    VersionOutdatedError,
} from './errors.mts';
import { describe, expect, test, vi } from 'vitest';
import { type Student } from '../entity/student.mts';
import { type StudentRepository } from '../repository/student-repository.mts';
import { type StudentUpdate } from '../validation/student-validation.mts';
import { StudentWriteService } from './student-write-service.mts';
import { ZodError } from 'zod';
import { pino } from 'pino';

const ID = 1000;
const VERSION = 7;
const NEUE_VERSION = VERSION + 1;
const MAX_INTEGER = 2_147_483_647;
const ANZAHL_UNIQUE_FELDER = 3;
const ANZAHL_KONFLIKT_LESEN = 2;
const daten: StudentUpdate = {
    matrikelnummer: '111111',
    nachname: 'Test',
    vorname: 'Theo',
    email: 'theo.test@h-ka.de',
    username: 'theo',
    adresse: { plz: '76133', ort: 'Karlsruhe' },
    pruefungsleistungen: [
        { modul: 'Softwareengineering', note: 1.3, semester: 'WS 2026/27' },
        { modul: 'Datenbanken', note: 2, semester: 'SS 2026' },
    ],
};
const gespeichert: Student = {
    ...daten,
    id: ID,
    version: VERSION,
    erzeugt: new Date('2026-11-01T10:00:00Z'),
    aktualisiert: new Date('2026-11-01T10:00:00Z'),
    adresse: { ...daten.adresse, id: ID, studentId: ID },
    pruefungsleistungen: [],
};

const setup = () => {
    const repository = {
        create: vi.fn<StudentRepository['create']>(),
        existsBy: vi.fn<StudentRepository['existsBy']>().mockResolvedValue(false),
        findById: vi.fn<StudentRepository['findById']>().mockResolvedValue(gespeichert),
        update: vi.fn<StudentRepository['update']>().mockResolvedValue(NEUE_VERSION),
    };
    const service = new StudentWriteService(pino({ level: 'silent' }), repository);
    return { service, repository };
};

describe('StudentWriteService: erfolgreiche Aenderung', () => {
    test('vollstaendige Daten, Noten als NUMERIC-Strings und erwartete Version ans Repository', async () => {
        const { service, repository } = setup();
        await expect(service.update(ID, daten, '"7"')).resolves.toBe(NEUE_VERSION);
        const { adresse, pruefungsleistungen: _, ...student } = daten;
        expect(repository.update).toHaveBeenCalledExactlyOnceWith(ID, VERSION, {
            student,
            adresse,
            pruefungsleistungen: [
                { modul: 'Softwareengineering', note: '1.3', semester: 'WS 2026/27' },
                { modul: 'Datenbanken', note: '2.0', semester: 'SS 2026' },
            ],
        });
        expect(repository.findById).toHaveBeenCalledExactlyOnceWith(ID);
        expect(repository.create).not.toHaveBeenCalled();
    });

    test('eigene unveraenderte Werte sind erlaubt; die eigene ID wird ausgeschlossen', async () => {
        const { service, repository } = setup();
        await service.update(ID, daten, '"7"');
        expect(repository.existsBy).toHaveBeenCalledWith('matrikelnummer', '111111', ID);
        expect(repository.existsBy).toHaveBeenCalledWith('email', 'theo.test@h-ka.de', ID);
        expect(repository.existsBy).toHaveBeenCalledWith('username', 'theo', ID);
        expect(repository.existsBy).toHaveBeenCalledTimes(ANZAHL_UNIQUE_FELDER);
    });

    test('Zod normalisiert Daten und eine leere Leistungsliste wird weitergegeben', async () => {
        const { service, repository } = setup();
        const eingabe = { ...daten, username: ' theo ', pruefungsleistungen: [] };
        await service.update(ID, eingabe, '"7"');
        expect(repository.existsBy).toHaveBeenCalledWith('username', 'theo', ID);
        expect(repository.update.mock.calls[0]?.[2]).toMatchObject({
            student: { username: 'theo' },
            pruefungsleistungen: [],
        });
        expect(eingabe.username).toBe(' theo ');
    });

    test('Version 0 wird als gueltige Anfangsversion akzeptiert', async () => {
        const { service, repository } = setup();
        repository.findById.mockResolvedValue({ ...gespeichert, version: 0 });
        repository.update.mockResolvedValue(1);
        await expect(service.update(ID, daten, '"0"')).resolves.toBe(1);
        expect(repository.update.mock.calls[0]?.[1]).toBe(0);
    });
});

describe('StudentWriteService: Eingabevalidierung beim Aendern', () => {
    test.each([0, Number.NaN, MAX_INTEGER + 1])(
        'ungueltige ID %s erreicht die Datenbank nicht',
        async (id) => {
            const { service, repository } = setup();
            await expect(service.update(id, daten, '"7"')).rejects.toBeInstanceOf(NotFoundError);
            expect(repository.findById).not.toHaveBeenCalled();
            expect(repository.existsBy).not.toHaveBeenCalled();
            expect(repository.update).not.toHaveBeenCalled();
        },
    );

    test.each(['7', `"${MAX_INTEGER + 1}"`])(
        'ungueltige Versionsangabe %j erreicht die Datenbank nicht',
        async (version) => {
            const { service, repository } = setup();
            await expect(service.update(ID, daten, version)).rejects.toBeInstanceOf(
                VersionInvalidError,
            );
            expect(repository.findById).not.toHaveBeenCalled();
            expect(repository.existsBy).not.toHaveBeenCalled();
            expect(repository.update).not.toHaveBeenCalled();
        },
    );

    test.each([{}, { ...daten, version: VERSION }])(
        'ungueltiger Body %j erreicht die Datenbank nicht',
        async (body) => {
            const { service, repository } = setup();
            await expect(service.update(ID, body, '"7"')).rejects.toBeInstanceOf(ZodError);
            expect(repository.findById).not.toHaveBeenCalled();
            expect(repository.existsBy).not.toHaveBeenCalled();
            expect(repository.update).not.toHaveBeenCalled();
        },
    );
});

describe('StudentWriteService: fachliche Konflikte beim Aendern', () => {
    test('unbekannte ID: NotFoundError ohne Eindeutigkeitspruefung oder Schreiben', async () => {
        const { service, repository } = setup();
        repository.findById.mockResolvedValue(undefined);
        await expect(service.update(ID, daten, '"7"')).rejects.toBeInstanceOf(NotFoundError);
        expect(repository.existsBy).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
    });

    test.each(['"6"', '"8"'])('abweichende Version %s: kein Schreiben', async (version) => {
        const { service, repository } = setup();
        await expect(service.update(ID, daten, version)).rejects.toBeInstanceOf(
            VersionOutdatedError,
        );
        expect(repository.existsBy).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
    });

    test.each(['matrikelnummer', 'email', 'username'] as const)(
        '%s eines anderen Studenten: UniqueError ohne Schreiben',
        async (spalte) => {
            const { service, repository } = setup();
            repository.existsBy.mockImplementation((geprueft) =>
                Promise.resolve(geprueft === spalte),
            );
            await expect(service.update(ID, daten, '"7"')).rejects.toMatchObject({
                constructor: UniqueError,
                spalte,
            });
            expect(repository.update).not.toHaveBeenCalled();
        },
    );

    test('bei mehreren Konflikten wird zuerst die Matrikelnummer gemeldet', async () => {
        const { service, repository } = setup();
        repository.existsBy.mockResolvedValue(true);
        await expect(service.update(ID, daten, '"7"')).rejects.toMatchObject({
            constructor: UniqueError,
            spalte: 'matrikelnummer',
        });
        expect(repository.update).not.toHaveBeenCalled();
    });
});

describe('StudentWriteService: Aenderungen zwischen Lesen und Schreiben', () => {
    test('SQL-Versionskonflikt wird trotz erfolgreicher Vorpruefung ohne Wiederholung gemeldet', async () => {
        const { service, repository } = setup();
        repository.update.mockResolvedValue(undefined);
        repository.findById
            .mockResolvedValueOnce(gespeichert)
            .mockResolvedValueOnce({ ...gespeichert, version: NEUE_VERSION });
        await expect(service.update(ID, daten, '"7"')).rejects.toBeInstanceOf(VersionOutdatedError);
        expect(repository.update).toHaveBeenCalledOnce();
        expect(repository.findById).toHaveBeenCalledTimes(ANZAHL_KONFLIKT_LESEN);
    });

    test('inzwischen geloeschter Student wird als fehlend gemeldet', async () => {
        const { service, repository } = setup();
        repository.update.mockResolvedValue(undefined);
        repository.findById.mockResolvedValueOnce(gespeichert).mockResolvedValueOnce(undefined);
        await expect(service.update(ID, daten, '"7"')).rejects.toBeInstanceOf(NotFoundError);
        expect(repository.update).toHaveBeenCalledOnce();
    });

    test.each([
        ['findById', 0],
        ['existsBy', 0],
        ['update', 1],
    ] as const)(
        'DB-Fehler aus %s wird unveraendert weitergereicht',
        async (methode, schreibversuche) => {
            const { service, repository } = setup();
            const fehler = new Error('Datenbank nicht erreichbar');
            repository[methode].mockRejectedValue(fehler);
            await expect(service.update(ID, daten, '"7"')).rejects.toBe(fehler);
            expect(repository.update).toHaveBeenCalledTimes(schreibversuche);
        },
    );
});

import { describe, expect, test, vi } from 'vitest';
import { type StudentNeu } from '../validation/student-validation.mts';
import { type StudentRepository } from '../repository/student-repository.mts';
import { StudentWriteService } from './student-write-service.mts';
import { UniqueError } from './errors.mts';
import { pino } from 'pino';

const NEUE_ID = 1000;

const studentNeu: StudentNeu = {
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

const setup = () => {
    const repository = {
        create: vi.fn<StudentRepository['create']>().mockResolvedValue(NEUE_ID),
        existsBy: vi.fn<StudentRepository['existsBy']>().mockResolvedValue(false),
    };
    const service = new StudentWriteService(pino({ level: 'silent' }), repository);
    return { repository, service };
};

describe('StudentWriteService: create', () => {
    test('neuer Studierender wird angelegt und die neue ID geliefert', async () => {
        const { service, repository } = setup();
        await expect(service.create(studentNeu)).resolves.toBe(NEUE_ID);
        expect(repository.create).toHaveBeenCalledOnce();
    });

    test('Daten werden fuer das INSERT aufbereitet', async () => {
        const { service, repository } = setup();
        await service.create(studentNeu);

        const daten = repository.create.mock.calls[0]?.[0];
        expect(daten?.student).toMatchObject({ matrikelnummer: '111111', username: 'theo' });
        expect(daten?.student.erzeugt).toBeInstanceOf(Date);
        expect(daten?.student.aktualisiert).toStrictEqual(daten?.student.erzeugt);
        expect(daten?.adresse).toStrictEqual({ plz: '76133', ort: 'Karlsruhe' });
        // Noten als String mit einer Nachkommastelle wie in der Spalte NUMERIC(2,1)
        expect(daten?.pruefungsleistungen.map((leistung) => leistung.note)).toStrictEqual([
            '1.3',
            '2.0',
        ]);
    });

    test('alle drei eindeutigen Felder werden geprueft', async () => {
        const { service, repository } = setup();
        await service.create(studentNeu);

        expect(repository.existsBy).toHaveBeenCalledWith('matrikelnummer', '111111');
        expect(repository.existsBy).toHaveBeenCalledWith('email', 'theo.test@h-ka.de');
        expect(repository.existsBy).toHaveBeenCalledWith('username', 'theo');
    });

    test.each(['matrikelnummer', 'email', 'username'] as const)(
        'vergebene %s fuehrt zu UniqueError ohne INSERT',
        async (spalte) => {
            const { service, repository } = setup();
            repository.existsBy.mockImplementation((geprueft) =>
                Promise.resolve(geprueft === spalte),
            );

            await expect(service.create(studentNeu)).rejects.toMatchObject({
                constructor: UniqueError,
                spalte,
            });
            expect(repository.create).not.toHaveBeenCalled();
        },
    );

    test('DB-Fehler beim Anlegen werden weitergereicht', async () => {
        const { service, repository } = setup();
        const err = new Error('DB nicht erreichbar');
        repository.create.mockRejectedValue(err);
        await expect(service.create(studentNeu)).rejects.toBe(err);
    });
});

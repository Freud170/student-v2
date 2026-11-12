import { describe, expect, test, vi } from 'vitest';
import { NotFoundError } from './errors.mts';
import { type Student } from '../entity/student.mts';
import { type StudentRepository } from '../repository/student-repository.mts';
import { StudentService } from './student-service.mts';
import { pino } from 'pino';

const student: Student = {
    id: 1,
    version: 0,
    matrikelnummer: '123456',
    nachname: 'Mustermann',
    vorname: 'Max',
    email: 'max.mustermann@h-ka.de',
    username: 'admin',
    erzeugt: new Date('2026-10-01T00:00:00Z'),
    aktualisiert: new Date('2026-10-01T00:00:00Z'),
    adresse: null,
    pruefungsleistungen: [],
};

const setup = () => {
    const repository = {
        find: vi.fn<StudentRepository['find']>().mockResolvedValue([]),
        findById: vi.fn<StudentRepository['findById']>().mockResolvedValue(undefined),
    };
    const lines: string[] = [];
    const logger = pino({ level: 'debug' }, { write: (line) => lines.push(line) });
    return { repository, lines, service: new StudentService(logger, repository) };
};

describe('StudentService: Suche', () => {
    test('Suchwerte werden getrimmt und nicht protokolliert', async () => {
        const { service, repository, lines } = setup();
        repository.find.mockResolvedValue([student]);
        await expect(service.find({ nachname: ' privat ', plz: '01234' })).resolves.toStrictEqual([
            student,
        ]);
        expect(repository.find).toHaveBeenCalledExactlyOnceWith({
            nachname: 'privat',
            plz: '01234',
        });
        expect(lines.join('')).not.toContain('privat');
    });

    test('ohne Filter wird eine unbeschraenkte Suche uebergeben', async () => {
        const { service, repository } = setup();
        repository.find.mockResolvedValue([student]);
        await service.find();
        expect(repository.find).toHaveBeenCalledExactlyOnceWith({});
    });

    test('keine Treffer fuehren zu NotFoundError', async () => {
        const { service } = setup();
        await expect(service.find({ nachname: 'gibtsnicht' })).rejects.toThrow(NotFoundError);
    });

    test.each([
        { nachname: ' ' },
        { matrikelnummer: '123' },
        { plz: '1234' },
        { email: '' },
        { vorname: '', ort: 'Testort' },
        { nachname: 'Test', unbekannt: 'x' },
    ])('ungueltige Filter verhindern DB-Zugriff: %j', async (params) => {
        const { service, repository } = setup();
        await expect(service.find(params)).rejects.toThrow(NotFoundError);
        expect(repository.find).not.toHaveBeenCalled();
    });
});

describe('StudentService: ID und Fehler', () => {
    test('gueltige ID liefert den Studierenden aus dem Repository', async () => {
        const { service, repository } = setup();
        repository.findById.mockResolvedValue(student);
        await expect(service.findById(1)).resolves.toBe(student);
        expect(repository.findById).toHaveBeenCalledExactlyOnceWith(1);
    });

    test('unbekannte ID fuehrt zu NotFoundError', async () => {
        const { service } = setup();
        const unbekannteId = 999;
        await expect(service.findById(unbekannteId)).rejects.toThrow(NotFoundError);
    });

    test.each([{ id: 0 }, { id: -1 }, { id: 1.5 }, { id: Number.NaN }, { id: 2_147_483_648 }])(
        'ungueltige ID $id verhindert DB-Zugriff',
        async ({ id }) => {
            const { service, repository } = setup();
            await expect(service.findById(id)).rejects.toThrow(NotFoundError);
            expect(repository.findById).not.toHaveBeenCalled();
        },
    );

    test('DB-Fehler bleiben Fehler und werden nicht in NotFoundError umgewandelt', async () => {
        const { service, repository } = setup();
        const err = new Error('Datenbank nicht erreichbar');
        repository.find.mockRejectedValue(err);
        await expect(service.find()).rejects.toBe(err);
    });
});

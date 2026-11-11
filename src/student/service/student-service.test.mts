import { describe, expect, test, vi } from 'vitest';
import { type StudentRepository } from '../repository/student-repository.mts';
import { StudentService } from './student-service.mts';
import { ZodError } from 'zod';
import { pino } from 'pino';

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
        await expect(service.find({ nachname: ' privat ', plz: '01234' })).resolves.toStrictEqual(
            [],
        );
        expect(repository.find).toHaveBeenCalledExactlyOnceWith({
            nachname: 'privat',
            plz: '01234',
        });
        expect(lines.join('')).not.toContain('privat');
    });

    test('ohne Filter wird eine unbeschraenkte Suche uebergeben', async () => {
        const { service, repository } = setup();
        await service.find();
        expect(repository.find).toHaveBeenCalledExactlyOnceWith({});
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
        await expect(service.find(params)).rejects.toThrow(ZodError);
        expect(repository.find).not.toHaveBeenCalled();
    });
});

describe('StudentService: ID und Fehler', () => {
    test('gueltige ID erreicht das Repository; unbekannte ID bleibt undefined', async () => {
        const { service, repository } = setup();
        await expect(service.findById(1)).resolves.toBeUndefined();
        expect(repository.findById).toHaveBeenCalledExactlyOnceWith(1);
    });

    test.each([{ id: 0 }, { id: -1 }, { id: 1.5 }, { id: Number.NaN }, { id: 2_147_483_648 }])(
        'ungueltige ID $id verhindert DB-Zugriff',
        async ({ id }) => {
            const { service, repository } = setup();
            await expect(service.findById(id)).rejects.toThrow(ZodError);
            expect(repository.findById).not.toHaveBeenCalled();
        },
    );

    test('DB-Fehler bleiben Fehler und werden nicht in leere Trefferlisten umgewandelt', async () => {
        const { service, repository } = setup();
        const err = new Error('Datenbank nicht erreichbar');
        repository.find.mockRejectedValue(err);
        await expect(service.find()).rejects.toBe(err);
    });
});

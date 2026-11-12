import { type Suchparameter, SuchparameterSchema } from './suchparameter.mts';
import { type Logger } from 'pino';
import { NotFoundError } from './errors.mts';
import { type Student } from '../entity/student.mts';
import { type StudentRepository } from '../repository/student-repository.mts';
import { z } from 'zod';

const MAX_ID = 2_147_483_647;
const idSchema = z.number().int().positive().max(MAX_ID);

/** Validiert Suchkriterien vor dem Persistenzzugriff auf das Student-Aggregate. */
export class StudentService {
    readonly #logger: Logger;
    readonly #repository: Pick<StudentRepository, 'find' | 'findById'>;

    public constructor(logger: Logger, repository: Pick<StudentRepository, 'find' | 'findById'>) {
        this.#logger = logger;
        this.#repository = repository;
    }

    /** @throws NotFoundError bei ungueltiger oder unbekannter ID */
    async findById(id: number): Promise<Student> {
        this.#logger.debug('findById');
        const result = idSchema.safeParse(id);
        if (!result.success) {
            throw new NotFoundError(`Ungueltige ID ${id}`);
        }

        const student = await this.#repository.findById(result.data);
        if (student === undefined) {
            throw new NotFoundError(`Es gibt keinen Studierenden mit der ID ${id}`);
        }
        return student;
    }

    /** @throws NotFoundError bei ungueltigen Suchparametern oder ohne Treffer */
    async find(params: Suchparameter = {}): Promise<Student[]> {
        this.#logger.debug('find');
        const result = SuchparameterSchema.safeParse(params);
        if (!result.success) {
            throw new NotFoundError('Ungueltige Suchparameter');
        }

        const students = await this.#repository.find(result.data);
        if (students.length === 0) {
            throw new NotFoundError('Keine Studierenden gefunden');
        }
        return students;
    }
}

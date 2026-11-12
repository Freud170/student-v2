import { type Suchparameter, SuchparameterSchema } from './suchparameter.mts';
import { type Logger } from 'pino';
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

    async findById(id: number): Promise<Student | undefined> {
        this.#logger.debug('findById');
        return await this.#repository.findById(idSchema.parse(id));
    }

    async find(params: Suchparameter = {}): Promise<Student[]> {
        this.#logger.debug('find');
        return await this.#repository.find(SuchparameterSchema.parse(params));
    }
}

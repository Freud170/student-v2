import { type Config } from './config/config.mts';
import { type Database } from './config/db.mts';
import { type Logger } from 'pino';
import { StudentRepository } from './student/repository/student-repository.mts';
import { StudentService } from './student/service/student-service.mts';
import { StudentWriteService } from './student/service/student-write-service.mts';
import { createDbPopulate } from './config/dev/db-populate.mts';
import { createLogger } from './logger/logger.mts';
import { createTokenVerifier } from './security/token-verifier.mts';

/** Einmal beim Start erzeugen: dieselben Instanzen fuer alle Requests der App. */
export const createContainer = (
    config: Config,
    database: Database,
    logger: Logger = createLogger(config.log),
) => {
    const studentRepository = new StudentRepository(database.db);
    return {
        config,
        logger,
        database,
        tokenVerifier: createTokenVerifier(config.keycloak),
        studentRepository,
        studentService: new StudentService(
            logger.child({ service: 'StudentService' }),
            studentRepository,
        ),
        studentWriteService: new StudentWriteService(
            logger.child({ service: 'StudentWriteService' }),
            studentRepository,
        ),
        dbPopulate: createDbPopulate(database, config.db, logger.child({ module: 'populate' })),
    };
};

export type Container = ReturnType<typeof createContainer>;

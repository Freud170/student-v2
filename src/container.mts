import { type Config } from './config/config.mts';
import { type Logger } from 'pino';
import { StudentService } from './student/service/student-service.mts';
import { createLogger } from './logger/logger.mts';

/** Einmal beim Start erzeugen: dieselben Instanzen fuer alle Requests der App. */
export const createContainer = (config: Config, logger: Logger = createLogger(config.log)) => {
    return {
        config,
        logger,
        studentService: new StudentService(logger.child({ service: 'StudentService' })),
    };
};

export type Container = ReturnType<typeof createContainer>;

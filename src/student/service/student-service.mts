import { type Logger } from 'pino';

/** Einstieg fuer das Student-Aggregate; noch keine Suche oder Datenbankanbindung. */
export class StudentService {
    readonly #logger: Logger;

    public constructor(logger: Logger) {
        this.#logger = logger;
    }

    public hello(): { msg: string } {
        this.#logger.debug('hello');
        return { msg: 'Hello Student' };
    }
}

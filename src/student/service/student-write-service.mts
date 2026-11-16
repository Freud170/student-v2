import { type StudentRepository, type UniqueSpalte } from '../repository/student-repository.mts';
import { type Logger } from 'pino';
import { type StudentNeu } from '../validation/student-validation.mts';
import { UniqueError } from './errors.mts';

// Reihenfolge der Pruefung; gemeldet wird der erste bereits vergebene Wert
const UNIQUE_SPALTEN: readonly UniqueSpalte[] = ['matrikelnummer', 'email', 'username'];

/** Schreibzugriffe auf das Student-Aggregate (wie buch-write-service im Prof-Beispiel). */
export class StudentWriteService {
    readonly #logger: Logger;
    readonly #repository: Pick<StudentRepository, 'create' | 'existsBy'>;

    public constructor(logger: Logger, repository: Pick<StudentRepository, 'create' | 'existsBy'>) {
        this.#logger = logger;
        this.#repository = repository;
    }

    /**
     * Legt einen neuen Studierenden an; die Daten sind bereits durch Zod validiert.
     * @returns die ID des neuen Studierenden
     * @throws UniqueError falls Matrikelnummer, Email oder Username schon vergeben ist
     */
    async create(studentNeu: StudentNeu): Promise<number> {
        this.#logger.debug('create');
        await this.#checkUnique(studentNeu);

        // erzeugt/aktualisiert haben in der Tabelle keinen Default
        const jetzt = new Date();
        const { adresse, pruefungsleistungen, ...student } = studentNeu;
        const id = await this.#repository.create({
            student: { ...student, erzeugt: jetzt, aktualisiert: jetzt },
            adresse,
            // NUMERIC erwartet Drizzle als String, z.B. 1.3 -> "1.3"
            pruefungsleistungen: pruefungsleistungen.map(({ note, ...leistung }) => {
                return { ...leistung, note: note.toFixed(1) };
            }),
        });
        this.#logger.debug('create: id=%d', id);
        return id;
    }

    async #checkUnique(studentNeu: StudentNeu): Promise<void> {
        // Die drei Abfragen laufen parallel
        const vergeben = await Promise.all(
            UNIQUE_SPALTEN.map((spalte) => this.#repository.existsBy(spalte, studentNeu[spalte])),
        );
        const index = vergeben.indexOf(true);
        const spalte = UNIQUE_SPALTEN[index];
        if (spalte !== undefined) {
            throw new UniqueError(spalte, studentNeu[spalte]);
        }
    }
}

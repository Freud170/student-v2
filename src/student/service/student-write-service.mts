import {
    IfMatchSchema,
    StudentIdSchema,
    type StudentNeu,
    StudentUpdateSchema,
} from '../validation/student-validation.mts';
import {
    NotFoundError,
    UniqueError,
    VersionInvalidError,
    VersionOutdatedError,
} from './errors.mts';
import { type StudentRepository, type UniqueSpalte } from '../repository/student-repository.mts';
import { type Logger } from 'pino';

// Reihenfolge der Pruefung; gemeldet wird der erste bereits vergebene Wert
const UNIQUE_SPALTEN: readonly UniqueSpalte[] = ['matrikelnummer', 'email', 'username'];

/** Validierung und Geschaeftslogik fuer Schreibzugriffe auf das Student-Aggregate. */
export class StudentWriteService {
    readonly #logger: Logger;
    readonly #repository: Pick<StudentRepository, 'create' | 'existsBy' | 'findById' | 'update'>;

    public constructor(
        logger: Logger,
        repository: Pick<StudentRepository, 'create' | 'existsBy' | 'findById' | 'update'>,
    ) {
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

    /** Validiert und ersetzt ein Aggregate; liefert die vom Repository gespeicherte Version. */
    async update(id: number, daten: unknown, versionHeader: string): Promise<number> {
        this.#logger.debug('update: id=%d', id);
        if (!StudentIdSchema.safeParse(id).success) {
            throw new NotFoundError(`Ungueltige ID ${id}`);
        }
        const parsedVersion = IfMatchSchema.safeParse(versionHeader);
        if (!parsedVersion.success) {
            throw new VersionInvalidError();
        }
        const studentUpdate = StudentUpdateSchema.parse(daten);
        const vorhanden = await this.#repository.findById(id);
        if (vorhanden === undefined) {
            throw new NotFoundError(`Es gibt keinen Studierenden mit der ID ${id}`);
        }
        const version = parsedVersion.data;
        if (vorhanden.version !== version) {
            throw new VersionOutdatedError();
        }
        await this.#checkUnique(studentUpdate, id);

        const { adresse, pruefungsleistungen, ...student } = studentUpdate;
        const neueVersion = await this.#repository.update(id, version, {
            student,
            adresse,
            pruefungsleistungen: pruefungsleistungen.map(({ note, ...leistung }) => {
                return { ...leistung, note: note.toFixed(1) };
            }),
        });
        // Die Vorpruefung ersetzt nicht den atomaren Versionsvergleich beim Schreiben.
        if (neueVersion === undefined) {
            if ((await this.#repository.findById(id)) === undefined) {
                throw new NotFoundError(`Es gibt keinen Studierenden mit der ID ${id}`);
            }
            throw new VersionOutdatedError();
        }
        this.#logger.debug('update: id=%d, version=%d', id, neueVersion);
        return neueVersion;
    }

    async #checkUnique(studentNeu: StudentNeu, eigeneId?: number): Promise<void> {
        // Die drei Abfragen laufen parallel
        const vergeben = await Promise.all(
            UNIQUE_SPALTEN.map((spalte) =>
                this.#repository.existsBy(spalte, studentNeu[spalte], eigeneId),
            ),
        );
        const index = vergeben.indexOf(true);
        const spalte = UNIQUE_SPALTEN[index];
        if (spalte !== undefined) {
            throw new UniqueError(spalte, studentNeu[spalte]);
        }
    }
}

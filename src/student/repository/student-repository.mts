import { type SQL, and, asc, eq, sql } from 'drizzle-orm';
import { adresseTable, pruefungsleistungTable, studentTable } from '../../db/schema.mts';
import { type Database } from '../../config/db.mts';
import { type Student } from '../entity/student.mts';
import { type Suchparameter } from '../service/suchparameter.mts';
import { buildWhere } from './build-where.mts';

// Daten fuer INSERT ohne generierte Spalten (id, version) und ohne Fremdschluessel
export type StudentCreate = {
    student: Omit<typeof studentTable.$inferInsert, 'id' | 'version'>;
    adresse: Omit<typeof adresseTable.$inferInsert, 'id' | 'studentId'>;
    pruefungsleistungen: Omit<typeof pruefungsleistungTable.$inferInsert, 'id' | 'studentId'>[];
};

// Vollstaendige fachliche Daten; Version und Zeitstempel setzt das Repository.
export type StudentUpdate = {
    student: Omit<StudentCreate['student'], 'erzeugt' | 'aktualisiert'>;
    adresse: StudentCreate['adresse'];
    pruefungsleistungen: StudentCreate['pruefungsleistungen'];
};

// Spalten, die eindeutig sein muessen (UNIQUE bzw. fachlich eindeutig)
export type UniqueSpalte = 'email' | 'matrikelnummer' | 'username';

/** Persistenzzugriff auf das Student-Aggregate ueber den gemeinsamen Drizzle-Client. */
export class StudentRepository {
    readonly #db: Database['db'];

    constructor(db: Database['db']) {
        this.#db = db;
    }

    /** Legt Student, Adresse und Pruefungsleistungen in einer Transaktion an. */
    async create({ student, adresse, pruefungsleistungen }: StudentCreate): Promise<number> {
        // Schlaegt ein INSERT fehl, wird die ganze Transaktion zurueckgerollt.
        return await this.#db.transaction(async (tx) => {
            const [row] = await tx
                .insert(studentTable)
                .values(student)
                .returning({ id: studentTable.id });
            if (row === undefined) {
                throw new Error('Der Studierende wurde nicht angelegt.');
            }
            const studentId = row.id;

            await tx.insert(adresseTable).values({ ...adresse, studentId });
            // Ein INSERT mit leerer Werteliste waere ungueltiges SQL
            if (pruefungsleistungen.length > 0) {
                await tx.insert(pruefungsleistungTable).values(
                    pruefungsleistungen.map((leistung) => {
                        return { ...leistung, studentId };
                    }),
                );
            }
            return studentId;
        });
    }

    /**
     * Ersetzt die fachlichen Daten des Aggregats in einer Transaktion.
     * @returns neue Version oder undefined, wenn ID und Version nicht zusammen passen
     */
    async update(
        id: number,
        version: number,
        { student, adresse, pruefungsleistungen }: StudentUpdate,
    ): Promise<number | undefined> {
        return await this.#db.transaction(async (tx) => {
            // Der Versionsvergleich muss Teil des UPDATE sein: kein getrenntes Lesen/Schreiben.
            const [updated] = await tx
                .update(studentTable)
                .set({
                    ...student,
                    version: sql`${studentTable.version} + 1`,
                    aktualisiert: sql`now()`,
                })
                .where(and(eq(studentTable.id, id), eq(studentTable.version, version)))
                .returning({ version: studentTable.version });
            if (updated === undefined) {
                // Kein Treffer: auch die zugehoerigen Daten bleiben unveraendert.
                return undefined;
            }

            // Eine vorhandene Adresse behaelt ihre ID; eine fehlende wird angelegt.
            await tx
                .insert(adresseTable)
                .values({ ...adresse, studentId: id })
                .onConflictDoUpdate({ target: adresseTable.studentId, set: adresse });

            // Leistungen werden als vollstaendige Liste ohne eigene IDs uebergeben.
            await tx.delete(pruefungsleistungTable).where(eq(pruefungsleistungTable.studentId, id));
            if (pruefungsleistungen.length > 0) {
                await tx.insert(pruefungsleistungTable).values(
                    pruefungsleistungen.map((leistung) => {
                        return { ...leistung, studentId: id };
                    }),
                );
            }
            return updated.version;
        });
    }

    /** Gibt es bereits einen Studierenden mit diesem Wert, z.B. dieser Email? */
    async existsBy(spalte: UniqueSpalte, wert: string): Promise<boolean> {
        const [row] = await this.#db
            .select({ id: studentTable.id })
            .from(studentTable)
            .where(eq(studentTable[spalte], wert))
            .limit(1);
        return row !== undefined;
    }

    async findById(id: number): Promise<Student | undefined> {
        const [student] = await this.#find(eq(studentTable.id, id));
        return student;
    }

    find(params: Suchparameter = {}): Promise<Student[]> {
        return this.#find(buildWhere(params));
    }

    async #find(where: SQL | undefined): Promise<Student[]> {
        const rows = await this.#db
            .select({
                student: studentTable,
                adresse: adresseTable,
                pruefungsleistung: pruefungsleistungTable,
            })
            .from(studentTable)
            .leftJoin(adresseTable, eq(studentTable.id, adresseTable.studentId))
            .leftJoin(pruefungsleistungTable, eq(studentTable.id, pruefungsleistungTable.studentId))
            .where(where)
            // Kein LIMIT auf Join-Zeilen: alle Leistungen des Studierenden mitladen.
            .orderBy(asc(studentTable.id), asc(pruefungsleistungTable.id));

        const students = new Map<number, Student>();
        for (const row of rows) {
            let student = students.get(row.student.id);
            if (student === undefined) {
                student = { ...row.student, adresse: row.adresse, pruefungsleistungen: [] };
                students.set(student.id, student);
            }
            if (row.pruefungsleistung !== null) {
                student.pruefungsleistungen.push(row.pruefungsleistung);
            }
        }
        return [...students.values()];
    }
}

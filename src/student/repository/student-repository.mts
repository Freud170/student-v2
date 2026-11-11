import { adresseTable, pruefungsleistungTable, studentTable } from '../../db/schema.mts';
import { asc, eq } from 'drizzle-orm';
import { type Database } from '../../config/db.mts';
import { type Student } from '../entity/student.mts';

/** Persistenzzugriff auf das Student-Aggregate ueber den gemeinsamen Drizzle-Client. */
export class StudentRepository {
    readonly #db: Database['db'];

    constructor(db: Database['db']) {
        this.#db = db;
    }

    async findById(id: number): Promise<Student | undefined> {
        const rows = await this.#db
            .select({
                student: studentTable,
                adresse: adresseTable,
                pruefungsleistung: pruefungsleistungTable,
            })
            .from(studentTable)
            .leftJoin(adresseTable, eq(studentTable.id, adresseTable.studentId))
            .leftJoin(pruefungsleistungTable, eq(studentTable.id, pruefungsleistungTable.studentId))
            .where(eq(studentTable.id, id))
            // Kein LIMIT auf Join-Zeilen: alle Leistungen des Studierenden mitladen.
            .orderBy(asc(pruefungsleistungTable.id));

        const [first] = rows;
        if (first === undefined) {
            return undefined;
        }
        return {
            ...first.student,
            adresse: first.adresse,
            pruefungsleistungen: rows.flatMap(({ pruefungsleistung }) =>
                pruefungsleistung === null ? [] : [pruefungsleistung],
            ),
        };
    }
}

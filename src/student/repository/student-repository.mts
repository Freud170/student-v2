import { type SQL, asc, eq } from 'drizzle-orm';
import { adresseTable, pruefungsleistungTable, studentTable } from '../../db/schema.mts';
import { type Database } from '../../config/db.mts';
import { type Student } from '../entity/student.mts';
import { type Suchparameter } from '../service/suchparameter.mts';
import { buildWhere } from './build-where.mts';

/** Persistenzzugriff auf das Student-Aggregate ueber den gemeinsamen Drizzle-Client. */
export class StudentRepository {
    readonly #db: Database['db'];

    constructor(db: Database['db']) {
        this.#db = db;
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

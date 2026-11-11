import {
    check,
    foreignKey,
    index,
    integer,
    numeric,
    pgSchema,
    text,
    timestamp,
    unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const studentSchema = pgSchema('student');

export const studentTable = studentSchema.table(
    'student',
    {
        id: integer().primaryKey().generatedAlwaysAsIdentity({ startWith: 1000 }),
        version: integer().default(0).notNull(),
        matrikelnummer: text().notNull(),
        nachname: text().notNull(),
        vorname: text().notNull(),
        email: text().notNull(),
        username: text().notNull(),
        erzeugt: timestamp().notNull(),
        aktualisiert: timestamp().notNull(),
    },
    (table) => [
        index('student_nachname_idx').using('btree', table.nachname.asc().nullsLast()),
        unique('student_email_key').on(table.email),
        unique('student_matrikelnummer_key').on(table.matrikelnummer),
        check('student_matrikelnummer_check', sql`(matrikelnummer ~ '^\\d{6}$'::text)`),
    ],
);

export const adresseTable = studentSchema.table(
    'adresse',
    {
        id: integer().primaryKey().generatedAlwaysAsIdentity({ startWith: 1000 }),
        plz: text().notNull(),
        ort: text().notNull(),
        studentId: integer('student_id').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.studentId],
            foreignColumns: [studentTable.id],
            name: 'adresse_student_id_fkey',
        }).onDelete('cascade'),
        index('adresse_plz_idx').using('btree', table.plz.asc().nullsLast()),
        unique('adresse_student_id_key').on(table.studentId),
        check('adresse_plz_check', sql`(plz ~ '^\\d{5}$'::text)`),
    ],
);

export const pruefungsleistungTable = studentSchema.table(
    'pruefungsleistung',
    {
        id: integer().primaryKey().generatedAlwaysAsIdentity({ startWith: 1000 }),
        modul: text().notNull(),
        note: numeric({ precision: 2, scale: 1 }).notNull(),
        semester: text().notNull(),
        studentId: integer('student_id').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.studentId],
            foreignColumns: [studentTable.id],
            name: 'pruefungsleistung_student_id_fkey',
        }).onDelete('cascade'),
        index('pruefungsleistung_student_id_idx').using('btree', table.studentId.asc().nullsLast()),
        check(
            'pruefungsleistung_note_check',
            sql`(note = ANY (ARRAY[1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0, 5.0]))`,
        ),
    ],
);

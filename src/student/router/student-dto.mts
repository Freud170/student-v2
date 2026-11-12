import { type Student } from '../entity/student.mts';

/** Adresse in der API-Antwort, ohne interne IDs. */
export type AdresseDTO = {
    readonly plz: string;
    readonly ort: string;
};

/** Pruefungsleistung in der API-Antwort; die Note als Zahl statt als Dezimal-String. */
export type PruefungsleistungDTO = {
    readonly modul: string;
    readonly note: number;
    readonly semester: string;
};

/** Studierende in der API-Antwort (Data Transfer Object). */
export type StudentDTO = {
    readonly id: number;
    readonly version: number;
    readonly matrikelnummer: string;
    readonly nachname: string;
    readonly vorname: string;
    readonly email: string;
    readonly username: string;
    readonly erzeugt: Date;
    readonly aktualisiert: Date;
    readonly adresse: AdresseDTO | null;
    readonly pruefungsleistungen: PruefungsleistungDTO[];
};

/** Wandelt das gelesene Aggregate aus der DB in die API-Darstellung um. */
export const toStudentDTO = (student: Student): StudentDTO => {
    const { adresse, pruefungsleistungen } = student;
    return {
        id: student.id,
        version: student.version,
        matrikelnummer: student.matrikelnummer,
        nachname: student.nachname,
        vorname: student.vorname,
        email: student.email,
        username: student.username,
        erzeugt: student.erzeugt,
        aktualisiert: student.aktualisiert,
        adresse: adresse === null ? null : { plz: adresse.plz, ort: adresse.ort },
        pruefungsleistungen: pruefungsleistungen.map(({ modul, note, semester }) => {
            return { modul, note: Number(note), semester };
        }),
    };
};

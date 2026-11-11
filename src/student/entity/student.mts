import {
    type adresseTable,
    type pruefungsleistungTable,
    type studentTable,
} from '../../db/schema.mts';

export type Adresse = typeof adresseTable.$inferSelect;
export type Pruefungsleistung = typeof pruefungsleistungTable.$inferSelect;

/** Gelesenes Aggregate; Noten bleiben dezimale Strings, Zeitstempel Date-Werte. */
export type Student = typeof studentTable.$inferSelect & {
    adresse: Adresse | null;
    pruefungsleistungen: Pruefungsleistung[];
};

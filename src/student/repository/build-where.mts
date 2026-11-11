import { type SQL, and, eq, ilike } from 'drizzle-orm';
import { adresseTable, studentTable } from '../../db/schema.mts';
import { type Suchparameter } from '../service/suchparameter.mts';

// SQL-LIKE-Sonderzeichen als woertliche Zeichen der Teiltextsuche behandeln.
const contains = (value: string): string => `%${value.replaceAll(/[\\%_]/gu, '\\$&')}%`;

export const buildWhere = (params: Suchparameter): SQL | undefined =>
    and(
        params.nachname === undefined
            ? undefined
            : ilike(studentTable.nachname, contains(params.nachname)),
        params.vorname === undefined
            ? undefined
            : ilike(studentTable.vorname, contains(params.vorname)),
        params.matrikelnummer === undefined
            ? undefined
            : eq(studentTable.matrikelnummer, params.matrikelnummer),
        params.email === undefined ? undefined : eq(studentTable.email, params.email),
        params.plz === undefined ? undefined : eq(adresseTable.plz, params.plz),
        params.ort === undefined ? undefined : ilike(adresseTable.ort, contains(params.ort)),
    );

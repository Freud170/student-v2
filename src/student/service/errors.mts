// oxlint-disable max-classes-per-file
// Fehlerklassen des Student-Service; error-handler.mts bildet sie zentral auf Statuscodes ab.

import { type UniqueSpalte } from '../repository/student-repository.mts';

/** Kein Studierender gefunden bzw. ungueltige ID oder Suchparameter (404). */
export class NotFoundError extends Error {}

/** Email, Matrikelnummer oder Username ist bereits vergeben (422). */
export class UniqueError extends Error {
    readonly spalte: UniqueSpalte;

    constructor(spalte: UniqueSpalte, wert: string) {
        super(`Der Wert "${wert}" fuer ${spalte} existiert bereits.`);
        this.spalte = spalte;
    }
}

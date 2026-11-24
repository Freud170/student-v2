// oxlint-disable max-classes-per-file
// Fachliche Fehlerklassen des Student-Service.

import { type UniqueSpalte } from '../repository/student-repository.mts';

/** Kein Studierender gefunden bzw. ungueltige ID oder Suchparameter (404). */
export class NotFoundError extends Error {}

/** Die fuer eine Aenderung erforderliche Versionsbedingung fehlt. */
export class VersionRequiredError extends Error {
    constructor() {
        super('Header "If-Match" fehlt.');
    }
}

/** Die Versionsangabe entspricht keinem einzelnen numerischen starken ETag. */
export class VersionInvalidError extends Error {
    constructor() {
        super('Die Versionsangabe ist ungueltig.');
    }
}

/** Die erwartete Version stimmt nicht mehr mit dem gespeicherten Stand ueberein. */
export class VersionOutdatedError extends Error {
    constructor() {
        super('Die Versionsnummer ist nicht aktuell.');
    }
}

/** Email, Matrikelnummer oder Username ist bereits vergeben (422). */
export class UniqueError extends Error {
    readonly spalte: UniqueSpalte;

    constructor(spalte: UniqueSpalte, wert: string) {
        super(`Der Wert "${wert}" fuer ${spalte} existiert bereits.`);
        this.spalte = spalte;
    }
}

// oxlint-disable max-classes-per-file

/** Ungueltiges Access-Token; keine Token-Claims in Fehler oder Ursache aufnehmen. */
export class UnauthorizedError extends Error {
    constructor() {
        super('Access-Token nicht gueltig.');
        this.name = 'UnauthorizedError';
    }
}

/** Das verifizierte Token enthaelt keine passende Client-Rolle. */
export class ForbiddenError extends Error {
    constructor() {
        super('Erforderliche Rolle fehlt.');
        this.name = 'ForbiddenError';
    }
}

/** Die Pruefung ist wegen fehlender Signaturschluessel nicht moeglich. */
export class KeycloakUnavailableError extends Error {
    constructor() {
        super('Signaturschluessel nicht verfuegbar.');
        this.name = 'KeycloakUnavailableError';
    }
}

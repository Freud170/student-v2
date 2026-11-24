// oxlint-disable max-classes-per-file

/** Ungueltiges Access-Token; keine Token-Claims in Fehler oder Ursache aufnehmen. */
export class UnauthorizedError extends Error {
    constructor() {
        super('Access-Token nicht gueltig.');
        this.name = 'UnauthorizedError';
    }
}

/** Die Pruefung ist wegen fehlender Signaturschluessel nicht moeglich. */
export class KeycloakUnavailableError extends Error {
    constructor() {
        super('Signaturschluessel nicht verfuegbar.');
        this.name = 'KeycloakUnavailableError';
    }
}

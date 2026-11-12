// Fehlerklassen des Student-Service; app.mts bildet sie zentral auf Statuscodes ab.

/** Kein Studierender gefunden bzw. ungueltige ID oder Suchparameter (404). */
export class NotFoundError extends Error {}

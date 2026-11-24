// Globale Fehlerbehandlung: Fehler aus Router und Service zentral auf Statuscodes abbilden.

import { ForbiddenError, KeycloakUnavailableError, UnauthorizedError } from './security/errors.mts';
import {
    NotFoundError,
    UniqueError,
    VersionInvalidError,
    VersionOutdatedError,
    VersionRequiredError,
} from './student/service/errors.mts';
import {
    createProblemDetails,
    forbidden,
    preconditionFailed,
    preconditionRequired,
    serviceUnavailable,
    unauthorized,
    unprocessableContent,
} from './problem-details.mts';
import { type ErrorHandler } from 'hono';
import { type Logger } from 'pino';
import { ZodError } from 'zod';

const INTERNAL_SERVER_ERROR = 500;

export const createErrorHandler =
    (logger: Logger): ErrorHandler =>
    (err, c) => {
        if (err instanceof UnauthorizedError) {
            c.header('WWW-Authenticate', 'Bearer');
            return createProblemDetails(c, unauthorized, err.message);
        }
        if (err instanceof ForbiddenError) {
            return createProblemDetails(c, forbidden, err.message);
        }
        if (err instanceof KeycloakUnavailableError) {
            logger.warn('Keycloak-Signaturschluessel nicht verfuegbar.');
            return createProblemDetails(c, serviceUnavailable, err.message);
        }
        if (err instanceof NotFoundError) {
            // Gleiche Antwort wie bei unbekannten Routen (app.notFound)
            return c.notFound();
        }
        if (err instanceof ZodError) {
            // Ungueltige Daten, z.B. beim POST
            return createProblemDetails(c, unprocessableContent, err.issues);
        }
        if (err instanceof UniqueError) {
            // Matrikelnummer, Email oder Username bereits vergeben
            return createProblemDetails(c, unprocessableContent, err.message);
        }
        if (err instanceof VersionRequiredError) {
            c.header('Cache-Control', 'no-store');
            return createProblemDetails(c, preconditionRequired, err.message);
        }
        if (err instanceof VersionInvalidError || err instanceof VersionOutdatedError) {
            return createProblemDetails(c, preconditionFailed, err.message);
        }

        // Interne Details nur ins Log, nicht in die Antwort
        logger.error({ err }, 'Interner Serverfehler');
        return c.json({ msg: 'Interner Serverfehler' }, INTERNAL_SERVER_ERROR);
    };

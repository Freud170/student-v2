// Globale Fehlerbehandlung: Fehler aus Router und Service zentral auf Statuscodes abbilden.

import { NotFoundError, UniqueError } from './student/service/errors.mts';
import { createProblemDetails, unprocessableContent } from './problem-details.mts';
import { type ErrorHandler } from 'hono';
import { type Logger } from 'pino';
import { ZodError } from 'zod';

const INTERNAL_SERVER_ERROR = 500;

export const createErrorHandler =
    (logger: Logger): ErrorHandler =>
    (err, c) => {
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
        // 412 und 428 folgen mit PUT und If-Match (#32)

        // Interne Details nur ins Log, nicht in die Antwort
        logger.error({ err }, 'Interner Serverfehler');
        return c.json({ msg: 'Interner Serverfehler' }, INTERNAL_SERVER_ERROR);
    };

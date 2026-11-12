// Fehlerantworten als "Problem Details for HTTP APIs" (RFC 9457), angelehnt an das
// Beispiel der Vorlesung: https://www.rfc-editor.org/rfc/rfc9457

import { type ClientErrorStatusCode } from 'hono/utils/http-status';
import { type Context } from 'hono';

export const badRequest = 400;
export const preconditionFailed = 412;
export const unprocessableContent = 422;
export const preconditionRequired = 428;

export type ProblemDetails = {
    readonly title: string;
    readonly statusCode: ClientErrorStatusCode;
    readonly detail: unknown;
};

const titles: Partial<Record<ClientErrorStatusCode, string>> = {
    [badRequest]: 'Bad Request',
    [preconditionFailed]: 'Precondition Failed',
    [unprocessableContent]: 'Unprocessable Content',
    [preconditionRequired]: 'Precondition Required',
};

/** JSON-Antwort mit Content-Type application/problem+json. */
export const createProblemDetails = (
    c: Context,
    statusCode: ClientErrorStatusCode,
    detail?: unknown,
): Response => {
    const problemDetails: ProblemDetails = {
        title: titles[statusCode] ?? 'Client Error',
        statusCode,
        detail,
    };
    const response = c.json(problemDetails, statusCode);
    response.headers.set('Content-Type', 'application/problem+json');
    return response;
};

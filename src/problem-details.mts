// Fehlerantworten als "Problem Details for HTTP APIs": https://www.rfc-editor.org/rfc/rfc9457

import { type ClientErrorStatusCode, type ServerErrorStatusCode } from 'hono/utils/http-status';
import { type Context } from 'hono';

export const badRequest = 400;
export const unauthorized = 401;
export const forbidden = 403;
export const preconditionFailed = 412;
export const unsupportedMediaType = 415;
export const unprocessableContent = 422;
export const preconditionRequired = 428;
export const serviceUnavailable = 503;

type ProblemStatusCode = ClientErrorStatusCode | ServerErrorStatusCode;

export type ProblemDetails = {
    readonly title: string;
    readonly statusCode: ProblemStatusCode;
    readonly detail: unknown;
};

const titles: Partial<Record<ProblemStatusCode, string>> = {
    [badRequest]: 'Bad Request',
    [unauthorized]: 'Unauthorized',
    [forbidden]: 'Forbidden',
    [preconditionFailed]: 'Precondition Failed',
    [unsupportedMediaType]: 'Unsupported Media Type',
    [unprocessableContent]: 'Unprocessable Content',
    [preconditionRequired]: 'Precondition Required',
    [serviceUnavailable]: 'Service Unavailable',
};

/** JSON-Antwort mit Content-Type application/problem+json. */
export const createProblemDetails = (
    c: Context,
    statusCode: ProblemStatusCode,
    detail?: unknown,
): Response => {
    const problemDetails: ProblemDetails = {
        title: titles[statusCode] ?? 'HTTP Error',
        statusCode,
        detail,
    };
    const response = c.json(problemDetails, statusCode);
    response.headers.set('Content-Type', 'application/problem+json');
    return response;
};

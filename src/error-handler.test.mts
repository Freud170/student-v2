import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import { NotFoundError } from './student/service/errors.mts';
import { createErrorHandler } from './error-handler.mts';
import { pino } from 'pino';
import { z } from 'zod';

const NOT_FOUND = 404;
const UNPROCESSABLE_CONTENT = 422;

// Testroute, die den uebergebenen Fehler wirft
const setup = (error: Error) => {
    const lines: string[] = [];
    const app = new Hono();
    app.get('/', () => {
        throw error;
    });
    app.onError(createErrorHandler(pino({}, { write: (line) => lines.push(line) })));
    return { app, lines };
};

describe('Globale Fehlerbehandlung', () => {
    test('NotFoundError liefert 404', async () => {
        const { app } = setup(new NotFoundError('nicht da'));
        const response = await app.request('/');

        expect(response.status).toBe(NOT_FOUND);
    });

    test('ZodError liefert 422 als Problem Details', async () => {
        const result = z.object({ plz: z.string().regex(/^\d{5}$/u) }).safeParse({ plz: '1' });
        if (result.success) {
            throw new Error('Testdaten muessen ungueltig sein');
        }
        const { app } = setup(result.error);
        const response = await app.request('/');

        expect(response.status).toBe(UNPROCESSABLE_CONTENT);
        expect(response.headers.get('Content-Type')).toBe('application/problem+json');
        await expect(response.json()).resolves.toMatchObject({
            title: 'Unprocessable Content',
            statusCode: UNPROCESSABLE_CONTENT,
            detail: [expect.objectContaining({ path: ['plz'] })],
        });
    });

    test('andere Fehler liefern 500 ohne interne Details', async () => {
        const { app, lines } = setup(new Error('geheimes Detail'));
        const response = await app.request('/');

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toStrictEqual({ msg: 'Interner Serverfehler' });
        expect(lines.join('')).toContain('geheimes Detail');
    });
});

import { describe, expect, test, vi } from 'vitest';
import { ConfigSchema } from './config/config.mts';
import { createApp } from './app.mts';
import { createContainer } from './container.mts';
import { pino } from 'pino';

const origin = 'https://localhost:5173';

const setup = (level = 'debug') => {
    const lines: string[] = [];
    const logger = pino({ level }, { write: (line) => lines.push(line) });
    const config = ConfigSchema.parse({ server: {}, cors: { origins: [origin] } });
    const container = createContainer(config, logger);
    return { app: createApp(container), container, lines };
};

describe('App und manuelle DI', () => {
    test('bestehender Einstieg und Student-Router sind getrennt erreichbar', async () => {
        const { app } = setup();
        const hello = await app.request('/');
        const student = await app.request('/rest');

        expect(hello.status).toBe(200);
        await expect(hello.json()).resolves.toStrictEqual({ msg: 'Hello World' });
        expect(student.status).toBe(200);
        await expect(student.json()).resolves.toStrictEqual({ msg: 'Hello Student' });
    });

    test('Requests verwenden dieselbe injizierte Service-Instanz', async () => {
        const { app, container } = setup();
        const hello = vi.spyOn(container.studentService, 'hello');
        hello.mockReturnValue({ msg: 'Injizierter Service' });

        const first = await app.request('/rest');
        const second = await app.request('/rest');

        await expect(first.json()).resolves.toStrictEqual({ msg: 'Injizierter Service' });
        await expect(second.json()).resolves.toStrictEqual({ msg: 'Injizierter Service' });
        const requestCount = 2;
        expect(hello).toHaveBeenCalledTimes(requestCount);
    });

    test('unbekannte Routen liefern JSON mit Status 404', async () => {
        const { app } = setup();
        const response = await app.request('/unbekannt');

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toStrictEqual({ msg: 'Nicht gefunden' });
    });
});

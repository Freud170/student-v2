import { ConfigSchema, getConfig } from './config.mts';
import { describe, expect, test } from 'vitest';
import { ZodError } from 'zod';

describe('Konfiguration', () => {
    test('TOML wird geladen und validiert', async () => {
        const config = await getConfig();

        expect(config.server.allowHTTP1).toBe(true);
        expect(config.log.level).toBe('info');
        expect(config.log.output).toBe('both');
        expect(config.cors.origins).toContain('https://localhost:5173');
    });

    test('fehlende optionale Abschnitte verwenden Defaults', () => {
        const config = ConfigSchema.parse({ server: {} });

        expect(config.log).toStrictEqual({
            dir: 'log',
            file: 'server.log',
            level: 'info',
            output: 'console',
            pretty: false,
        });
    });

    test.each([
        { log: { level: 'verbose' } },
        { log: { output: 'database' } },
        { log: { pretty: 'true' } },
        { cors: { origins: ['*'] } },
        { cors: { origins: ['https://localhost:5173/path'] } },
        { cors: { origins: ['https://user:password@localhost:5173'] } },
        { cors: { origins: ['ftp://localhost'] } },
        { server: { port: -1 } },
    ])('ungueltige Werte verhindern den Start: %j', (invalid) => {
        expect(() => ConfigSchema.parse({ server: {}, ...invalid })).toThrow(ZodError);
    });
});

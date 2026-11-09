import { describe, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { ConfigSchema } from '../config/config.mts';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const loggerURL = new URL('./logger.mts', import.meta.url).href;

// Eigener Prozess prueft auch das Flushen der Pino-Transport-Worker beim Beenden.
const runLogger = async (log: object) => {
    const script = `
        const { createLogger } = await import(process.argv[1]);
        const logger = createLogger(JSON.parse(process.argv[2]));
        logger.debug('debug-message');
        logger.info({ password: 'private-marker', token: 'private-marker' }, 'info-message');
        logger.error('error-message');
    `;
    return await execFileAsync(process.execPath, [
        '--input-type=module',
        '--eval',
        script,
        loggerURL,
        JSON.stringify(log),
    ]);
};

// oxlint-disable-next-line max-lines-per-function
describe('Pino-Ausgabe', () => {
    test('Konsole liefert JSON und respektiert den Loglevel', async () => {
        const { log } = ConfigSchema.parse({ server: {}, log: { level: 'error' } });
        const { stdout } = await runLogger(log);
        const records: unknown[] = stdout
            .trim()
            .split('\n')
            .map((line): unknown => JSON.parse(line));

        expect(records).toHaveLength(1);
        expect(records[0]).toStrictEqual(expect.objectContaining({ msg: 'error-message' }));
        expect(stdout).not.toContain('info-message');
        expect(stdout).not.toContain('debug-message');
    });

    test('Pretty-Ausgabe ist ueber die Konfiguration einschaltbar', async () => {
        const { log } = ConfigSchema.parse({ server: {}, log: { pretty: true, level: 'error' } });
        const { stdout } = await runLogger(log);

        expect(stdout).toContain('ERROR');
        expect(stdout).toContain('error-message');
        expect(stdout).not.toContain('"msg"');
    });

    test('silent unterdrueckt auch Fehlermeldungen', async () => {
        const { log } = ConfigSchema.parse({ server: {}, log: { level: 'silent' } });
        const { stdout } = await runLogger(log);

        expect(stdout).toBe('');
    });

    test.each(['file', 'both'])(
        '%s schreibt JSON in das konfigurierte Verzeichnis',
        async (output) => {
            await mkdir('temp', { recursive: true });
            const directory = await mkdtemp('temp/pino-');
            try {
                const { log } = ConfigSchema.parse({
                    server: {},
                    log: {
                        output,
                        dir: join(directory, 'nested'),
                        file: 'test.log',
                        level: 'info',
                    },
                });
                const { stdout } = await runLogger(log);
                const contents = await readFile(join(log.dir, log.file), 'utf8');
                const records: unknown[] = contents
                    .trim()
                    .split('\n')
                    .map((line): unknown => JSON.parse(line));

                expect(records).toContainEqual(expect.objectContaining({ msg: 'info-message' }));
                expect(records).toContainEqual(expect.objectContaining({ msg: 'error-message' }));
                expect(contents).not.toContain('private-marker');
                expect(contents).not.toContain('debug-message');
                expect(stdout).toBe(output === 'both' ? contents : '');
            } finally {
                // Nur das von diesem Test erzeugte Unterverzeichnis entfernen.
                await rm(directory, { recursive: true, force: true });
            }
        },
    );
});

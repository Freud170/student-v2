import { type Logger, type TransportTargetOptions, pino } from 'pino';
import { type Config } from '../config/config.mts';
import { resolve } from 'node:path';

/** Ein Pino-Elternlogger pro Anwendung; Fachmodule erhalten Child-Logger per DI. */
export const createLogger = (config: Config['log']): Logger => {
    const { dir, file, level, output, pretty } = config;
    const targets: TransportTargetOptions[] = [];

    if (output === 'file' || output === 'both') {
        targets.push({
            target: 'pino/file',
            level,
            options: { destination: resolve(dir, file), mkdir: true },
        });
    }
    if (output === 'console' || output === 'both') {
        targets.push({
            target: pretty ? 'pino-pretty' : 'pino/file',
            level,
            options: pretty
                ? { singleLine: true, colorize: true, translateTime: 'SYS:standard' }
                : { destination: 1 },
        });
    }

    return pino({
        name: 'student',
        level,
        redact: {
            paths: ['password', 'token', 'authorization', 'cookie', 'req.headers', 'req.body'],
            remove: true,
        },
        transport: { targets },
    });
};

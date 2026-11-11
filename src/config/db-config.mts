import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const postgresURL = new URL('../../extras/compose/postgres/', import.meta.url);
const DEFAULT_DB_PORT = 5432;
const MAX_PORT = 65_535;
const DEFAULT_POOL_MAX = 5;
const MAX_POOL_SIZE = 100;
const DEFAULT_IDLE_TIMEOUT = 30_000;
const DEFAULT_CONNECTION_TIMEOUT = 5_000;
const DEFAULT_QUERY_TIMEOUT = 5_000;
const MAX_TIMEOUT = 60_000;

/** Zugangsdaten werden erst beim Erzeugen des Pools aus der Datei gelesen. */
export const DbConfigSchema = z.object({
    host: z.string().trim().min(1).default('localhost'),
    port: z.number().int().min(1).max(MAX_PORT).default(DEFAULT_DB_PORT),
    database: z.string().trim().min(1).default('student'),
    user: z.string().trim().min(1).default('student'),
    passwordFile: z
        .string()
        .trim()
        .min(1)
        .default(fileURLToPath(new URL('password.txt', postgresURL))),
    caFile: z
        .string()
        .trim()
        .min(1)
        .default(fileURLToPath(new URL('init/tls/server.crt', postgresURL))),
    poolMax: z.number().int().min(1).max(MAX_POOL_SIZE).default(DEFAULT_POOL_MAX),
    poolIdleTimeoutMillis: z.number().int().min(1).max(MAX_TIMEOUT).default(DEFAULT_IDLE_TIMEOUT),
    poolConnectionTimeoutMillis: z
        .number()
        .int()
        .min(1)
        .max(MAX_TIMEOUT)
        .default(DEFAULT_CONNECTION_TIMEOUT),
    queryTimeoutMillis: z.number().int().min(1).max(MAX_TIMEOUT).default(DEFAULT_QUERY_TIMEOUT),
});

export type DbConfig = z.infer<typeof DbConfigSchema>;

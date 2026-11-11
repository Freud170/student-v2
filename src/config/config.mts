// Konfigurationsdaten aus "config.toml", eingelesen durch c12 und geprueft durch Zod.

import { DbConfigSchema } from './db-config.mts';
import { fileURLToPath } from 'node:url';
import { loadConfig } from 'c12';
import { z } from 'zod';

// URL dieser Datei, d.h. von src/config/config.mts (nur bei ES-Modulen)
const configURL = new URL(import.meta.url);
const tlsURL = new URL('tls/', configURL);

// Gueltige Ports: 1 bis 65535 (16 Bit)
const MAX_PORT = 65_535;
const DEFAULT_PORT = 3000;

// Zod-Schema fuer config.toml: Struktur, erlaubte Werte und Defaults
const originSchema = z
    .url({ protocol: /^https?$/u })
    .pipe(
        z
            .string()
            .refine(
                (value) => new URL(value).origin === value,
                'Origin ohne Pfad, Zugangsdaten, Query oder abschliessenden Slash angeben',
            ),
    );

export const ConfigSchema = z.object({
    db: DbConfigSchema.prefault({}),
    server: z.object({
        port: z.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT),
        keyFile: z.string().default(fileURLToPath(new URL('key.pem', tlsURL))),
        certFile: z.string().default(fileURLToPath(new URL('certificate.crt', tlsURL))),
        allowHTTP1: z.boolean().default(false),
    }),
    log: z
        .object({
            dir: z.string().min(1).default('log'),
            file: z.string().min(1).default('server.log'),
            level: z
                .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
                .default('info'),
            output: z.enum(['console', 'file', 'both']).default('console'),
            pretty: z.boolean().default(false),
        })
        .prefault({}),
    cors: z
        .object({
            origins: z
                .array(originSchema)
                .default(['https://localhost:4200', 'https://localhost:5173']),
        })
        .prefault({}),
});

// TypeScript-Typ, der automatisch aus dem Zod-Schema abgeleitet wird
export type Config = z.infer<typeof ConfigSchema>;

const tomlURL = new URL('config.toml', configURL);

// config.toml einlesen und gegen das Schema pruefen
export const getConfig = async (): Promise<Config> => {
    const { config } = await loadConfig<Config>({
        name: 'config',
        configFile: fileURLToPath(tomlURL),
        configFileRequired: true,
        schema: ConfigSchema,
    });
    return config;
};

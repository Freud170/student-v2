// Konfigurationsdaten aus "config.toml", eingelesen durch c12 und geprueft durch Zod.

import { loadConfig } from 'c12';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// URL dieser Datei, d.h. von src/config/config.mts (nur bei ES-Modulen)
const configURL = new URL(import.meta.url);
const tlsURL = new URL('tls/', configURL);

// Zod-Schema fuer config.toml: Struktur, erlaubte Werte und Defaults
const ConfigSchema = z.object({
    server: z.object({
        port: z.number().int().min(1).max(65535).default(3000),
        keyFile: z.string().default(fileURLToPath(new URL('key.pem', tlsURL))),
        certFile: z.string().default(fileURLToPath(new URL('certificate.crt', tlsURL))),
        allowHTTP1: z.boolean().default(false),
    }),
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

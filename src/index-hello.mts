// "Hello World" als Web-Applikation mit Hono und Node, mit HTTPS (TLS).

import { Hono } from 'hono';
import { createSecureServer } from 'node:http2';
import { getConfig } from './config/config.mts';
import { readFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';

const app = new Hono();

// GET-Request auf "/" liefert einen JSON-Datensatz.
app.get('/', (c) => c.json({ msg: 'Hello World' }));

// Konfiguration aus src/config/config.toml (Destructuring)
const config = await getConfig();
const { port, keyFile, certFile, allowHTTP1 } = config.server;

// Privater Schluessel und selbstsigniertes Zertifikat fuer TLS
const key = await readFile(keyFile, { encoding: 'utf8' });
const cert = await readFile(certFile, { encoding: 'utf8' });

// Node-Server mit HTTP/2 und TLS 1.3 starten.
serve(
    {
        fetch: app.fetch,
        port,
        createServer: createSecureServer,
        serverOptions: {
            key,
            cert,
            minVersion: 'TLSv1.3',
            maxVersion: 'TLSv1.3',
            // HTTP/1.1 zusaetzlich erlauben, z.B. fuer Bruno
            allowHTTP1,
        },
    },
    (info) => {
        console.log(`Der Server ist mit HTTPS gestartet: https://localhost:${info.port}`);
    },
);

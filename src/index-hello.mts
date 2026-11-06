// "Hello World" als Web-Applikation mit Hono und Node, mit HTTPS (TLS).

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { createSecureServer } from 'node:http2';

const app = new Hono();

// GET-Request auf "/" liefert einen JSON-Datensatz.
app.get('/', (c) => c.json({ msg: 'Hello World' }));

// Privater Schluessel und selbstsigniertes Zertifikat fuer TLS.
// Die Pfade sind relativ zu dieser Datei (import.meta.url).
// Spaeter kommen Port und Pfade in die Konfiguration (config.toml).
const key = await readFile(new URL('config/tls/key.pem', import.meta.url), { encoding: 'utf8' });
const cert = await readFile(new URL('config/tls/certificate.crt', import.meta.url), {
    encoding: 'utf8',
});

// Node-Server mit HTTP/2 und TLS 1.3 starten.
serve(
    {
        fetch: app.fetch,
        port: 3000,
        createServer: createSecureServer,
        serverOptions: {
            key,
            cert,
            minVersion: 'TLSv1.3',
            maxVersion: 'TLSv1.3',
            // HTTP/1.1 zusaetzlich erlauben, z.B. fuer Bruno
            allowHTTP1: true,
        },
    },
    (info) => {
        console.log(`Der Server ist mit HTTPS gestartet: https://localhost:${info.port}`);
    },
);

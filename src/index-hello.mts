// "Hello World" als Web-Applikation mit Hono und Node.

import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

// GET-Request auf "/" liefert einen JSON-Datensatz.
app.get('/', (c) => c.json({ msg: 'Hello World' }));

// Node-Server starten (Default-Port 3000).
serve(app, (info) => {
    console.log(`Der Server ist gestartet: http://localhost:${info.port}`);
});

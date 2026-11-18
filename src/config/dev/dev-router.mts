import { type DbPopulate } from './db-populate.mts';
import { Hono } from 'hono';

// Router fuer die Entwicklung wie im Beispiel der Vorlesung; wird nur eingehaengt, wenn
// in config.toml "populate = true" steht. Absicherung mit der Rolle admin folgt (#31).
export const createDevRouter = (populate: DbPopulate): Hono => {
    const router = new Hono();

    // QUERY ist eine HTTP-Methode fuer sichere Anfragen mit Body; der Prof nutzt sie auch hier
    router.query('/db_populate', async (c) => {
        await populate();
        return c.json({ db_populate: 'ok' });
    });

    return router;
};

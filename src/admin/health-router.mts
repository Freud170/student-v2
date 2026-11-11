import { Hono } from 'hono';
import { type Logger } from 'pino';

const SERVICE_UNAVAILABLE = 503;

export const createHealthRouter = (checkDatabase: () => Promise<void>, logger: Logger): Hono => {
    const router = new Hono();
    router.get('/liveness', (c) => c.json({ status: 'up' }));
    router.get('/readiness', async (c) => {
        try {
            await checkDatabase();
            return c.json({ status: 'up' });
        } catch {
            logger.warn('Readiness: Datenbank nicht verfuegbar.');
            return c.json({ status: 'down' }, SERVICE_UNAVAILABLE);
        }
    });
    return router;
};

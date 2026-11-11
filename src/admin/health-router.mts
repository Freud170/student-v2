import { Hono } from 'hono';

export const createHealthRouter = (): Hono => {
    const router = new Hono();
    router.get('/liveness', (c) => c.json({ status: 'up' }));
    // Readiness prueft derzeit noch keine externen Dienste.
    router.get('/readiness', (c) => c.json({ status: 'up' }));
    return router;
};

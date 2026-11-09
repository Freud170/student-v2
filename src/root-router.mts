import { Hono } from 'hono';

export const createRootRouter = (): Hono => {
    const router = new Hono();
    router.get('/', (c) => c.json({ msg: 'Hello World' }));
    return router;
};

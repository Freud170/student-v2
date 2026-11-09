import { type Config } from './config.mts';
import { type cors } from 'hono/cors';

const MAX_AGE = 86_400;

export const getCorsOptions = (config: Config['cors']): Parameters<typeof cors>[0] => {
    return {
        origin: config.origins,
        allowMethods: ['GET', 'HEAD'],
        allowHeaders: ['Accept', 'Content-Type', 'Authorization', 'If-Match', 'If-None-Match'],
        exposeHeaders: ['ETag', 'Location', 'X-Response-Time'],
        maxAge: MAX_AGE,
        credentials: false,
    };
};

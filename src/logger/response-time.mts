import { type Logger } from 'pino';
import { type MiddlewareHandler } from 'hono';
import { defineMiddleware } from 'hono/factory';

const DECIMAL_PLACES = 3;

/** Misst bis zur fertigen Response, nicht bis zum Ende der Netzwerkuebertragung. */
export const responseTime = (logger: Logger): MiddlewareHandler =>
    defineMiddleware(async (c, next) => {
        const start = performance.now();
        await next(); // oxlint-disable-line node/callback-return
        const duration = performance.now() - start;
        c.header('X-Response-Time', `${duration.toFixed(DECIMAL_PLACES)}ms`);
        logger.debug({ duration, status: c.res.status }, 'Response time');
    });

import { type Logger } from 'pino';
import { type MiddlewareHandler } from 'hono';
import { defineMiddleware } from 'hono/factory';

/** Keine Query-Werte, Bodies, Cookies oder Authorization-Header protokollieren. */
export const requestLogger = (logger: Logger): MiddlewareHandler =>
    defineMiddleware(async (c, next) => {
        await next(); // oxlint-disable-line node/callback-return
        logger.info(
            { method: c.req.method, path: c.req.path, status: c.res.status },
            'HTTP request',
        );
    });

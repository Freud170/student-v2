import { type Container } from './container.mts';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { createRootRouter } from './root-router.mts';
import { createStudentRouter } from './student/router/student-router.mts';
import { getCorsOptions } from './config/cors-options.mts';
import { requestLogger } from './logger/request-logger.mts';
import { responseTime } from './logger/response-time.mts';
import { secureHeaders } from 'hono/secure-headers';

/** App-Komposition ohne Serverstart oder Zugriff auf externe Dienste. */
export const createApp = ({ config, logger, studentService }: Container): Hono => {
    const app = new Hono();
    const httpLogger = logger.child({ module: 'http' });

    // Auch Preflights und Fehler durchlaufen Logging und Security-Header.
    app.use(responseTime(httpLogger), requestLogger(httpLogger));
    app.use(secureHeaders(), cors(getCorsOptions(config.cors)), compress());

    app.route('/', createRootRouter());
    app.route('/rest', createStudentRouter(studentService));

    app.notFound((c) => c.json({ msg: 'Nicht gefunden' }, 404));
    // Hono erwartet hier einen Fehler-Callback.
    // oxlint-disable-next-line promise/prefer-await-to-callbacks
    app.onError((err, c) => {
        httpLogger.error({ err }, 'Interner Serverfehler');
        return c.json({ msg: 'Interner Serverfehler' }, 500);
    });
    return app;
};

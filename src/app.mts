import { type Container } from './container.mts';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { createErrorHandler } from './error-handler.mts';
import { createHealthRouter } from './admin/health-router.mts';
import { createRootRouter } from './root-router.mts';
import { createStudentRouter } from './student/router/student-router.mts';
import { getCorsOptions } from './config/cors-options.mts';
import { requestLogger } from './logger/request-logger.mts';
import { responseTime } from './logger/response-time.mts';
// Wie im Beispiel der Vorlesung: app.mts setzt alles zusammen und braucht mehr Imports
import { secureHeaders } from 'hono/secure-headers'; // oxlint-disable-line import/max-dependencies

/** App-Komposition ohne Serverstart oder Zugriff auf externe Dienste. */
export const createApp = ({ config, logger, studentService, database }: Container): Hono => {
    const app = new Hono();
    const httpLogger = logger.child({ module: 'http' });

    // Auch Preflights und Fehler durchlaufen Logging und Security-Header.
    app.use(responseTime(httpLogger), requestLogger(httpLogger));
    app.use(secureHeaders(), cors(getCorsOptions(config.cors)), compress());

    app.route('/', createRootRouter());
    app.route('/rest', createStudentRouter(studentService));
    app.route('/health', createHealthRouter(database.check, logger.child({ module: 'health' })));

    app.notFound((c) => c.json({ msg: 'Nicht gefunden' }, 404));
    app.onError(createErrorHandler(httpLogger));
    return app;
};

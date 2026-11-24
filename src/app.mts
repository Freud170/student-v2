// Zentrale Komposition von Routern und Middleware.
// oxlint-disable import/max-dependencies
import { type Container } from './container.mts';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { createDevRouter } from './config/dev/dev-router.mts';
import { createErrorHandler } from './error-handler.mts';
import { createHealthRouter } from './admin/health-router.mts';
import { createRootRouter } from './root-router.mts';
import { createStudentRouter } from './student/router/student-router.mts';
import { createStudentWriteRouter } from './student/router/student-write-router.mts';
import { getCorsOptions } from './config/cors-options.mts';
import { requestLogger } from './logger/request-logger.mts';
import { responseTime } from './logger/response-time.mts';
import { secureHeaders } from 'hono/secure-headers';

/** App-Komposition ohne Serverstart oder Zugriff auf externe Dienste. */
export const createApp = ({
    config,
    logger,
    studentService,
    studentWriteService,
    database,
    dbPopulate,
    rolesRequired,
}: Container): Hono => {
    const app = new Hono();
    const httpLogger = logger.child({ module: 'http' });

    // Auch Preflights und Fehler durchlaufen Logging und Security-Header.
    app.use(responseTime(httpLogger), requestLogger(httpLogger));
    app.use(secureHeaders(), cors(getCorsOptions(config.cors)), compress());

    app.route('/', createRootRouter());
    app.route('/rest', createStudentRouter(studentService));
    app.route('/rest', createStudentWriteRouter(studentWriteService, rolesRequired));
    app.route('/health', createHealthRouter(database.check, logger.child({ module: 'health' })));
    // Nur in der Entwicklung, d.h. mit "populate = true" in config.toml
    if (config.db.populate) {
        app.route('/dev', createDevRouter(dbPopulate, rolesRequired));
    }

    app.notFound((c) => c.json({ msg: 'Nicht gefunden' }, 404));
    app.onError(createErrorHandler(httpLogger));
    return app;
};

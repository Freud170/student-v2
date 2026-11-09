import { type Container } from './container.mts';
import { Hono } from 'hono';
import { createRootRouter } from './root-router.mts';
import { createStudentRouter } from './student/router/student-router.mts';

/** App-Komposition ohne Serverstart oder Zugriff auf externe Dienste. */
export const createApp = ({ logger, studentService }: Container): Hono => {
    const app = new Hono();
    const httpLogger = logger.child({ module: 'http' });

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

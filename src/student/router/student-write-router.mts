import { Hono, type MiddlewareHandler } from 'hono';
import { badRequest, createProblemDetails, unsupportedMediaType } from '../../problem-details.mts';
import { type RolesRequired } from '../../security/roles-required.mts';
import { StudentNeuSchema } from '../validation/student-validation.mts';
import { type StudentWriteService } from '../service/student-write-service.mts';
import { VersionRequiredError } from '../service/errors.mts';

const CREATED = 201;
const NO_CONTENT = 204;

// Nur unkomprimierte Bodies; pruefen, bevor JSON gelesen oder verarbeitet wird.
const uncompressedBody: MiddlewareHandler = async (c, next) => {
    const encoding = c.req.header('Content-Encoding');
    if (encoding !== undefined && encoding.trim().toLowerCase() !== 'identity') {
        c.header('Accept-Encoding', 'identity');
        return createProblemDetails(
            c,
            unsupportedMediaType,
            'Nur unkomprimierte Request-Bodies sind erlaubt.',
        );
    }
    return await next();
};

// Absolute URL des neuen Datensatzes, z.B. https://localhost:3000/rest/1000
const createLocation = (requestUrl: string, id: number): string => {
    const { origin, pathname } = new URL(requestUrl);
    return `${origin}${pathname.replace(/\/$/u, '')}/${id}`;
};

// Authentifizierung und Rollenpruefung laufen vor Body-Validierung und Service-Aufruf.
export const createStudentWriteRouter = (
    service: Pick<StudentWriteService, 'create' | 'update'>,
    rolesRequired: RolesRequired,
): Hono => {
    const router = new Hono();

    // Neuanlegen, z.B. POST /rest mit JSON im Request-Body
    router.post('/', rolesRequired('admin', 'student'), uncompressedBody, async (c) => {
        let requestBody: unknown;
        try {
            requestBody = await c.req.json();
        } catch {
            // Der Request-Body muss gueltiges JSON enthalten.
            return createProblemDetails(c, badRequest, 'Ungueltiges JSON');
        }

        // Validierung mit Zod: bei ungueltigen Daten ZodError, d.h. 422
        const studentNeu = StudentNeuSchema.parse(requestBody);
        const id = await service.create(studentNeu);

        c.header('Location', createLocation(c.req.url, id));
        return c.body(null, CREATED);
    });

    router.put('/:id', rolesRequired('admin', 'student'), uncompressedBody, async (c) => {
        const id = c.req.param('id');
        // Wie bei GET keine teilweise geparsten IDs wie "1abc" oder "1e3".
        if (!/^\d+$/u.test(id)) {
            return c.notFound();
        }
        const version = c.req.header('If-Match');
        if (version === undefined) {
            throw new VersionRequiredError();
        }
        let requestBody: unknown;
        try {
            requestBody = await c.req.json();
        } catch {
            return createProblemDetails(c, badRequest, 'Ungueltiges JSON');
        }
        // Der Service validiert ID, Version und den vollstaendigen Body.
        const neueVersion = await service.update(Number(id), requestBody, version);
        c.header('ETag', `"${neueVersion}"`);
        return c.body(null, NO_CONTENT);
    });

    return router;
};

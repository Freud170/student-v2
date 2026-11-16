import { badRequest, createProblemDetails } from '../../problem-details.mts';
import { Hono } from 'hono';
import { StudentNeuSchema } from '../validation/student-validation.mts';
import { type StudentWriteService } from '../service/student-write-service.mts';

const CREATED = 201;

// Absolute URL des neuen Datensatzes, z.B. https://localhost:3000/rest/1000
const createLocation = (requestUrl: string, id: number): string => {
    const { origin, pathname } = new URL(requestUrl);
    return `${origin}${pathname.replace(/\/$/u, '')}/${id}`;
};

// Schreibende Routen wie buch-write-router im Prof-Beispiel; Fehler wie ZodError oder
// UniqueError bildet die globale Fehlerbehandlung ab (error-handler.mts).
export const createStudentWriteRouter = (service: Pick<StudentWriteService, 'create'>): Hono => {
    const router = new Hono();

    // Neuanlegen, z.B. POST /rest mit JSON im Request-Body
    router.post('/', async (c) => {
        let requestBody: unknown;
        try {
            requestBody = await c.req.json();
        } catch {
            // Wie im Prof-Beispiel: kein gueltiges JSON
            return createProblemDetails(c, badRequest, 'Ungueltiges JSON');
        }

        // Validierung mit Zod: bei ungueltigen Daten ZodError, d.h. 422
        const studentNeu = StudentNeuSchema.parse(requestBody);
        const id = await service.create(studentNeu);

        c.header('Location', createLocation(c.req.url, id));
        return c.body(null, CREATED);
    });

    return router;
};

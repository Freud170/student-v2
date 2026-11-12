import { Hono } from 'hono';
import { type StudentService } from '../service/student-service.mts';
import { toStudentDTO } from './student-dto.mts';

const NOT_MODIFIED = 304;
const NOT_ACCEPTABLE = 406;

// Ohne Accept-Header oder mit */* ist JSON erlaubt; sonst muss json oder html enthalten sein.
const acceptsJson = (accept: string | undefined): boolean => {
    const value = accept?.toLowerCase() ?? '*/*';
    return value.includes('*/*') || /json|html/u.test(value);
};

// Fehler wie NotFoundError wirft der Service; app.onError macht daraus den Statuscode.
export const createStudentRouter = (service: Pick<StudentService, 'find' | 'findById'>): Hono => {
    const router = new Hono();

    // Suche mit Pfad-Parameter, z.B. GET /rest/1
    router.get('/:id', async (c) => {
        if (!acceptsJson(c.req.header('Accept'))) {
            return c.body(null, NOT_ACCEPTABLE);
        }

        const id = c.req.param('id');
        // Nur Ziffern; "1e3", "-1" oder "abc" sind keine gueltige ID
        if (!/^\d+$/u.test(id)) {
            return c.notFound();
        }

        const student = await service.findById(Number(id));

        // ETag = Version in Anfuehrungszeichen, z.B. "0"; auch bei 304 mitsenden
        const etag = `"${student.version}"`;
        c.header('ETag', etag);
        // Einfacher Vergleich wie im Prof-Beispiel (schwache ETags W/"0" werden nicht erkannt)
        if (c.req.header('If-None-Match') === etag) {
            // Unveraendert: der Client verwendet seine gespeicherte Kopie
            return c.body(null, NOT_MODIFIED);
        }
        return c.json(toStudentDTO(student));
    });

    // Suche mit Query-Parametern, z.B. GET /rest?nachname=a&plz=76133; ohne Parameter: alle
    router.get('/', async (c) => {
        if (!acceptsJson(c.req.header('Accept'))) {
            return c.body(null, NOT_ACCEPTABLE);
        }

        const students = await service.find(c.req.query());
        return c.json(students.map((student) => toStudentDTO(student)));
    });

    return router;
};

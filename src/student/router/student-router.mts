import { Hono } from 'hono';
import { type StudentService } from '../service/student-service.mts';
import { ZodError } from 'zod';
import { toStudentDTO } from './student-dto.mts';

const NOT_ACCEPTABLE = 406;

// Ohne Accept-Header oder mit */* ist JSON erlaubt; sonst muss json oder html enthalten sein.
const acceptsJson = (accept: string | undefined): boolean => {
    const value = accept?.toLowerCase() ?? '*/*';
    return value.includes('*/*') || /json|html/u.test(value);
};

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

        let student;
        try {
            student = await service.findById(Number(id));
        } catch (err) {
            // Zu grosse IDs lehnt der Service per Zod ab
            if (err instanceof ZodError) {
                return c.notFound();
            }
            throw err;
        }
        if (student === undefined) {
            return c.notFound();
        }
        return c.json(toStudentDTO(student));
    });

    // Suche mit Query-Parametern, z.B. GET /rest?nachname=a&plz=76133; ohne Parameter: alle
    router.get('/', async (c) => {
        if (!acceptsJson(c.req.header('Accept'))) {
            return c.body(null, NOT_ACCEPTABLE);
        }

        let students;
        try {
            students = await service.find(c.req.query());
        } catch (err) {
            // Unbekannte oder ungueltige Suchparameter (wie im Prof-Beispiel: 404)
            if (err instanceof ZodError) {
                return c.notFound();
            }
            throw err;
        }
        if (students.length === 0) {
            return c.notFound();
        }
        return c.json(students.map((student) => toStudentDTO(student)));
    });

    return router;
};

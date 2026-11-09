import { Hono } from 'hono';
import { type StudentService } from '../service/student-service.mts';

export const createStudentRouter = (service: StudentService): Hono => {
    const router = new Hono();
    router.get('/', (c) => c.json(service.hello()));
    return router;
};

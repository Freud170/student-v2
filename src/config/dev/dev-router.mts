import { type DbPopulate } from './db-populate.mts';
import { Hono } from 'hono';
import { type RolesRequired } from '../../security/roles-required.mts';

// Nur mit populate=true erreichbar; Daten duerfen ausschliesslich Administratoren neu laden.
export const createDevRouter = (populate: DbPopulate, rolesRequired: RolesRequired): Hono => {
    const router = new Hono();

    // Dieser Entwicklungsendpunkt veraendert trotz der HTTP-Methode QUERY die Daten.
    router.query('/db_populate', rolesRequired('admin'), async (c) => {
        await populate();
        return c.json({ db_populate: 'ok' });
    });

    return router;
};

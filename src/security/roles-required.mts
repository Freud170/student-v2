import { ForbiddenError, UnauthorizedError } from './errors.mts';
import { type MiddlewareHandler } from 'hono';
import { type TokenVerifier } from './token-verifier.mts';
import { z } from 'zod';

export type Role = 'admin' | 'student';

/** Nur Client-Rollen aus bereits verifizierten Claims entscheiden ueber den Zugriff. */
export const createRolesRequired = (verifier: TokenVerifier, clientId: string) => {
    const claimsSchema = z.object({
        resource_access: z.object({ [clientId]: z.object({ roles: z.array(z.string()) }) }),
    });
    return (...roles: [Role, ...Role[]]): MiddlewareHandler =>
        async (c, next) => {
            const authorization = c.req.header('Authorization') ?? '';
            const token = /^Bearer +(?<token>\S+)$/iu.exec(authorization)?.groups?.['token'];
            if (!token) {
                throw new UnauthorizedError();
            }
            const payload = await verifier.verify(token);
            const claims = claimsSchema.safeParse(payload);
            const clientRoles = claims.success
                ? (claims.data.resource_access[clientId]?.roles ?? [])
                : [];
            if (!roles.some((role) => clientRoles.includes(role))) {
                throw new ForbiddenError();
            }
            return await next();
        };
};

export type RolesRequired = ReturnType<typeof createRolesRequired>;

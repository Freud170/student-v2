import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const LOCAL_ISSUER = 'https://localhost:8843/realms/student';
const httpsUrlSchema = z.url({ protocol: /^https$/u }).pipe(
    z.string().refine((value) => {
        const url = new URL(value);
        return (
            url.href === value &&
            url.username === '' &&
            url.password === '' &&
            !value.includes('?') &&
            !value.includes('#')
        );
    }, 'HTTPS-URL ohne Zugangsdaten, Query oder Fragment angeben'),
);
const nonEmptyString = z.string().trim().min(1);

/** Token-Issuer und erreichbare JWKS-Adresse sind unabhaengig konfigurierbar. */
export const KeycloakConfigSchema = z.object({
    issuer: httpsUrlSchema.default(LOCAL_ISSUER),
    jwksUri: httpsUrlSchema.default(`${LOCAL_ISSUER}/protocol/openid-connect/certs`),
    clientId: nonEmptyString.default('student-client'),
    audience: z.array(nonEmptyString).min(1).default(['account']),
    caFile: nonEmptyString.default(fileURLToPath(new URL('tls/certificate.crt', import.meta.url))),
});

export type KeycloakConfig = z.infer<typeof KeycloakConfigSchema>;

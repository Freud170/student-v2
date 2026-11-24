import { describe, expect, test } from 'vitest';
import { ConfigSchema } from './config.mts';
import { ZodError } from 'zod';
import { fileURLToPath } from 'node:url';
import { loadConfig } from 'c12';

describe('Keycloak-Konfiguration', () => {
    test('Container-TOML trennt Token-Issuer und internen Schluesselabruf', async () => {
        const { config } = await loadConfig({
            configFile: fileURLToPath(
                new URL('../../extras/compose/student/config.toml', import.meta.url),
            ),
            configFileRequired: true,
            schema: ConfigSchema,
        });
        const { keycloak } = ConfigSchema.parse(config);

        expect(keycloak).toStrictEqual({
            issuer: 'https://localhost:8843/realms/student',
            jwksUri: 'https://keycloak:8443/realms/student/protocol/openid-connect/certs',
            clientId: 'student-client',
            audience: ['account'],
            caFile: '/run/config/student-certificate.crt',
        });
    });

    test.each([
        { issuer: 'http://localhost:8880/realms/student' },
        { issuer: 'https://user:secret@localhost:8843/realms/student' },
        { issuer: 'https://localhost:8843/realms/student?query=1' },
        { issuer: 'https://localhost:8843/realms/student#fragment' },
        { jwksUri: 'http://keycloak:8080/certs' },
        { jwksUri: 'https://user:secret@keycloak:8443/certs' },
        { jwksUri: 'https://keycloak:8443/certs?query=1' },
        { jwksUri: 'https://keycloak:8443/certs#fragment' },
        { issuer: 'kein-url' },
        { clientId: ' ' },
        { audience: [] },
        { audience: [' '] },
        { audience: 'account' },
        { caFile: ' ' },
    ])('ungueltige Werte verhindern den Start: %j', (keycloak) => {
        expect(() => ConfigSchema.parse({ server: {}, keycloak })).toThrow(ZodError);
    });
});

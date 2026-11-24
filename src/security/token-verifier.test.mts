import { type FetchImplementation, SignJWT, exportJWK, generateKeyPair } from 'jose';
import { KeycloakUnavailableError, UnauthorizedError } from './errors.mts';
import { describe, expect, test, vi } from 'vitest';
import { KeycloakConfigSchema } from '../config/keycloak-config.mts';
import { createTokenVerifier } from './token-verifier.mts';

const config = KeycloakConfigSchema.parse({});
const keys = await generateKeyPair('RS256');
const otherKeys = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'primary', alg: 'RS256', use: 'sig' };
const SECOND = 1000;
const LIFETIME = 1800;

const sign = (claims: Record<string, unknown> = {}, privateKey = keys.privateKey) => {
    const now = Math.floor(Date.now() / SECOND);
    return new SignJWT({
        iss: config.issuer,
        aud: 'account',
        sub: 'test-user',
        iat: now,
        exp: now + LIFETIME,
        typ: 'Bearer',
        azp: 'student-client',
        resource_access: { 'student-client': { roles: ['student'] } },
        ...claims,
    })
        .setProtectedHeader({ alg: 'RS256', kid: 'primary', typ: 'JWT' })
        .sign(privateKey);
};

const setup = () => {
    const fetchJwks = vi
        .fn<FetchImplementation>()
        .mockResolvedValue(Response.json({ keys: [jwk] }));
    return { verifier: createTokenVerifier(config, fetchJwks), fetchJwks };
};

describe('Access-Token-Pruefung', () => {
    test('prueft eine echte RSA-Signatur und gibt verifizierte Claims zurueck', async () => {
        const { verifier } = setup();
        const payload = await verifier.verify(await sign());
        expect(payload.sub).toBe('test-user');
        expect(payload['resource_access']).toStrictEqual({
            'student-client': { roles: ['student'] },
        });
    });

    test('akzeptiert die konfigurierte Audience auch in einer Liste', async () => {
        const { verifier } = setup();
        await expect(
            verifier.verify(await sign({ aud: ['other', 'account'] })),
        ).resolves.toMatchObject({
            aud: ['other', 'account'],
        });
    });

    test.each([
        { iss: 'https://other/realms/student' },
        { aud: 'other' },
        { exp: 0 },
        { exp: undefined },
        { exp: 'tomorrow' },
        { iat: undefined },
        { iat: 'yesterday' },
        { iat: Math.floor(Date.now() / SECOND) + LIFETIME },
        { nbf: Math.floor(Date.now() / SECOND) + LIFETIME },
        { sub: undefined },
        { sub: '' },
        { sub: 123 },
        { typ: 'ID' },
        { typ: 'Refresh' },
        { typ: undefined },
        { azp: 'other-client' },
        { azp: undefined },
    ])('verwirft unpassende Claims: %j', async (claims) => {
        const { verifier } = setup();
        await expect(verifier.verify(await sign(claims))).rejects.toThrow(UnauthorizedError);
    });
});

describe('Signatur und Token-Format', () => {
    test('verwirft eine Signatur mit einem fremden privaten Schluessel', async () => {
        const { verifier } = setup();
        await expect(verifier.verify(await sign({}, otherKeys.privateKey))).rejects.toThrow(
            UnauthorizedError,
        );
    });

    test.each(['', 'kein.jwt.token', 'Bearer abc', 'eyJhbGciOiJub25lIn0.e30.'])(
        'verwirft fehlerhafte oder unsignierte Tokens: %s',
        async (token) => {
            const { verifier, fetchJwks } = setup();
            await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedError);
            expect(fetchJwks).not.toHaveBeenCalled();
        },
    );

    test('verwirft HMAC statt RSA ohne Schluesselabruf', async () => {
        const { verifier, fetchJwks } = setup();
        const keyLength = 32;
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .sign(new Uint8Array(keyLength));
        await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedError);
        expect(fetchJwks).not.toHaveBeenCalled();
    });

    test('verwirft ein unbekanntes kid', async () => {
        const { verifier } = setup();
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'RS256', kid: 'unknown', typ: 'JWT' })
            .sign(keys.privateKey);
        await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedError);
    });

    test('Fehler enthaelt weder Payload noch Token oder urspruenglichen JOSE-Fehler', async () => {
        const { verifier } = setup();
        const token = await sign({ aud: 'wrong', email: 'private-test@example.test' });
        const err: unknown = await verifier.verify(token).catch((error: unknown) => error);
        expect(err).toBeInstanceOf(UnauthorizedError);
        expect(JSON.stringify(err)).not.toContain('private-test');
        expect(JSON.stringify(err)).not.toContain(token);
        expect(err).not.toHaveProperty('cause');
        expect(err).not.toHaveProperty('payload');
    });
});

describe('JWKS-Cache und Ausfaelle', () => {
    test('laedt erst beim Pruefen und verwendet denselben Cache fuer weitere Tokens', async () => {
        const { verifier, fetchJwks } = setup();
        expect(fetchJwks).not.toHaveBeenCalled();
        const token = await sign();
        await Promise.all([verifier.verify(token), verifier.verify(token)]);
        await verifier.verify(token);
        expect(fetchJwks).toHaveBeenCalledExactlyOnceWith(
            config.jwksUri,
            expect.objectContaining({ method: 'GET', redirect: 'manual' }),
        );
    });

    test('Netzfehler bleibt ein Betriebsfehler und ein spaeterer Versuch erholt sich', async () => {
        const { verifier, fetchJwks } = setup();
        fetchJwks.mockRejectedValueOnce(new Error('private upstream details'));
        const token = await sign();
        await expect(verifier.verify(token)).rejects.toThrow(KeycloakUnavailableError);
        await expect(verifier.verify(token)).resolves.toHaveProperty('sub', 'test-user');
    });

    test.each([
        () => new Response('private upstream details', { status: 503 }),
        () => new Response('invalid json'),
        () => Response.json({ keys: 'invalid' }),
    ])('verwirft unbrauchbare JWKS ohne interne Details weiterzureichen', async (response) => {
        const verifier = createTokenVerifier(config, () => Promise.resolve(response()));
        const err: unknown = await verifier.verify(await sign()).catch((error: unknown) => error);
        expect(err).toBeInstanceOf(KeycloakUnavailableError);
        expect(err).not.toHaveProperty('cause');
        expect(JSON.stringify(err)).not.toContain('private upstream details');
    });
});

import {
    type FetchImplementation,
    type JWTVerifyGetKey,
    createRemoteJWKSet,
    customFetch,
    jwtVerify,
} from 'jose';
import { JOSEError, JWKSNoMatchingKey } from 'jose/errors';
import { KeycloakUnavailableError, UnauthorizedError } from './errors.mts';
import { type KeycloakConfig } from '../config/keycloak-config.mts';
import { createJwksFetch } from './jwks-fetch.mts';

const MILLISECONDS_PER_SECOND = 1000;

/** Ein Verifier mit gemeinsamem JWKS-Cache pro Anwendung; kein Zugriff beim Erzeugen. */
export const createTokenVerifier = (
    config: KeycloakConfig,
    fetchJwks: FetchImplementation = createJwksFetch(config.caFile),
) => {
    const jwks = createRemoteJWKSet(new URL(config.jwksUri), { [customFetch]: fetchJwks });
    const resolveKey: JWTVerifyGetKey = async (header, token) => {
        try {
            return await jwks(header, token);
        } catch (err) {
            if (err instanceof JWKSNoMatchingKey) {
                throw new UnauthorizedError();
            }
            // Keine fremden Antwortinhalte oder Token-Claims als cause weiterreichen.
            throw new KeycloakUnavailableError();
        }
    };
    return {
        verify: async (token: string) => {
            try {
                const { payload } = await jwtVerify(token, resolveKey, {
                    issuer: config.issuer,
                    audience: config.audience,
                    algorithms: ['RS256'],
                    typ: 'JWT',
                    requiredClaims: ['exp', 'iat', 'sub'],
                });
                // Nur Access-Tokens des eigenen Clients; keine ID-/Refresh-Tokens.
                if (
                    payload['typ'] !== 'Bearer' ||
                    payload['azp'] !== config.clientId ||
                    typeof payload.sub !== 'string' ||
                    payload.sub.trim() === '' ||
                    typeof payload.iat !== 'number' ||
                    payload.iat > Math.floor(Date.now() / MILLISECONDS_PER_SECOND)
                ) {
                    throw new UnauthorizedError();
                }
                return payload;
            } catch (err) {
                if (err instanceof JOSEError) {
                    // JOSE-Fehler koennen die gesamte Payload enthalten.
                    throw new UnauthorizedError();
                }
                throw err;
            }
        },
    };
};

export type TokenVerifier = ReturnType<typeof createTokenVerifier>;

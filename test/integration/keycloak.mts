import { config } from './constants.mts';
import { parse } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const credentialsSchema = z.object({
    CLIENT_SECRET: z.string().min(1),
    TEST_ADMIN_USERNAME: z.string().min(1),
    TEST_ADMIN_PASSWORD: z.string().min(1),
    TEST_STUDENT_USERNAME: z.string().min(1),
    TEST_STUDENT_PASSWORD: z.string().min(1),
});
const tokensSchema = z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
});
const TIMEOUT = 5000;

/** Tokens bleiben im Speicher; die zugehoerige Testanmeldung laesst sich schliessen. */
export const createTestSession = async (role: 'admin' | 'student') => {
    const credentials = credentialsSchema.safeParse(
        parse(await readFile(new URL('.env', import.meta.url))),
    );
    if (!credentials.success) {
        throw new Error('Zugangsdaten in test/integration/.env fehlen oder sind leer.');
    }
    const settings = credentials.data;
    const post = (operation: string, data: Record<string, string>) =>
        fetch(`${config.keycloak.issuer}/protocol/openid-connect/${operation}`, {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT),
            body: new URLSearchParams({
                client_id: config.keycloak.clientId,
                client_secret: settings.CLIENT_SECRET,
                ...data,
            }),
        });
    const response = await post('token', {
        grant_type: 'password',
        username: role === 'admin' ? settings.TEST_ADMIN_USERNAME : settings.TEST_STUDENT_USERNAME,
        password: role === 'admin' ? settings.TEST_ADMIN_PASSWORD : settings.TEST_STUDENT_PASSWORD,
    });
    if (!response.ok) {
        throw new Error(`Keycloak-Login (${role}): HTTP ${response.status}`);
    }
    const tokens = tokensSchema.safeParse(await response.json());
    if (!tokens.success) {
        throw new Error('Keycloak hat keine gueltigen Test-Tokens geliefert.');
    }
    return {
        token: tokens.data.access_token,
        close: async () => {
            const logout = await post('logout', { refresh_token: tokens.data.refresh_token });
            if (!logout.ok) {
                throw new Error(`Keycloak-Logout (${role}): HTTP ${logout.status}`);
            }
        },
    };
};

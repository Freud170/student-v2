import { describe, expect, test } from 'vitest';
import { healthURL } from './constants.mts';

// Einfachster Integrationstest: laeuft der Server und erreicht er die DB?
describe('Health', () => {
    test.concurrent.each(['liveness', 'readiness'])('GET /health/%s', async (pfad) => {
        // given / when
        const response = await fetch(`${healthURL}/${pfad}`);

        // then
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toStrictEqual({ status: 'up' });
    });
});

import { defineConfig } from 'vitest/config';
import process from 'node:process';

// Integrationstests: fetch akzeptiert sonst das selbstsignierte Zertifikat des Servers
// nicht (wie im Beispiel der Vorlesung; gilt nur fuer den Testprozess).
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const INTEGRATION_TIMEOUT = 5000;

// Zwei Projekte wie im Beispiel der Vorlesung:
//  unit:        ohne laufende App, Datenbank oder Keycloak (pnpm run test:run)
//  integration: HTTP-Requests mit fetch gegen die laufende App und PostgreSQL
//               (pnpm run test:integration)
// oxlint-disable-next-line import/no-default-export
export default defineConfig({
    test: {
        environment: 'node',
        pool: 'threads',
        projects: [
            {
                // Gemeinsame Einstellungen (environment, pool) von oben uebernehmen
                extends: true,
                test: {
                    name: 'unit',
                    include: ['src/**/*.test.mts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'integration',
                    include: ['test/integration/**/*.test.mts'],
                    // Laedt die DB vor allen Tests einmal neu
                    globalSetup: './test/integration/setup.global.mts',
                    testTimeout: INTEGRATION_TIMEOUT,
                },
            },
        ],
    },
});

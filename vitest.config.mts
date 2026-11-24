import { defineConfig } from 'vitest/config';

const INTEGRATION_TIMEOUT = 5000;

// Getrennte Projekte fuer isolierte Tests und die vorgesehene Testumgebung:
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
                    // Laedt die DB vor und nach allen Tests neu; meldet Testbenutzer ab.
                    globalSetup: './test/integration/setup.global.mts',
                    setupFiles: ['./test/integration/setup.mts'],
                    testTimeout: INTEGRATION_TIMEOUT,
                },
            },
        ],
    },
});

import { defineConfig } from 'vitest/config';

// Tests ohne laufende App, Datenbank oder Keycloak; kein globales Setup mit Testdaten.
// oxlint-disable-next-line import/no-default-export
export default defineConfig({
    test: {
        include: ['src/**/*.test.mts'],
        environment: 'node',
        pool: 'threads',
    },
});

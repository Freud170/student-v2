import { config, devURL } from './constants.mts';
import { type TestProject } from 'vitest/node';
import { configureTestTls } from './tls.mts';
import { createTestSession } from './keycloak.mts';

declare module 'vitest' {
    export interface ProvidedContext {
        adminToken: string;
        studentToken: string;
    }
}

const resetDatabase = async (token: string) => {
    const response = await fetch(`${devURL}/db_populate`, {
        method: 'QUERY',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`QUERY /dev/db_populate: Status ${response.status}`);
    }
    const body = (await response.json()) as { db_populate?: string };
    if (body.db_populate !== 'ok') {
        throw new Error('Fehler beim Neuladen der DB');
    }
};

// Nur in der vorgesehenen Testumgebung: vor und nach den Tests CSV-Daten laden.
// oxlint-disable-next-line import/no-default-export
export default async function setup(project: TestProject) {
    if (!config.db.populate) {
        throw new Error('Integrationstests benoetigen die Testumgebung mit populate=true.');
    }
    await configureTestTls();
    const sessions: Awaited<ReturnType<typeof createTestSession>>[] = [];
    const closeSessions = async () => {
        const results = await Promise.allSettled(sessions.map((session) => session.close()));
        if (results.some((result) => result.status === 'rejected')) {
            throw new Error('Mindestens eine Keycloak-Testanmeldung konnte nicht beendet werden.');
        }
    };
    try {
        const admin = await createTestSession('admin');
        sessions.push(admin);
        const student = await createTestSession('student');
        sessions.push(student);
        await resetDatabase(admin.token);
        project.provide('adminToken', admin.token);
        project.provide('studentToken', student.token);
        return async () => {
            try {
                await resetDatabase(admin.token);
            } finally {
                await closeSessions();
            }
        };
    } catch (err) {
        await closeSessions();
        throw err;
    }
}

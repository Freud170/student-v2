// Globales Setup der Integrationstests (https://vitest.dev/config/globalsetup):
// laeuft einmal vor allen Tests und laedt die DB mit den CSV-Testdaten neu.
// Voraussetzung: PostgreSQL und die App laufen, in config.toml ist "populate = true".

import { devURL } from './constants.mts';

// oxlint-disable-next-line import/no-default-export
export default async function setup() {
    const response = await fetch(`${devURL}/db_populate`, { method: 'QUERY' });
    if (!response.ok) {
        throw new Error(`QUERY /dev/db_populate: Status ${response.status}`);
    }
    const body = (await response.json()) as { db_populate?: string };
    if (body.db_populate !== 'ok') {
        throw new Error('Fehler beim Neuladen der DB');
    }
    console.log('DB wurde neu geladen');
}

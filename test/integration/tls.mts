import { getCACertificates, setDefaultCACertificates } from 'node:tls';
import { config } from './constants.mts';
import { readFile } from 'node:fs/promises';

/** Explizites Vertrauen nur in den Testprozessen; Hostnamenpruefung bleibt aktiv. */
export const configureTestTls = async () => {
    const certificates = await Promise.all([
        readFile(config.server.certFile, 'utf8'),
        readFile(config.keycloak.caFile, 'utf8'),
    ]);
    setDefaultCACertificates([...getCACertificates('default'), ...certificates]);
};

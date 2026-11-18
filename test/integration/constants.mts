// Gemeinsame Werte der Integrationstests; Port aus src/config/config.toml.

import { getConfig } from '../../src/config/config.mts';

const config = await getConfig();

export const baseURL = `https://localhost:${config.server.port}`;
export const restURL = `${baseURL}/rest`;
export const healthURL = `${baseURL}/health`;
export const devURL = `${baseURL}/dev`;

export const CONTENT_TYPE = 'Content-Type';
export const LOCATION = 'Location';
export const ETAG = 'ETag';
export const IF_NONE_MATCH = 'If-None-Match';

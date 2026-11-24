import { type FetchImplementation } from 'jose';
import { type IncomingMessage } from 'node:http';
import { get } from 'node:https';
import { readFile } from 'node:fs/promises';

const MAX_JWKS_BYTES = 1_048_576;

/** Nur der JWKS-Abruf vertraut dieser CA; globale TLS-Einstellungen bleiben unberuehrt. */
export const createJwksFetch = (caFile: string): FetchImplementation => {
    let certificate: Promise<Buffer> | undefined;
    return async (url, { headers, signal }) => {
        certificate ??= readFile(caFile);
        const ca = await certificate;
        // Callback-API von HTTPS in eine abwartbare Antwort umwandeln.
        // oxlint-disable-next-line promise/avoid-new
        const response = await new Promise<IncomingMessage>((resolve, reject) => {
            const request = get(
                url,
                {
                    ca,
                    rejectUnauthorized: true,
                    minVersion: 'TLSv1.3',
                    maxVersion: 'TLSv1.3',
                    agent: false,
                    headers: Object.fromEntries(headers),
                    signal,
                },
                resolve,
            );
            request.once('error', reject);
        });
        // Keine Weiterleitung an andere Hosts; keine offenen Keep-Alive-Sockets.
        if (response.statusCode !== 200) {
            response.destroy();
            throw new Error('JWKS-Endpunkt antwortet nicht mit HTTP 200.');
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of response as AsyncIterable<Buffer>) {
            size += chunk.length;
            if (size > MAX_JWKS_BYTES) {
                response.destroy();
                throw new Error('JWKS-Antwort ist zu gross.');
            }
            chunks.push(chunk);
        }
        return new Response(Buffer.concat(chunks), { status: 200 });
    };
};

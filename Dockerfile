# syntax=docker.io/docker/dockerfile-upstream:1.28.0
# check=error=true

ARG NODE_VERSION=26.13.0
ARG NODE_VERSION_DHI=26.13.0-0

FROM node:${NODE_VERSION}-trixie-slim AS dependencies

RUN npm install --global pnpm@12.19.0

WORKDIR /home/node
USER 1000:1000

COPY --chown=1000:1000 package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM dhi.io/node:${NODE_VERSION_DHI}-debian13 AS final

WORKDIR /opt/app
USER 1000:1000
ENV NODE_ENV=production

COPY --chown=1000:1000 package.json ./
COPY --from=dependencies --chown=1000:1000 /home/node/node_modules ./node_modules
COPY --chown=1000:1000 src ./src
COPY --chown=1000:1000 extras/compose/student/config.toml ./src/config/config.toml

EXPOSE 3000

# Readiness mit Zertifikatspruefung, ohne Shell oder zusaetzliche Programme.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "--eval", "import { get } from 'node:https'; import { readFile } from 'node:fs/promises'; import { getConfig } from './src/config/config.mts'; const { server } = await getConfig(); const request = get({ hostname: 'localhost', port: server.port, path: '/health/readiness', ca: await readFile(server.certFile), minVersion: 'TLSv1.3', timeout: 2000 }, response => { response.resume(); process.exitCode = response.statusCode === 200 ? 0 : 1; }); request.on('timeout', () => request.destroy()); request.on('error', () => { process.exitCode = 1; });"]

LABEL org.opencontainers.image.title="student-v2" \
    org.opencontainers.image.description="Hono-Appserver zur Verwaltung von Studierendendaten" \
    org.opencontainers.image.version="2026.11.0-hardened"

ENTRYPOINT ["node", "src/index.mts"]

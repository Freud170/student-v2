import { createContainer } from './container.mts';
import { createDatabase } from './config/db.mts';
import { createLogger } from './logger/logger.mts';
import { getConfig } from './config/config.mts';
import process from 'node:process';
import { startServer } from './server.mts';

const config = await getConfig();
const logger = createLogger(config.log);

try {
    const database = await createDatabase(config.db, logger.child({ module: 'db' }));
    const running = await startServer(createContainer(config, database, logger));
    let stopping = false;
    const stop = () => {
        if (stopping) {
            return;
        }
        stopping = true;
        (async () => {
            try {
                await running.close();
                logger.info('HTTP-Server und DB-Pool sind geschlossen.');
            } catch {
                logger.error('Fehler beim Beenden der Anwendung.');
                process.exitCode = 1;
            }
        })();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
} catch {
    logger.error('Die Anwendung konnte nicht gestartet werden. DB- und TLS-Konfiguration pruefen.');
    process.exitCode = 1;
}

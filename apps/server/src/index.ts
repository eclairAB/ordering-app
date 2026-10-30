import { buildApp } from './app.ts';
import { assertServable, loadConfig } from './config.ts';
import { openDatabase } from './db/connection.ts';
import { migrate } from './db/migrate.ts';

const config = loadConfig();
assertServable(config);
const db = openDatabase(config.dbPath);
const applied = migrate(db);

const app = await buildApp({ config, db });
if (applied.length > 0) app.log.info({ applied }, 'migrations applied');
if (config.development && config.staffPasscode === 'change-me') {
  app.log.warn('STAFF_PASSCODE is the default "change-me". Fine for development only.');
}
app.log.info({ timeZone: config.timeZone }, 'business day time zone');

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });

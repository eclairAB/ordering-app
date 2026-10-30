import { loadConfig } from '../config.ts';
import { openDatabase } from './connection.ts';
import { migrate } from './migrate.ts';

const config = loadConfig();
const db = openDatabase(config.dbPath);
const applied = migrate(db);
db.close();

console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');

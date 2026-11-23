import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDatabase } from './storage/database.js';
import { seedDatabase } from './storage/seed.js';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const databasePath = resolve(workspaceRoot, process.env.DATABASE_PATH ?? '.data/pran-rekha-demo.sqlite');
const database = openDatabase({ databasePath });
const count = database.prepare('SELECT COUNT(*) AS count FROM patients').get() as { count: number };
const allowDemo = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production';
if (count.count === 0 && allowDemo) seedDatabase(database);

const port = Number(process.env.API_PORT ?? 4100);
const app = createApp({ database });
const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Pran Rekha API listening at http://127.0.0.1:${port}\n`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

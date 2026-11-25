import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDatabase } from './storage/database.js';
import { seedDatabase } from './storage/seed.js';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const useRemoteTurso = Boolean(process.env.TURSO_DATABASE_URL);
const databasePath = resolve(workspaceRoot, process.env.DATABASE_PATH ?? '.data/pran-rekha-demo.sqlite');
const database = await openDatabase(useRemoteTurso ? {} : { databasePath });
const count = await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM patients');
const allowDemo = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production';
if ((count?.count ?? 0) === 0 && allowDemo) await seedDatabase(database);

const port = Number(process.env.API_PORT ?? 4100);
const app = await createApp({ database });
const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Pran Rekha API listening at http://127.0.0.1:${port} (${useRemoteTurso ? 'turso' : 'sqlite'})\n`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

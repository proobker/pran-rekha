import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { openDatabase } from '../server/src/storage/database.js';
import { PlatformStore } from '../server/src/platform/store.js';
import { enrollDemoBatch } from '../server/src/platform/enroll-demo-batch.js';

const batchId = process.argv[2];
if (!batchId || !/^[a-zA-Z0-9_-]+$/.test(batchId)) throw new Error('Supply the named batch ID');
mkdirSync('.data', { recursive: true });
const path = resolve('.data', batchId + '-credentials.json');
const useRemoteTurso = Boolean(process.env.TURSO_DATABASE_URL);
const db = await openDatabase(useRemoteTurso ? {} : { databasePath: process.env.DATABASE_PATH ?? '.data/pran-rekha-demo.sqlite' });
const saved = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
const store = new PlatformStore(db);
await store.init();
if (!saved && (await store.get<{ status: string }>('rfid-enrollment-batch', batchId))?.status === 'REGISTERED') {
  db.close();
  throw new Error('Batch is already registered but its private credential file is missing; refusing to generate replacement passwords');
}
if (saved && saved.batchId !== batchId) throw new Error('Credential file belongs to another batch');
const passwords: string[] = saved?.passwords ?? Array.from({ length: 7 }, () => randomBytes(18).toString('base64url'));
if (!saved) writeFileSync(path, JSON.stringify({ batchId, passwords }, null, 2), { mode: 0o600, flag: 'wx' });
try {
  const rows = await enrollDemoBatch(store, batchId, passwords);
  writeFileSync(path, JSON.stringify({ batchId, passwords, patients: rows }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(rows.map(({ password: _p, ...row }) => row), null, 2));
  console.log('Private login credentials saved to ' + path);
} finally {
  db.close();
}

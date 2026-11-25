import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient, type Client, type InArgs, type ResultSet, type Transaction } from '@libsql/client';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export type DatabaseOptions = {
  databasePath?: string;
  url?: string;
  authToken?: string;
};

function toPlainRows<T>(result: ResultSet): T[] {
  return result.rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (let index = 0; index < result.columns.length; index++) {
      record[result.columns[index]!] = row[index];
    }
    return record as T;
  });
}

export class Database {
  private readonly txContext = new AsyncLocalStorage<Transaction>();

  constructor(
    readonly client: Client,
    readonly url: string
  ) {}

  private runner(): Client | Transaction {
    return this.txContext.getStore() ?? this.client;
  }

  async execute(sql: string, args: InArgs = []): Promise<ResultSet> {
    return this.runner().execute({ sql, args });
  }

  async queryOne<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T | undefined> {
    const result = await this.execute(sql, args);
    return toPlainRows<T>(result)[0];
  }

  async queryAll<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
    const result = await this.execute(sql, args);
    return toPlainRows<T>(result);
  }

  async run(sql: string, args: InArgs = []): Promise<{ changes: number }> {
    const result = await this.execute(sql, args);
    return { changes: result.rowsAffected };
  }

  async exec(sql: string): Promise<void> {
    const active = this.txContext.getStore();
    if (active) {
      await active.executeMultiple(sql);
    } else {
      await this.client.executeMultiple(sql);
    }
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    if (this.txContext.getStore()) {
      return operation();
    }
    const tx = await this.client.transaction('write');
    return this.txContext.run(tx, async () => {
      try {
        const result = await operation();
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    });
  }

  close(): void {
    this.client.close();
  }
}

export async function openDatabase(options: DatabaseOptions = {}): Promise<Database> {
  let url: string;
  if (options.url) {
    url = options.url;
  } else if (options.databasePath) {
    const absolutePath = resolve(options.databasePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    url = pathToFileURL(absolutePath).href;
  } else if (process.env.TURSO_DATABASE_URL) {
    url = process.env.TURSO_DATABASE_URL.trim();
  } else {
    const absolutePath = resolve(process.env.DATABASE_PATH ?? '.data/pran-rekha-demo.sqlite');
    mkdirSync(dirname(absolutePath), { recursive: true });
    url = pathToFileURL(absolutePath).href;
  }

  const isLocalFile = url.startsWith('file:');
  const isMemory = url === ':memory:';
  const authToken = options.authToken ?? (!isLocalFile && !isMemory ? process.env.TURSO_AUTH_TOKEN?.trim() : undefined);

  const client = createClient(authToken ? { url, authToken } : { url });
  const database = new Database(client, url);

  await database.execute('PRAGMA foreign_keys = ON;');
  if (isLocalFile) {
    await database.execute('PRAGMA journal_mode = WAL;');
    await database.execute('PRAGMA busy_timeout = 5000;');
  }

  const adjacentMigration = resolve(moduleDirectory, 'migrations/001_initial.sql');
  const sourceMigration = resolve(process.cwd(), 'src/storage/migrations/001_initial.sql');
  const repositoryMigration = resolve(process.cwd(), 'server/src/storage/migrations/001_initial.sql');
  const migrationPath = [adjacentMigration, sourceMigration, repositoryMigration].find(existsSync);
  if (!migrationPath) throw new Error('Database migration 001_initial.sql could not be found.');
  const migration = readFileSync(migrationPath, 'utf8');
  await database.exec(migration);
  return database;
}

export async function withTransaction<T>(database: Database, operation: () => Promise<T>): Promise<T> {
  return database.transaction(operation);
}

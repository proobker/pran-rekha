import type { ActorRole } from '@pran-rekha/contracts';
import type { Database } from './database.js';

type ActorRow = { id: string; username: string; display_name: string; role: ActorRole; password_salt: string; password_hash: string };

export class Repository {
  constructor(private readonly database: Database) {}

  async findActorByUsername(username: string): Promise<ActorRow | undefined> {
    return this.database.queryOne<ActorRow>(
      'SELECT id, username, display_name, role, password_salt, password_hash FROM actors WHERE username = ?',
      [username]
    );
  }

  async findActorBySessionHash(tokenHash: string, now: string): Promise<Omit<ActorRow, 'password_salt' | 'password_hash' | 'username'> | undefined> {
    return this.database.queryOne<Omit<ActorRow, 'password_salt' | 'password_hash' | 'username'>>(
      `SELECT actors.id, actors.display_name, actors.role
       FROM sessions JOIN actors ON actors.id = sessions.actor_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      [tokenHash, now]
    );
  }

  async createSession(tokenHash: string, actorId: string, createdAt: string, expiresAt: string): Promise<void> {
    await this.database.run(
      'INSERT INTO sessions (token_hash, actor_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      [tokenHash, actorId, createdAt, expiresAt]
    );
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
  }

  async patientIdsForActor(actorId: string): Promise<string[]> {
    const rows = await this.database.queryAll<{ patient_id: string }>(
      'SELECT patient_id FROM actor_patient_bindings WHERE actor_id = ? ORDER BY patient_id',
      [actorId]
    );
    return rows.map((row) => row.patient_id);
  }
}

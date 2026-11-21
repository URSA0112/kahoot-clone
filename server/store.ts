import fs from 'node:fs/promises';
import path from 'node:path';
import type { GameSessionRecord } from '../shared/types.js';

/**
 * Persistence for game sessions (participants + every QuestionAttempt).
 * Reports are always recomputed from these raw records.
 *
 *  - FileStore (default, local dev / Railway volume): one JSON file per session in DATA_DIR.
 *  - FirestoreStore (STORE=firestore, used on Cloud Run): collection "sessions", one doc per session.
 *
 * Retention: sessions older than RETENTION_DAYS (default 180) are deleted on startup.
 * No personal data is stored beyond the nickname the player typed.
 */
export interface Store {
  save(s: GameSessionRecord): Promise<void>;
  get(id: string): Promise<GameSessionRecord | null>;
  list(): Promise<GameSessionRecord[]>;
  remove(id: string): Promise<void>;
}

class FileStore implements Store {
  constructor(private dir: string) {}
  private file(id: string) {
    if (!/^[\w-]+$/.test(id)) throw new Error('bad id');
    return path.join(this.dir, `${id}.json`);
  }
  async save(s: GameSessionRecord) {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = this.file(s.id) + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(s));
    await fs.rename(tmp, this.file(s.id)); // atomic replace
  }
  async get(id: string) {
    try {
      return JSON.parse(await fs.readFile(this.file(id), 'utf8')) as GameSessionRecord;
    } catch {
      return null;
    }
  }
  async list() {
    try {
      const files = (await fs.readdir(this.dir)).filter((f) => f.endsWith('.json'));
      const all = await Promise.all(files.map((f) => this.get(f.slice(0, -5))));
      return all.filter((x): x is GameSessionRecord => !!x);
    } catch {
      return [];
    }
  }
  async remove(id: string) {
    await fs.rm(this.file(id), { force: true });
  }
}

class FirestoreStore implements Store {
  private col: import('@google-cloud/firestore').CollectionReference | null = null;
  private async c() {
    if (!this.col) {
      const { Firestore } = await import('@google-cloud/firestore');
      this.col = new Firestore({ ignoreUndefinedProperties: true }).collection('sessions');
    }
    return this.col;
  }
  async save(s: GameSessionRecord) {
    // Firestore map keys must be strings -> eligibility is already Record<number,...> (stringified keys)
    await (await this.c()).doc(s.id).set(JSON.parse(JSON.stringify(s)));
  }
  async get(id: string) {
    const d = await (await this.c()).doc(id).get();
    return d.exists ? (d.data() as GameSessionRecord) : null;
  }
  async list() {
    const q = await (await this.c()).orderBy('startedAt', 'desc').limit(200).get();
    return q.docs.map((d) => d.data() as GameSessionRecord);
  }
  async remove(id: string) {
    await (await this.c()).doc(id).delete();
  }
}

export function createStore(): Store {
  if (process.env.STORE === 'firestore') return new FirestoreStore();
  return new FileStore(process.env.DATA_DIR || path.resolve('data'));
}

export async function applyRetention(store: Store) {
  const days = Number(process.env.RETENTION_DAYS || 180);
  const cutoff = Date.now() - days * 86_400_000;
  for (const s of await store.list()) {
    if ((s.finishedAt ?? s.startedAt ?? Date.now()) < cutoff) await store.remove(s.id);
  }
}

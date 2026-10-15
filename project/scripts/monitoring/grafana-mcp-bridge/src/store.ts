import { Firestore } from '@google-cloud/firestore';

export type Document = Record<string, any>;
export type Filter = [string, '==' | '<=' | '>', unknown];
export interface Transaction {
  get<T extends Document>(path: string): Promise<T | undefined>;
  set(path: string, value: Document): void;
  delete(path: string): void;
}
export interface Store {
  count?(collection: string, filters: Filter[]): Promise<number>;
  atomic<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  get<T extends Document>(path: string): Promise<T | undefined>;
  query<T extends Document>(collection: string, filters: Filter[], limit: number, order?: string): Promise<T[]>;
}

/** Stages writes so every Firestore read precedes every write, including adapters. */
export class FirestoreStore implements Store {
  constructor(readonly db: Firestore) {}
  async atomic<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async native => {
      const writes = new Map<string, Document | undefined>();
      const result = await fn({
        get: async <D extends Document>(path: string) => {
          if (writes.has(path)) return writes.get(path) as D | undefined;
          const snap = await native.get(this.db.doc(path));
          return snap.exists ? snap.data() as D : undefined;
        },
        set: (path, value) => { writes.set(path, value); },
        delete: path => { writes.set(path, undefined); },
      });
      for (const [path, value] of writes) {
        if (value) native.set(this.db.doc(path), value);
        else native.delete(this.db.doc(path));
      }
      return result;
    });
  }
  async count(collection: string, filters: Filter[]) {
    let q: FirebaseFirestore.Query = this.db.collection(collection);
    for (const [key, op, value] of filters) q=q.where(key,op,value);
    return (await q.count().get()).data().count;
  }
  async get<T extends Document>(path: string) {
    const snap = await this.db.doc(path).get();
    return snap.exists ? snap.data() as T : undefined;
  }
  async query<T extends Document>(collection: string, filters: Filter[], limit: number, order?: string) {
    let q: FirebaseFirestore.Query = this.db.collection(collection);
    for (const [key, op, value] of filters) q = q.where(key, op, value);
    if (order) q = q.orderBy(order);
    return (await q.limit(limit).get()).docs.map(s => s.data() as T);
  }
}

/** Disposable test store; serializes transactions and copies data like Firestore. */
export class MemoryStore implements Store {
  private data = new Map<string, Document>();
  private tail = Promise.resolve();
  async atomic<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const draft = structuredClone(this.data);
    try {
      const result = await fn({
        get: async <D extends Document>(path: string) => structuredClone(draft.get(path)) as D | undefined,
        set: (path, value) => { draft.set(path, structuredClone(value)); },
        delete: path => { draft.delete(path); },
      });
      this.data = draft;
      return result;
    } finally { release(); }
  }
  async count(collection: string, filters: Filter[]) { return (await this.query(collection,filters,Number.MAX_SAFE_INTEGER)).length; }
  async get<T extends Document>(path: string) { return structuredClone(this.data.get(path)) as T | undefined; }
  async query<T extends Document>(collection: string, filters: Filter[], limit: number, order?: string) {
    const rows = [...this.data].filter(([path]) => path.startsWith(collection + '/') && path.split('/').length === 2)
      .map(([,value]) => value).filter(row => filters.every(([key,op,val]) => op === '==' ? row[key] === val : op === '<=' ? row[key] <= val! : row[key] > val!));
    if (order) rows.sort((a,b) => a[order] < b[order] ? -1 : a[order] > b[order] ? 1 : 0);
    return structuredClone(rows.slice(0, limit)) as T[];
  }
}

import { fetchWithAuthAndRetry } from './authService';

export interface DbReference {
  kind: 'doc' | 'collection';
  path: string;
  id: string;
}

export type WhereFilterOp =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'array-contains'
  | 'in'
  | 'array-contains-any';

export interface QueryConstraint {
  type: 'where' | 'orderBy' | 'limit';
  field?: string;
  op?: WhereFilterOp;
  value?: unknown;
  direction?: 'asc' | 'desc';
  limitCount?: number;
}

export interface DbQuery {
  kind: 'query';
  path: string;
  filters: Array<{ field: string; op: WhereFilterOp; value: unknown }>;
  orderBys: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limitCount?: number;
}

export interface DocumentSnapshot<T = Record<string, unknown>> {
  id: string;
  ref?: DbReference;
  exists: () => boolean;
  data: () => any;
}

export interface QueryDocumentSnapshot<T = Record<string, unknown>> {
  id: string;
  ref?: DbReference;
  data: () => any;
}

export interface QuerySnapshot<T = Record<string, unknown>> {
  docs: Array<QueryDocumentSnapshot<T>>;
  empty: boolean;
  size: number;
}

export const db = { __isAppDb: true } as const;

export function collection(_db: unknown, ...pathSegments: string[]): DbReference {
  const path = pathSegments.map((s) => String(s).replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
  const parts = path.split('/');
  return {
    kind: 'collection',
    path,
    id: parts[parts.length - 1] || '',
  };
}

export function doc(_dbOrCol: unknown, ...pathSegments: string[]): DbReference {
  const basePath =
    typeof _dbOrCol === 'object' && _dbOrCol !== null && 'path' in _dbOrCol
      ? String((_dbOrCol as { path: string }).path)
      : '';
  const joined = [basePath, ...pathSegments.map((s) => String(s).replace(/^\/+|\/+$/g, ''))]
    .filter(Boolean)
    .join('/');
  const parts = joined.split('/');
  return {
    kind: 'doc',
    path: joined,
    id: parts[parts.length - 1] || '',
  };
}

export function where(field: string, op: WhereFilterOp, value: unknown): QueryConstraint {
  return { type: 'where', field, op, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return { type: 'orderBy', field, direction };
}

export function limit(limitCount: number): QueryConstraint {
  return { type: 'limit', limitCount };
}

export function query(
  target: DbReference | DbQuery,
  ...constraints: QueryConstraint[]
): DbQuery {
  const baseFilters = target.kind === 'query' ? [...target.filters] : [];
  const baseOrderBys = target.kind === 'query' ? [...target.orderBys] : [];
  let baseLimit = target.kind === 'query' ? target.limitCount : undefined;

  for (const c of constraints) {
    if (c.type === 'where' && c.field && c.op) {
      baseFilters.push({ field: c.field, op: c.op, value: c.value });
    } else if (c.type === 'orderBy' && c.field) {
      baseOrderBys.push({ field: c.field, direction: c.direction || 'asc' });
    } else if (c.type === 'limit' && typeof c.limitCount === 'number') {
      baseLimit = c.limitCount;
    }
  }

  return {
    kind: 'query',
    path: target.path,
    filters: baseFilters,
    orderBys: baseOrderBys,
    limitCount: baseLimit,
  };
}

export function serverTimestamp(): Record<string, unknown> {
  return { __dbOp: 'serverTimestamp' };
}

export function increment(delta: number): Record<string, unknown> {
  return { __dbOp: 'increment', delta };
}

export function deleteField(): Record<string, unknown> {
  return { __dbOp: 'deleteField' };
}

function hydrateTimestamps<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map((item) => hydrateTimestamps(item)) as unknown as T;
  }
  const rec = val as Record<string, unknown>;
  if (rec.__type === 'timestamp' && typeof rec.seconds === 'number') {
    const ms = typeof rec.ms === 'number' ? rec.ms : rec.seconds * 1000;
    return {
      seconds: rec.seconds,
      nanoseconds: typeof rec.nanoseconds === 'number' ? rec.nanoseconds : 0,
      toMillis: () => ms,
      toDate: () => new Date(ms),
    } as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] = hydrateTimestamps(v);
  }
  return out as T;
}

const snapshotListeners = new Set<() => void>();

function notifySnapshotListeners(): void {
  for (const cb of snapshotListeners) {
    try {
      cb();
    } catch {
      // ignore
    }
  }
}

async function postDb<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetchWithAuthAndRetry(`/api/db/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || `Database ${endpoint} operation failed (${res.status})`);
  }
  return payload;
}

export async function getDoc<T = Record<string, unknown>>(
  ref: DbReference,
): Promise<DocumentSnapshot<T>> {
  const res = await postDb<{ exists: boolean; id: string; data: Record<string, unknown> | null }>('get', {
    path: ref.path,
  });
  const hydrated = res.exists && res.data ? hydrateTimestamps(res.data) : undefined;
  return {
    id: res.id || ref.id,
    exists: () => Boolean(res.exists && hydrated),
    data: () => hydrated as unknown as T,
  };
}

export async function getDocs<T = Record<string, unknown>>(
  target: DbReference | DbQuery,
): Promise<QuerySnapshot<T>> {
  const body =
    target.kind === 'query'
      ? {
          path: target.path,
          filters: target.filters,
          orderBys: target.orderBys,
          limit: target.limitCount,
        }
      : {
          path: target.path,
          filters: [],
          orderBys: [],
        };

  const res = await postDb<{ docs: Array<{ id: string; data: Record<string, unknown> }> }>('query', body);
  const docs: Array<QueryDocumentSnapshot<T>> = (res.docs || []).map((item) => {
    const hydrated = hydrateTimestamps(item.data);
    return {
      id: item.id,
      data: () => hydrated as unknown as T,
    };
  });
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
  };
}

export async function setDoc(
  ref: DbReference,
  data: Record<string, unknown>,
  options?: { merge?: boolean },
): Promise<void> {
  await postDb('set', {
    path: ref.path,
    data,
    merge: Boolean(options?.merge),
  });
  notifySnapshotListeners();
}

export async function updateDoc(
  ref: DbReference,
  patch: Record<string, unknown>,
): Promise<void> {
  await postDb('update', {
    path: ref.path,
    patch,
  });
  notifySnapshotListeners();
}

export async function deleteDoc(ref: DbReference): Promise<void> {
  await postDb('delete', {
    path: ref.path,
  });
  notifySnapshotListeners();
}

export interface WriteBatch {
  set: (ref: DbReference, data: Record<string, unknown>, options?: { merge?: boolean }) => WriteBatch;
  update: (ref: DbReference, patch: Record<string, unknown>) => WriteBatch;
  delete: (ref: DbReference) => WriteBatch;
  commit: () => Promise<void>;
}

export function writeBatch(_db: unknown): WriteBatch {
  const ops: Array<{
    type: 'set' | 'update' | 'delete';
    path: string;
    data?: Record<string, unknown>;
    merge?: boolean;
  }> = [];

  const batch: WriteBatch = {
    set(ref, data, options) {
      ops.push({ type: 'set', path: ref.path, data, merge: Boolean(options?.merge) });
      return batch;
    },
    update(ref, patch) {
      ops.push({ type: 'update', path: ref.path, data: patch });
      return batch;
    },
    delete(ref) {
      ops.push({ type: 'delete', path: ref.path });
      return batch;
    },
    async commit() {
      if (ops.length === 0) return;
      await postDb('batch', { ops });
      notifySnapshotListeners();
    },
  };
  return batch;
}

export function onSnapshot<T = Record<string, unknown>>(
  target: DbReference | DbQuery,
  onNext: (snapshot: QuerySnapshot<T>) => void,
  onError?: (err: Error) => void,
): () => void {
  let active = true;
  let inFlight = false;

  const poll = async () => {
    if (!active || inFlight) return;
    inFlight = true;
    try {
      const snap = await getDocs<T>(target);
      if (active) onNext(snap);
    } catch (err) {
      if (active && onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      inFlight = false;
    }
  };

  const listener = () => {
    void poll();
  };
  snapshotListeners.add(listener);
  void poll();
  const intervalId = window.setInterval(() => {
    void poll();
  }, 2500);

  return () => {
    active = false;
    snapshotListeners.delete(listener);
    window.clearInterval(intervalId);
  };
}

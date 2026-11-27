import type { ServerAuthUserPayload } from './authService';

const ADMIN_PRIMARY_EMAIL = 'enochayomide2013@gmail.com';
const ACCOUNTS_STORAGE_KEY = 'mideocode_fallback_accounts_v1';
const SESSION_STORAGE_KEY = 'mideocode_fallback_session_v1';
const DOCS_STORAGE_KEY = 'mideocode_fallback_docs_v1';
const LOCAL_TOKEN_PREFIX = 'local_';

interface BrowserStoredAccount {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  country?: string;
  photoURL?: string;
  passwordHash: string;
  role: 'member' | 'moderator' | 'admin';
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
}

interface BrowserStoredSession {
  token: string;
  uid: string;
  rememberMe: boolean;
  createdAt: number;
  expiresAt: number;
}

interface BrowserDocStoreState {
  collections: Record<string, Record<string, Record<string, unknown>>>;
}

type DbFilter = {
  field: string;
  op: string;
  value: unknown;
};

type DbOrderBy = {
  field: string;
  direction: 'asc' | 'desc';
};

type BatchOp = {
  type: 'set' | 'update' | 'delete';
  path: string;
  data?: Record<string, unknown>;
  merge?: boolean;
};

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeReadStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteStorage(key: string, value: unknown): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function randomHex(byteLength = 12): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(byteLength);
    crypto.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let out = '';
  for (let i = 0; i < byteLength * 2; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic FNV-1a mix when crypto.subtle is unavailable
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

async function hashBrowserPassword(password: string): Promise<string> {
  const salt = randomHex(12);
  const digest = await sha256Hex(`${salt}:${password}`);
  return `bsha256:${salt}:${digest}`;
}

async function verifyBrowserPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'bsha256') return false;
  const [, salt, expected] = parts;
  if (!salt || !expected) return false;
  const actual = await sha256Hex(`${salt}:${password}`);
  return actual === expected;
}

function toPublicPayload(acc: BrowserStoredAccount): ServerAuthUserPayload {
  return {
    uid: acc.uid,
    email: acc.email,
    displayName: acc.displayName,
    phoneNumber: acc.phoneNumber,
    country: acc.country,
    photoURL: acc.photoURL,
    role: acc.role,
    emailVerified: acc.emailVerified,
  };
}

function makeAuthError(message: string, code: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

export function isLocalFallbackToken(token?: string | null): boolean {
  return Boolean(token && token.startsWith(LOCAL_TOKEN_PREFIX));
}

export function shouldFallbackForHttpStatus(status: number, contentType?: string | null, hasJsonError?: boolean): boolean {
  if (status === 404 || status === 405 || status === 501 || status === 502 || status === 503 || status === 504) {
    if (status === 404 && hasJsonError && contentType?.includes('application/json')) {
      return false;
    }
    return true;
  }
  if (status >= 200 && status < 300 && contentType && contentType.includes('text/html')) {
    return true;
  }
  return false;
}

export function isValidLenientEmail(email: string): boolean {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) && trimmed.length <= 254;
}

function deriveFallbackDisplayName(fullName: string, email: string): string {
  const cleaned = fullName.trim().slice(0, 80);
  if (cleaned.length >= 1) return cleaned;
  const prefix = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'MideoCode Learner';
  return prefix.slice(0, 80);
}

function saveBrowserSession(acc: BrowserStoredAccount, rememberMe: boolean): { token: string; expiresAt: number } {
  const now = Date.now();
  const ttl = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const session: BrowserStoredSession = {
    token: `${LOCAL_TOKEN_PREFIX}${randomHex(24)}`,
    uid: acc.uid,
    rememberMe,
    createdAt: now,
    expiresAt: now + ttl,
  };
  safeWriteStorage(SESSION_STORAGE_KEY, session);
  return { token: session.token, expiresAt: session.expiresAt };
}

export async function browserRegisterAccount(input: {
  fullName: string;
  email: string;
  phoneNumber?: string;
  country?: string;
  password: string;
}): Promise<{ user: ServerAuthUserPayload; token: string }> {
  const cleanEmail = (input.email || '').trim().toLowerCase();
  if (!isValidLenientEmail(cleanEmail)) {
    throw makeAuthError('Enter a valid email address.', 'auth/invalid-email');
  }
  if (typeof input.password !== 'string' || input.password.length < 4 || input.password.length > 128) {
    throw makeAuthError('Password must be at least 4 characters.', 'auth/weak-password');
  }

  const accounts = safeReadStorage<Record<string, BrowserStoredAccount>>(ACCOUNTS_STORAGE_KEY, {});
  const existing = Object.values(accounts).find((a) => a.email.toLowerCase() === cleanEmail);
  if (existing) {
    const matches = await verifyBrowserPassword(input.password, existing.passwordHash);
    if (matches) {
      const { token } = saveBrowserSession(existing, true);
      return { user: toPublicPayload(existing), token };
    }
    throw makeAuthError('An account with this email already exists. Sign in instead.', 'auth/email-already-in-use');
  }

  const uid = `usr_${randomHex(12)}`;
  const now = Date.now();
  const account: BrowserStoredAccount = {
    uid,
    email: cleanEmail,
    displayName: deriveFallbackDisplayName(input.fullName || '', cleanEmail),
    phoneNumber: (input.phoneNumber || '').trim().slice(0, 32),
    country: input.country ? input.country.trim().slice(0, 80) : undefined,
    passwordHash: await hashBrowserPassword(input.password),
    role: cleanEmail === ADMIN_PRIMARY_EMAIL ? 'admin' : 'member',
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };
  accounts[uid] = account;
  safeWriteStorage(ACCOUNTS_STORAGE_KEY, accounts);

  const { token } = saveBrowserSession(account, true);
  return { user: toPublicPayload(account), token };
}

export async function browserLoginAccount(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
}): Promise<{ user: ServerAuthUserPayload; token: string }> {
  const cleanEmail = (input.email || '').trim().toLowerCase();
  if (!isValidLenientEmail(cleanEmail)) {
    throw makeAuthError('Enter a valid email address.', 'auth/invalid-email');
  }
  if (typeof input.password !== 'string' || !input.password) {
    throw makeAuthError('Enter your password.', 'auth/wrong-password');
  }

  const accounts = safeReadStorage<Record<string, BrowserStoredAccount>>(ACCOUNTS_STORAGE_KEY, {});
  const account = Object.values(accounts).find((a) => a.email.toLowerCase() === cleanEmail);
  if (!account) {
    throw makeAuthError('No account found for this email address. Switch to Sign Up to create one.', 'auth/user-not-found');
  }
  const matches = await verifyBrowserPassword(input.password, account.passwordHash);
  if (!matches) {
    throw makeAuthError('Incorrect password for this account. Try again or reset your password.', 'auth/wrong-password');
  }

  const { token } = saveBrowserSession(account, input.rememberMe !== false);
  return { user: toPublicPayload(account), token };
}

export function browserGetSessionUser(): { user: ServerAuthUserPayload; token: string } | null {
  const session = safeReadStorage<BrowserStoredSession | null>(SESSION_STORAGE_KEY, null);
  if (!session || !session.token || !session.uid) return null;
  if (session.expiresAt <= Date.now()) {
    browserLogoutSession();
    return null;
  }
  const accounts = safeReadStorage<Record<string, BrowserStoredAccount>>(ACCOUNTS_STORAGE_KEY, {});
  const account = accounts[session.uid];
  if (!account) {
    browserLogoutSession();
    return null;
  }
  return { user: toPublicPayload(account), token: session.token };
}

export function browserLogoutSession(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export async function browserResetPassword(input: {
  email: string;
  phoneNumber?: string;
  newPassword: string;
}): Promise<void> {
  const cleanEmail = (input.email || '').trim().toLowerCase();
  const cleanPhone = (input.phoneNumber || '').trim();
  if (!isValidLenientEmail(cleanEmail)) {
    throw makeAuthError('Enter a valid email address.', 'auth/invalid-email');
  }
  if (typeof input.newPassword !== 'string' || input.newPassword.length < 4 || input.newPassword.length > 128) {
    throw makeAuthError('Password must be at least 4 characters.', 'auth/weak-password');
  }

  const accounts = safeReadStorage<Record<string, BrowserStoredAccount>>(ACCOUNTS_STORAGE_KEY, {});
  const account = Object.values(accounts).find((a) => a.email.toLowerCase() === cleanEmail);
  if (!account) {
    throw makeAuthError('No account found with that email address.', 'auth/user-not-found');
  }
  if (account.phoneNumber.trim() && cleanPhone && account.phoneNumber.trim() !== cleanPhone) {
    throw makeAuthError('Phone number does not match the registered account.', 'auth/invalid-phone-number');
  }

  account.passwordHash = await hashBrowserPassword(input.newPassword);
  account.updatedAt = Date.now();
  safeWriteStorage(ACCOUNTS_STORAGE_KEY, accounts);
}

// ---------------------------------------------------------------------------
// Browser Fallback Document Store (mirrors localAuthAndStore.ts behavior)
// ---------------------------------------------------------------------------

function makeBrowserTimestamp(ms = Date.now()): Record<string, unknown> {
  return {
    __type: 'timestamp',
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
    ms,
  };
}

function cloneSafe<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

function getNestedValue(obj: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.split('.');
  let curr: unknown = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined || typeof curr !== 'object') return undefined;
    curr = (curr as Record<string, unknown>)[part];
  }
  return curr;
}

function setNestedValue(obj: Record<string, unknown>, fieldPath: string, value: unknown): void {
  const parts = fieldPath.split('.');
  let curr: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (FORBIDDEN_KEYS.has(key)) return;
    const next = curr[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      curr[key] = {};
    }
    curr = curr[key] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (!FORBIDDEN_KEYS.has(last)) {
    curr[last] = value;
  }
}

function deleteNestedValue(obj: Record<string, unknown>, fieldPath: string): void {
  const parts = fieldPath.split('.');
  let curr: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (FORBIDDEN_KEYS.has(key)) return;
    const next = curr[key];
    if (!next || typeof next !== 'object') return;
    curr = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (!FORBIDDEN_KEYS.has(last)) {
    delete curr[last];
  }
}

function resolvePayloadValue(val: unknown, existingVal?: unknown): unknown {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map((item) => resolvePayloadValue(item));
  const rec = val as Record<string, unknown>;
  if (rec.__dbOp === 'serverTimestamp') {
    return makeBrowserTimestamp();
  }
  if (rec.__dbOp === 'increment') {
    const prev = typeof existingVal === 'number' ? existingVal : 0;
    const delta = typeof rec.delta === 'number' ? rec.delta : 0;
    return prev + delta;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    if (v && typeof v === 'object' && (v as Record<string, unknown>).__dbOp === 'deleteField') {
      continue;
    }
    out[k] = resolvePayloadValue(v);
  }
  return out;
}

function normalizeComparable(val: unknown): number | string | boolean | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val !== null && (val as Record<string, unknown>).__type === 'timestamp') {
    const ts = val as { ms?: number; seconds?: number };
    return typeof ts.ms === 'number' ? ts.ms : (ts.seconds || 0) * 1000;
  }
  if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;
  return JSON.stringify(val);
}

function compareValues(a: unknown, b: unknown): number {
  const ca = normalizeComparable(a);
  const cb = normalizeComparable(b);
  if (ca === cb) return 0;
  if (ca === null) return -1;
  if (cb === null) return 1;
  if (typeof ca === 'number' && typeof cb === 'number') return ca - cb;
  return String(ca).localeCompare(String(cb));
}

function matchesFilter(docData: Record<string, unknown>, filter: DbFilter): boolean {
  const actual = getNestedValue(docData, filter.field);
  switch (filter.op) {
    case '==':
      return compareValues(actual, filter.value) === 0;
    case '!=':
      return compareValues(actual, filter.value) !== 0;
    case '<':
      return compareValues(actual, filter.value) < 0;
    case '<=':
      return compareValues(actual, filter.value) <= 0;
    case '>':
      return compareValues(actual, filter.value) > 0;
    case '>=':
      return compareValues(actual, filter.value) >= 0;
    case 'array-contains':
      return Array.isArray(actual) && actual.some((item) => compareValues(item, filter.value) === 0);
    case 'in':
      return Array.isArray(filter.value) && filter.value.some((v) => compareValues(actual, v) === 0);
    case 'array-contains-any':
      return (
        Array.isArray(actual) &&
        Array.isArray(filter.value) &&
        filter.value.some((v) => actual.some((item) => compareValues(item, v) === 0))
      );
    default:
      return false;
  }
}

function parseSegments(rawPath: string): string[] {
  return String(rawPath || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
}

function syncBrowserAccountFromUserDoc(docId: string, saved: Record<string, unknown>): void {
  const accounts = safeReadStorage<Record<string, BrowserStoredAccount>>(ACCOUNTS_STORAGE_KEY, {});
  const acc = accounts[docId];
  if (!acc) return;
  let changed = false;
  if (typeof saved.displayName === 'string' && saved.displayName.trim()) {
    acc.displayName = saved.displayName.trim().slice(0, 80);
    changed = true;
  }
  if (typeof saved.phoneNumber === 'string' && saved.phoneNumber.trim()) {
    acc.phoneNumber = saved.phoneNumber.trim().slice(0, 32);
    changed = true;
  } else if (!('phoneNumber' in saved) && acc.phoneNumber) {
    acc.phoneNumber = '';
    changed = true;
  }
  if (typeof saved.country === 'string' && saved.country.trim()) {
    acc.country = saved.country.trim().slice(0, 80);
    changed = true;
  } else if (!('country' in saved) && acc.country !== undefined) {
    delete acc.country;
    changed = true;
  }
  if (typeof saved.photoURL === 'string' && saved.photoURL.trim()) {
    const cleanPhoto = saved.photoURL.trim();
    acc.photoURL = cleanPhoto.startsWith('data:image/')
      ? cleanPhoto.slice(0, 60_000)
      : cleanPhoto.slice(0, 500);
    changed = true;
  } else if (!('photoURL' in saved) && acc.photoURL !== undefined) {
    delete acc.photoURL;
    changed = true;
  }
  if (changed) {
    acc.updatedAt = Date.now();
    safeWriteStorage(ACCOUNTS_STORAGE_KEY, accounts);
  }
}

export function browserDbOperation(endpoint: string, body: Record<string, unknown>): unknown {
  const store = safeReadStorage<BrowserDocStoreState>(DOCS_STORAGE_KEY, { collections: {} });

  const applySet = (docPath: string, data: Record<string, unknown>, merge = false) => {
    const segs = parseSegments(docPath);
    if (segs.length % 2 !== 0) throw new Error('Invalid document path.');
    const docId = segs[segs.length - 1];
    const colPath = segs.slice(0, -1).join('/');
    const col = (store.collections[colPath] ||= {});
    const existing = col[docId];
    if (merge && existing) {
      const next = cloneSafe(existing);
      for (const [key, val] of Object.entries(data)) {
        if (FORBIDDEN_KEYS.has(key)) continue;
        if (val && typeof val === 'object' && (val as Record<string, unknown>).__dbOp === 'deleteField') {
          deleteNestedValue(next, key);
        } else {
          setNestedValue(next, key, resolvePayloadValue(val, getNestedValue(next, key)));
        }
      }
      col[docId] = next;
    } else {
      col[docId] = resolvePayloadValue(data) as Record<string, unknown>;
    }
    if (colPath === 'users') {
      syncBrowserAccountFromUserDoc(docId, col[docId]);
    }
  };

  const applyUpdate = (docPath: string, patch: Record<string, unknown>) => {
    const segs = parseSegments(docPath);
    if (segs.length % 2 !== 0) throw new Error('Invalid document path.');
    const docId = segs[segs.length - 1];
    const colPath = segs.slice(0, -1).join('/');
    const col = (store.collections[colPath] ||= {});
    const existing = col[docId] || {};
    const next = cloneSafe(existing);
    for (const [key, val] of Object.entries(patch)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      if (val && typeof val === 'object' && (val as Record<string, unknown>).__dbOp === 'deleteField') {
        deleteNestedValue(next, key);
      } else {
        setNestedValue(next, key, resolvePayloadValue(val, getNestedValue(next, key)));
      }
    }
    col[docId] = next;
    if (colPath === 'users') {
      syncBrowserAccountFromUserDoc(docId, col[docId]);
    }
  };

  const applyDelete = (docPath: string) => {
    const segs = parseSegments(docPath);
    if (segs.length % 2 !== 0) throw new Error('Invalid document path.');
    const docId = segs[segs.length - 1];
    const colPath = segs.slice(0, -1).join('/');
    if (store.collections[colPath]) {
      delete store.collections[colPath][docId];
    }
  };

  if (endpoint === 'get') {
    const segs = parseSegments(String(body.path || ''));
    const docId = segs[segs.length - 1] || '';
    const colPath = segs.slice(0, -1).join('/');
    const existing = store.collections[colPath]?.[docId];
    return {
      exists: Boolean(existing),
      id: docId,
      data: existing ? cloneSafe(existing) : null,
    };
  }

  if (endpoint === 'query') {
    const segs = parseSegments(String(body.path || ''));
    const colPath = segs.join('/');
    const col = store.collections[colPath] || {};
    const filters = Array.isArray(body.filters) ? (body.filters as DbFilter[]) : [];
    const orderBys = Array.isArray(body.orderBys) ? (body.orderBys as DbOrderBy[]) : [];
    const limitCount = typeof body.limit === 'number' ? body.limit : undefined;

    const docs: Array<{ id: string; data: Record<string, unknown> }> = [];
    for (const [docId, docData] of Object.entries(col)) {
      if (filters.every((f) => matchesFilter(docData, f))) {
        docs.push({ id: docId, data: cloneSafe(docData) });
      }
    }
    if (orderBys.length > 0) {
      docs.sort((a, b) => {
        for (const ord of orderBys) {
          const cmp = compareValues(getNestedValue(a.data, ord.field), getNestedValue(b.data, ord.field));
          if (cmp !== 0) return ord.direction === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }
    return {
      docs: typeof limitCount === 'number' && limitCount > 0 ? docs.slice(0, limitCount) : docs,
    };
  }

  if (endpoint === 'set') {
    applySet(String(body.path || ''), (body.data as Record<string, unknown>) || {}, Boolean(body.merge));
    safeWriteStorage(DOCS_STORAGE_KEY, store);
    return { ok: true };
  }

  if (endpoint === 'update') {
    applyUpdate(String(body.path || ''), (body.patch as Record<string, unknown>) || {});
    safeWriteStorage(DOCS_STORAGE_KEY, store);
    return { ok: true };
  }

  if (endpoint === 'delete') {
    applyDelete(String(body.path || ''));
    safeWriteStorage(DOCS_STORAGE_KEY, store);
    return { ok: true };
  }

  if (endpoint === 'batch') {
    const ops = Array.isArray(body.ops) ? (body.ops as BatchOp[]) : [];
    for (const op of ops) {
      if (op.type === 'set') {
        applySet(op.path, op.data || {}, Boolean(op.merge));
      } else if (op.type === 'update') {
        applyUpdate(op.path, op.data || {});
      } else if (op.type === 'delete') {
        applyDelete(op.path);
      }
    }
    safeWriteStorage(DOCS_STORAGE_KEY, store);
    return { ok: true };
  }

  throw new Error(`Unsupported local database operation: ${endpoint}`);
}

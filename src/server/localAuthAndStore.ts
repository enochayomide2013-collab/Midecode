import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ADMIN_PRIMARY_EMAIL = 'enochayomide2013@gmail.com';

const DATA_DIR = path.resolve(process.cwd(), '.mideocode-data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'auth-accounts.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'auth-sessions.json');
const STORE_FILE = path.join(DATA_DIR, 'doc-store.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

export interface StoredAccount {
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

export interface PublicAuthUser {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  country?: string;
  photoURL?: string;
  role: 'member' | 'moderator' | 'admin';
  emailVerified: boolean;
}

interface StoredSession {
  tokenHash: string;
  uid: string;
  rememberMe: boolean;
  createdAt: number;
  expiresAt: number;
}

interface DocStoreState {
  collections: Record<string, Record<string, Record<string, unknown>>>;
}

const SESSION_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SHORT_MS = 12 * 60 * 60 * 1000;

function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

let accountsCache: Record<string, StoredAccount> = readJsonSafe<Record<string, StoredAccount>>(ACCOUNTS_FILE, {});
let sessionsCache: Record<string, StoredSession> = readJsonSafe<Record<string, StoredSession>>(SESSIONS_FILE, {});
let storeCache: DocStoreState = readJsonSafe<DocStoreState>(STORE_FILE, { collections: {} });

function saveAccounts(): void {
  atomicWriteJson(ACCOUNTS_FILE, accountsCache);
}

function saveSessions(): void {
  const now = Date.now();
  for (const [k, s] of Object.entries(sessionsCache)) {
    if (s.expiresAt <= now) delete sessionsCache[k];
  }
  atomicWriteJson(SESSIONS_FILE, sessionsCache);
}

function saveStore(): void {
  atomicWriteJson(STORE_FILE, storeCache);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function toPublicAuthUser(acc: StoredAccount): PublicAuthUser {
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

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be between 8 and 128 characters.';
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include both letters and numbers.';
  }
  return null;
}

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && email.trim().length <= 254;
}

export function createSessionForAccount(acc: StoredAccount, rememberMe: boolean): { token: string; expiresAt: number } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();
  const expiresAt = now + (rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_SHORT_MS);
  sessionsCache[tokenHash] = {
    tokenHash,
    uid: acc.uid,
    rememberMe,
    createdAt: now,
    expiresAt,
  };
  saveSessions();
  return { token: rawToken, expiresAt };
}

export function registerLocalAccount(input: {
  fullName: string;
  email: string;
  phoneNumber: string;
  country?: string;
  password: string;
}): { user: PublicAuthUser; token: string; expiresAt: number } {
  const cleanName = (input.fullName || '').trim().slice(0, 80);
  const cleanEmail = (input.email || '').trim().toLowerCase();
  const cleanPhone = (input.phoneNumber || '').trim().slice(0, 32);
  const cleanCountry = input.country ? input.country.trim().slice(0, 80) : undefined;

  if (cleanName.length < 2) {
    throw Object.assign(new Error('Please enter your full name (at least 2 characters).'), { status: 400 });
  }
  if (!isValidEmail(cleanEmail)) {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  }
  if (!cleanPhone || cleanPhone.length < 6) {
    throw Object.assign(new Error('Enter a valid phone number.'), { status: 400 });
  }
  const pwdError = validatePasswordStrength(input.password);
  if (pwdError) {
    throw Object.assign(new Error(pwdError), { status: 400 });
  }

  const existing = Object.values(accountsCache).find((a) => a.email === cleanEmail);
  if (existing) {
    throw Object.assign(new Error('An account with this email address already exists. Sign in instead.'), {
      status: 409,
      code: 'auth/email-already-in-use',
    });
  }

  const uid = `usr_${crypto.randomBytes(12).toString('hex')}`;
  const now = Date.now();
  const account: StoredAccount = {
    uid,
    email: cleanEmail,
    displayName: cleanName,
    phoneNumber: cleanPhone,
    country: cleanCountry,
    passwordHash: hashPassword(input.password),
    role: cleanEmail === ADMIN_PRIMARY_EMAIL ? 'admin' : 'member',
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };
  accountsCache[uid] = account;
  saveAccounts();

  const { token, expiresAt } = createSessionForAccount(account, true);
  return { user: toPublicAuthUser(account), token, expiresAt };
}

export function loginLocalAccount(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
}): { user: PublicAuthUser; token: string; expiresAt: number } {
  const cleanEmail = (input.email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail) || typeof input.password !== 'string' || !input.password) {
    throw Object.assign(new Error('Incorrect email or password.'), { status: 401, code: 'auth/invalid-credential' });
  }

  const account = Object.values(accountsCache).find((a) => a.email === cleanEmail);
  if (!account || !verifyPassword(input.password, account.passwordHash)) {
    throw Object.assign(new Error('Incorrect email or password.'), { status: 401, code: 'auth/invalid-credential' });
  }

  const { token, expiresAt } = createSessionForAccount(account, input.rememberMe !== false);
  return { user: toPublicAuthUser(account), token, expiresAt };
}

export function resetPasswordWithPhoneVerification(input: {
  email: string;
  phoneNumber: string;
  newPassword: string;
}): void {
  const cleanEmail = (input.email || '').trim().toLowerCase();
  const cleanPhone = (input.phoneNumber || '').trim();
  if (!isValidEmail(cleanEmail) || !cleanPhone) {
    throw Object.assign(new Error('Email and registered phone number are required.'), { status: 400 });
  }
  const pwdError = validatePasswordStrength(input.newPassword);
  if (pwdError) {
    throw Object.assign(new Error(pwdError), { status: 400 });
  }

  const account = Object.values(accountsCache).find((a) => a.email === cleanEmail);
  if (!account) {
    throw Object.assign(new Error('Account details could not be verified.'), { status: 400 });
  }

  const aBuf = Buffer.from(account.phoneNumber.trim());
  const bBuf = Buffer.from(cleanPhone);
  if (aBuf.length !== bBuf.length || !crypto.timingSafeEqual(aBuf, bBuf)) {
    throw Object.assign(new Error('Account details could not be verified.'), { status: 400 });
  }

  account.passwordHash = hashPassword(input.newPassword);
  account.updatedAt = Date.now();
  saveAccounts();

  // Revoke all previous sessions for this account
  for (const [k, s] of Object.entries(sessionsCache)) {
    if (s.uid === account.uid) delete sessionsCache[k];
  }
  saveSessions();
}

export function verifySessionToken(rawToken: string): PublicAuthUser | null {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashSessionToken(rawToken.trim());
  const session = sessionsCache[tokenHash];
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    delete sessionsCache[tokenHash];
    saveSessions();
    return null;
  }
  const account = accountsCache[session.uid];
  if (!account) return null;
  return toPublicAuthUser(account);
}

export function revokeSessionToken(rawToken: string): void {
  if (!rawToken || typeof rawToken !== 'string') return;
  const tokenHash = hashSessionToken(rawToken.trim());
  if (sessionsCache[tokenHash]) {
    delete sessionsCache[tokenHash];
    saveSessions();
  }
}

export function updateLocalAccountProfile(
  uid: string,
  patch: { displayName?: string; phoneNumber?: string | null; country?: string | null; photoURL?: string | null },
): PublicAuthUser | null {
  const account = accountsCache[uid];
  if (!account) return null;
  if (typeof patch.displayName === 'string' && patch.displayName.trim()) {
    account.displayName = patch.displayName.trim().slice(0, 80);
  }
  if (patch.phoneNumber === null) {
    account.phoneNumber = '';
    account.country = undefined;
  } else if (typeof patch.phoneNumber === 'string' && patch.phoneNumber.trim()) {
    account.phoneNumber = patch.phoneNumber.trim().slice(0, 32);
  }
  if (typeof patch.country === 'string' && patch.country.trim()) {
    account.country = patch.country.trim().slice(0, 80);
  }
  if (patch.photoURL === null) {
    account.photoURL = undefined;
  } else if (typeof patch.photoURL === 'string' && patch.photoURL.trim()) {
    account.photoURL = patch.photoURL.trim().slice(0, 500);
  }
  account.updatedAt = Date.now();
  saveAccounts();
  return toPublicAuthUser(account);
}

// ---------------------------------------------------------------------------
// Server-Side Persistent Document Store with Authorization Enforcement
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function validatePathSegments(rawPath: string): string[] {
  const cleaned = String(rawPath || '').replace(/^\/+|\/+$/g, '');
  if (!cleaned) {
    throw Object.assign(new Error('Invalid document path.'), { status: 400 });
  }
  const segments = cleaned.split('/');
  if (segments.length > 6) {
    throw Object.assign(new Error('Path depth exceeds limit.'), { status: 400 });
  }
  for (const seg of segments) {
    if (!seg || seg.length > 160 || seg === '.' || seg === '..' || FORBIDDEN_KEYS.has(seg) || !/^[a-zA-Z0-9_@.\-]+$/.test(seg)) {
      throw Object.assign(new Error('Invalid path segment.'), { status: 400 });
    }
  }
  return segments;
}

function makeServerTimestampValue(): Record<string, unknown> {
  const ms = Date.now();
  return {
    __type: 'timestamp',
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
    ms,
  };
}

function getNestedValue(obj: Record<string, unknown>, fieldPath: string): unknown {
  if (!fieldPath.includes('.')) return obj[fieldPath];
  const parts = fieldPath.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (FORBIDDEN_KEYS.has(p) || cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setNestedValue(obj: Record<string, unknown>, fieldPath: string, value: unknown): void {
  if (!fieldPath.includes('.')) {
    if (!FORBIDDEN_KEYS.has(fieldPath)) obj[fieldPath] = value;
    return;
  }
  const parts = fieldPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (FORBIDDEN_KEYS.has(key)) return;
    if (!cur[key] || typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (!FORBIDDEN_KEYS.has(leaf)) {
    cur[leaf] = value;
  }
}

function deleteNestedValue(obj: Record<string, unknown>, fieldPath: string): void {
  if (!fieldPath.includes('.')) {
    delete obj[fieldPath];
    return;
  }
  const parts = fieldPath.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur || typeof cur !== 'object') return;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  if (cur && typeof cur === 'object') {
    delete (cur as Record<string, unknown>)[parts[parts.length - 1]];
  }
}

function resolvePayloadValue(val: unknown, existingVal?: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) {
    return val.map((item) => resolvePayloadValue(item));
  }
  if (typeof val === 'object') {
    const rec = val as Record<string, unknown>;
    if (rec.__dbOp === 'serverTimestamp') {
      return makeServerTimestampValue();
    }
    if (rec.__dbOp === 'increment') {
      const base = typeof existingVal === 'number' && Number.isFinite(existingVal) ? existingVal : 0;
      const delta = typeof rec.delta === 'number' && Number.isFinite(rec.delta) ? rec.delta : 0;
      return base + delta;
    }
    if (rec.__dbOp === 'deleteField') {
      return undefined;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      const resolved = resolvePayloadValue(v, existingVal && typeof existingVal === 'object' ? (existingVal as Record<string, unknown>)[k] : undefined);
      if (resolved !== undefined) out[k] = resolved;
    }
    return out;
  }
  return val;
}

function getRawCollection(colPath: string): Record<string, Record<string, unknown>> {
  return storeCache.collections[colPath] || {};
}

export function getProjectMembershipForPairHub(
  projectId: string,
  uid: string,
): { authorized: boolean; role: 'owner' | 'editor' | 'viewer'; collaboratorIds: string[] } {
  const projects = getRawCollection('projects');
  const proj = projects[projectId];
  if (!proj) return { authorized: false, role: 'viewer', collaboratorIds: [] };
  const ownerId = typeof proj.ownerId === 'string' ? proj.ownerId : '';
  const collabIds = Array.isArray(proj.collaboratorIds)
    ? proj.collaboratorIds.filter((x): x is string => typeof x === 'string')
    : [];

  if (ownerId === uid) {
    return { authorized: true, role: 'owner', collaboratorIds: Array.from(new Set([ownerId, ...collabIds])) };
  }
  if (collabIds.includes(uid)) {
    const rolesMap = (proj.collaboratorRoles as Record<string, unknown> | undefined) || {};
    const rawRole = rolesMap[uid];
    const role = rawRole === 'editor' || rawRole === 'owner' ? rawRole : 'viewer';
    return {
      authorized: true,
      role,
      collaboratorIds: Array.from(new Set([ownerId, ...collabIds].filter(Boolean))),
    };
  }
  return { authorized: false, role: 'viewer', collaboratorIds: [] };
}

function isProjectMemberDoc(proj: Record<string, unknown> | undefined, uid: string): boolean {
  if (!proj) return false;
  if (proj.ownerId === uid) return true;
  if (Array.isArray(proj.collaboratorIds) && proj.collaboratorIds.includes(uid)) return true;
  return false;
}

function isProjectEditorDoc(proj: Record<string, unknown> | undefined, uid: string): boolean {
  if (!proj) return false;
  if (proj.ownerId === uid) return true;
  if (Array.isArray(proj.collaboratorIds) && proj.collaboratorIds.includes(uid)) {
    const roles = (proj.collaboratorRoles as Record<string, unknown> | undefined) || {};
    return roles[uid] === 'owner' || roles[uid] === 'editor';
  }
  return false;
}

interface AuthContext {
  uid: string;
  email: string;
  role: 'member' | 'moderator' | 'admin';
}

const unlockedAdminUids = new Set<string>();

export function isOwnerAdminCredentials(email?: string, password?: string): boolean {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();
  return cleanEmail === ADMIN_PRIMARY_EMAIL.toLowerCase() && cleanPass === '2013';
}

export function elevateUserToAdmin(uid: string): PublicAuthUser | null {
  if (!uid) return null;
  unlockedAdminUids.add(uid);
  const account = accountsCache[uid];
  if (account) {
    account.role = 'admin';
    account.updatedAt = Date.now();
    saveAccounts();

    if (!storeCache.collections['users']) {
      storeCache.collections['users'] = {};
    }
    const userDoc = storeCache.collections['users'][uid];
    if (userDoc) {
      userDoc.role = 'admin';
      userDoc.updatedAt = Date.now();
      saveStore();
    }
    return toPublicAuthUser(account);
  }
  return null;
}

function isAdminCtx(ctx: AuthContext): boolean {
  return (
    ctx.role === 'admin' ||
    ctx.email.toLowerCase() === ADMIN_PRIMARY_EMAIL.toLowerCase() ||
    unlockedAdminUids.has(ctx.uid)
  );
}

const USER_OWNED_COLLECTIONS = new Set([
  'courseProgress',
  'bookmarks',
  'notes',
  'notifications',
  'achievements',
  'activityEvents',
  'aiConversations',
  'challengeAttempts',
  'missionAttempts',
  'missionSubmissions',
  'missionEvaluations',
  'missionHintHistory',
  'rescueScans',
  'rescueFixes',
  'rescueInvestigations',
  'testSuites',
  'testRuns',
  'mockInterviews',
  'architecturePlans',
]);

function authorizeDocAccess(
  ctx: AuthContext,
  action: 'read' | 'write' | 'delete',
  colPath: string,
  docId: string,
  existing: Record<string, unknown> | undefined,
  incoming?: Record<string, unknown>,
): boolean {
  if (isAdminCtx(ctx)) return true;
  const parts = colPath.split('/');
  const root = parts[0];

  // users/{uid}
  if (colPath === 'users') {
    if (action === 'read') return docId === ctx.uid;
    if (action === 'write') {
      if (docId !== ctx.uid) return false;
      if (incoming && 'role' in incoming && incoming.role !== 'member' && (!existing || existing.role !== incoming.role)) {
        return false;
      }
      return true;
    }
    return false;
  }

  // publicProfiles/{uid}
  if (colPath === 'publicProfiles') {
    if (action === 'read') return true;
    return action === 'write' && docId === ctx.uid;
  }

  // userSettings/{uid}, userCareerProgress/{uid}
  if (colPath === 'userSettings' || colPath === 'userCareerProgress') {
    return docId === ctx.uid && action !== 'delete';
  }

  // projects/{projectId}
  if (colPath === 'projects') {
    if (action === 'read') {
      if (!existing) return true;
      return isProjectMemberDoc(existing, ctx.uid) || existing.visibility === 'public';
    }
    if (action === 'write') {
      if (!existing) return incoming?.ownerId === ctx.uid;
      return isProjectEditorDoc(existing, ctx.uid);
    }
    if (action === 'delete') {
      return existing?.ownerId === ctx.uid;
    }
  }

  // projects/{projectId}/{subcol}
  if (parts.length === 3 && parts[0] === 'projects') {
    const projectId = parts[1];
    const subcol = parts[2];
    const parentProj = getRawCollection('projects')[projectId];
    if (!parentProj) return false;
    const isMember = isProjectMemberDoc(parentProj, ctx.uid);
    const isEditor = isProjectEditorDoc(parentProj, ctx.uid);
    const isPublic = parentProj.visibility === 'public';

    if (action === 'read') {
      return isMember || isPublic;
    }
    if (subcol === 'files' || subcol === 'versions') {
      return isEditor;
    }
    if (subcol === 'comments' || subcol === 'activity' || subcol === 'pairMessages') {
      if (action === 'write') {
        if (!existing) return isMember;
        return parentProj.ownerId === ctx.uid || existing.authorId === ctx.uid || existing.userId === ctx.uid;
      }
      return parentProj.ownerId === ctx.uid || existing?.authorId === ctx.uid || existing?.userId === ctx.uid;
    }
    return false;
  }

  // architecturePlans/{planId}/versions
  if (parts.length === 3 && parts[0] === 'architecturePlans' && parts[2] === 'versions') {
    const parentPlan = getRawCollection('architecturePlans')[parts[1]];
    if (!parentPlan) return false;
    return parentPlan.userId === ctx.uid || parentPlan.ownerId === ctx.uid;
  }

  // projectInvitations
  if (colPath === 'projectInvitations') {
    const targetEmail = (existing?.invitedEmail || incoming?.invitedEmail || '').toString().toLowerCase();
    const isInvitee = Boolean(targetEmail && targetEmail === ctx.email) || existing?.invitedUid === ctx.uid;
    const isOwner = existing?.ownerId === ctx.uid || incoming?.ownerId === ctx.uid;
    if (action === 'read') return isOwner || isInvitee;
    if (action === 'write') return isOwner || (Boolean(existing) && isInvitee);
    if (action === 'delete') return isOwner;
  }

  // playgroundItems
  if (colPath === 'playgroundItems') {
    if (action === 'read') {
      if (!existing) return true;
      return existing.ownerId === ctx.uid || existing.userId === ctx.uid || existing.visibility === 'public' || existing.isPublic === true;
    }
    const owner = (existing?.ownerId || existing?.userId || incoming?.ownerId || incoming?.userId);
    return owner === ctx.uid;
  }

  // missions / checkpoints / templates / rewards / leaderboard
  if (colPath === 'missions' || colPath === 'missionCheckpoints' || colPath === 'missionTemplates' || colPath === 'missionRewards') {
    return action === 'read';
  }
  if (colPath === 'missionLeaderboard') {
    if (action === 'read') return true;
    return (existing?.userId || incoming?.userId) === ctx.uid;
  }

  // communityPosts & comments
  if (colPath === 'communityPosts') {
    if (action === 'read') return true;
    if (action === 'write') {
      if (!existing) return incoming?.authorId === ctx.uid;
      return true; // allows author edits or authenticated upvotes/comment counts
    }
    return existing?.authorId === ctx.uid;
  }
  if (parts.length === 3 && parts[0] === 'communityPosts' && parts[2] === 'comments') {
    if (action === 'read') return true;
    if (!existing) return incoming?.authorId === ctx.uid;
    return existing.authorId === ctx.uid;
  }

  // reports & adminAuditLogs
  if (colPath === 'reports') {
    return action === 'write' && !existing && incoming?.reporterId === ctx.uid;
  }
  if (colPath === 'adminAuditLogs') {
    return false;
  }

  // User-owned collections
  if (USER_OWNED_COLLECTIONS.has(root)) {
    const owner = existing?.userId ?? existing?.ownerId ?? incoming?.userId ?? incoming?.ownerId;
    if (!existing && action === 'read') return true;
    return owner === ctx.uid;
  }

  return false;
}

function compareValues(a: unknown, b: unknown): number {
  const norm = (v: unknown): number | string => {
    if (v && typeof v === 'object' && '__type' in (v as Record<string, unknown>) && (v as Record<string, unknown>).__type === 'timestamp') {
      return Number((v as Record<string, unknown>).ms || 0);
    }
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return String(v ?? '');
  };
  const na = norm(a);
  const nb = norm(b);
  if (typeof na === 'number' && typeof nb === 'number') return na - nb;
  return String(na).localeCompare(String(nb));
}

export interface DbFilter {
  field: string;
  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'array-contains-any';
  value: unknown;
}

export interface DbOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

function matchesFilter(docData: Record<string, unknown>, filter: DbFilter): boolean {
  const actual = getNestedValue(docData, filter.field);
  switch (filter.op) {
    case '==':
      return actual === filter.value;
    case '!=':
      return actual !== filter.value;
    case '<':
      return actual !== undefined && compareValues(actual, filter.value) < 0;
    case '<=':
      return actual !== undefined && compareValues(actual, filter.value) <= 0;
    case '>':
      return actual !== undefined && compareValues(actual, filter.value) > 0;
    case '>=':
      return actual !== undefined && compareValues(actual, filter.value) >= 0;
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(filter.value);
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(actual);
    case 'array-contains-any':
      return Array.isArray(actual) && Array.isArray(filter.value) && actual.some((item) => (filter.value as unknown[]).includes(item));
    default:
      return false;
  }
}

export function dbGetDocument(
  ctx: AuthContext,
  docPath: string,
): { exists: boolean; id: string; data: Record<string, unknown> | null } {
  const segments = validatePathSegments(docPath);
  if (segments.length % 2 !== 0) {
    throw Object.assign(new Error('Document path must have even segments.'), { status: 400 });
  }
  const docId = segments[segments.length - 1];
  const colPath = segments.slice(0, -1).join('/');
  const existing = getRawCollection(colPath)[docId];

  if (!authorizeDocAccess(ctx, 'read', colPath, docId, existing)) {
    throw Object.assign(new Error('Missing or insufficient permissions.'), { status: 403 });
  }

  return {
    exists: Boolean(existing),
    id: docId,
    data: existing ? structuredClone(existing) : null,
  };
}

export function dbQueryCollection(
  ctx: AuthContext,
  colPathRaw: string,
  filters: DbFilter[] = [],
  orderBys: DbOrderBy[] = [],
  limitCount?: number,
): Array<{ id: string; data: Record<string, unknown> }> {
  const segments = validatePathSegments(colPathRaw);
  if (segments.length % 2 !== 1) {
    throw Object.assign(new Error('Collection path must have odd segments.'), { status: 400 });
  }
  const colPath = segments.join('/');
  const col = getRawCollection(colPath);

  const docs: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const [docId, docData] of Object.entries(col)) {
    if (!authorizeDocAccess(ctx, 'read', colPath, docId, docData)) continue;
    // Non-admin status check for missions/templates/checkpoints
    if (!isAdminCtx(ctx)) {
      if (colPath === 'missions' && docData.status !== 'published') continue;
      if ((colPath === 'missionCheckpoints' || colPath === 'missionTemplates') && docData.status !== 'active') continue;
    }
    if (filters.every((f) => matchesFilter(docData, f))) {
      docs.push({ id: docId, data: structuredClone(docData) });
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

  if (typeof limitCount === 'number' && limitCount > 0) {
    return docs.slice(0, limitCount);
  }
  return docs;
}

export function dbSetDocument(
  ctx: AuthContext,
  docPath: string,
  payload: Record<string, unknown>,
  merge = false,
): void {
  const segments = validatePathSegments(docPath);
  if (segments.length % 2 !== 0) {
    throw Object.assign(new Error('Document path must have even segments.'), { status: 400 });
  }
  const docId = segments[segments.length - 1];
  const colPath = segments.slice(0, -1).join('/');
  const col = (storeCache.collections[colPath] ||= {});
  const existing = col[docId];

  if (!authorizeDocAccess(ctx, 'write', colPath, docId, existing, payload)) {
    throw Object.assign(new Error('Missing or insufficient permissions.'), { status: 403 });
  }

  if (merge && existing) {
    const next = structuredClone(existing);
    for (const [key, val] of Object.entries(payload)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      if (val && typeof val === 'object' && (val as Record<string, unknown>).__dbOp === 'deleteField') {
        deleteNestedValue(next, key);
      } else {
        const resolved = resolvePayloadValue(val, getNestedValue(next, key));
        setNestedValue(next, key, resolved);
      }
    }
    col[docId] = next;
  } else {
    const resolved = resolvePayloadValue(payload) as Record<string, unknown>;
    col[docId] = resolved;
  }

  // Keep local auth account display/phone/photo synced when users/{uid} updates
  if (colPath === 'users' && docId === ctx.uid) {
    const saved = col[docId];
    updateLocalAccountProfile(ctx.uid, {
      displayName: typeof saved.displayName === 'string' ? saved.displayName : undefined,
      phoneNumber: typeof saved.phoneNumber === 'string' ? saved.phoneNumber : saved.phoneNumber === undefined ? null : undefined,
      country: typeof saved.country === 'string' ? saved.country : undefined,
      photoURL: typeof saved.photoURL === 'string' ? saved.photoURL : saved.photoURL === undefined ? null : undefined,
    });
  }

  saveStore();
}

export function dbUpdateDocument(
  ctx: AuthContext,
  docPath: string,
  patch: Record<string, unknown>,
): void {
  const segments = validatePathSegments(docPath);
  if (segments.length % 2 !== 0) {
    throw Object.assign(new Error('Document path must have even segments.'), { status: 400 });
  }
  const docId = segments[segments.length - 1];
  const colPath = segments.slice(0, -1).join('/');
  const col = storeCache.collections[colPath];
  const existing = col?.[docId];
  if (!existing) {
    throw Object.assign(new Error('No document to update.'), { status: 404 });
  }
  if (!authorizeDocAccess(ctx, 'write', colPath, docId, existing, patch)) {
    throw Object.assign(new Error('Missing or insufficient permissions.'), { status: 403 });
  }

  const next = structuredClone(existing);
  for (const [key, val] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (val && typeof val === 'object' && (val as Record<string, unknown>).__dbOp === 'deleteField') {
      deleteNestedValue(next, key);
    } else {
      const resolved = resolvePayloadValue(val, getNestedValue(next, key));
      setNestedValue(next, key, resolved);
    }
  }
  col[docId] = next;

  if (colPath === 'users' && docId === ctx.uid) {
    updateLocalAccountProfile(ctx.uid, {
      displayName: typeof next.displayName === 'string' ? next.displayName : undefined,
      phoneNumber: typeof next.phoneNumber === 'string' ? next.phoneNumber : next.phoneNumber === undefined ? null : undefined,
      country: typeof next.country === 'string' ? next.country : undefined,
      photoURL: typeof next.photoURL === 'string' ? next.photoURL : next.photoURL === undefined ? null : undefined,
    });
  }

  saveStore();
}

export function dbDeleteDocument(ctx: AuthContext, docPath: string): void {
  const segments = validatePathSegments(docPath);
  if (segments.length % 2 !== 0) {
    throw Object.assign(new Error('Document path must have even segments.'), { status: 400 });
  }
  const docId = segments[segments.length - 1];
  const colPath = segments.slice(0, -1).join('/');
  const col = storeCache.collections[colPath];
  const existing = col?.[docId];
  if (!existing) return;

  if (!authorizeDocAccess(ctx, 'delete', colPath, docId, existing)) {
    throw Object.assign(new Error('Missing or insufficient permissions.'), { status: 403 });
  }

  delete col[docId];
  saveStore();
}

export interface BatchOp {
  type: 'set' | 'update' | 'delete';
  path: string;
  data?: Record<string, unknown>;
  merge?: boolean;
}

export function dbCommitBatch(ctx: AuthContext, ops: BatchOp[]): void {
  if (!Array.isArray(ops) || ops.length > 500) {
    throw Object.assign(new Error('Batch must contain at most 500 operations.'), { status: 400 });
  }
  // Apply against a cloned store snapshot so failure rolls back atomically
  const snapshot = structuredClone(storeCache);
  try {
    for (const op of ops) {
      if (op.type === 'set') {
        dbSetDocument(ctx, op.path, op.data || {}, Boolean(op.merge));
      } else if (op.type === 'update') {
        dbUpdateDocument(ctx, op.path, op.data || {});
      } else if (op.type === 'delete') {
        dbDeleteDocument(ctx, op.path);
      }
    }
  } catch (err) {
    storeCache = snapshot;
    saveStore();
    throw err;
  }
}

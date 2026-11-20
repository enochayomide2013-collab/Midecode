import crypto from 'node:crypto';
import type { DiffLineEntry, FileDiffSummary, ProjectVersionSnapshot } from '../types/mideocode.ts';

function getInviteSecret(): string {
  return process.env.INVITE_HMAC_SECRET || process.env.GEMINI_API_KEY || 'mideocode-collab-hmac-v1';
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function buildDeterministicInviteId(projectId: string, inviteeEmail: string): string {
  const emailSlug = normalizeInviteEmail(inviteeEmail).replace(/[^a-z0-9]/g, '_');
  return `${projectId}_${emailSlug}`.slice(0, 128);
}

export function signInvitationPayload(input: {
  projectId: string;
  inviteeEmail: string;
  role: 'editor' | 'viewer';
  expiresAt: string;
}): string {
  const msg = `${input.projectId}|${normalizeInviteEmail(input.inviteeEmail)}|${input.role}|${input.expiresAt}`;
  return crypto.createHmac('sha256', getInviteSecret()).update(msg).digest('hex').slice(0, 32);
}

export function verifyInvitationPayload(input: {
  projectId: string;
  inviteeEmail: string;
  role: 'editor' | 'viewer';
  expiresAt: string;
  inviteSignature: string;
}): { valid: boolean; expired: boolean; reason?: string } {
  const expMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(expMs) || Date.now() > expMs) {
    return { valid: false, expired: true, reason: 'This invitation has expired.' };
  }
  const expected = signInvitationPayload({
    projectId: input.projectId,
    inviteeEmail: input.inviteeEmail,
    role: input.role,
    expiresAt: input.expiresAt,
  });
  const ok =
    expected.length === input.inviteSignature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.inviteSignature));
  if (!ok) {
    return { valid: false, expired: false, reason: 'Invitation signature verification failed.' };
  }
  return { valid: true, expired: false };
}

export function computeLineDiff(oldText: string, newText: string): {
  additions: number;
  deletions: number;
  lines: DiffLineEntry[];
} {
  const a = oldText === '' ? [] : oldText.split('\n');
  const b = newText === '' ? [] : newText.split('\n');

  // Guard LCS DP size for very large files
  if (a.length * b.length > 250_000) {
    const lines: DiffLineEntry[] = [];
    const maxLen = Math.max(a.length, b.length);
    let additions = 0;
    let deletions = 0;
    for (let i = 0; i < maxLen; i++) {
      if (i < a.length && i < b.length && a[i] === b[i]) {
        lines.push({ type: 'unchanged', oldLine: i + 1, newLine: i + 1, text: a[i] });
      } else {
        if (i < a.length) {
          lines.push({ type: 'removed', oldLine: i + 1, text: a[i] });
          deletions += 1;
        }
        if (i < b.length) {
          lines.push({ type: 'added', newLine: i + 1, text: b[i] });
          additions += 1;
        }
      }
    }
    return { additions, deletions, lines };
  }

  const m = a.length;
  const n = b.length;
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  const lines: DiffLineEntry[] = [];
  let i = 0;
  let j = 0;
  let additions = 0;
  let deletions = 0;

  while (i < m && j < n) {
    if (a[i] === b[j]) {
      lines.push({ type: 'unchanged', oldLine: i + 1, newLine: j + 1, text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'removed', oldLine: i + 1, text: a[i] });
      deletions += 1;
      i += 1;
    } else {
      lines.push({ type: 'added', newLine: j + 1, text: b[j] });
      additions += 1;
      j += 1;
    }
  }

  while (i < m) {
    lines.push({ type: 'removed', oldLine: i + 1, text: a[i] });
    deletions += 1;
    i += 1;
  }
  while (j < n) {
    lines.push({ type: 'added', newLine: j + 1, text: b[j] });
    additions += 1;
    j += 1;
  }

  return { additions, deletions, lines };
}

export function computeSnapshotDiff(
  baseSnapshot: ProjectVersionSnapshot[],
  targetSnapshot: ProjectVersionSnapshot[],
): {
  files: FileDiffSummary[];
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
} {
  const getPath = (f: ProjectVersionSnapshot) => (f.folder ? `${f.folder}/${f.name}` : f.name);
  const baseMap = new Map(baseSnapshot.map((f) => [getPath(f), f]));
  const targetMap = new Map(targetSnapshot.map((f) => [getPath(f), f]));

  const allPaths = Array.from(new Set([...baseMap.keys(), ...targetMap.keys()])).sort();
  const files: FileDiffSummary[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;

  for (const p of allPaths) {
    const oldFile = baseMap.get(p);
    const newFile = targetMap.get(p);
    if (!oldFile && newFile) {
      const diff = computeLineDiff('', newFile.content || '');
      files.push({ path: p, status: 'added', ...diff });
      addedCount += 1;
    } else if (oldFile && !newFile) {
      const diff = computeLineDiff(oldFile.content || '', '');
      files.push({ path: p, status: 'removed', ...diff });
      removedCount += 1;
    } else if (oldFile && newFile) {
      if ((oldFile.content || '') === (newFile.content || '')) {
        files.push({
          path: p,
          status: 'unchanged',
          additions: 0,
          deletions: 0,
          lines: (oldFile.content || '').split('\n').map((text, idx) => ({
            type: 'unchanged',
            oldLine: idx + 1,
            newLine: idx + 1,
            text,
          })),
        });
        unchangedCount += 1;
      } else {
        const diff = computeLineDiff(oldFile.content || '', newFile.content || '');
        files.push({ path: p, status: 'modified', ...diff });
        modifiedCount += 1;
      }
    }
  }

  return { files, addedCount, removedCount, modifiedCount, unchangedCount };
}

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { fetchWithAuthAndRetry } from './authService';
import { recordDeveloperActivity, sanitizeForFirestore } from './dataService';
import type {
  ProjectFile,
  RescueAppliedFixRecord,
  RescueChatMessage,
  RescueFixProposal,
  RescueInternalTab,
  RescueIssue,
  RescueProjectIndex,
  RescueRootCauseAnalysis,
  RescueScanMode,
  RescueScanReport,
  RescueVerificationResult,
  TestSuite,
} from '../types/mideocode';

export const COMMUNITY_VIDEO_MIN_BYTES = 1_000_000; // 1 MB
export const COMMUNITY_VIDEO_MAX_BYTES = 80 * 1024 * 1024; // 80 MB
export const COMMUNITY_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UploadedCommunityMediaResult {
  url: string;
  filename: string;
  name: string;
  kind: 'image' | 'video';
  mimeType: string;
  sizeBytes: number;
}

function serializeProjectFiles(files: ProjectFile[]) {
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    folder: f.folder || '',
    language: f.language,
    content: f.content,
  }));
}

function toTimestampMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'object' && val !== null && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = new Date(val).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Project Rescue AI Server Engine Calls
// ---------------------------------------------------------------------------
export async function scanProjectViaApi(input: {
  projectId: string;
  projectTitle: string;
  scanMode: RescueScanMode;
  files: ProjectFile[];
}): Promise<RescueScanReport> {
  const res = await fetchWithAuthAndRetry('/api/rescue/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      scanMode: input.scanMode,
      files: serializeProjectFiles(input.files),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Project Rescue scan failed.');
  }
  return data as RescueScanReport;
}

export async function investigateIssueViaApi(input: {
  projectTitle: string;
  files: ProjectFile[];
  issue?: RescueIssue | null;
  userProblemDescription?: string;
}): Promise<RescueRootCauseAnalysis> {
  const res = await fetchWithAuthAndRetry('/api/rescue/investigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectTitle: input.projectTitle,
      files: serializeProjectFiles(input.files),
      issue: input.issue || null,
      userProblemDescription: input.userProblemDescription?.trim() || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Root cause investigation failed.');
  }
  return data as RescueRootCauseAnalysis;
}

export async function proposeFixViaApi(input: {
  projectTitle: string;
  files: ProjectFile[];
  targetFilePath: string;
  problemDescription: string;
  rootCause?: RescueRootCauseAnalysis | null;
  issueId?: string;
}): Promise<RescueFixProposal> {
  const res = await fetchWithAuthAndRetry('/api/rescue/propose-fix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectTitle: input.projectTitle,
      files: serializeProjectFiles(input.files),
      targetFilePath: input.targetFilePath,
      problemDescription: input.problemDescription,
      rootCause: input.rootCause || null,
      issueId: input.issueId,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Unable to generate automatic fix proposal.');
  }
  return data as RescueFixProposal;
}

export async function verifyRescueFixViaApi(input: {
  projectId: string;
  projectTitle: string;
  files: ProjectFile[];
  previousIssueIds?: string[];
  targetFilePath: string;
  testSuite?: TestSuite | null;
}): Promise<RescueVerificationResult> {
  const res = await fetchWithAuthAndRetry('/api/rescue/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      files: serializeProjectFiles(input.files),
      previousIssueIds: input.previousIssueIds || [],
      targetFilePath: input.targetFilePath,
      testSuite: input.testSuite || null,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Post-fix verification failed.');
  }
  return data as RescueVerificationResult;
}

export async function sendRescueChatViaApi(input: {
  projectTitle: string;
  files: ProjectFile[];
  message: string;
  history: RescueChatMessage[];
  latestIssues?: RescueIssue[];
}): Promise<{ reply: string; citedFiles: string[]; suggestedTab?: RescueInternalTab }> {
  const res = await fetchWithAuthAndRetry('/api/rescue/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectTitle: input.projectTitle,
      files: serializeProjectFiles(input.files),
      message: input.message,
      history: input.history.slice(-16),
      latestIssues: (input.latestIssues || []).slice(0, 20),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Rescue Chat assistant could not respond.');
  }
  return data as { reply: string; citedFiles: string[]; suggestedTab?: RescueInternalTab };
}

// ---------------------------------------------------------------------------
// Firestore Persistence for Scan Reports & Applied Fix Audit History
// ---------------------------------------------------------------------------
function encodeProjectIndexForFirestore(index: RescueProjectIndex): Record<string, unknown> {
  // Firestore rejects nested arrays (string[][]); encode cycles cleanly as { cycle: string[] }[]
  return sanitizeForFirestore({
    totalFiles: index.totalFiles,
    inspectedFiles: index.inspectedFiles,
    skippedFiles: (index.skippedFiles || []).slice(0, 25),
    languages: index.languages || {},
    frameworksDetected: (index.frameworksDetected || []).slice(0, 15),
    packageDependencies: (index.packageDependencies || []).slice(0, 50),
    entryPoints: (index.entryPoints || []).slice(0, 12),
    files: (index.files || []).slice(0, 40).map((f) => ({
      fileId: f.fileId || '',
      path: f.path,
      language: f.language,
      linesCount: f.linesCount,
      bytes: f.bytes,
      imports: (f.imports || []).slice(0, 20),
      importedBy: (f.importedBy || []).slice(0, 20),
      exports: (f.exports || []).slice(0, 20),
      apiCalls: (f.apiCalls || []).slice(0, 15),
      apiRoutes: (f.apiRoutes || []).slice(0, 15),
    })),
    circularDependencies: (index.circularDependencies || []).slice(0, 10).map((cycle) => ({
      cycle: Array.isArray(cycle) ? cycle.slice(0, 12) : [],
    })),
    unreferencedFiles: (index.unreferencedFiles || []).slice(0, 30),
    apiRouteConnections: (index.apiRouteConnections || []).slice(0, 30),
  });
}

function decodeScanReportFromFirestore(raw: Record<string, unknown>): RescueScanReport {
  const rawIdx = (raw.projectIndex as Record<string, unknown>) || {};
  const rawCycles = Array.isArray(rawIdx.circularDependencies) ? rawIdx.circularDependencies : [];
  const normalizedCycles: string[][] = rawCycles.map((entry) => {
    if (Array.isArray(entry)) return entry.map(String);
    if (entry && typeof entry === 'object' && Array.isArray((entry as { cycle?: unknown }).cycle)) {
      return ((entry as { cycle: unknown[] }).cycle).map(String);
    }
    return [];
  });

  return {
    ...(raw as unknown as RescueScanReport),
    projectIndex: {
      ...(rawIdx as unknown as RescueProjectIndex),
      circularDependencies: normalizedCycles,
    },
  };
}

export async function saveRescueScanReport(
  uid: string,
  report: RescueScanReport,
): Promise<RescueScanReport> {
  const scanId = String(report.id || `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  const projectId = String(report.projectId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);

  const payload = sanitizeForFirestore<Record<string, unknown>>({
    id: scanId,
    userId: uid,
    projectId,
    projectTitle: String(report.projectTitle || 'Workspace').trim().slice(0, 140) || 'Workspace',
    scanMode: report.scanMode,
    healthScore: Math.max(0, Math.min(100, Math.round(Number(report.healthScore) || 0))),
    filesInspected: Math.max(0, Math.min(500, Math.round(Number(report.filesInspected) || 0))),
    confirmedCount: Math.max(0, Math.min(500, Math.round(Number(report.confirmedCount) || 0))),
    potentialCount: Math.max(0, Math.min(500, Math.round(Number(report.potentialCount) || 0))),
    severityCounts: {
      critical: report.severityCounts?.critical || 0,
      high: report.severityCounts?.high || 0,
      medium: report.severityCounts?.medium || 0,
      low: report.severityCounts?.low || 0,
      suggestion: report.severityCounts?.suggestion || 0,
    },
    summary: String(report.summary || 'Project health scan completed.').trim().slice(0, 4000) || 'Scan completed.',
    recommendedRepairOrder: (report.recommendedRepairOrder || []).map((s) => String(s).slice(0, 300)).slice(0, 30),
    suggestedImprovements: (report.suggestedImprovements || []).map((s) => String(s).slice(0, 300)).slice(0, 30),
    projectIndex: encodeProjectIndexForFirestore(report.projectIndex),
    issues: (report.issues || []).slice(0, 50),
    runtimeAudit: (report.runtimeAudit || []).slice(0, 15),
    createdAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(db, 'rescueScans', scanId), payload);
    await recordDeveloperActivity(uid, {
      category: 'ide',
      action: `Project Rescue ${report.scanMode} scan (${report.healthScore}/100 health)`,
      aiAssisted: report.scanMode !== 'quick',
      scorePct: report.healthScore,
      projectId,
    });
    const saved = await getDoc(doc(db, 'rescueScans', scanId));
    return decodeScanReportFromFirestore(saved.data() as Record<string, unknown>);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `rescueScans/${scanId}`);
  }
}

export async function listUserRescueScans(uid: string): Promise<RescueScanReport[]> {
  try {
    const q = query(collection(db, 'rescueScans'), where('userId', '==', uid), limit(30));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => decodeScanReportFromFirestore(d.data() as Record<string, unknown>))
      .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'rescueScans');
  }
}

export async function deleteRescueScanReport(scanId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rescueScans', scanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `rescueScans/${scanId}`);
  }
}

export async function recordRescueFixRecord(
  uid: string,
  input: Omit<RescueAppliedFixRecord, 'id' | 'userId' | 'createdAt'>,
): Promise<RescueAppliedFixRecord> {
  const fixId = `rfix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const payload = sanitizeForFirestore<Record<string, unknown>>({
    id: fixId,
    userId: uid,
    projectId: input.projectId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120),
    projectTitle: input.projectTitle.trim().slice(0, 140) || 'Workspace',
    filePath: input.filePath.trim().slice(0, 240) || 'index.js',
    problemIdentified: input.problemIdentified.trim().slice(0, 500) || 'Applied rescue fix',
    snapshotVersionId: input.snapshotVersionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120),
    snapshotVersionNumber: Math.max(1, Math.min(10000, Math.round(input.snapshotVersionNumber))),
    verificationPassed: Boolean(input.verificationPassed),
    verificationSummary: input.verificationSummary.trim().slice(0, 1000) || 'Verified',
    status: 'applied',
    createdAt: serverTimestamp(),
  });
  try {
    await setDoc(doc(db, 'rescueFixes', fixId), payload);
    const snap = await getDoc(doc(db, 'rescueFixes', fixId));
    return snap.data() as RescueAppliedFixRecord;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `rescueFixes/${fixId}`);
  }
}

export async function listRescueFixRecords(uid: string): Promise<RescueAppliedFixRecord[]> {
  try {
    const q = query(collection(db, 'rescueFixes'), where('userId', '==', uid), limit(30));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as RescueAppliedFixRecord)
      .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'rescueFixes');
  }
}

export async function markRescueFixRolledBack(fixId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'rescueFixes', fixId), { status: 'rolled_back' });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `rescueFixes/${fixId}`);
  }
}

// ---------------------------------------------------------------------------
// Admin Community Media Chunked Uploader (Images <= 10 MB, Video 1 MB - 80 MB)
// ---------------------------------------------------------------------------
export function formatMediaBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

export async function uploadAdminCommunityMediaChunked(
  file: File,
  kind: 'image' | 'video',
  onProgress?: (pct: number) => void,
): Promise<UploadedCommunityMediaResult> {
  if (kind === 'video') {
    if (file.size < COMMUNITY_VIDEO_MIN_BYTES) {
      throw new Error(
        `Video is too small (${formatMediaBytes(file.size)}). Minimum required size is 1 MB.`,
      );
    }
    if (file.size > COMMUNITY_VIDEO_MAX_BYTES) {
      throw new Error(
        `Video exceeds the 80 MB maximum limit (${formatMediaBytes(file.size)}).`,
      );
    }
  } else {
    if (file.size <= 0 || file.size > COMMUNITY_IMAGE_MAX_BYTES) {
      throw new Error(`Image size must be between 1 byte and 10 MB.`);
    }
  }

  onProgress?.(2);

  const initRes = await fetchWithAuthAndRetry('/api/admin/community-media/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      totalSize: file.size,
      kind,
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok) {
    throw new Error(initData.error || 'Could not start media upload.');
  }

  const uploadId = initData.uploadId as string;
  const chunkSize = Number(initData.maxChunkBytes) || 4 * 1024 * 1024;
  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(file.size, offset + chunkSize);
    const slice = file.slice(offset, end);
    const chunkRes = await fetchWithAuthAndRetry(
      `/api/admin/community-media/chunk/${encodeURIComponent(uploadId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: slice,
      },
    );
    const chunkData = await chunkRes.json().catch(() => ({}));
    if (!chunkRes.ok) {
      throw new Error(chunkData.error || 'Chunk upload failed.');
    }
    offset = end;
    onProgress?.(Math.min(95, Math.round((offset / file.size) * 92) + 3));
  }

  const completeRes = await fetchWithAuthAndRetry(
    `/api/admin/community-media/complete/${encodeURIComponent(uploadId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  const completeData = await completeRes.json();
  if (!completeRes.ok) {
    throw new Error(completeData.error || 'Media verification failed.');
  }

  onProgress?.(100);
  return completeData as UploadedCommunityMediaResult;
}

export async function deleteAdminCommunityMedia(filename: string): Promise<void> {
  const res = await fetchWithAuthAndRetry(
    `/api/admin/community-media/${encodeURIComponent(filename)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete uploaded media.');
  }
}

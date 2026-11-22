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
} from './appDb';
import { db, handleFirestoreError, OperationType } from './firebase';
import { fetchWithAuthAndRetry } from './authService';
import {
  recordDeveloperActivity,
  sanitizeForFirestore,
  truncateToUtf8Bytes,
  utf8ByteLength,
} from './dataService';
import type {
  ProjectFile,
  RescueAdminTelemetry,
  RescueAppliedFixRecord,
  RescueChatMessage,
  RescueCustomScanConfig,
  RescueDismissedIssue,
  RescueFixProposal,
  RescueImpactReport,
  RescueImportSummary,
  RescueInternalTab,
  RescueInvestigationRecord,
  RescueIssue,
  RescueProjectIndex,
  RescueRootCauseAnalysis,
  RescueScanJob,
  RescueScanMode,
  RescueScanReport,
  RescueVerificationResult,
  RescueZipRootCandidate,
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
// File & Folder Import Normalizer / Validator (shared by pickers & drag-drop)
// ---------------------------------------------------------------------------
export const RESCUE_IMPORT_ACCEPT =
  '.js,.jsx,.mjs,.cjs,.ts,.tsx,.mts,.cts,.py,.pyw,.php,.java,.cpp,.cc,.cxx,.hpp,.c,.h,.cs,.go,.rs,.html,.htm,.css,.scss,.sass,.less,.sql,.json,.jsonc,.md,.mdx,.rst,.adoc,.yml,.yaml,.toml,.xml,.txt,.sh,.vue,.svelte,.astro,.prisma,.graphql,.gql,.env.example';

const IGNORED_IMPORT_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  'coverage',
  '.turbo',
  '.idea',
  '.vscode',
]);

const SUPPORTED_IMPORT_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs',
  'ts', 'tsx', 'mts', 'cts',
  'py', 'pyw',
  'php', 'java', 'cpp', 'cc', 'cxx', 'hpp', 'c', 'h', 'cs', 'go', 'rs',
  'html', 'htm',
  'css', 'scss', 'sass', 'less',
  'sql',
  'json', 'jsonc',
  'md', 'mdx', 'rst', 'adoc',
  'yml', 'yaml',
  'toml', 'xml', 'txt', 'sh', 'bash',
  'vue', 'svelte', 'astro', 'prisma', 'graphql', 'gql',
]);

const SPECIAL_TEXT_FILENAMES = new Set([
  'dockerfile',
  'makefile',
  'procfile',
  '.gitignore',
  '.gitattributes',
  '.prettierrc',
  '.eslintrc',
  '.babelrc',
  '.editorconfig',
  '.env.example',
  '.env.sample',
  '.env.template',
]);

export function normalizeImportedRelativePath(rawPath: string): string {
  return (rawPath || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

export function isIgnoredImportPath(relativePath: string): boolean {
  const norm = normalizeImportedRelativePath(relativePath).toLowerCase();
  if (!norm) return true;
  const parts = norm.split('/');
  if (parts.some((seg) => IGNORED_IMPORT_SEGMENTS.has(seg))) return true;
  const base = parts[parts.length - 1];
  if (base === '.ds_store' || base === 'thumbs.db' || base === 'package-lock.json' || base === 'yarn.lock' || base === 'bun.lock' || base === 'pnpm-lock.yaml') {
    return true;
  }
  // Never import local .env secrets (.env, .env.local, .env.production, etc.), while allowing .env.example/sample/template
  if (/^\.env(\.|$)/i.test(base) && !/^\.env\.(example|sample|template)$/i.test(base)) {
    return true;
  }
  return false;
}

export function isSupportedCodeFilename(filename: string): boolean {
  const lower = filename.trim().toLowerCase();
  if (!lower) return false;
  if (SPECIAL_TEXT_FILENAMES.has(lower)) return true;
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === lower.length - 1) return false;
  const ext = lower.slice(dotIdx + 1);
  return SUPPORTED_IMPORT_EXTENSIONS.has(ext);
}

export function detectImportLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
    return 'typescript';
  }
  if (lower.endsWith('.jsx')) return 'jsx';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.py') || lower.endsWith('.pyw')) return 'python';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.cxx') || lower.endsWith('.hpp')) return 'cpp';
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c';
  if (lower.endsWith('.cs')) return 'csharp';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.sass') || lower.endsWith('.less')) {
    return 'css';
  }
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return 'json';
  if (lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.rst') || lower.endsWith('.adoc')) return 'markdown';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.toml')) return 'toml';
  if (lower.endsWith('.xml')) return 'xml';
  return 'text';
}

export interface ImportedFileInput {
  relativePath: string;
  sizeBytes?: number;
  text: string;
}

export interface NormalizedImportedFile {
  name: string;
  folder: string;
  language: string;
  content: string;
}

export function prepareImportedProjectFiles(entries: ImportedFileInput[]): {
  files: NormalizedImportedFile[];
  skippedCount: number;
  inferredProjectTitle: string;
  totalBytes: number;
} {
  const MAX_FILES = 60;
  const MAX_FILE_BYTES = 145_000;
  const MAX_TOTAL_BYTES = 4_200_000;

  // Detect whether all entries share one outer root directory (typical when selecting a folder)
  const normalizedEntries = entries
    .map((entry) => ({
      ...entry,
      normPath: normalizeImportedRelativePath(entry.relativePath),
    }))
    .filter((e) => Boolean(e.normPath));

  const firstSegments = normalizedEntries
    .map((e) => (e.normPath.includes('/') ? e.normPath.split('/')[0] : ''))
    .filter(Boolean);
  const sharedRootFolder =
    normalizedEntries.length > 0 &&
    firstSegments.length === normalizedEntries.length &&
    new Set(firstSegments).size === 1
      ? firstSegments[0]
      : '';

  const dedupedByPath = new Map<string, NormalizedImportedFile>();
  let skippedCount = 0;
  let totalBytes = 0;

  for (const entry of normalizedEntries) {
    if (isIgnoredImportPath(entry.normPath)) {
      skippedCount++;
      continue;
    }
    const parts = entry.normPath.split('/');
    const baseName = parts[parts.length - 1];
    if (!isSupportedCodeFilename(baseName)) {
      skippedCount++;
      continue;
    }
    if ((entry.sizeBytes ?? entry.text.length) > 250_000 || entry.text.includes('\u0000')) {
      skippedCount++;
      continue;
    }

    const folderParts = sharedRootFolder
      ? parts.slice(1, -1)
      : parts.slice(0, -1);

    const safeName = truncateToUtf8Bytes(baseName, 120);
    const rawFolder = folderParts.join('/');
    const safeFolder = truncateToUtf8Bytes(rawFolder, 120);
    const safeContent = truncateToUtf8Bytes(entry.text, MAX_FILE_BYTES);
    const contentBytes = utf8ByteLength(safeContent);

    if (dedupedByPath.size >= MAX_FILES || totalBytes + contentBytes > MAX_TOTAL_BYTES) {
      skippedCount++;
      continue;
    }

    const canonicalKey = safeFolder ? `${safeFolder}/${safeName}` : safeName;
    if (!dedupedByPath.has(canonicalKey)) {
      totalBytes += contentBytes;
      dedupedByPath.set(canonicalKey, {
        name: safeName,
        folder: safeFolder,
        language: detectImportLanguage(safeName),
        content: safeContent,
      });
    }
  }

  return {
    files: Array.from(dedupedByPath.values()),
    skippedCount,
    inferredProjectTitle: sharedRootFolder || 'Imported Rescue Project',
    totalBytes,
  };
}

export async function computeClientWorkspaceFingerprint(
  files: Array<{ folder?: string; name: string; content: string }>,
): Promise<string> {
  const canonical = [...files]
    .map((f) => ({
      path: f.folder ? `${f.folder}/${f.name}` : f.name,
      content: f.content || '',
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.path}\n${f.content.length}\n${f.content}`)
    .join('\n---\n');

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(canonical);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  }
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv_${(hash >>> 0).toString(16)}`;
}

export function computeProjectRefreshDiff(
  prevFiles: Array<{ folder?: string; name: string; content: string }>,
  nextFiles: Array<{ folder?: string; name: string; content: string }>,
): {
  added: string[];
  modified: string[];
  removed: string[];
  unchanged: number;
} {
  const toMap = (list: Array<{ folder?: string; name: string; content: string }>) => {
    const m = new Map<string, string>();
    for (const f of list) {
      const p = f.folder ? `${f.folder}/${f.name}` : f.name;
      m.set(p, f.content || '');
    }
    return m;
  };
  const prevMap = toMap(prevFiles);
  const nextMap = toMap(nextFiles);
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];
  let unchanged = 0;

  for (const [p, nextContent] of nextMap.entries()) {
    if (!prevMap.has(p)) {
      added.push(p);
    } else if (prevMap.get(p) !== nextContent) {
      modified.push(p);
    } else {
      unchanged += 1;
    }
  }
  for (const p of prevMap.keys()) {
    if (!nextMap.has(p)) {
      removed.push(p);
    }
  }
  return { added, modified, removed, unchanged };
}

// ---------------------------------------------------------------------------
// Project Rescue AI Server Engine Calls & Multi-Source Importers
// ---------------------------------------------------------------------------
export async function importZipArchiveViaApi(
  file: File,
  options?: { selectedRoot?: string; projectNameHint?: string },
): Promise<{
  requiresRootSelection: boolean;
  rootCandidates: RescueZipRootCandidate[];
  summary: RescueImportSummary;
  files: NormalizedImportedFile[];
}> {
  const params = new URLSearchParams();
  if (options?.selectedRoot) params.set('selectedRoot', options.selectedRoot);
  if (options?.projectNameHint) params.set('projectName', options.projectNameHint);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const buffer = await file.arrayBuffer();
  const res = await fetchWithAuthAndRetry(`/api/rescue/import/zip${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: buffer,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to inspect and extract ZIP archive.');
  }
  return data as {
    requiresRootSelection: boolean;
    rootCandidates: RescueZipRootCandidate[];
    summary: RescueImportSummary;
    files: NormalizedImportedFile[];
  };
}

export async function importGitRepoViaApi(input: {
  repoUrl: string;
  branch?: string;
  githubToken?: string;
}): Promise<{
  summary: RescueImportSummary;
  files: NormalizedImportedFile[];
  branch: string;
  availableBranches: string[];
}> {
  const res = await fetchWithAuthAndRetry('/api/rescue/import/git', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repoUrl: input.repoUrl.trim(),
      branch: input.branch?.trim() || undefined,
      githubToken: input.githubToken?.trim() || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Git repository import failed.');
  }
  return data as {
    summary: RescueImportSummary;
    files: NormalizedImportedFile[];
    branch: string;
    availableBranches: string[];
  };
}

export async function startScanJobViaApi(input: {
  projectId: string;
  projectTitle: string;
  scanMode: RescueScanMode;
  files: ProjectFile[];
  customConfig?: RescueCustomScanConfig;
}): Promise<RescueScanJob> {
  const res = await fetchWithAuthAndRetry('/api/rescue/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      scanMode: input.scanMode,
      files: serializeProjectFiles(input.files),
      customConfig: input.customConfig,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Unable to start background scan job.');
  }
  return data as RescueScanJob;
}

export async function getScanJobStatusViaApi(jobId: string): Promise<RescueScanJob> {
  const res = await fetchWithAuthAndRetry(`/api/rescue/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Scan job not found.');
  }
  return data as RescueScanJob;
}

export async function cancelScanJobViaApi(jobId: string): Promise<RescueScanJob> {
  const res = await fetchWithAuthAndRetry(`/api/rescue/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Could not cancel scan job.');
  }
  return data as RescueScanJob;
}

export async function scanProjectViaApi(input: {
  projectId: string;
  projectTitle: string;
  scanMode: RescueScanMode;
  files: ProjectFile[];
  customConfig?: RescueCustomScanConfig;
}): Promise<RescueScanReport> {
  const res = await fetchWithAuthAndRetry('/api/rescue/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      scanMode: input.scanMode,
      files: serializeProjectFiles(input.files),
      customConfig: input.customConfig,
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
  expectedBehavior?: string;
  actualBehavior?: string;
  screenshot?: { mimeType: string; dataBase64: string } | null;
}): Promise<RescueRootCauseAnalysis> {
  const res = await fetchWithAuthAndRetry('/api/rescue/investigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectTitle: input.projectTitle,
      files: serializeProjectFiles(input.files),
      issue: input.issue || null,
      userProblemDescription: input.userProblemDescription?.trim() || undefined,
      expectedBehavior: input.expectedBehavior?.trim() || undefined,
      actualBehavior: input.actualBehavior?.trim() || undefined,
      screenshot: input.screenshot || null,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Root cause investigation failed.');
  }
  return data as RescueRootCauseAnalysis;
}

export async function analyzeFixImpactViaApi(input: {
  files: ProjectFile[];
  targetFilePath: string;
  proposedCode: string;
}): Promise<RescueImpactReport> {
  const res = await fetchWithAuthAndRetry('/api/rescue/analyze-impact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: serializeProjectFiles(input.files),
      targetFilePath: input.targetFilePath,
      proposedCode: input.proposedCode,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Fix impact analysis failed.');
  }
  return data as RescueImpactReport;
}

export async function fetchRescueAdminTelemetry(): Promise<RescueAdminTelemetry> {
  const res = await fetchWithAuthAndRetry('/api/rescue/admin/telemetry', { method: 'GET' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Unable to load Project Rescue telemetry.');
  }
  return data as RescueAdminTelemetry;
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
      role: f.role || 'module',
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

  const boundedIssues = (report.issues || []).slice(0, 45).map((iss) => ({
    ...iss,
    title: truncateToUtf8Bytes(iss.title || 'Issue', 220),
    filePath: truncateToUtf8Bytes(iss.filePath || 'unknown', 220),
    evidenceSource: truncateToUtf8Bytes(iss.evidenceSource || 'Static Check', 120),
    summary: truncateToUtf8Bytes(iss.summary || '', 800),
    beginnerExplanation: truncateToUtf8Bytes(iss.beginnerExplanation || '', 900),
    developerExplanation: truncateToUtf8Bytes(iss.developerExplanation || '', 900),
    recommendedAction: truncateToUtf8Bytes(iss.recommendedAction || '', 400),
    symbolOrSnippet: iss.symbolOrSnippet ? truncateToUtf8Bytes(iss.symbolOrSnippet, 300) : undefined,
    relatedFiles: (iss.relatedFiles || []).slice(0, 12),
  }));

  let encodedIndex = encodeProjectIndexForFirestore(report.projectIndex);
  const buildPayload = (issuesList: typeof boundedIssues, idxObj: Record<string, unknown>) =>
    sanitizeForFirestore<Record<string, unknown>>({
      id: scanId,
      userId: uid,
      projectId,
      projectTitle: truncateToUtf8Bytes(String(report.projectTitle || 'Workspace').trim(), 140) || 'Workspace',
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
      summary:
        truncateToUtf8Bytes(String(report.summary || 'Project health scan completed.').trim(), 3900) ||
        'Scan completed.',
      recommendedRepairOrder: (report.recommendedRepairOrder || [])
        .map((s) => truncateToUtf8Bytes(String(s), 280))
        .slice(0, 30),
      suggestedImprovements: (report.suggestedImprovements || [])
        .map((s) => truncateToUtf8Bytes(String(s), 280))
        .slice(0, 30),
      projectIndex: idxObj,
      documentationReport: report.documentationReport
        ? {
            docFiles: (report.documentationReport.docFiles || []).slice(0, 12),
            purposeSummary: truncateToUtf8Bytes(report.documentationReport.purposeSummary || '', 1200),
            setupInstructions: (report.documentationReport.setupInstructions || []).slice(0, 15),
            documentedEndpoints: (report.documentationReport.documentedEndpoints || []).slice(0, 25),
            referencedPaths: (report.documentationReport.referencedPaths || []).slice(0, 30),
            discrepancies: (report.documentationReport.discrepancies || []).slice(0, 20),
          }
        : undefined,
      issues: issuesList,
      runtimeAudit: (report.runtimeAudit || []).slice(0, 15),
      reviewedIssueIds: (report.reviewedIssueIds || []).slice(0, 100),
      dismissedIssues: (report.dismissedIssues || []).slice(0, 100),
      excludedPaths: (report.excludedPaths || []).slice(0, 60),
      projectFingerprint: report.projectFingerprint
        ? truncateToUtf8Bytes(report.projectFingerprint, 128)
        : undefined,
      createdAt: serverTimestamp(),
    });

  let payload = buildPayload(boundedIssues, encodedIndex);
  if (utf8ByteLength(JSON.stringify(payload)) > 680_000) {
    encodedIndex = encodeProjectIndexForFirestore({
      ...report.projectIndex,
      files: (report.projectIndex.files || []).slice(0, 20),
    });
    payload = buildPayload(boundedIssues.slice(0, 25), encodedIndex);
  }

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

export async function updateRescueScanReviewState(
  scanId: string,
  reviewedIssueIds: string[],
  dismissedIssues: RescueDismissedIssue[],
): Promise<void> {
  try {
    await updateDoc(doc(db, 'rescueScans', scanId), sanitizeForFirestore({
      reviewedIssueIds: reviewedIssueIds.slice(0, 100),
      dismissedIssues: dismissedIssues.slice(0, 100),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `rescueScans/${scanId}`);
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
    projectTitle: truncateToUtf8Bytes(input.projectTitle.trim(), 140) || 'Workspace',
    filePath: truncateToUtf8Bytes(input.filePath.trim(), 240) || 'index.js',
    problemIdentified: truncateToUtf8Bytes(input.problemIdentified.trim(), 500) || 'Applied rescue fix',
    snapshotVersionId: input.snapshotVersionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120),
    snapshotVersionNumber: Math.max(1, Math.min(10000, Math.round(input.snapshotVersionNumber))),
    verificationPassed: Boolean(input.verificationPassed),
    verificationStatus: input.verificationStatus,
    verificationSummary: truncateToUtf8Bytes(input.verificationSummary.trim(), 1000) || 'Verified',
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

export async function saveRescueInvestigationRecord(
  uid: string,
  input: {
    projectId: string;
    projectTitle: string;
    issueId?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    analysis: RescueRootCauseAnalysis;
    status?: RescueInvestigationRecord['status'];
  },
): Promise<RescueInvestigationRecord> {
  const invId = `rinv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const payload = sanitizeForFirestore<Record<string, unknown>>({
    id: invId,
    userId: uid,
    projectId: input.projectId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120),
    projectTitle: truncateToUtf8Bytes(input.projectTitle.trim(), 140) || 'Workspace',
    issueId: input.issueId ? truncateToUtf8Bytes(input.issueId, 120) : undefined,
    problemTitle: truncateToUtf8Bytes(input.analysis.problemTitle || 'Investigation', 220),
    responsibleFile: truncateToUtf8Bytes(input.analysis.responsibleFile || 'unknown', 240),
    certainty: input.analysis.certainty,
    confidence: Math.max(0, Math.min(100, Math.round(Number(input.analysis.confidence) || 0))),
    expectedBehavior: input.expectedBehavior
      ? truncateToUtf8Bytes(input.expectedBehavior.trim(), 950)
      : undefined,
    actualBehavior: input.actualBehavior
      ? truncateToUtf8Bytes(input.actualBehavior.trim(), 950)
      : undefined,
    analysis: sanitizeForFirestore(input.analysis),
    status: input.status || 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    await setDoc(doc(db, 'rescueInvestigations', invId), payload);
    const snap = await getDoc(doc(db, 'rescueInvestigations', invId));
    return snap.data() as RescueInvestigationRecord;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `rescueInvestigations/${invId}`);
  }
}

export async function listRescueInvestigationRecords(uid: string): Promise<RescueInvestigationRecord[]> {
  try {
    const q = query(collection(db, 'rescueInvestigations'), where('userId', '==', uid), limit(30));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as RescueInvestigationRecord)
      .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'rescueInvestigations');
  }
}

export async function updateRescueInvestigationStatus(
  investigationId: string,
  status: RescueInvestigationRecord['status'],
): Promise<void> {
  try {
    await updateDoc(doc(db, 'rescueInvestigations', investigationId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `rescueInvestigations/${investigationId}`);
  }
}

export async function deleteRescueInvestigationRecord(investigationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rescueInvestigations', investigationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `rescueInvestigations/${investigationId}`);
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

import path from 'node:path';
import yauzl from 'yauzl';
import { recordRescueAdminEvent } from './rescueTelemetry.ts';
import type { RescueImportSummary, RescueZipRootCandidate } from '../types/mideocode.ts';

export class ZipSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipSecurityError';
  }
}

const MAX_ZIP_ENTRIES = 2000;
const MAX_ZIP_DEPTH = 12;
const MAX_TOTAL_DECOMPRESSED_BYTES = 15 * 1024 * 1024; // 15 MB stream safety ceiling
const MAX_SINGLE_FILE_BYTES = 145_000;
const MAX_WORKSPACE_FILES = 60;
const MAX_WORKSPACE_BYTES = 4_200_000;

const IGNORED_SEGMENTS = new Set([
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

const IGNORED_FILENAMES = new Set([
  '.ds_store',
  'thumbs.db',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'pnpm-lock.yaml',
]);

const SUPPORTED_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs',
  'ts', 'tsx', 'mts', 'cts',
  'py', 'pyw',
  'php', 'java', 'cpp', 'cc', 'cxx', 'hpp', 'c', 'h', 'cs', 'go', 'rs',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'sql', 'json', 'jsonc',
  'md', 'mdx', 'rst', 'adoc',
  'yml', 'yaml', 'toml', 'xml', 'txt', 'sh', 'bash',
  'vue', 'svelte', 'astro', 'prisma', 'graphql', 'gql',
]);

const SPECIAL_FILENAMES = new Set([
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

export function detectImporterLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) return 'typescript';
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
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.sass') || lower.endsWith('.less')) return 'css';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return 'json';
  if (lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.rst') || lower.endsWith('.adoc')) return 'markdown';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.toml')) return 'toml';
  if (lower.endsWith('.xml')) return 'xml';
  return 'text';
}

function isSupportedFilename(filename: string): boolean {
  const lower = filename.trim().toLowerCase();
  if (!lower) return false;
  if (SPECIAL_FILENAMES.has(lower)) return true;
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === lower.length - 1) return false;
  return SUPPORTED_EXTENSIONS.has(lower.slice(dotIdx + 1));
}

function validateSafeArchivePath(rawPath: string): string {
  if (!rawPath || rawPath.includes('\u0000')) {
    throw new ZipSecurityError('Archive contains an unsafe null-byte filename.');
  }
  const normalized = rawPath.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new ZipSecurityError(`Blocked unsafe absolute archive path: ${normalized.slice(0, 80)}`);
  }
  const clean = normalized.replace(/^\.?\//, '').replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.some((p) => p === '..')) {
    throw new ZipSecurityError(`Blocked path traversal (ZIP-Slip) entry: ${normalized.slice(0, 80)}`);
  }
  if (parts.length > MAX_ZIP_DEPTH) {
    throw new ZipSecurityError(`Archive folder depth exceeds ${MAX_ZIP_DEPTH} levels.`);
  }
  return parts.join('/');
}

function isGitIgnoredPath(normPath: string, gitignorePatterns: string[]): boolean {
  if (gitignorePatterns.length === 0) return false;
  const parts = normPath.split('/');
  const base = parts[parts.length - 1];
  for (const rawPattern of gitignorePatterns) {
    const pattern = rawPattern.trim();
    if (!pattern || pattern.startsWith('#') || pattern.startsWith('!')) continue;
    const cleanPat = pattern.replace(/^\//, '').replace(/\/$/, '');
    if (!cleanPat) continue;
    if (cleanPat.startsWith('*.')) {
      const suffix = cleanPat.slice(1);
      if (base.endsWith(suffix)) return true;
    } else if (normPath === cleanPat || parts.includes(cleanPat) || normPath.startsWith(`${cleanPat}/`)) {
      return true;
    }
  }
  return false;
}

function isIgnoredSystemOrSecretPath(normPath: string): { ignored: boolean; reason?: string } {
  const parts = normPath.toLowerCase().split('/');
  if (parts.some((seg) => IGNORED_SEGMENTS.has(seg))) {
    return { ignored: true, reason: 'Dependency or build cache folder skipped' };
  }
  const base = parts[parts.length - 1];
  if (IGNORED_FILENAMES.has(base)) {
    return { ignored: true, reason: 'Lockfile or OS metadata skipped' };
  }
  if (/^\.env(\.|$)/i.test(base) && !/^\.env\.(example|sample|template)$/i.test(base)) {
    return { ignored: true, reason: 'Sensitive .env file skipped for security' };
  }
  return { ignored: false };
}

function readZipEntryBuffer(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
  maxBytesRemaining: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err || new Error('Failed to open ZIP entry stream.'));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      let aborted = false;

      stream.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytesRemaining) {
          aborted = true;
          stream.destroy();
          reject(new ZipSecurityError('Archive decompression exceeded safe 15 MB memory limit (possible decompression bomb).'));
          return;
        }
        chunks.push(chunk);
      });

      stream.on('error', (streamErr) => {
        if (!aborted) reject(streamErr);
      });

      stream.on('end', () => {
        if (!aborted) resolve(Buffer.concat(chunks));
      });
    });
  });
}

export interface ExtractedWorkspaceFile {
  name: string;
  folder: string;
  language: string;
  content: string;
}

export async function inspectAndExtractZipBuffer(
  buffer: Buffer,
  options?: {
    selectedRoot?: string;
    projectNameHint?: string;
    userId?: string;
  },
): Promise<{
  requiresRootSelection: boolean;
  rootCandidates: RescueZipRootCandidate[];
  summary: RescueImportSummary;
  files: ExtractedWorkspaceFile[];
}> {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new Error('Uploaded file is empty or not a valid ZIP archive.');
  }

  const rawEntries: { path: string; text: string; size: number }[] = [];
  const skipReasonsMap = new Map<string, number>();
  let totalReadBytes = 0;
  let totalEntriesSeen = 0;
  let totalSkipped = 0;

  const bumpSkip = (reason: string) => {
    totalSkipped += 1;
    skipReasonsMap.set(reason, (skipReasonsMap.get(reason) || 0) + 1);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (openErr, zipfile) => {
        if (openErr || !zipfile) {
          reject(new Error('Could not open ZIP archive. Ensure the file is a valid uncompressed/deflated .zip file.'));
          return;
        }

        let failed = false;
        const failWith = (err: Error) => {
          if (failed) return;
          failed = true;
          try {
            zipfile.close();
          } catch {
            // ignore
          }
          reject(err);
        };

        zipfile.on('error', (zErr) => failWith(zErr));
        zipfile.on('end', () => {
          if (!failed) resolve();
        });

        zipfile.on('entry', (entry: yauzl.Entry) => {
          if (failed) return;
          totalEntriesSeen += 1;
          if (totalEntriesSeen > MAX_ZIP_ENTRIES) {
            failWith(new ZipSecurityError(`Archive contains more than ${MAX_ZIP_ENTRIES} entries.`));
            return;
          }

          // Encrypted entry check (bit 0)
          if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
            failWith(new ZipSecurityError('Password-protected or encrypted ZIP archives are not supported.'));
            return;
          }

          // Symlink check from Unix external file attributes
          const unixMode = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (unixMode === 0o120000) {
            failWith(new ZipSecurityError(`Archive contains symbolic link "${entry.fileName}", which is blocked for security.`));
            return;
          }

          // Compression ratio bomb check
          if (
            entry.compressedSize > 0 &&
            entry.uncompressedSize > 1024 * 1024 &&
            entry.uncompressedSize / entry.compressedSize > 100
          ) {
            failWith(new ZipSecurityError(`Suspicious compression ratio detected in "${entry.fileName}".`));
            return;
          }

          let safePath = '';
          try {
            safePath = validateSafeArchivePath(entry.fileName);
          } catch (secErr) {
            failWith(secErr as Error);
            return;
          }

          // Skip directory entries
          if (!safePath || entry.fileName.endsWith('/')) {
            zipfile.readEntry();
            return;
          }

          const ignoredCheck = isIgnoredSystemOrSecretPath(safePath);
          if (ignoredCheck.ignored) {
            bumpSkip(ignoredCheck.reason || 'Ignored folder or lockfile');
            zipfile.readEntry();
            return;
          }

          const baseName = path.posix.basename(safePath);
          if (!isSupportedFilename(baseName)) {
            bumpSkip('Binary or unsupported file type');
            zipfile.readEntry();
            return;
          }

          if (entry.uncompressedSize > MAX_SINGLE_FILE_BYTES) {
            bumpSkip('File exceeded 145 KB analysis limit');
            zipfile.readEntry();
            return;
          }

          const remainingBudget = MAX_TOTAL_DECOMPRESSED_BYTES - totalReadBytes;
          if (remainingBudget <= 0) {
            failWith(new ZipSecurityError('Archive decompressed content exceeds 15 MB safety ceiling.'));
            return;
          }

          readZipEntryBuffer(zipfile, entry, Math.min(remainingBudget, MAX_SINGLE_FILE_BYTES + 4096))
            .then((fileBuf) => {
              totalReadBytes += fileBuf.length;
              if (fileBuf.includes(0)) {
                bumpSkip('Binary file content detected');
                zipfile.readEntry();
                return;
              }
              const text = fileBuf.toString('utf8');
              rawEntries.push({ path: safePath, text, size: fileBuf.length });
              zipfile.readEntry();
            })
            .catch((readErr) => failWith(readErr instanceof Error ? readErr : new Error(String(readErr))));
        });

        zipfile.readEntry();
      });
    });
  } catch (err) {
    if (err instanceof ZipSecurityError) {
      recordRescueAdminEvent({
        kind: 'security_event',
        userId: options?.userId,
        projectTitle: options?.projectNameHint || 'ZIP Import',
        message: err.message,
      });
    } else {
      recordRescueAdminEvent({
        kind: 'failed_import',
        userId: options?.userId,
        projectTitle: options?.projectNameHint || 'ZIP Import',
        message: err instanceof Error ? err.message : 'ZIP extraction failed.',
      });
    }
    throw err;
  }

  // Apply root .gitignore rules if present
  const gitignoreEntry = rawEntries.find((e) => e.path.toLowerCase() === '.gitignore' || e.path.toLowerCase().endsWith('/.gitignore'));
  const gitignorePatterns = gitignoreEntry
    ? gitignoreEntry.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : [];

  const filteredEntries = rawEntries.filter((e) => {
    if (path.posix.basename(e.path).toLowerCase() === '.gitignore') return true;
    if (isGitIgnoredPath(e.path, gitignorePatterns)) {
      bumpSkip('Matched .gitignore pattern');
      return false;
    }
    return true;
  });

  if (filteredEntries.length === 0) {
    const err = new Error('No supported source code or documentation files were found inside the ZIP archive.');
    recordRescueAdminEvent({
      kind: 'failed_import',
      userId: options?.userId,
      projectTitle: options?.projectNameHint || 'ZIP Import',
      message: err.message,
    });
    throw err;
  }

  // Detect multiple top-level project roots inside the archive
  const topDirStats = new Map<string, { fileCount: number; hasConfig: boolean }>();
  let hasRootLevelCode = false;
  for (const e of filteredEntries) {
    const slashIdx = e.path.indexOf('/');
    if (slashIdx === -1) {
      hasRootLevelCode = true;
      continue;
    }
    const topDir = e.path.slice(0, slashIdx);
    const stat = topDirStats.get(topDir) || { fileCount: 0, hasConfig: false };
    stat.fileCount += 1;
    const base = path.posix.basename(e.path).toLowerCase();
    if (['package.json', 'pyproject.toml', 'requirements.txt', 'pom.xml', 'go.mod', 'cargo.toml', 'index.html'].includes(base)) {
      stat.hasConfig = true;
    }
    topDirStats.set(topDir, stat);
  }

  const significantRoots: RescueZipRootCandidate[] = Array.from(topDirStats.entries())
    .filter(([, s]) => s.hasConfig || s.fileCount >= 2)
    .map(([rootPath, s]) => ({
      rootPath,
      fileCount: s.fileCount,
      hasConfigFile: s.hasConfig,
    }))
    .sort((a, b) => Number(b.hasConfigFile) - Number(a.hasConfigFile) || b.fileCount - a.fileCount);

  if (!hasRootLevelCode && !options?.selectedRoot && significantRoots.length >= 2) {
    return {
      requiresRootSelection: true,
      rootCandidates: significantRoots,
      summary: {
        sourceType: 'zip',
        projectTitle: options?.projectNameHint || 'ZIP Archive',
        importedCount: 0,
        skippedCount: totalSkipped,
        totalBytes: 0,
        languages: {},
        frameworks: [],
        skippedReasons: Array.from(skipReasonsMap.entries()).map(([reason, count]) => `${reason} (${count})`),
      },
      files: [],
    };
  }

  // Strip selected root or single outer directory cleanly
  let stripPrefix = '';
  let inferredTitle = options?.projectNameHint?.replace(/\.zip$/i, '') || 'Imported ZIP Project';

  if (options?.selectedRoot && options.selectedRoot !== '__ALL__') {
    stripPrefix = `${options.selectedRoot.replace(/^\/+|\/+$/g, '')}/`;
    inferredTitle = path.posix.basename(options.selectedRoot) || inferredTitle;
  } else if (!hasRootLevelCode && topDirStats.size === 1) {
    const onlyRoot = Array.from(topDirStats.keys())[0];
    stripPrefix = `${onlyRoot}/`;
    inferredTitle = onlyRoot;
  }

  const scopedEntries = stripPrefix
    ? filteredEntries.filter((e) => e.path.startsWith(stripPrefix))
    : filteredEntries;

  const files: ExtractedWorkspaceFile[] = [];
  const languages: Record<string, number> = {};
  let totalBytes = 0;

  for (const e of scopedEntries) {
    if (files.length >= MAX_WORKSPACE_FILES) {
      bumpSkip('Workspace 60-file cap reached');
      continue;
    }
    const rel = stripPrefix ? e.path.slice(stripPrefix.length) : e.path;
    if (!rel) continue;
    const contentBytes = Buffer.byteLength(e.text, 'utf8');
    if (totalBytes + contentBytes > MAX_WORKSPACE_BYTES) {
      bumpSkip('Workspace 4.2 MB cap reached');
      continue;
    }
    const folder = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
    const name = path.posix.basename(rel);
    const language = detectImporterLanguage(name);
    files.push({
      name: name.slice(0, 120),
      folder: folder.slice(0, 120),
      language,
      content: e.text,
    });
    totalBytes += contentBytes;
    languages[language] = (languages[language] || 0) + 1;
  }

  const frameworks = inferFrameworksFromFiles(files);

  return {
    requiresRootSelection: false,
    rootCandidates: significantRoots,
    summary: {
      sourceType: 'zip',
      projectTitle: inferredTitle.slice(0, 120),
      importedCount: files.length,
      skippedCount: totalSkipped,
      totalBytes,
      languages,
      frameworks,
      skippedReasons: Array.from(skipReasonsMap.entries()).map(([reason, count]) => `${reason} (${count})`),
    },
    files,
  };
}

function inferFrameworksFromFiles(files: ExtractedWorkspaceFile[]): string[] {
  const frameworks = new Set<string>();
  const pkg = files.find((f) => !f.folder && f.name === 'package.json');
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = new Set([
        ...Object.keys(parsed.dependencies || {}),
        ...Object.keys(parsed.devDependencies || {}),
      ]);
      if (deps.has('react')) frameworks.add('React');
      if (deps.has('vite')) frameworks.add('Vite');
      if (deps.has('express')) frameworks.add('Express');
      if (deps.has('next')) frameworks.add('Next.js');
      if (deps.has('tailwindcss')) frameworks.add('Tailwind CSS');
      if (deps.has('firebase')) frameworks.add('Firebase');
      if (deps.has('typescript')) frameworks.add('TypeScript');
    } catch {
      // invalid package.json will be caught by Rescue scanner
    }
  }
  for (const f of files) {
    if (f.language === 'python') frameworks.add('Python');
    if (f.language === 'php') frameworks.add('PHP');
    if (f.language === 'java') frameworks.add('Java');
    if (f.language === 'go') frameworks.add('Go');
    if (f.language === 'rust') frameworks.add('Rust');
  }
  return Array.from(frameworks);
}

export function parseGitHubRepoUrl(rawUrl: string): { owner: string; repo: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo).');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
    throw new ZipSecurityError('Only HTTPS github.com repository URLs are permitted.');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new Error('GitHub URL must include both owner and repository name (https://github.com/owner/repo).');
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');
  if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo)) {
    throw new Error('Invalid GitHub owner or repository name.');
  }
  return { owner, repo };
}

export async function importGitRepository(input: {
  repoUrl: string;
  branch?: string;
  githubToken?: string;
  userId?: string;
}): Promise<{
  summary: RescueImportSummary;
  files: ExtractedWorkspaceFile[];
  branch: string;
  availableBranches: string[];
}> {
  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGitHubRepoUrl(input.repoUrl));
  } catch (err) {
    if (err instanceof ZipSecurityError) {
      recordRescueAdminEvent({
        kind: 'security_event',
        userId: input.userId,
        projectTitle: input.repoUrl.slice(0, 80),
        message: err.message,
      });
    } else {
      recordRescueAdminEvent({
        kind: 'failed_import',
        userId: input.userId,
        projectTitle: input.repoUrl.slice(0, 80),
        message: err instanceof Error ? err.message : 'Invalid Git URL.',
      });
    }
    throw err;
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'MideoCode-Project-Rescue-Importer',
  };
  if (input.githubToken?.trim()) {
    headers.Authorization = `Bearer ${input.githubToken.trim()}`;
  }

  try {
    const repoResp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (repoResp.status === 404) {
      throw new Error(
        'Repository not found. If it is private, provide a temporary read-only GitHub Personal Access Token (never stored).',
      );
    }
    if (repoResp.status === 401 || repoResp.status === 403) {
      const rem = repoResp.headers.get('x-ratelimit-remaining');
      throw new Error(
        rem === '0'
          ? 'GitHub API rate limit reached. Provide an ephemeral GitHub token or upload a ZIP archive instead.'
          : 'GitHub authentication failed or access was denied.',
      );
    }
    if (!repoResp.ok) {
      throw new Error(`GitHub returned HTTP ${repoResp.status} while inspecting repository metadata.`);
    }

    const repoMeta = (await repoResp.json()) as { default_branch?: string; name?: string; private?: boolean };
    const selectedBranch = input.branch?.trim() || repoMeta.default_branch || 'main';

    const branchesResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=15`, { headers });
    const availableBranches = branchesResp.ok
      ? ((await branchesResp.json()) as { name: string }[]).map((b) => b.name)
      : [selectedBranch];

    const treeResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(selectedBranch)}?recursive=1`,
      { headers },
    );
    if (!treeResp.ok) {
      throw new Error(`Could not fetch file tree for branch "${selectedBranch}" (HTTP ${treeResp.status}).`);
    }

    const treeData = (await treeResp.json()) as {
      truncated?: boolean;
      tree?: Array<{ path: string; type: string; size?: number; sha?: string }>;
    };

    const blobs = (treeData.tree || []).filter((item) => item.type === 'blob' && item.path);
    if (blobs.length === 0) {
      throw new Error(`Branch "${selectedBranch}" contains no files.`);
    }

    const skipReasons = new Map<string, number>();
    let skippedCount = 0;
    const bumpSkip = (r: string) => {
      skippedCount += 1;
      skipReasons.set(r, (skipReasons.get(r) || 0) + 1);
    };

    const eligibleBlobs: Array<{ path: string; size: number }> = [];
    for (const b of blobs) {
      const ignored = isIgnoredSystemOrSecretPath(b.path);
      if (ignored.ignored) {
        bumpSkip(ignored.reason || 'Ignored directory or file');
        continue;
      }
      const base = path.posix.basename(b.path);
      if (!isSupportedFilename(base)) {
        bumpSkip('Binary or unsupported file extension');
        continue;
      }
      if ((b.size || 0) > MAX_SINGLE_FILE_BYTES) {
        bumpSkip('File exceeded 145 KB limit');
        continue;
      }
      if (eligibleBlobs.length >= MAX_WORKSPACE_FILES) {
        bumpSkip('Workspace 60-file limit reached');
        continue;
      }
      eligibleBlobs.push({ path: b.path, size: b.size || 0 });
    }

    if (eligibleBlobs.length === 0) {
      throw new Error('No supported source code or documentation files were found in this repository.');
    }

    // Fetch raw file contents concurrently in batches of 8
    const files: ExtractedWorkspaceFile[] = [];
    const languages: Record<string, number> = {};
    let totalBytes = 0;

    for (let i = 0; i < eligibleBlobs.length; i += 8) {
      const batch = eligibleBlobs.slice(i, i + 8);
      const results = await Promise.all(
        batch.map(async (item) => {
          const rawEndpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${item.path
            .split('/')
            .map(encodeURIComponent)
            .join('/')}?ref=${encodeURIComponent(selectedBranch)}`;
          const r = await fetch(rawEndpoint, {
            headers: {
              ...headers,
              Accept: 'application/vnd.github.raw+json',
            },
          });
          if (!r.ok) return null;
          const text = await r.text();
          if (text.includes('\u0000')) return null;
          return { path: item.path, text };
        }),
      );

      for (const resItem of results) {
        if (!resItem) {
          bumpSkip('Unreadable or binary file');
          continue;
        }
        const bytes = Buffer.byteLength(resItem.text, 'utf8');
        if (totalBytes + bytes > MAX_WORKSPACE_BYTES) {
          bumpSkip('Workspace 4.2 MB limit reached');
          continue;
        }
        const folder = path.posix.dirname(resItem.path) === '.' ? '' : path.posix.dirname(resItem.path);
        const name = path.posix.basename(resItem.path);
        const language = detectImporterLanguage(name);
        files.push({
          name: name.slice(0, 120),
          folder: folder.slice(0, 120),
          language,
          content: resItem.text,
        });
        totalBytes += bytes;
        languages[language] = (languages[language] || 0) + 1;
      }
    }

    return {
      branch: selectedBranch,
      availableBranches,
      files,
      summary: {
        sourceType: 'git',
        projectTitle: repoMeta.name || repo,
        importedCount: files.length,
        skippedCount,
        totalBytes,
        languages,
        frameworks: inferFrameworksFromFiles(files),
        skippedReasons: Array.from(skipReasons.entries()).map(([reason, count]) => `${reason} (${count})`),
        branch: selectedBranch,
        repoUrl: `https://github.com/${owner}/${repo}`,
      },
    };
  } catch (err) {
    if (!(err instanceof ZipSecurityError)) {
      recordRescueAdminEvent({
        kind: 'failed_import',
        userId: input.userId,
        projectTitle: `${owner}/${repo}`,
        message: err instanceof Error ? err.message : 'Git repository import failed.',
      });
    }
    throw err;
  }
}

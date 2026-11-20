import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { Linter } from 'eslint';
import { GoogleGenAI, Type } from '@google/genai';
import { executeTestLabSuite, type SubmittedWorkspaceFile } from './testLabEngine.ts';
import type {
  RescueCertainty,
  RescueChatMessage,
  RescueFileSummary,
  RescueFixProposal,
  RescueImpactReport,
  RescueIssue,
  RescueIssueCategory,
  RescueProjectIndex,
  RescueRootCauseAnalysis,
  RescueRuntimeAudit,
  RescueScanMode,
  RescueScanReport,
  RescueSeverity,
  RescueVerificationResult,
  TestSuite,
} from '../types/mideocode.ts';

export interface RescueWorkspaceFile extends SubmittedWorkspaceFile {
  id?: string;
}

const NODE_BUILTINS = new Set([
  'fs', 'node:fs', 'path', 'node:path', 'os', 'node:os', 'crypto', 'node:crypto',
  'http', 'https', 'node:http', 'node:https', 'url', 'node:url', 'util', 'node:util',
  'stream', 'node:stream', 'events', 'node:events', 'child_process', 'node:child_process',
  'vm', 'node:vm', 'buffer', 'node:buffer', 'assert', 'node:assert', 'readline', 'node:readline',
  'zlib', 'node:zlib',
]);

const PYTHON_STDLIB = new Set([
  'os', 'sys', 'json', 'math', 're', 'time', 'datetime', 'random', 'collections',
  'itertools', 'functools', 'pathlib', 'typing', 'sqlite3', 'http', 'urllib', 'hashlib',
  'hmac', 'base64', 'csv', 'io', 'ast', 'unittest', 'dataclasses', 'enum', 'asyncio',
]);

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function normalizeRescuePath(file: { folder?: string; name: string }): string {
  const folder = (file.folder || '').replace(/^\/+|\/+$/g, '').trim();
  const name = (file.name || '').replace(/^\/+/, '').trim();
  return folder ? `${folder}/${name}` : name;
}

export function redactSecrets(text: string, filePath = ''): string {
  if (!text) return '';
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.env') || lower.includes('.env.')) {
    return text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
          return `${line.slice(0, eqIdx + 1)}[REDACTED_ENV_VALUE]`;
        }
        return '[REDACTED_ENV_LINE]';
      })
      .join('\n');
  }

  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\bAIza[0-9A-Za-z\-_]{25,}\b/g, '[REDACTED_GOOGLE_API_KEY]')
    .replace(/\bsk-[A-Za-z0-9\-_]{16,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/((?:api_?key|secret|password|passwd|private_?key|access_?token|auth_?token)\s*[:=]\s*['"`])([^'"`\n]{6,})(['"`])/gi, '$1[REDACTED]$3');
}

function detectLanguage(filePath: string, declared?: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.jsx')) return 'jsx';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  return declared || 'text';
}

function extractImportsAndExports(filePath: string, content: string, lang: string): {
  imports: string[];
  exports: string[];
  apiCalls: string[];
  apiRoutes: string[];
} {
  const imports = new Set<string>();
  const exports = new Set<string>();
  const apiCalls = new Set<string>();
  const apiRoutes = new Set<string>();

  if (['javascript', 'typescript', 'jsx', 'tsx'].includes(lang)) {
    const esmImportRegex = /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = esmImportRegex.exec(content)) !== null) {
      imports.add(m[1]);
    }
    const reqRegex = /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = reqRegex.exec(content)) !== null) {
      imports.add(m[1]);
    }

    const exportDeclRegex = /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
    while ((m = exportDeclRegex.exec(content)) !== null) {
      exports.add(m[1]);
    }
    if (/\bexport\s+default\b/.test(content)) {
      exports.add('default');
    }

    const fetchRegex = /\b(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*['"`](\/api\/[^'"`?\s]+)/g;
    while ((m = fetchRegex.exec(content)) !== null) {
      apiCalls.add(m[1]);
    }

    const routeRegex = /\b(?:app|router)\.(?:get|post|put|patch|delete|use)\s*\(\s*['"`](\/api\/[^'"`\s]+)/g;
    while ((m = routeRegex.exec(content)) !== null) {
      apiRoutes.add(m[1]);
    }
  } else if (lang === 'python') {
    const pyImport = /^\s*import\s+([a-zA-Z0-9_.]+)/gm;
    let m: RegExpExecArray | null;
    while ((m = pyImport.exec(content)) !== null) {
      imports.add(m[1].split('.')[0]);
    }
    const pyFrom = /^\s*from\s+(\.{0,2}[a-zA-Z0-9_.]*)\s+import\s+/gm;
    while ((m = pyFrom.exec(content)) !== null) {
      if (m[1]) imports.add(m[1]);
    }
    const pyDef = /^(?:def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;
    while ((m = pyDef.exec(content)) !== null) {
      exports.add(m[1]);
    }
    const pyRoute = /@(?:app|bp|router)\.(?:route|get|post|put|delete)\(\s*['"](\/api\/[^'"]+)/g;
    while ((m = pyRoute.exec(content)) !== null) {
      apiRoutes.add(m[1]);
    }
  } else if (lang === 'html') {
    const srcRegex = /<(?:script|link)[^>]+(?:src|href)\s*=\s*['"]([^'"]+)['"]/gi;
    let m: RegExpExecArray | null;
    while ((m = srcRegex.exec(content)) !== null) {
      const target = m[1].trim();
      if (target && !target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('//') && !target.startsWith('#')) {
        imports.add(target);
      }
    }
  } else if (lang === 'css') {
    const cssImport = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/gi;
    let m: RegExpExecArray | null;
    while ((m = cssImport.exec(content)) !== null) {
      if (!m[1].startsWith('http')) imports.add(m[1]);
    }
  }

  return {
    imports: Array.from(imports),
    exports: Array.from(exports),
    apiCalls: Array.from(apiCalls),
    apiRoutes: Array.from(apiRoutes),
  };
}

function resolveRelativeImport(
  fromPath: string,
  specifier: string,
  allPathSet: Set<string>,
): string | null {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return null;
  }
  const cleanSpec = specifier.split('?')[0].split('#')[0];
  const baseDir = path.posix.dirname(fromPath);
  const candidateBase = cleanSpec.startsWith('/')
    ? cleanSpec.replace(/^\/+/, '')
    : path.posix.normalize(baseDir === '.' ? cleanSpec : `${baseDir}/${cleanSpec}`);

  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json', '.py', '.html'];
  for (const ext of extensions) {
    const candidate = `${candidateBase}${ext}`;
    if (allPathSet.has(candidate)) return candidate;
  }
  const indexCandidates = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', '__init__.py'];
  for (const idx of indexCandidates) {
    const candidate = `${candidateBase}/${idx}`;
    if (allPathSet.has(candidate)) return candidate;
  }
  return null;
}

export function buildProjectIndex(files: RescueWorkspaceFile[]): {
  index: RescueProjectIndex;
  fileMap: Map<string, RescueWorkspaceFile>;
  brokenImports: { fromPath: string; specifier: string; line: number }[];
  unlistedPackages: { fromPath: string; pkgName: string; line: number }[];
  packageJsonParsed: Record<string, unknown> | null;
} {
  const fileMap = new Map<string, RescueWorkspaceFile>();
  const languages: Record<string, number> = {};
  const skippedFiles: { path: string; reason: string }[] = [];

  for (const f of files) {
    const norm = normalizeRescuePath(f);
    if (!norm) continue;
    if ((f.content || '').length > 150000) {
      skippedFiles.push({ path: norm, reason: 'Exceeded 150 KB per-file analysis cap' });
      continue;
    }
    fileMap.set(norm, { ...f, content: f.content || '' });
    const lang = detectLanguage(norm, f.language);
    languages[lang] = (languages[lang] || 0) + 1;
  }

  const allPaths = Array.from(fileMap.keys());
  const allPathSet = new Set(allPaths);

  let packageJsonParsed: Record<string, unknown> | null = null;
  const packageDependencies: string[] = [];
  const pkgFile = fileMap.get('package.json');
  if (pkgFile) {
    try {
      const parsed = JSON.parse(pkgFile.content) as Record<string, unknown>;
      packageJsonParsed = parsed;
      const deps = {
        ...((parsed.dependencies as Record<string, unknown>) || {}),
        ...((parsed.devDependencies as Record<string, unknown>) || {}),
      };
      for (const k of Object.keys(deps)) {
        packageDependencies.push(k);
      }
    } catch {
      // Handled in diagnostics
    }
  }
  const declaredPkgSet = new Set(packageDependencies);

  const frameworksDetected = new Set<string>();
  if (declaredPkgSet.has('react')) frameworksDetected.add('React');
  if (declaredPkgSet.has('vite')) frameworksDetected.add('Vite');
  if (declaredPkgSet.has('express')) frameworksDetected.add('Express');
  if (declaredPkgSet.has('next')) frameworksDetected.add('Next.js');
  if (declaredPkgSet.has('tailwindcss')) frameworksDetected.add('Tailwind CSS');
  if (declaredPkgSet.has('firebase')) frameworksDetected.add('Firebase');
  if (languages.python) frameworksDetected.add('Python');
  if (languages.sql) frameworksDetected.add('SQL');
  if (languages.typescript || languages.tsx) frameworksDetected.add('TypeScript');
  if (frameworksDetected.size === 0 && languages.html) frameworksDetected.add('HTML/CSS/JS Web');

  const summariesMap = new Map<string, RescueFileSummary>();
  const resolvedEdges = new Map<string, string[]>();
  const brokenImports: { fromPath: string; specifier: string; line: number }[] = [];
  const unlistedPackages: { fromPath: string; pkgName: string; line: number }[] = [];

  for (const p of allPaths) {
    const f = fileMap.get(p)!;
    const lang = detectLanguage(p, f.language);
    const extracted = extractImportsAndExports(p, f.content, lang);
    summariesMap.set(p, {
      fileId: f.id,
      path: p,
      language: lang,
      linesCount: f.content ? f.content.split('\n').length : 0,
      bytes: Buffer.byteLength(f.content, 'utf8'),
      imports: extracted.imports,
      importedBy: [],
      exports: extracted.exports,
      apiCalls: extracted.apiCalls,
      apiRoutes: extracted.apiRoutes,
    });
    resolvedEdges.set(p, []);
  }

  // Resolve edges & detect broken imports / missing packages
  for (const p of allPaths) {
    const f = fileMap.get(p)!;
    const summary = summariesMap.get(p)!;
    const lines = f.content.split('\n');

    for (const spec of summary.imports) {
      const lineIdx = lines.findIndex((l) => l.includes(spec));
      const lineNo = lineIdx >= 0 ? lineIdx + 1 : 1;

      if (spec.startsWith('.') || spec.startsWith('/')) {
        // Ignore API paths accidentally captured as HTML links
        if (spec.startsWith('/api/')) continue;
        const target = resolveRelativeImport(p, spec, allPathSet);
        if (target) {
          resolvedEdges.get(p)!.push(target);
          summariesMap.get(target)!.importedBy.push(p);
        } else {
          brokenImports.push({ fromPath: p, specifier: spec, line: lineNo });
        }
      } else if (summary.language === 'python') {
        if (!PYTHON_STDLIB.has(spec)) {
          const pyLocal = `${spec}.py`;
          const pyInit = `${spec}/__init__.py`;
          if (allPathSet.has(pyLocal)) {
            resolvedEdges.get(p)!.push(pyLocal);
            summariesMap.get(pyLocal)!.importedBy.push(p);
          } else if (allPathSet.has(pyInit)) {
            resolvedEdges.get(p)!.push(pyInit);
            summariesMap.get(pyInit)!.importedBy.push(p);
          }
        }
      } else if (packageJsonParsed && ['javascript', 'typescript', 'jsx', 'tsx'].includes(summary.language)) {
        const pkgName = spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : spec.split('/')[0];
        if (
          pkgName &&
          !NODE_BUILTINS.has(spec) &&
          !NODE_BUILTINS.has(pkgName) &&
          !declaredPkgSet.has(pkgName)
        ) {
          unlistedPackages.push({ fromPath: p, pkgName, line: lineNo });
        }
      }
    }
  }

  // Cycle detection (DFS)
  const circularDependencies: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const pathTrace: string[] = [];

  const dfs = (node: string) => {
    visited.add(node);
    stack.add(node);
    pathTrace.push(node);
    for (const next of resolvedEdges.get(node) || []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (stack.has(next)) {
        const cycleStart = pathTrace.indexOf(next);
        if (cycleStart >= 0 && circularDependencies.length < 10) {
          circularDependencies.push([...pathTrace.slice(cycleStart), next]);
        }
      }
    }
    stack.delete(node);
    pathTrace.pop();
  };

  for (const p of allPaths) {
    if (!visited.has(p)) dfs(p);
  }

  // Entrypoints & unreferenced files
  const entryPoints = allPaths.filter((p) => {
    const base = path.posix.basename(p).toLowerCase();
    return (
      base === 'index.html' ||
      base === 'main.tsx' ||
      base === 'main.ts' ||
      base === 'main.jsx' ||
      base === 'main.js' ||
      base === 'index.ts' ||
      base === 'index.js' ||
      base === 'app.tsx' ||
      base === 'app.py' ||
      base === 'main.py' ||
      base === 'server.ts' ||
      base === 'server.js'
    );
  });

  const unreferencedFiles = allPaths.filter((p) => {
    const summary = summariesMap.get(p)!;
    const base = path.posix.basename(p).toLowerCase();
    if (entryPoints.includes(p)) return false;
    if (
      base.endsWith('.json') ||
      base.endsWith('.md') ||
      base.startsWith('.env') ||
      base.includes('.test.') ||
      base.includes('.spec.') ||
      base.endsWith('.sql')
    ) {
      return false;
    }
    return summary.importedBy.length === 0 && allPaths.length > 1;
  });

  // API connections (Frontend fetch -> Backend route)
  const backendRoutesMap = new Map<string, string>();
  for (const s of summariesMap.values()) {
    for (const r of s.apiRoutes) {
      backendRoutesMap.set(r.replace(/\/+$/, ''), s.path);
    }
  }
  const hasBackendRouteFiles = backendRoutesMap.size > 0;
  const apiRouteConnections: RescueProjectIndex['apiRouteConnections'] = [];
  for (const s of summariesMap.values()) {
    for (const call of s.apiCalls) {
      const normalizedCall = call.replace(/\/+$/, '');
      let matched = backendRoutesMap.get(normalizedCall);
      if (!matched) {
        // Check parameterized Express route match e.g. /api/items/:id
        for (const [routePattern, backendFile] of backendRoutesMap.entries()) {
          const regexStr = '^' + routePattern.replace(/:[a-zA-Z0-9_]+/g, '[^/]+') + '$';
          if (new RegExp(regexStr).test(normalizedCall)) {
            matched = backendFile;
            break;
          }
        }
      }
      apiRouteConnections.push({
        frontendFile: s.path,
        endpoint: call,
        matchedBackendFile: matched,
        status: matched
          ? 'connected'
          : hasBackendRouteFiles
            ? 'unmatched_endpoint'
            : 'static_only',
      });
    }
  }

  return {
    index: {
      totalFiles: files.length,
      inspectedFiles: fileMap.size,
      skippedFiles,
      languages,
      frameworksDetected: Array.from(frameworksDetected),
      packageDependencies,
      entryPoints,
      files: Array.from(summariesMap.values()),
      circularDependencies,
      unreferencedFiles,
      apiRouteConnections,
    },
    fileMap,
    brokenImports,
    unlistedPackages,
    packageJsonParsed,
  };
}

function makeIssueId(prefix: string, seed: string): string {
  const hash = crypto.createHash('sha1').update(`${prefix}:${seed}`).digest('hex').slice(0, 8);
  return `${prefix}_${hash}`;
}

function runTscTempCheck(fileMap: Map<string, RescueWorkspaceFile>): {
  executed: boolean;
  note: string;
  diagnostics: { filePath: string; line: number; column: number; code: string; message: string }[];
} {
  const tscBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsc');
  if (!fs.existsSync(tscBin)) {
    return {
      executed: false,
      note: 'TypeScript CLI binary not present in this environment; fell back to esbuild + ESLint AST parsing.',
      diagnostics: [],
    };
  }

  const tsFiles = Array.from(fileMap.entries()).filter(([p]) =>
    /\.(ts|tsx|js|jsx)$/i.test(p),
  );
  if (tsFiles.length === 0) {
    return { executed: false, note: 'No TypeScript or JavaScript files in workspace.', diagnostics: [] };
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mideocode-rescue-'));
  try {
    for (const [relPath, file] of fileMap.entries()) {
      const safeRel = relPath.replace(/\.\./g, '_');
      const full = path.join(tmpRoot, safeRel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, file.content, 'utf8');
    }

    const args = [
      '--noEmit',
      '--allowJs',
      '--checkJs', 'false',
      '--target', 'ES2022',
      '--module', 'ESNext',
      '--moduleResolution', 'bundler',
      '--jsx', 'react-jsx',
      '--skipLibCheck',
      '--pretty', 'false',
      ...tsFiles.map(([relPath]) => relPath.replace(/\.\./g, '_')),
    ];

    const res = spawnSync(tscBin, args, {
      cwd: tmpRoot,
      encoding: 'utf8',
      timeout: 8000,
    });

    const output = `${res.stdout || ''}\n${res.stderr || ''}`;
    const parsed: { filePath: string; line: number; column: number; code: string; message: string }[] = [];
    const diagRegex = /^([^\s:(][^:(]*)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = diagRegex.exec(output)) !== null) {
      const filePath = m[1].replace(/\\/g, '/');
      const code = m[4];
      const msg = m[5].trim();
      // Skip external library resolution errors when node_modules aren't installed inside isolated temp workspace
      if (code === 'TS2307' && !msg.includes('./') && !msg.includes('../') && fileMap.has('package.json')) {
        continue;
      }
      if (code === 'TS2792' || code === 'TS2688' || code === 'TS7016') {
        continue;
      }
      if (fileMap.has(filePath)) {
        parsed.push({
          filePath,
          line: Number(m[2]),
          column: Number(m[3]),
          code,
          message: msg,
        });
      }
    }

    return {
      executed: true,
      note: `Executed TypeScript compiler check across ${tsFiles.length} file(s).`,
      diagnostics: parsed.slice(0, 30),
    };
  } catch (err) {
    return {
      executed: false,
      note: err instanceof Error ? err.message : 'TypeScript isolated check failed to execute.',
      diagnostics: [],
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export async function scanProjectWorkspace(input: {
  userId: string;
  projectId: string;
  projectTitle: string;
  scanMode: RescueScanMode;
  files: RescueWorkspaceFile[];
}): Promise<Omit<RescueScanReport, 'id' | 'createdAt'>> {
  const { index, fileMap, brokenImports, unlistedPackages } = buildProjectIndex(input.files);
  const issues: RescueIssue[] = [];
  const runtimeAudit: RescueRuntimeAudit[] = [];

  const eslintLinter = new Linter();

  // 1. JSON & Config Checks
  let jsonFilesCount = 0;
  for (const [filePath, file] of fileMap.entries()) {
    const lang = detectLanguage(filePath, file.language);
    if (lang === 'json') {
      jsonFilesCount += 1;
      try {
        JSON.parse(file.content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid JSON syntax';
        issues.push({
          id: makeIssueId('json', `${filePath}:${msg}`),
          title: `Malformed JSON in ${filePath}`,
          severity: filePath.endsWith('package.json') || filePath.endsWith('tsconfig.json') ? 'critical' : 'high',
          certainty: 'confirmed',
          confidence: 99,
          category: 'config',
          filePath,
          line: 1,
          evidenceSource: 'JSON.parse',
          summary: msg,
          beginnerExplanation: `The configuration file ${filePath} has a formatting mistake (such as a trailing comma or missing quote), so tools cannot read it.`,
          developerExplanation: `JSON.parse failed on ${filePath}: ${msg}. Fix invalid punctuation, unquoted keys, or trailing commas.`,
          relatedFiles: [],
          recommendedAction: `Fix the JSON syntax in ${filePath}.`,
          learnTopic: 'json',
        });
      }
    }
  }
  runtimeAudit.push({
    tool: 'JSON Configuration Validator',
    available: true,
    executed: jsonFilesCount > 0,
    note: jsonFilesCount > 0 ? `Parsed ${jsonFilesCount} JSON config file(s).` : 'No JSON files in workspace.',
  });

  // 2. Broken Relative Imports & Unlisted Packages
  for (const b of brokenImports) {
    issues.push({
      id: makeIssueId('imp', `${b.fromPath}:${b.specifier}`),
      title: `Broken import path "${b.specifier}"`,
      severity: 'critical',
      certainty: 'confirmed',
      confidence: 98,
      category: 'import',
      filePath: b.fromPath,
      line: b.line,
      symbolOrSnippet: b.specifier,
      evidenceSource: 'Dependency Graph Resolver',
      summary: `${b.fromPath} imports "${b.specifier}" on line ${b.line}, but no matching file exists in the project.`,
      beginnerExplanation: `${b.fromPath} tries to load a file named "${b.specifier}", but that file is missing or its folder path is misspelled.`,
      developerExplanation: `Unresolved module specifier "${b.specifier}" in ${b.fromPath}:${b.line}. Verify relative path depth, filename casing, and extension.`,
      relatedFiles: [],
      recommendedAction: `Update the import path on line ${b.line} or create the missing target file.`,
      learnTopic: 'modules',
    });
  }

  for (const u of unlistedPackages) {
    issues.push({
      id: makeIssueId('pkg', `${u.fromPath}:${u.pkgName}`),
      title: `Missing package "${u.pkgName}" in package.json`,
      severity: 'high',
      certainty: 'confirmed',
      confidence: 95,
      category: 'dependency',
      filePath: u.fromPath,
      line: u.line,
      symbolOrSnippet: u.pkgName,
      evidenceSource: 'package.json Cross-Reference',
      summary: `${u.fromPath} imports "${u.pkgName}", which is not declared in package.json.`,
      beginnerExplanation: `Your code uses an external library called "${u.pkgName}", but it isn't listed in your project's package.json dependency list yet.`,
      developerExplanation: `Module "${u.pkgName}" is imported at ${u.fromPath}:${u.line} without an entry in dependencies or devDependencies of package.json.`,
      relatedFiles: ['package.json'],
      recommendedAction: `Add "${u.pkgName}" to package.json dependencies or replace the import.`,
      learnTopic: 'npm',
    });
  }

  // 3. Real JS/TS/JSX/TSX Syntax Check via esbuild
  let esbuildChecked = 0;
  for (const [filePath, file] of fileMap.entries()) {
    const lang = detectLanguage(filePath, file.language);
    if (!['javascript', 'typescript', 'jsx', 'tsx', 'css'].includes(lang)) continue;
    esbuildChecked += 1;
    const loader = lang === 'typescript' ? 'ts' : lang === 'tsx' ? 'tsx' : lang === 'jsx' ? 'jsx' : lang === 'css' ? 'css' : 'js';
    try {
      transformSync(file.content, { loader, target: 'es2022', format: 'esm' });
    } catch (err: unknown) {
      const e = err as { errors?: { text: string; location?: { line?: number; column?: number; lineText?: string } }[]; message?: string };
      const first = e?.errors?.[0];
      const msg = first?.text || e?.message || 'Syntax error';
      const line = first?.location?.line || 1;
      const column = first?.location?.column || 0;
      issues.push({
        id: makeIssueId('syn', `${filePath}:${line}:${msg}`),
        title: `Syntax error in ${filePath} (line ${line})`,
        severity: 'critical',
        certainty: 'confirmed',
        confidence: 99,
        category: 'syntax',
        filePath,
        line,
        column,
        symbolOrSnippet: first?.location?.lineText?.trim(),
        evidenceSource: 'esbuild Parser',
        summary: msg,
        beginnerExplanation: `There is a typing or grammar mistake in ${filePath} near line ${line} (${msg}), preventing the code from running.`,
        developerExplanation: `esbuild ${loader} parser error at ${filePath}:${line}:${column} — ${msg}.`,
        relatedFiles: index.files.find((f) => f.path === filePath)?.importedBy || [],
        recommendedAction: `Fix the syntax error near line ${line} in ${filePath}.`,
        learnTopic: lang === 'css' ? 'css' : 'javascript',
      });
    }
  }
  runtimeAudit.push({
    tool: 'esbuild JS/TS/CSS Syntax Parser',
    available: true,
    executed: esbuildChecked > 0,
    note: esbuildChecked > 0 ? `Parsed ${esbuildChecked} JS/TS/JSX/TSX/CSS file(s).` : 'No JS/TS/CSS files in workspace.',
  });

  // 4. Real Python AST Check
  const pyFiles = Array.from(fileMap.entries()).filter(([p]) => detectLanguage(p) === 'python');
  const pythonCheck = spawnSync('python3', ['--version'], { encoding: 'utf8', timeout: 1500 });
  const pythonAvailable = pythonCheck.status === 0;
  if (pyFiles.length > 0 && pythonAvailable) {
    for (const [filePath, file] of pyFiles) {
      const pyScript = `
import ast, json
src = ${JSON.stringify(file.content)}
try:
    ast.parse(src, filename=${JSON.stringify(filePath)})
    print("__RESCUE_PY__" + json.dumps({"ok": True}))
except SyntaxError as e:
    print("__RESCUE_PY__" + json.dumps({"ok": False, "msg": e.msg, "line": e.lineno or 1, "col": e.offset or 0, "text": (e.text or "").strip()}))
`;
      const run = spawnSync('python3', ['-I', '-S', '-c', pyScript], {
        encoding: 'utf8',
        timeout: 1500,
        env: {},
      });
      const markerIdx = (run.stdout || '').lastIndexOf('__RESCUE_PY__');
      if (markerIdx !== -1) {
        try {
          const parsed = JSON.parse(run.stdout.slice(markerIdx + '__RESCUE_PY__'.length)) as {
            ok: boolean;
            msg?: string;
            line?: number;
            col?: number;
            text?: string;
          };
          if (!parsed.ok) {
            issues.push({
              id: makeIssueId('py', `${filePath}:${parsed.line}:${parsed.msg}`),
              title: `Python SyntaxError in ${filePath} (line ${parsed.line})`,
              severity: 'critical',
              certainty: 'confirmed',
              confidence: 99,
              category: 'syntax',
              filePath,
              line: parsed.line || 1,
              column: parsed.col || 0,
              symbolOrSnippet: parsed.text,
              evidenceSource: 'Python 3 ast.parse',
              summary: parsed.msg || 'Invalid Python syntax',
              beginnerExplanation: `Python could not read ${filePath} around line ${parsed.line} because of a syntax error (like missing a colon ':' or mismatched indentation).`,
              developerExplanation: `Python ast.parse raised SyntaxError at ${filePath}:${parsed.line}:${parsed.col} — ${parsed.msg}.`,
              relatedFiles: [],
              recommendedAction: `Fix the Python syntax near line ${parsed.line} in ${filePath}.`,
              learnTopic: 'python',
            });
          }
        } catch {
          // Ignore parse error on marker
        }
      }
    }
    runtimeAudit.push({
      tool: 'Python 3 AST Parser (isolated)',
      available: true,
      executed: true,
      note: `Checked ${pyFiles.length} Python file(s) with python3 -I -S.`,
    });
  } else {
    runtimeAudit.push({
      tool: 'Python 3 AST Parser',
      available: pythonAvailable,
      executed: false,
      note: pyFiles.length === 0 ? 'No Python files in workspace.' : 'Python 3 runtime is unavailable on server; static import scan only.',
    });
  }

  // 5. Real SQLite SQL Validation
  const sqlFiles = Array.from(fileMap.entries()).filter(([p]) => detectLanguage(p) === 'sql');
  if (sqlFiles.length > 0 && pythonAvailable) {
    for (const [filePath, file] of sqlFiles) {
      const pySql = `
import sqlite3, json
sql = ${JSON.stringify(file.content)}
try:
    conn = sqlite3.connect(":memory:")
    conn.executescript(sql)
    print("__RESCUE_SQL__" + json.dumps({"ok": True}))
except Exception as e:
    print("__RESCUE_SQL__" + json.dumps({"ok": False, "error": str(e)}))
`;
      const run = spawnSync('python3', ['-I', '-S', '-c', pySql], {
        encoding: 'utf8',
        timeout: 1500,
        env: {},
      });
      const markerIdx = (run.stdout || '').lastIndexOf('__RESCUE_SQL__');
      if (markerIdx !== -1) {
        try {
          const parsed = JSON.parse(run.stdout.slice(markerIdx + '__RESCUE_SQL__'.length)) as {
            ok: boolean;
            error?: string;
          };
          if (!parsed.ok) {
            issues.push({
              id: makeIssueId('sql', `${filePath}:${parsed.error}`),
              title: `SQL Execution Error in ${filePath}`,
              severity: 'high',
              certainty: 'confirmed',
              confidence: 95,
              category: 'database',
              filePath,
              line: 1,
              evidenceSource: 'SQLite In-Memory Engine',
              summary: parsed.error || 'SQL execution failed.',
              beginnerExplanation: `When running the database commands in ${filePath}, SQLite reported an error: ${parsed.error}.`,
              developerExplanation: `In-memory SQLite validation of ${filePath} failed: ${parsed.error}. Check table creation order, column names, and SQL keywords.`,
              relatedFiles: [],
              recommendedAction: `Fix the SQL statement in ${filePath}.`,
              learnTopic: 'sql',
            });
          }
        } catch {
          // Ignore marker error
        }
      }
    }
    runtimeAudit.push({
      tool: 'SQLite In-Memory SQL Validator',
      available: true,
      executed: true,
      note: `Executed ${sqlFiles.length} SQL script(s) inside isolated :memory: SQLite.`,
    });
  } else {
    runtimeAudit.push({
      tool: 'SQLite In-Memory SQL Validator',
      available: pythonAvailable,
      executed: false,
      note: sqlFiles.length === 0 ? 'No SQL files in workspace.' : 'SQLite runtime unavailable.',
    });
  }

  // Deep & Full Scan Checks
  if (input.scanMode === 'deep' || input.scanMode === 'full') {
    // 6. ESLint Static AST Checks on JS/TS
    let eslintChecked = 0;
    for (const [filePath, file] of fileMap.entries()) {
      const lang = detectLanguage(filePath, file.language);
      if (!['javascript', 'typescript', 'jsx', 'tsx'].includes(lang)) continue;
      // Skip if esbuild failed syntax already
      if (issues.some((i) => i.filePath === filePath && i.category === 'syntax')) continue;

      let jsCode = file.content;
      if (lang === 'typescript' || lang === 'tsx' || lang === 'jsx') {
        try {
          const out = transformSync(file.content, {
            loader: lang === 'typescript' ? 'ts' : lang === 'tsx' ? 'tsx' : 'jsx',
            target: 'es2022',
            format: 'esm',
          });
          jsCode = out.code;
        } catch {
          continue;
        }
      }
      eslintChecked += 1;
      const messages = eslintLinter.verify(jsCode, [
        {
          languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
              window: 'readonly',
              document: 'readonly',
              console: 'readonly',
              fetch: 'readonly',
              localStorage: 'readonly',
              sessionStorage: 'readonly',
              setTimeout: 'readonly',
              clearTimeout: 'readonly',
              setInterval: 'readonly',
              clearInterval: 'readonly',
              URL: 'readonly',
              Blob: 'readonly',
              Promise: 'readonly',
              Set: 'readonly',
              Map: 'readonly',
              process: 'readonly',
              Buffer: 'readonly',
              Math: 'readonly',
              Date: 'readonly',
              JSON: 'readonly',
              Array: 'readonly',
              Object: 'readonly',
              Error: 'readonly',
              alert: 'readonly',
            },
          },
          rules: {
            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-dupe-keys': 'error',
            'no-constant-condition': 'warn',
            'no-unused-vars': 'warn',
            'eqeqeq': ['warn', 'smart'],
          },
        },
      ]);

      for (const m of messages.slice(0, 5)) {
        const isError = m.severity === 2;
        issues.push({
          id: makeIssueId('eslint', `${filePath}:${m.line}:${m.ruleId}:${m.message}`),
          title: `${m.ruleId || 'Static check'}: ${m.message}`,
          severity: isError ? 'high' : m.ruleId === 'no-unused-vars' ? 'low' : 'medium',
          certainty: 'confirmed',
          confidence: isError ? 92 : 85,
          category: m.ruleId === 'no-undef' ? 'runtime' : 'architecture',
          filePath,
          line: m.line,
          column: m.column,
          evidenceSource: `ESLint (${m.ruleId})`,
          summary: `${m.message} at ${filePath}:${m.line}`,
          beginnerExplanation:
            m.ruleId === 'no-undef'
              ? `You used a name in ${filePath} (line ${m.line}) that hasn't been created or imported yet: ${m.message}`
              : `Code quality check flagged a potential issue in ${filePath} at line ${m.line}: ${m.message}`,
          developerExplanation: `ESLint rule "${m.ruleId}" reported in ${filePath}:${m.line}:${m.column}: ${m.message}`,
          relatedFiles: [],
          recommendedAction: `Review line ${m.line} in ${filePath} and declare, import, or clean up the symbol.`,
          learnTopic: 'javascript',
        });
      }
    }
    runtimeAudit.push({
      tool: 'ESLint AST Static Analyzer',
      available: true,
      executed: eslintChecked > 0,
      note: eslintChecked > 0 ? `Analyzed ${eslintChecked} JS/TS module(s).` : 'No valid JS/TS files available for AST lint.',
    });

    // 7. TypeScript Semantic Type Checker
    const tscRes = runTscTempCheck(fileMap);
    runtimeAudit.push({
      tool: 'TypeScript Compiler (tsc --noEmit)',
      available: fs.existsSync(path.resolve(process.cwd(), 'node_modules', '.bin', 'tsc')),
      executed: tscRes.executed,
      note: tscRes.note,
    });
    for (const d of tscRes.diagnostics) {
      if (issues.some((i) => i.filePath === d.filePath && i.line === d.line && i.category === 'syntax')) continue;
      issues.push({
        id: makeIssueId('tsc', `${d.filePath}:${d.line}:${d.code}`),
        title: `TypeScript ${d.code} in ${d.filePath} (line ${d.line})`,
        severity: 'high',
        certainty: 'confirmed',
        confidence: 96,
        category: 'type',
        filePath: d.filePath,
        line: d.line,
        column: d.column,
        evidenceSource: `tsc ${d.code}`,
        summary: d.message,
        beginnerExplanation: `TypeScript caught a type mismatch in ${d.filePath} at line ${d.line}: ${d.message}`,
        developerExplanation: `TypeScript compiler diagnostic ${d.code} at ${d.filePath}:${d.line}:${d.column} — ${d.message}`,
        relatedFiles: index.files.find((f) => f.path === d.filePath)?.importedBy || [],
        recommendedAction: `Align the type annotation or passed value at ${d.filePath}:${d.line}.`,
        learnTopic: 'typescript',
      });
    }

    // 8. Circular dependencies & API route mismatches
    for (const cycle of index.circularDependencies) {
      issues.push({
        id: makeIssueId('cycle', cycle.join('->')),
        title: `Circular dependency cycle detected`,
        severity: 'medium',
        certainty: 'confirmed',
        confidence: 94,
        category: 'architecture',
        filePath: cycle[0],
        evidenceSource: 'Import Graph DFS',
        summary: `Import cycle: ${cycle.join(' -> ')}`,
        beginnerExplanation: `Two or more files import each other in a loop (${cycle.join(' -> ')}), which can cause undefined variables at startup.`,
        developerExplanation: `Circular ESM dependency detected across [${cycle.join(' -> ')}]. Extract shared types or helpers into a separate module.`,
        relatedFiles: cycle.slice(1),
        recommendedAction: `Extract shared code from ${cycle[0]} into a common module to break the cycle.`,
        learnTopic: 'architecture',
      });
    }

    for (const conn of index.apiRouteConnections) {
      if (conn.status === 'unmatched_endpoint') {
        issues.push({
          id: makeIssueId('api', `${conn.frontendFile}:${conn.endpoint}`),
          title: `Frontend calls unmatched API "${conn.endpoint}"`,
          severity: 'high',
          certainty: 'possible',
          confidence: 80,
          category: 'api_integration',
          filePath: conn.frontendFile,
          evidenceSource: 'Frontend/Backend Route Matcher',
          summary: `${conn.frontendFile} requests "${conn.endpoint}", which does not match any detected route in the inspected backend files.`,
          beginnerExplanation: `The frontend file ${conn.frontendFile} tries to talk to "${conn.endpoint}", but no matching backend route was found in your server files.`,
          developerExplanation: `API call to "${conn.endpoint}" in ${conn.frontendFile} has no matching Express/FastAPI route handler in inspected backend files.`,
          relatedFiles: index.files.filter((f) => f.apiRoutes.length > 0).map((f) => f.path),
          recommendedAction: `Verify the route path spelling or register "${conn.endpoint}" on the backend.`,
          learnTopic: 'api',
        });
      }
    }

    for (const orphan of index.unreferencedFiles.slice(0, 6)) {
      issues.push({
        id: makeIssueId('orphan', orphan),
        title: `Unreferenced module "${orphan}"`,
        severity: 'suggestion',
        certainty: 'possible',
        confidence: 70,
        category: 'architecture',
        filePath: orphan,
        evidenceSource: 'Import Graph Analysis',
        summary: `No inspected file imports "${orphan}".`,
        beginnerExplanation: `The file ${orphan} isn't imported anywhere else in the project yet—it might be unused or waiting to be connected.`,
        developerExplanation: `Zero incoming import edges found for ${orphan}. Confirm whether it is an external entrypoint or dead code.`,
        relatedFiles: [],
        recommendedAction: `Connect ${orphan} where needed or remove it if obsolete.`,
      });
    }
  }

  // Full Scan: Security, Secrets, Performance, plus Gemini Holistic Insight
  if (input.scanMode === 'full') {
    for (const [filePath, file] of fileMap.entries()) {
      const content = file.content;
      const lines = content.split('\n');

      lines.forEach((lineText, idx) => {
        const lineNo = idx + 1;
        if (/\b(?:AIza[0-9A-Za-z\-_]{25,}|sk-[A-Za-z0-9\-_]{16,}|ghp_[A-Za-z0-9]{20,})\b/.test(lineText) ||
            (/\b(?:API_KEY|SECRET_KEY|PASSWORD|PRIVATE_KEY)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(lineText) && !filePath.includes('.example'))) {
          issues.push({
            id: makeIssueId('sec', `${filePath}:${lineNo}`),
            title: `Possible hardcoded secret or credential in ${filePath}`,
            severity: 'critical',
            certainty: 'confirmed',
            confidence: 93,
            category: 'security',
            filePath,
            line: lineNo,
            evidenceSource: 'Secret Hygiene Scanner',
            summary: `Potential credential or API key literal detected at ${filePath}:${lineNo}.`,
            beginnerExplanation: `Line ${lineNo} in ${filePath} looks like it contains a real password or API key written directly in code. Anyone reading the code could steal it.`,
            developerExplanation: `Hardcoded credential pattern detected at ${filePath}:${lineNo}. Move secrets into server-side environment variables (.env) and rotate exposed keys.`,
            relatedFiles: [],
            recommendedAction: `Move the credential to a server-side environment variable immediately.`,
            learnTopic: 'security',
          });
        }

        if (/\.innerHTML\s*=|dangerouslySetInnerHTML/.test(lineText)) {
          issues.push({
            id: makeIssueId('xss', `${filePath}:${lineNo}`),
            title: `Unsafe HTML injection sink in ${filePath} (line ${lineNo})`,
            severity: 'medium',
            certainty: 'possible',
            confidence: 76,
            category: 'security',
            filePath,
            line: lineNo,
            symbolOrSnippet: lineText.trim().slice(0, 120),
            evidenceSource: 'Static Security Pattern',
            summary: `Direct HTML assignment found at ${filePath}:${lineNo}; verify inputs are sanitized or use textContent/JSX.`,
            beginnerExplanation: `Inserting raw HTML strings directly into the page (line ${lineNo}) can let attackers run malicious scripts if user input gets inside.`,
            developerExplanation: `XSS sink (.innerHTML / dangerouslySetInnerHTML) at ${filePath}:${lineNo}. Prefer textContent or sanitize untrusted content before rendering.`,
            relatedFiles: [],
            recommendedAction: `Use textContent or React JSX escaping instead of raw HTML injection.`,
            learnTopic: 'security',
          });
        }

        if (/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,160}set[A-Z]\w*\(/.test(lineText)) {
          issues.push({
            id: makeIssueId('perf', `${filePath}:${lineNo}`),
            title: `Review React useEffect dependency list at ${filePath}:${lineNo}`,
            severity: 'low',
            certainty: 'possible',
            confidence: 65,
            category: 'performance',
            filePath,
            line: lineNo,
            evidenceSource: 'React Hook Pattern Check',
            summary: `Ensure state setter inside useEffect has an explicit dependency array to avoid repeated re-render loops.`,
            beginnerExplanation: `A React useEffect block on line ${lineNo} updates state. If it is missing a dependency array '[]', it can re-run endlessly and slow down the browser.`,
            developerExplanation: `Inspect the dependency array of useEffect around ${filePath}:${lineNo} to prevent infinite render cycles.`,
            relatedFiles: [],
            recommendedAction: `Verify the dependency array of useEffect at line ${lineNo}.`,
            learnTopic: 'react',
          });
        }
      });
    }
  }

  // Deduplicate by ID
  const dedupedMap = new Map<string, RescueIssue>();
  for (const iss of issues) {
    if (!dedupedMap.has(iss.id)) {
      dedupedMap.set(iss.id, iss);
    }
  }
  const uniqueIssues = Array.from(dedupedMap.values());

  // Sort by severity then certainty
  const sevRank: Record<RescueSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    suggestion: 4,
  };
  uniqueIssues.sort((a, b) => {
    if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity];
    if (a.certainty !== b.certainty) return a.certainty === 'confirmed' ? -1 : 1;
    return b.confidence - a.confidence;
  });

  const cappedIssues = uniqueIssues.slice(0, 40);

  const severityCounts = {
    critical: cappedIssues.filter((i) => i.severity === 'critical').length,
    high: cappedIssues.filter((i) => i.severity === 'high').length,
    medium: cappedIssues.filter((i) => i.severity === 'medium').length,
    low: cappedIssues.filter((i) => i.severity === 'low').length,
    suggestion: cappedIssues.filter((i) => i.severity === 'suggestion').length,
  };
  const confirmedCount = cappedIssues.filter((i) => i.certainty === 'confirmed').length;
  const potentialCount = cappedIssues.filter((i) => i.certainty === 'possible').length;

  const penalty =
    severityCounts.critical * 18 +
    severityCounts.high * 10 +
    severityCounts.medium * 5 +
    severityCounts.low * 2;
  const healthScore = Math.max(8, Math.min(100, 100 - penalty));

  let summary =
    cappedIssues.length === 0
      ? `Inspected ${index.inspectedFiles} file(s) across ${index.frameworksDetected.join(', ') || 'your project'}. Zero syntax, import, or configuration blockers detected.`
      : `Inspected ${index.inspectedFiles} file(s). Found ${confirmedCount} confirmed issue(s) and ${potentialCount} potential issue(s) (${severityCounts.critical} critical, ${severityCounts.high} high).`;

  let recommendedRepairOrder: string[] = cappedIssues
    .slice(0, 6)
    .map((i, idx) => `${idx + 1}. [${i.severity.toUpperCase()}] ${i.title} (${i.filePath}${i.line ? `:${i.line}` : ''})`);

  let suggestedImprovements: string[] = [
    ...(index.unreferencedFiles.length > 0
      ? [`Review ${index.unreferencedFiles.length} unreferenced file(s) for dead code or missing imports.`]
      : []),
    ...(index.circularDependencies.length > 0
      ? ['Break circular module imports by extracting shared interfaces into a neutral file.']
      : []),
    'Create a Version History snapshot or run TestLab verification after applying code changes.',
  ];

  // Optional AI holistic summary on deep/full scans when Gemini is configured
  const ai = getAiClient();
  if ((input.scanMode === 'deep' || input.scanMode === 'full') && ai && index.inspectedFiles > 0) {
    try {
      const compactManifest = index.files.slice(0, 35).map((f) => ({
        path: f.path,
        language: f.language,
        imports: f.imports.slice(0, 10),
        apiCalls: f.apiCalls,
        apiRoutes: f.apiRoutes,
      }));
      const compactIssues = cappedIssues.slice(0, 15).map((i) => ({
        title: i.title,
        severity: i.severity,
        certainty: i.certainty,
        filePath: i.filePath,
        line: i.line,
        summary: i.summary,
      }));
      const aiResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze this scanned project summary and return JSON with an executive summary, prioritized repair order, and up to 4 concrete architectural suggestions. Never invent files or claim checks outside the provided manifest.\nProject: ${input.projectTitle}\nFrameworks: ${index.frameworksDetected.join(', ')}\nFiles: ${JSON.stringify(compactManifest)}\nDetected Issues: ${JSON.stringify(compactIssues)}`,
        config: {
          systemInstruction:
            'You are MideoCode Project Rescue AI. Base conclusions strictly on the provided project manifest and verified diagnostics.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              recommendedRepairOrder: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestedImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['summary', 'recommendedRepairOrder', 'suggestedImprovements'],
          },
        },
      });
      const parsed = JSON.parse((aiResp.text || '{}').trim()) as {
        summary?: string;
        recommendedRepairOrder?: string[];
        suggestedImprovements?: string[];
      };
      if (parsed.summary) summary = parsed.summary.slice(0, 3800);
      if (Array.isArray(parsed.recommendedRepairOrder) && parsed.recommendedRepairOrder.length > 0) {
        recommendedRepairOrder = parsed.recommendedRepairOrder.slice(0, 10);
      }
      if (Array.isArray(parsed.suggestedImprovements) && parsed.suggestedImprovements.length > 0) {
        suggestedImprovements = parsed.suggestedImprovements.slice(0, 8);
      }
      runtimeAudit.push({
        tool: 'Gemini Project Rescue Analyzer',
        available: true,
        executed: true,
        note: 'Synthesized cross-file priorities and repair order from inspected project context.',
      });
    } catch {
      runtimeAudit.push({
        tool: 'Gemini Project Rescue Analyzer',
        available: true,
        executed: false,
        note: 'AI synthesis encountered a temporary upstream error; deterministic diagnostics completed.',
      });
    }
  } else {
    runtimeAudit.push({
      tool: 'Gemini Project Rescue Analyzer',
      available: Boolean(ai),
      executed: false,
      note:
        input.scanMode === 'quick'
          ? 'Skipped in Quick Scan for speed; run Deep or Full Scan for AI synthesis.'
          : 'GEMINI_API_KEY not configured on server; deterministic checks completed.',
    });
  }

  return {
    userId: input.userId,
    projectId: input.projectId,
    projectTitle: input.projectTitle.slice(0, 140),
    scanMode: input.scanMode,
    healthScore,
    filesInspected: index.inspectedFiles,
    confirmedCount,
    potentialCount,
    severityCounts,
    summary,
    recommendedRepairOrder,
    suggestedImprovements,
    projectIndex: index,
    issues: cappedIssues,
    runtimeAudit,
  };
}

function selectRelevantFiles(
  fileMap: Map<string, RescueWorkspaceFile>,
  index: RescueProjectIndex,
  focusFilePath?: string,
  problemText?: string,
  maxFiles = 6,
): { path: string; content: string }[] {
  const chosen = new Set<string>();
  if (focusFilePath && fileMap.has(focusFilePath)) {
    chosen.add(focusFilePath);
    const meta = index.files.find((f) => f.path === focusFilePath);
    if (meta) {
      for (const imp of meta.imports) {
        for (const candidate of fileMap.keys()) {
          if (candidate.includes(imp.replace(/^\.\//, '')) && chosen.size < maxFiles) {
            chosen.add(candidate);
          }
        }
      }
      for (const by of meta.importedBy) {
        if (chosen.size < maxFiles) chosen.add(by);
      }
    }
  }

  if (problemText) {
    const lowerProblem = problemText.toLowerCase();
    for (const p of fileMap.keys()) {
      if (chosen.size >= maxFiles) break;
      const base = path.posix.basename(p).toLowerCase();
      if (lowerProblem.includes(p.toLowerCase()) || lowerProblem.includes(base)) {
        chosen.add(p);
      }
    }
  }

  if (fileMap.has('package.json') && chosen.size < maxFiles) {
    chosen.add('package.json');
  }

  for (const ep of index.entryPoints) {
    if (chosen.size >= maxFiles) break;
    chosen.add(ep);
  }

  for (const p of fileMap.keys()) {
    if (chosen.size >= maxFiles) break;
    chosen.add(p);
  }

  return Array.from(chosen).map((p) => ({
    path: p,
    content: redactSecrets(fileMap.get(p)!.content, p).slice(0, 14000),
  }));
}

export async function investigateProjectIssue(input: {
  projectTitle: string;
  files: RescueWorkspaceFile[];
  issue?: RescueIssue | null;
  userProblemDescription?: string;
}): Promise<RescueRootCauseAnalysis> {
  const { index, fileMap } = buildProjectIndex(input.files);
  const focusPath = input.issue?.filePath;
  const problemDesc = input.userProblemDescription || input.issue?.summary || input.issue?.title || 'Investigate project issue';

  const relevantFiles = selectRelevantFiles(fileMap, index, focusPath, problemDesc, 6);
  const inspectedFilesList = Array.from(fileMap.keys());
  const unverifiedScopeNotes: string[] = [];
  if (index.skippedFiles.length > 0) {
    unverifiedScopeNotes.push(`${index.skippedFiles.length} file(s) skipped due to per-file size cap.`);
  }
  unverifiedScopeNotes.push('Live external database/network endpoints and user browser runtime logs outside MideoCode workspace were not directly executed.');

  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const prompt = `
Investigate this project problem deeply and identify the root cause without simply repeating the error message.

Project: ${input.projectTitle}
Frameworks detected: ${index.frameworksDetected.join(', ') || 'Unknown'}
All inspected workspace files (${inspectedFilesList.length}): ${inspectedFilesList.join(', ')}

Dependency overview:
${JSON.stringify(
  index.files.map((f) => ({
    path: f.path,
    imports: f.imports,
    importedBy: f.importedBy,
    exports: f.exports,
    apiCalls: f.apiCalls,
    apiRoutes: f.apiRoutes,
  })),
)}

Reported Problem / Issue:
${input.issue ? JSON.stringify(input.issue) : problemDesc}
Additional User Symptom: ${input.userProblemDescription || 'None'}

Relevant File Contents (secrets redacted):
${relevantFiles.map((f) => `--- FILE: ${f.path} ---\n${f.content}`).join('\n\n')}

Rules:
- Clearly separate CONFIRMED causes (directly proven by code/imports/diagnostics in the inspected files) from POSSIBLE causes (hypotheses needing runtime verification).
- Never claim to have inspected files not in the workspace list above.
- Provide both a plain-English Beginner Explanation and a technical Developer Explanation.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are MideoCode Project Rescue AI. Return accurate, evidence-backed root cause analysis in strict JSON.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          problemTitle: { type: Type.STRING },
          certainty: { type: Type.STRING, enum: ['confirmed', 'possible'] },
          confidence: { type: Type.INTEGER },
          whatIsHappening: { type: Type.STRING },
          confirmedCauses: { type: Type.ARRAY, items: { type: Type.STRING } },
          possibleCauses: { type: Type.ARRAY, items: { type: Type.STRING } },
          responsibleFile: { type: Type.STRING },
          affectedFiles: { type: Type.ARRAY, items: { type: Type.STRING } },
          whyItOccurred: { type: Type.STRING },
          safestSolution: { type: Type.STRING },
          beginnerExplanation: { type: Type.STRING },
          developerExplanation: { type: Type.STRING },
          learnKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          'problemTitle',
          'certainty',
          'confidence',
          'whatIsHappening',
          'confirmedCauses',
          'possibleCauses',
          'responsibleFile',
          'affectedFiles',
          'whyItOccurred',
          'safestSolution',
          'beginnerExplanation',
          'developerExplanation',
          'learnKeywords',
        ],
      },
    },
  });

  const raw = JSON.parse((response.text || '{}').trim()) as Partial<RescueRootCauseAnalysis>;
  const safeResponsible =
    raw.responsibleFile && fileMap.has(raw.responsibleFile)
      ? raw.responsibleFile
      : focusPath && fileMap.has(focusPath)
        ? focusPath
        : relevantFiles[0]?.path || inspectedFilesList[0] || 'unknown';

  return {
    issueId: input.issue?.id,
    problemTitle: raw.problemTitle || input.issue?.title || 'Root Cause Investigation',
    certainty: raw.certainty === 'confirmed' ? 'confirmed' : 'possible',
    confidence: Math.max(15, Math.min(99, Number(raw.confidence) || (input.issue?.confidence ?? 75))),
    whatIsHappening: raw.whatIsHappening || 'Investigation completed across related project files.',
    confirmedCauses: Array.isArray(raw.confirmedCauses) ? raw.confirmedCauses : [],
    possibleCauses: Array.isArray(raw.possibleCauses) ? raw.possibleCauses : [],
    responsibleFile: safeResponsible,
    affectedFiles: Array.isArray(raw.affectedFiles)
      ? raw.affectedFiles.filter((p) => fileMap.has(p))
      : [],
    whyItOccurred: raw.whyItOccurred || '',
    safestSolution: raw.safestSolution || '',
    beginnerExplanation: raw.beginnerExplanation || '',
    developerExplanation: raw.developerExplanation || '',
    learnKeywords: Array.isArray(raw.learnKeywords) ? raw.learnKeywords.slice(0, 6) : [],
    inspectedFilesList,
    unverifiedScopeNotes,
  };
}

export function analyzeFixImpact(
  files: RescueWorkspaceFile[],
  targetPath: string,
  proposedCode: string,
): RescueImpactReport {
  const { index, fileMap } = buildProjectIndex(files);
  const originalFile = fileMap.get(targetPath);
  const origSummary = index.files.find((f) => f.path === targetPath);
  const dependentFiles = origSummary?.importedBy || [];
  const lang = detectLanguage(targetPath, originalFile?.language);

  const newExtracted = extractImportsAndExports(targetPath, proposedCode, lang);
  const oldExports = new Set(origSummary?.exports || []);
  const newExports = new Set(newExtracted.exports);
  const removedOrChangedExports: string[] = [];
  for (const exp of oldExports) {
    if (!newExports.has(exp)) {
      removedOrChangedExports.push(exp);
    }
  }

  const potentialConflicts: string[] = [];
  if (removedOrChangedExports.length > 0 && dependentFiles.length > 0) {
    for (const dep of dependentFiles) {
      const depContent = fileMap.get(dep)?.content || '';
      for (const exp of removedOrChangedExports) {
        if (exp !== 'default' && depContent.includes(exp)) {
          potentialConflicts.push(`${dep} references removed export "${exp}".`);
        }
      }
    }
  }

  const preFlightChecks: RescueImpactReport['preFlightChecks'] = [];
  let preFlightPassed = true;

  // Run real syntax check on proposedCode
  if (['javascript', 'typescript', 'jsx', 'tsx', 'css'].includes(lang)) {
    const loader = lang === 'typescript' ? 'ts' : lang === 'tsx' ? 'tsx' : lang === 'jsx' ? 'jsx' : lang === 'css' ? 'css' : 'js';
    try {
      transformSync(proposedCode, { loader, target: 'es2022', format: 'esm' });
      preFlightChecks.push({
        checkName: 'esbuild Syntax Pre-Flight',
        executed: true,
        passed: true,
        details: `Proposed ${targetPath} parsed cleanly with 0 syntax errors.`,
      });
    } catch (err) {
      preFlightPassed = false;
      preFlightChecks.push({
        checkName: 'esbuild Syntax Pre-Flight',
        executed: true,
        passed: false,
        details: err instanceof Error ? err.message : 'Syntax error in proposed code.',
      });
    }
  } else if (lang === 'json') {
    try {
      JSON.parse(proposedCode);
      preFlightChecks.push({
        checkName: 'JSON Parse Pre-Flight',
        executed: true,
        passed: true,
        details: 'Valid JSON structure confirmed.',
      });
    } catch (err) {
      preFlightPassed = false;
      preFlightChecks.push({
        checkName: 'JSON Parse Pre-Flight',
        executed: true,
        passed: false,
        details: err instanceof Error ? err.message : 'Invalid JSON in proposed code.',
      });
    }
  } else if (lang === 'python') {
    const pyCheck = spawnSync('python3', ['--version'], { encoding: 'utf8', timeout: 1000 });
    if (pyCheck.status === 0) {
      const res = spawnSync(
        'python3',
        ['-I', '-S', '-c', `import ast; ast.parse(${JSON.stringify(proposedCode)})`],
        { encoding: 'utf8', timeout: 1500, env: {} },
      );
      const ok = res.status === 0;
      if (!ok) preFlightPassed = false;
      preFlightChecks.push({
        checkName: 'Python AST Pre-Flight',
        executed: true,
        passed: ok,
        details: ok ? 'Python ast.parse succeeded.' : (res.stderr || 'Python syntax check failed.'),
      });
    } else {
      preFlightChecks.push({
        checkName: 'Python AST Pre-Flight',
        executed: false,
        passed: true,
        details: 'Python 3 unavailable; static diff preview only.',
      });
    }
  }

  // Re-check patched import resolution
  const patchedFiles = files.map((f) =>
    normalizeRescuePath(f) === targetPath ? { ...f, content: proposedCode } : f,
  );
  const patchedIndex = buildProjectIndex(patchedFiles);
  const remainingTargetBroken = patchedIndex.brokenImports.filter((b) => b.fromPath === targetPath);
  if (remainingTargetBroken.length > 0) {
    preFlightPassed = false;
    for (const b of remainingTargetBroken) {
      potentialConflicts.push(`Proposed code still imports unresolved path "${b.specifier}" (line ${b.line}).`);
    }
  }
  preFlightChecks.push({
    checkName: 'Import Graph Resolution',
    executed: true,
    passed: remainingTargetBroken.length === 0,
    details:
      remainingTargetBroken.length === 0
        ? `All relative imports in ${targetPath} resolve cleanly.`
        : `${remainingTargetBroken.length} unresolved import(s) remain in ${targetPath}.`,
  });

  if (potentialConflicts.length > 0) {
    preFlightPassed = false;
  }

  return {
    dependentFiles,
    affectedFeatures: [
      ...(origSummary?.apiRoutes.length ? ['Backend API routes'] : []),
      ...(origSummary?.apiCalls.length ? ['Frontend API integration'] : []),
      ...(dependentFiles.length > 0 ? [`${dependentFiles.length} dependent module(s)`] : ['Isolated module']),
    ],
    removedOrChangedExports,
    preFlightPassed,
    preFlightChecks,
    potentialConflicts,
  };
}

export async function proposeFixAndAnalyzeImpact(input: {
  projectTitle: string;
  files: RescueWorkspaceFile[];
  targetFilePath: string;
  problemDescription: string;
  rootCause?: RescueRootCauseAnalysis | null;
  issueId?: string;
}): Promise<RescueFixProposal> {
  const { index, fileMap } = buildProjectIndex(input.files);
  const targetFile = fileMap.get(input.targetFilePath);
  if (!targetFile) {
    throw new Error(`Target file "${input.targetFilePath}" does not exist in this project.`);
  }

  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const related = selectRelevantFiles(fileMap, index, input.targetFilePath, input.problemDescription, 4)
    .filter((f) => f.path !== input.targetFilePath);

  const redactedOriginal = redactSecrets(targetFile.content, input.targetFilePath);

  const prompt = `
Generate a safe, minimal, complete corrected file for ${input.targetFilePath} to fix the identified problem.

Project: ${input.projectTitle}
Problem Identified: ${input.problemDescription}
${input.rootCause ? `Root Cause Context: ${JSON.stringify({ whatIsHappening: input.rootCause.whatIsHappening, responsibleFile: input.rootCause.responsibleFile, safestSolution: input.rootCause.safestSolution })}` : ''}

Target File (${input.targetFilePath}) Current Content:
\`\`\`
${redactedOriginal.slice(0, 20000)}
\`\`\`

Related / Dependent Files:
${related.map((r) => `--- ${r.path} ---\n${r.content.slice(0, 6000)}`).join('\n\n')}

Rules:
- Return the COMPLETE updated file content for ${input.targetFilePath} in "proposedCode" (do NOT use placeholders like "// ... rest of code").
- Preserve existing exports unless fixing a broken export, and do not introduce secrets.
- Explain clearly what changed, why it was changed, and any potential side effects.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are MideoCode Project Rescue AI. Produce surgical, production-safe code fixes in strict JSON.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          problemIdentified: { type: Type.STRING },
          proposedCode: { type: Type.STRING },
          explanation: { type: Type.STRING },
          reason: { type: Type.STRING },
          potentialSideEffects: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['problemIdentified', 'proposedCode', 'explanation', 'reason', 'potentialSideEffects'],
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim()) as {
    problemIdentified?: string;
    proposedCode?: string;
    explanation?: string;
    reason?: string;
    potentialSideEffects?: string[];
  };

  const proposedCode = (parsed.proposedCode || targetFile.content).trimEnd();
  const impact = analyzeFixImpact(input.files, input.targetFilePath, proposedCode);

  return {
    id: `fix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    issueId: input.issueId,
    problemIdentified: parsed.problemIdentified || input.problemDescription,
    fileId: targetFile.id,
    filePath: input.targetFilePath,
    language: detectLanguage(input.targetFilePath, targetFile.language),
    originalCode: targetFile.content,
    proposedCode,
    explanation: parsed.explanation || 'Corrected the identified issue while preserving existing exports.',
    reason: parsed.reason || 'Resolves root cause detected during project investigation.',
    potentialSideEffects: Array.isArray(parsed.potentialSideEffects) ? parsed.potentialSideEffects : [],
    impact,
    status: 'pending',
  };
}

export async function verifyPatchedWorkspace(input: {
  userId: string;
  projectId: string;
  projectTitle: string;
  files: RescueWorkspaceFile[];
  previousIssueIds?: string[];
  targetFilePath: string;
  testSuite?: TestSuite | null;
}): Promise<RescueVerificationResult> {
  const scan = await scanProjectWorkspace({
    userId: input.userId,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    scanMode: 'deep',
    files: input.files,
  });

  const prevSet = new Set(input.previousIssueIds || []);
  const newIssuesIntroduced = scan.issues.filter(
    (iss) => !prevSet.has(iss.id) && (iss.severity === 'critical' || iss.severity === 'high'),
  );

  const checksExecuted: RescueVerificationResult['checksExecuted'] = scan.runtimeAudit
    .filter((r) => r.executed)
    .map((r) => ({
      name: r.tool,
      executed: true,
      passed: !scan.issues.some((i) => i.evidenceSource.toLowerCase().includes(r.tool.split(' ')[0].toLowerCase()) && i.filePath === input.targetFilePath && i.severity === 'critical'),
      details: r.note,
    }));

  let testLabSummary: RescueVerificationResult['testLabSummary'];
  let testsPassed = true;
  if (input.testSuite && input.testSuite.cases.length > 0) {
    const runRes = executeTestLabSuite({
      language: input.testSuite.language || 'javascript',
      files: input.files,
      cases: input.testSuite.cases,
    });
    testsPassed = runRes.status === 'passed';
    checksExecuted.push({
      name: `TestLab Suite (${input.testSuite.title})`,
      executed: true,
      passed: testsPassed,
      details: `${runRes.passedTests}/${runRes.totalTests} tests passed in ${runRes.durationMs}ms.`,
    });
    testLabSummary = {
      executed: true,
      suiteTitle: input.testSuite.title,
      passedTests: runRes.passedTests,
      totalTests: runRes.totalTests,
      message: `${runRes.passedTests}/${runRes.totalTests} passed`,
    };
  } else {
    testLabSummary = {
      executed: false,
      message: 'No saved TestLab suite exists for this project; static/compiler checks executed.',
    };
  }

  const targetCriticalOrHigh = scan.issues.filter(
    (i) => i.filePath === input.targetFilePath && (i.severity === 'critical' || i.severity === 'high'),
  );
  const passed = targetCriticalOrHigh.length === 0 && newIssuesIntroduced.length === 0 && testsPassed;

  return {
    passed,
    summary: passed
      ? `Verification passed for ${input.targetFilePath}. No new critical/high errors introduced (${scan.issues.length} total remaining project findings).`
      : `Verification flagged ${targetCriticalOrHigh.length} critical/high issue(s) on ${input.targetFilePath} and ${newIssuesIntroduced.length} newly introduced issue(s). You can roll back safely.`,
    checksExecuted,
    remainingIssuesCount: scan.issues.length,
    newIssuesIntroduced,
    testLabSummary,
  };
}

export async function chatWithRescueAssistant(input: {
  projectTitle: string;
  files: RescueWorkspaceFile[];
  message: string;
  history: RescueChatMessage[];
  latestIssues?: RescueIssue[];
}): Promise<{ reply: string; citedFiles: string[] }> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const { index, fileMap } = buildProjectIndex(input.files);
  const relevantFiles = selectRelevantFiles(fileMap, index, undefined, input.message, 6);

  const systemInstruction = `You are MideoCode Project Rescue AI — an expert software debugging partner.
Mission: "Your project isn't beyond saving. Let's find out what went wrong."

Grounded Project Context:
- Project Title: ${input.projectTitle}
- Frameworks: ${index.frameworksDetected.join(', ') || 'Unknown'}
- Inspected Files (${index.inspectedFiles}): ${index.files.map((f) => f.path).join(', ')}
- API Connections: ${JSON.stringify(index.apiRouteConnections)}
- Circular Dependencies: ${JSON.stringify(index.circularDependencies)}
- Latest Verified Issues: ${JSON.stringify((input.latestIssues || []).slice(0, 12).map((i) => ({ title: i.title, severity: i.severity, certainty: i.certainty, filePath: i.filePath, line: i.line, summary: i.summary })))}

Relevant File Snippets (secrets redacted):
${relevantFiles.map((f) => `--- ${f.path} ---\n${f.content.slice(0, 6000)}`).join('\n\n')}

Strict Honesty Rules:
- Always cite exact file paths and line numbers/symbols from the inspected project above when answering.
- Distinguish confirmed facts seen in the files from likely causes.
- If a file or runtime log is NOT in the provided project context, explicitly say you cannot inspect it rather than guessing.
- Never reveal secrets or environment variables.`;

  const historyLines = (input.history || [])
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Developer' : 'Rescue AI'}: ${m.content}`)
    .join('\n\n');

  const fullPrompt = historyLines
    ? `${historyLines}\n\nDeveloper: ${input.message}`
    : input.message;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: fullPrompt,
    config: {
      systemInstruction,
    },
  });

  const reply = (response.text || 'Unable to generate a response right now.').trim();
  const citedFiles = index.files
    .map((f) => f.path)
    .filter((p) => reply.includes(p))
    .slice(0, 8);

  return { reply, citedFiles };
}

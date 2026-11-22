import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { SERVER_CHALLENGE_SPECS } from './src/data/challengesServer.ts';
import { CHALLENGES } from './src/data/challengesData.ts';
import {
  buildPublicEvalSummary,
  deleteCustomEvalSpec,
  getMissionEvalSpec,
  saveCustomEvalSpec,
} from './src/data/missionsServer.ts';
import {
  assistTestingWithAi,
  executeTestLabSuite,
  generateTestsWithAi,
} from './src/server/testLabEngine.ts';
import {
  exportDatabaseSqlDdl,
  exportOpenApiSpecJson,
  generateArchitectureWithAi,
  reviseArchitectureWithAi,
} from './src/server/architectEngine.ts';
import {
  buildDeterministicInviteId,
  computeSnapshotDiff,
  normalizeInviteEmail,
  signInvitationPayload,
  verifyInvitationPayload,
} from './src/server/collabAndDiffHelpers.ts';
import {
  analyzeFixImpact,
  cancelRescueScanJob,
  chatWithRescueAssistant,
  getUserRescueScanJob,
  investigateProjectIssue,
  proposeFixAndAnalyzeImpact,
  scanProjectWorkspace,
  startRescueScanJob,
  verifyPatchedWorkspace,
  type RescueWorkspaceFile,
} from './src/server/rescueEngine.ts';
import {
  importGitRepository,
  inspectAndExtractZipBuffer,
  ZipSecurityError,
} from './src/server/rescueImporters.ts';
import {
  getRescueAdminTelemetry,
  recordRescueAdminEvent,
} from './src/server/rescueTelemetry.ts';
import { attachPairProgrammingWebSocket } from './src/server/pairProgrammingHub.ts';
import {
  evaluateInterviewSession,
  generateInterviewFollowup,
} from './src/server/interviewEngine.ts';
import type {
  ArchitecturePlan,
  MissionRuntimeTestSpec,
  MissionServerEvalConfig,
  MissionTestCaseResult,
  MockInterviewQuestionTurn,
  ProjectVersionSnapshot,
  RescueChatMessage,
  RescueCustomScanConfig,
  RescueIssue,
  RescueRootCauseAnalysis,
  RescueScanMode,
  TestCaseItem,
  TestCaseResult,
  TestCoverageSummary,
  TestSuite,
  TestType,
} from './src/types/mideocode.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase projectId & firestoreDatabaseId from firebase-applet-config.json (verifyIdToken requires no IAM)
let firebaseProjectId = '';
let firestoreDatabaseId = '(default)';
try {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      projectId?: string;
      firestoreDatabaseId?: string;
    };
    if (raw.projectId && raw.projectId !== 'remixed-project-id') {
      firebaseProjectId = raw.projectId;
    }
    if (raw.firestoreDatabaseId && raw.firestoreDatabaseId.trim()) {
      firestoreDatabaseId = raw.firestoreDatabaseId.trim();
    }
  }
} catch (err) {
  console.error('Failed to read firebase-applet-config.json:', err);
}

if (firebaseProjectId) {
  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId });
  } else {
    getApp();
  }
}

// Check runtime capabilities truthfully
const pythonCheck = spawnSync('python3', ['--version'], { encoding: 'utf-8', timeout: 1500 });
const pythonAvailable = pythonCheck.status === 0;
const pythonVersion = pythonAvailable ? (pythonCheck.stdout || pythonCheck.stderr).trim() : null;

interface AuthedRequest extends Request {
  uid?: string;
  userEmail?: string;
  emailVerified?: boolean;
}

// Simple per-UID / IP rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxRequests) {
    return false;
  }
  bucket.count += 1;
  return true;
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!firebaseProjectId) {
    res.status(503).json({ error: 'Firebase project is not configured on this server.' });
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Missing authentication token.' });
    return;
  }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.userEmail = decoded.email;
    req.emailVerified = decoded.email_verified;
    next();
  } catch (err) {
    res.status(401).json({
      error: 'Invalid or expired authentication session. Please sign in again.',
      details: err instanceof Error ? err.message : 'Token verification failed',
    });
  }
}

function getGeminiClient(): GoogleGenAI | null {
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

function runIsolatedJavaScript(code: string, driverScript?: string): {
  logs: string[];
  result: unknown;
  error?: string;
  executionMs: number;
} {
  const start = Date.now();
  const logs: string[] = [];
  const formatArg = (arg: unknown): string => {
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  };

  const sandbox: Record<string, unknown> = Object.create(null);
  sandbox.console = {
    log: (...args: unknown[]) => {
      if (logs.length < 100) logs.push(args.map(formatArg).join(' '));
    },
    warn: (...args: unknown[]) => {
      if (logs.length < 100) logs.push('[warn] ' + args.map(formatArg).join(' '));
    },
    error: (...args: unknown[]) => {
      if (logs.length < 100) logs.push('[error] ' + args.map(formatArg).join(' '));
    },
  };
  sandbox.Math = Math;
  sandbox.JSON = JSON;
  sandbox.Array = Array;
  sandbox.Object = Object;
  sandbox.String = String;
  sandbox.Number = Number;
  sandbox.Boolean = Boolean;
  sandbox.Map = Map;
  sandbox.Set = Set;
  sandbox.Date = Date;
  sandbox.RegExp = RegExp;
  sandbox.Error = Error;
  sandbox.TypeError = TypeError;
  sandbox.RangeError = RangeError;
  sandbox.parseInt = parseInt;
  sandbox.parseFloat = parseFloat;
  sandbox.isNaN = isNaN;
  sandbox.isFinite = isFinite;

  const context = vm.createContext(sandbox);
  try {
    const fullCode = driverScript ? `${code}\n;\n${driverScript}` : code;
    const script = new vm.Script(fullCode);
    const result = script.runInContext(context, { timeout: 1000 });
    return {
      logs,
      result,
      executionMs: Date.now() - start,
    };
  } catch (err) {
    return {
      logs,
      result: undefined,
      error: err instanceof Error ? err.message : String(err),
      executionMs: Date.now() - start,
    };
  }
}

function runIsolatedPython(scriptContent: string): {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionMs: number;
} {
  const start = Date.now();
  if (!pythonAvailable) {
    return {
      stdout: '',
      stderr: 'Python 3 runtime is not installed on this server container.',
      exitCode: 127,
      executionMs: 0,
    };
  }
  const res = spawnSync('python3', ['-I', '-S', '-c', scriptContent], {
    encoding: 'utf-8',
    timeout: 1500,
    maxBuffer: 256 * 1024,
    env: {},
  });
  const timedOut = res.error && 'code' in res.error && res.error.code === 'ETIMEDOUT';
  return {
    stdout: (res.stdout || '').slice(0, 16000),
    stderr: timedOut
      ? 'Execution timed out after 1500ms.'
      : (res.stderr || (res.error ? res.error.message : '')).slice(0, 8000),
    exitCode: res.status,
    executionMs: Date.now() - start,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, idx) => deepEqual(v, b[idx]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

const ADMIN_PRIMARY_EMAIL = 'enochayomide2013@gmail.com';

function isVerifiedAdminRequest(req: AuthedRequest): boolean {
  return Boolean(req.userEmail === ADMIN_PRIMARY_EMAIL && req.emailVerified === true);
}

interface SubmittedFileInput {
  name: string;
  language?: string;
  content: string;
}

function runMissionSqlTest(
  files: SubmittedFileInput[],
  spec: MissionRuntimeTestSpec,
): { passed: boolean; actualSummary: string; error?: string; executionMs: number } {
  if (!pythonAvailable) {
    return {
      passed: false,
      actualSummary: 'Error',
      error: 'Python/SQLite runtime is unavailable on this server container.',
      executionMs: 0,
    };
  }
  const schemaFile = files.find((f) => f.name.toLowerCase() === 'schema.sql');
  const reportFile = files.find((f) => f.name.toLowerCase() === 'report.sql');
  const anySql = files.filter((f) => f.name.toLowerCase().endsWith('.sql')).map((f) => f.content).join('\n;\n');
  const schemaSql = schemaFile?.content ?? anySql;
  const targetReportSql = reportFile?.content ?? anySql;

  const isSchemaTest = spec.targetFile === 'schema.sql';
  const pyScript = `
import sqlite3, json

schema_sql = ${JSON.stringify(schemaSql)}
driver_sql = ${JSON.stringify(spec.driverOrQuery)}
report_sql = ${JSON.stringify(targetReportSql)}
is_schema = ${isSchemaTest ? 'True' : 'False'}

try:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON;")
    if schema_sql.strip():
        conn.executescript(schema_sql)
    if is_schema:
        cur = conn.execute(driver_sql.strip().rstrip(";"))
        rows = [list(r) for r in cur.fetchall()]
    else:
        if driver_sql.strip():
            conn.executescript(driver_sql)
        stmts = [s.strip() for s in report_sql.split(";") if s.strip() and not all(line.strip().startswith("--") or not line.strip() for line in s.splitlines())]
        if not stmts:
            raise ValueError("No executable SELECT query found in report.sql")
        cur = conn.execute(stmts[-1])
        rows = [list(r) for r in cur.fetchall()]
    print("__MIDEOCODE_SQL__" + json.dumps({"ok": True, "rows": rows}))
except Exception as e:
    print("__MIDEOCODE_SQL__" + json.dumps({"ok": False, "error": str(e)}))
`;
  const run = runIsolatedPython(pyScript);
  const marker = '__MIDEOCODE_SQL__';
  const idx = run.stdout.lastIndexOf(marker);
  if (idx === -1) {
    return {
      passed: false,
      actualSummary: 'SQL execution error',
      error: run.stderr || 'Failed to execute SQL query in isolated SQLite engine.',
      executionMs: run.executionMs,
    };
  }
  try {
    const parsed = JSON.parse(run.stdout.slice(idx + marker.length).trim()) as {
      ok: boolean;
      rows?: unknown[];
      error?: string;
    };
    if (!parsed.ok) {
      return {
        passed: false,
        actualSummary: 'SQL error',
        error: parsed.error || 'SQL execution failed.',
        executionMs: run.executionMs,
      };
    }
    const passed = spec.expectedJson !== undefined ? deepEqual(parsed.rows, spec.expectedJson) : true;
    return {
      passed,
      actualSummary: JSON.stringify(parsed.rows ?? []),
      error: passed ? undefined : 'Query output rows did not match expected schema/aggregation.',
      executionMs: run.executionMs,
    };
  } catch (err) {
    return {
      passed: false,
      actualSummary: 'Parse error',
      error: err instanceof Error ? err.message : 'Unable to parse SQL evaluation output.',
      executionMs: run.executionMs,
    };
  }
}

function runSingleMissionTest(
  files: SubmittedFileInput[],
  spec: MissionRuntimeTestSpec,
): { result: MissionTestCaseResult; executionMs: number; suggestion?: string } {
  const start = Date.now();
  const findTarget = (fallbackExt: string) =>
    (spec.targetFile && files.find((f) => f.name.toLowerCase() === spec.targetFile?.toLowerCase())) ||
    files.find((f) => f.name.toLowerCase().endsWith(fallbackExt)) ||
    files[0];

  if (spec.kind === 'html_css') {
    const target = spec.targetFile?.endsWith('.css') ? findTarget('.css') : findTarget('.html');
    const source = target?.content || '';
    const missingItems: string[] = [];

    if (spec.mustContainAll) {
      for (const token of spec.mustContainAll) {
        if (!source.toLowerCase().includes(token.toLowerCase())) {
          missingItems.push(`Missing required "${token}"`);
        }
      }
    }
    if (spec.regexChecks) {
      for (const pattern of spec.regexChecks) {
        try {
          const rx = new RegExp(pattern, 'im');
          if (!rx.test(source)) {
            missingItems.push(`Check failed: ${spec.requirementText}`);
            break;
          }
        } catch {
          missingItems.push(`Invalid validation pattern configured for: ${spec.requirementText}`);
          break;
        }
      }
    }
    const passed = missingItems.length === 0 && source.trim().length > 0;
    const elapsed = Date.now() - start;
    return {
      result: {
        id: spec.id,
        label: spec.label,
        isHidden: spec.isHidden,
        passed,
        expectedSummary: spec.isHidden ? 'Hidden structural check' : spec.requirementText,
        actualSummary: passed ? 'Passed structural check' : missingItems[0] || 'File is empty',
        error: passed ? undefined : missingItems.join('; '),
      },
      executionMs: elapsed,
      suggestion: passed ? undefined : `Review ${target?.name || 'HTML/CSS'}: ${spec.requirementText}.`,
    };
  }

  if (spec.kind === 'javascript') {
    const jsFiles = files.filter(
      (f) => f.name.toLowerCase().endsWith('.js') || f.language === 'javascript',
    );
    const orderedJs = spec.targetFile
      ? [
          ...jsFiles.filter((f) => f.name.toLowerCase() === spec.targetFile?.toLowerCase()),
          ...jsFiles.filter((f) => f.name.toLowerCase() !== spec.targetFile?.toLowerCase()),
        ]
      : jsFiles;
    const combinedCode = orderedJs.map((f) => f.content).join('\n;\n');
    const run = runIsolatedJavaScript(combinedCode, spec.driverOrQuery);
    const passed =
      !run.error &&
      (spec.expectedJson !== undefined ? deepEqual(run.result, spec.expectedJson) : Boolean(run.result));

    return {
      result: {
        id: spec.id,
        label: spec.label,
        isHidden: spec.isHidden,
        passed,
        expectedSummary: spec.isHidden ? 'Hidden unit test' : JSON.stringify(spec.expectedJson),
        actualSummary: run.error
          ? 'Runtime Error'
          : spec.isHidden
            ? passed
              ? 'Passed'
              : 'Failed hidden assertion'
            : JSON.stringify(run.result),
        error: run.error || (passed ? undefined : `Returned output did not satisfy: ${spec.requirementText}`),
      },
      executionMs: run.executionMs,
      suggestion: passed ? undefined : run.error ? `Fix JavaScript error: ${run.error}` : `Ensure: ${spec.requirementText}.`,
    };
  }

  if (spec.kind === 'python') {
    if (!pythonAvailable) {
      return {
        result: {
          id: spec.id,
          label: spec.label,
          isHidden: spec.isHidden,
          passed: false,
          expectedSummary: spec.isHidden ? 'Hidden test' : JSON.stringify(spec.expectedJson),
          actualSummary: 'Python unavailable',
          error: 'Python 3 runtime is not available on this server.',
        },
        executionMs: 0,
      };
    }
    const pyFiles = files.filter((f) => f.name.toLowerCase().endsWith('.py') || f.language === 'python');
    const combinedPy = pyFiles.map((f) => f.content).join('\n\n');
    const expectValueError = spec.expectedJson === 'VALUE_ERROR_RAISED';

    const harness = `
import json, builtins as _b
_blocked = {"os", "sys", "subprocess", "socket", "shutil", "pathlib", "http", "urllib"}
_orig_import = _b.__import__
def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if name.split(".")[0] in _blocked:
        raise ImportError(f"Module {name!r} is disabled in isolated sandbox")
    return _orig_import(name, globals, locals, fromlist, level)
_b.__import__ = _safe_import

${combinedPy}

try:
    _val = eval(${JSON.stringify(spec.driverOrQuery)}, globals())
    print("__MIDEOCODE_PY_TEST__" + json.dumps({"ok": True, "val": _val}))
except ValueError as _ve:
    print("__MIDEOCODE_PY_TEST__" + json.dumps({"ok": True, "valueError": True, "msg": str(_ve)}))
except Exception as _ex:
    print("__MIDEOCODE_PY_TEST__" + json.dumps({"ok": False, "error": str(_ex)}))
`;
    const run = runIsolatedPython(harness);
    const marker = '__MIDEOCODE_PY_TEST__';
    const idx = run.stdout.lastIndexOf(marker);
    if (idx === -1) {
      return {
        result: {
          id: spec.id,
          label: spec.label,
          isHidden: spec.isHidden,
          passed: false,
          expectedSummary: spec.isHidden ? 'Hidden Python test' : JSON.stringify(spec.expectedJson),
          actualSummary: 'Runtime Error',
          error: run.stderr || 'Python syntax or runtime error.',
        },
        executionMs: run.executionMs,
        suggestion: `Fix Python error before resubmitting: ${run.stderr.split('\n').slice(-2).join(' ').trim()}`,
      };
    }
    let parsed: {
      ok: boolean;
      val?: unknown;
      valueError?: boolean;
      error?: string;
      msg?: string;
    };
    try {
      parsed = JSON.parse(run.stdout.slice(idx + marker.length).trim()) as {
        ok: boolean;
        val?: unknown;
        valueError?: boolean;
        error?: string;
        msg?: string;
      };
    } catch {
      return {
        result: {
          id: spec.id,
          label: spec.label,
          isHidden: spec.isHidden,
          passed: false,
          expectedSummary: spec.isHidden ? 'Hidden Python test' : JSON.stringify(spec.expectedJson),
          actualSummary: 'Output Parse Error',
          error: run.stderr || 'Python test runner produced malformed JSON output.',
        },
        executionMs: run.executionMs,
        suggestion: 'Check for stray print output or recursion issues in your Python code.',
      };
    }

    if (expectValueError) {
      const passed = Boolean(parsed.valueError);
      return {
        result: {
          id: spec.id,
          label: spec.label,
          isHidden: spec.isHidden,
          passed,
          expectedSummary: 'Hidden validation check',
          actualSummary: passed ? 'Passed' : 'Did not raise ValueError',
          error: passed ? undefined : parsed.error || 'Expected ValueError to be raised.',
        },
        executionMs: run.executionMs,
        suggestion: passed ? undefined : `Ensure: ${spec.requirementText}.`,
      };
    }

    const passed = Boolean(parsed.ok && !parsed.valueError && deepEqual(parsed.val, spec.expectedJson));
    return {
      result: {
        id: spec.id,
        label: spec.label,
        isHidden: spec.isHidden,
        passed,
        expectedSummary: spec.isHidden ? 'Hidden Python test' : JSON.stringify(spec.expectedJson),
        actualSummary: parsed.error
          ? `Error: ${parsed.error}`
          : spec.isHidden
            ? passed
              ? 'Passed'
              : 'Failed hidden assertion'
            : JSON.stringify(parsed.val),
        error: parsed.error || parsed.msg || (passed ? undefined : `Output did not satisfy: ${spec.requirementText}`),
      },
      executionMs: run.executionMs,
      suggestion: passed ? undefined : parsed.error ? `Fix Python exception: ${parsed.error}` : `Verify: ${spec.requirementText}.`,
    };
  }

  // SQL
  const sqlRes = runMissionSqlTest(files, spec);
  return {
    result: {
      id: spec.id,
      label: spec.label,
      isHidden: spec.isHidden,
      passed: sqlRes.passed,
      expectedSummary: spec.isHidden ? 'Hidden SQL check' : JSON.stringify(spec.expectedJson),
      actualSummary: spec.isHidden ? (sqlRes.passed ? 'Passed' : 'Mismatch') : sqlRes.actualSummary,
      error: sqlRes.error,
    },
    executionMs: sqlRes.executionMs,
    suggestion: sqlRes.passed ? undefined : sqlRes.error || `Verify SQL requirement: ${spec.requirementText}.`,
  };
}

async function startServer() {
  const app = express();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/api/admin/community-media/chunk/') ||
      req.path === '/api/rescue/import/zip'
    ) {
      next();
      return;
    }
    const limit = req.path.startsWith('/api/rescue/') ? '10mb' : '512kb';
    express.json({ limit })(req, res, next);
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      firebaseConfigured: Boolean(firebaseProjectId),
      aiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      pythonAvailable,
      pythonVersion,
    });
  });

  app.get('/api/runtime/capabilities', (_req: Request, res: Response) => {
    res.json({
      browserWeb: true,
      isolatedNodeVm: true,
      python3: pythonAvailable,
      pythonVersion,
      geminiAi: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      firebaseProjectId: firebaseProjectId || null,
    });
  });

  // Profile Avatar Storage & Serving
  const avatarsDir = path.resolve(__dirname, '.mideocode-uploads', 'avatars');
  fs.mkdirSync(avatarsDir, { recursive: true });

  app.post('/api/profile/avatar', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.uid;
    if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) {
      res.status(401).json({ error: 'Invalid user session.' });
      return;
    }
    if (!checkRateLimit(`avatar:${uid}`, 20, 10 * 60_000)) {
      res.status(429).json({ error: 'Too many avatar updates. Please wait a few minutes.' });
      return;
    }

    const { imageDataUrl } = req.body as { imageDataUrl?: string };
    if (typeof imageDataUrl !== 'string') {
      res.status(400).json({ error: 'Missing imageDataUrl payload.' });
      return;
    }

    const match = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid image format. Upload a PNG, JPG, WebP, or GIF image.' });
      return;
    }

    const rawExt = match[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > 350 * 1024) {
      res.status(400).json({ error: 'Processed profile image must be under 350 KB.' });
      return;
    }

    try {
      const prefix = `${uid}_`;
      for (const existingFile of fs.readdirSync(avatarsDir)) {
        if (existingFile.startsWith(prefix)) {
          fs.unlinkSync(path.join(avatarsDir, existingFile));
        }
      }
      const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 10);
      const filename = `${uid}_${hash}.${ext}`;
      fs.writeFileSync(path.join(avatarsDir, filename), buffer);
      res.json({ photoURL: `/api/profile/avatar/${filename}` });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to store profile picture.',
      });
    }
  });

  app.get('/api/profile/avatar/:filename', (req: Request, res: Response) => {
    const filename = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9_-]+\.(jpg|png|webp|gif)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid avatar filename.' });
      return;
    }
    const filePath = path.join(avatarsDir, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Avatar not found.' });
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
  });

  type AiAssistBody = {
    mode?: string;
    depth?: 'fast' | 'balanced' | 'deep';
    prompt?: string;
    history?: { role: string; content: string }[];
    includeContext?: boolean;
    learnerProfile?: {
      experienceLevel?: string;
      preferredLanguages?: string[];
      activeCareerPathId?: string;
    };
    context?: {
      courseTitle?: string;
      lessonTitle?: string;
      missionTitle?: string;
      missionScenario?: string;
      currentCheckpointTitle?: string;
      currentCheckpointRequirements?: string[];
      instructions?: string[];
      language?: string;
      selectedCode?: string;
      errorMessage?: string;
      filename?: string;
    };
  };

  function resolveThinkingLevel(mode: string, depth?: string): ThinkingLevel {
    if (depth === 'fast') return ThinkingLevel.LOW;
    if (depth === 'deep') return ThinkingLevel.HIGH;
    if (depth === 'balanced') return ThinkingLevel.MEDIUM;
    // Smart adaptive default by task mode
    if (mode === 'debug' || mode === 'build' || mode === 'review') {
      return ThinkingLevel.HIGH;
    }
    return ThinkingLevel.MEDIUM;
  }

  function buildMideoAiPayload(body: AiAssistBody) {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const validModes = ['learn', 'debug', 'explain', 'practice', 'build', 'review'];
    const mode = body.mode && validModes.includes(body.mode) ? body.mode : 'learn';
    const thinkingLevel = resolveThinkingLevel(mode, body.depth);

    const modeDirectives: Record<string, string> = {
      learn:
        'Teach the concept clearly: lead with the core intuition in 2-3 sentences, give a clean minimal runnable example, and list common pitfalls.',
      debug:
        'Identify the exact root cause first, explain why it breaks, distinguish verified facts from hypotheses, and provide a minimal, copy-ready fix.',
      explain:
        'Break down the supplied code or concept step by step in plain language, highlighting control flow, edge cases, and complexity.',
      practice:
        'Offer a targeted exercise or Socratic nudge that helps the learner reason through the next step without immediately giving away the whole solution unless asked.',
      build:
        'Design modular, production-ready code with clear architecture, input validation, and concrete edge-case handling.',
      review:
        'Audit the code concisely for correctness, security, edge cases, performance/complexity, and readability with actionable improvements.',
    };

    const learnerLines: string[] = [];
    if (body.learnerProfile?.experienceLevel) {
      learnerLines.push(`Learner experience level: ${String(body.learnerProfile.experienceLevel).slice(0, 32)}`);
    }
    if (Array.isArray(body.learnerProfile?.preferredLanguages) && body.learnerProfile.preferredLanguages.length > 0) {
      learnerLines.push(`Preferred languages: ${body.learnerProfile.preferredLanguages.slice(0, 6).join(', ')}`);
    }

    let contextSection = '';
    const isMissionAssist = Boolean(body.context?.missionTitle);
    if (body.context?.missionTitle) {
      const mParts: string[] = [`Active Mission: ${body.context.missionTitle.slice(0, 140)}`];
      if (body.context.missionScenario) mParts.push(`Scenario: ${body.context.missionScenario.slice(0, 600)}`);
      if (body.context.currentCheckpointTitle) {
        mParts.push(`Current Checkpoint: ${body.context.currentCheckpointTitle.slice(0, 140)}`);
      }
      if (
        Array.isArray(body.context.currentCheckpointRequirements) &&
        body.context.currentCheckpointRequirements.length > 0
      ) {
        mParts.push(
          `Checkpoint Requirements:\n- ${body.context.currentCheckpointRequirements.slice(0, 8).join('\n- ')}`,
        );
      }
      contextSection += `\n\nMission Context:\n${mParts.join('\n')}`;
    }

    if (body.includeContext && body.context) {
      const parts: string[] = [];
      if (body.context.courseTitle) parts.push(`Course: ${body.context.courseTitle.slice(0, 120)}`);
      if (body.context.lessonTitle) parts.push(`Lesson: ${body.context.lessonTitle.slice(0, 120)}`);
      if (body.context.filename) parts.push(`Active file: ${body.context.filename.slice(0, 120)}`);
      if (body.context.language) parts.push(`Language: ${body.context.language.slice(0, 40)}`);
      if (body.context.errorMessage) parts.push(`Error output:\n${body.context.errorMessage.slice(0, 1500)}`);
      if (body.context.selectedCode) {
        parts.push(`Authorized code context:\n\`\`\`\n${body.context.selectedCode.slice(0, 8000)}\n\`\`\``);
      }
      if (parts.length > 0) {
        contextSection += `\n\nUser-Authorized Workspace Context:\n${parts.join('\n')}`;
      }
    }

    // Build native multi-turn conversation history with strict user/model role alternation for Gemini
    const rawHistory = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const msg of rawHistory) {
      const text = String(msg?.content || '').trim().slice(0, 3000);
      if (!text) continue;
      const role: 'user' | 'model' = msg.role === 'user' ? 'user' : 'model';
      if (contents.length === 0 && role === 'model') {
        continue;
      }
      const last = contents[contents.length - 1];
      if (last && last.role === role) {
        last.parts[0].text = `${last.parts[0].text}\n\n${text}`.slice(0, 6000);
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }
    const finalTurnText = `${prompt}${contextSection}`;
    const tail = contents[contents.length - 1];
    if (tail && tail.role === 'user') {
      if (tail.parts[0].text.trim() === prompt.trim()) {
        tail.parts[0].text = finalTurnText;
      } else {
        tail.parts[0].text = `${tail.parts[0].text}\n\n${finalTurnText}`;
      }
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: finalTurnText }],
      });
    }

    const missionMentorDirective = isMissionAssist
      ? ' IMPORTANT MISSION MENTOR RULE: Guide the learner constructively with explanations, edge-case questions, and incremental next steps rather than handing over a complete copy-paste solution to the entire mission. Only provide a full replacement snippet if the user explicitly asks to inspect a minimal fix for a broken snippet.'
      : '';

    const systemInstruction =
      `You are Mideo AI, the expert senior software engineering tutor inside MideoCode. Mode: ${mode.toUpperCase()}. ${modeDirectives[mode]} ` +
      (learnerLines.length > 0 ? `${learnerLines.join('. ')}. ` : '') +
      'Response quality standards: Answer directly first with no filler preamble; use clear Markdown headings, bullet points, and fenced language-tagged code blocks; state time/space complexity or edge cases when relevant; never claim you executed code or verified test results when you did not run them.' +
      missionMentorDirective;

    return { prompt, mode, thinkingLevel, contents, systemInstruction, isMissionAssist };
  }

  async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const retryable = msg.includes('429') || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED');
        if (!retryable || attempt === maxRetries) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      }
    }
    throw lastError;
  }

  // Server-side Mideo AI streaming SSE endpoint (fast perceived latency + rich markdown)
  app.post('/api/ai/assist/stream', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`ai:${uid}`, 30, 60_000)) {
      res.status(429).json({ error: 'Rate limit reached. Please wait a minute before sending more AI requests.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable Mideo AI.',
      });
      return;
    }

    const body = req.body as AiAssistBody;
    const { prompt, mode, thinkingLevel, contents, systemInstruction } = buildMideoAiPayload(body);
    if (!prompt || prompt.length > 6000) {
      res.status(400).json({ error: 'Please provide a prompt between 1 and 6000 characters.' });
      return;
    }

    const streamSystemInstruction =
      systemInstruction +
      (mode === 'debug' || mode === 'build' || mode === 'review'
        ? ' When proposing a complete runnable replacement file for the user\'s active workspace, optionally append a single tag at the very end in this exact format: <mideo_proposed_code filename="index.js" language="javascript">\n// full file code\n</mideo_proposed_code>.'
        : '');

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!clientClosed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const stream = await callGeminiWithRetry(() =>
        ai.models.generateContentStream({
          model: 'gemini-4-hydrogen',
          contents,
          config: {
            systemInstruction: streamSystemInstruction,
            thinkingConfig: { thinkingLevel },
          },
        }),
      );

      let accumulated = '';
      for await (const chunk of stream) {
        if (clientClosed) break;
        const delta = chunk.text ?? '';
        if (!delta) continue;
        accumulated += delta;
        // Strip incomplete or complete <mideo_proposed_code> tag from live visible stream
        const visible = accumulated.replace(/<mideo_proposed_code[\s\S]*$/i, '').trimEnd();
        sendEvent({ type: 'snapshot', text: visible });
      }

      if (!clientClosed) {
        let proposedCode: { filename: string; language: string; code: string } | undefined;
        const tagMatch = accumulated.match(
          /<mideo_proposed_code\s+filename="([^"]+)"\s+language="([^"]+)">([\s\S]*?)<\/mideo_proposed_code>/i,
        );
        if (tagMatch) {
          proposedCode = {
            filename: tagMatch[1].trim().slice(0, 120) || 'index.js',
            language: tagMatch[2].trim().slice(0, 32) || 'javascript',
            code: tagMatch[3].trim(),
          };
        }
        const cleanReply = accumulated
          .replace(/<mideo_proposed_code[\s\S]*?<\/mideo_proposed_code>/gi, '')
          .trim();

        sendEvent({
          type: 'done',
          reply: cleanReply || 'No response generated.',
          ...(proposedCode && proposedCode.code ? { proposedCode } : {}),
        });
        res.end();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mideo AI streaming request failed.';
      sendEvent({ type: 'error', error: `Mideo AI request failed: ${message}` });
      if (!res.writableEnded) res.end();
    }
  });

  // Server-side Mideo AI JSON endpoint (used by MissionWorkspace & fallback)
  app.post('/api/ai/assist', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`ai:${uid}`, 30, 60_000)) {
      res.status(429).json({ error: 'Rate limit reached. Please wait a minute before sending more AI requests.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable Mideo AI.',
      });
      return;
    }

    const body = req.body as AiAssistBody;
    const { prompt, thinkingLevel, contents, systemInstruction } = buildMideoAiPayload(body);

    if (!prompt || prompt.length > 6000) {
      res.status(400).json({ error: 'Please provide a prompt between 1 and 6000 characters.' });
      return;
    }

    try {
      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents,
          config: {
            systemInstruction:
              systemInstruction +
              ' If proposing replacement code for the user\'s active file, include it in proposedCode so the user can review and choose whether to apply it.',
            thinkingConfig: { thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {
                  type: Type.STRING,
                  description: 'Clear markdown response with syntax-highlighted code blocks where helpful.',
                },
                proposedCode: {
                  type: Type.OBJECT,
                  description: 'Optional proposed replacement code for the active editor file when relevant in debug/build/review modes.',
                  properties: {
                    filename: { type: Type.STRING },
                    language: { type: Type.STRING },
                    code: { type: Type.STRING },
                  },
                },
              },
              required: ['reply'],
            },
          },
        }),
      );

      const rawText = (response.text ?? '').trim();
      let parsed: { reply: string; proposedCode?: { filename: string; language: string; code: string } };
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { reply: rawText || 'No response generated.' };
      }
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI request failed.';
      res.status(502).json({ error: `Mideo AI request failed: ${message}` });
    }
  });

  // Isolated IDE code runner for JS and Python
  app.post('/api/ide/run', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`ide:${uid}`, 40, 60_000)) {
      res.status(429).json({ error: 'Execution rate limit exceeded. Please pause briefly.' });
      return;
    }

    const { language, code } = req.body as { language?: string; code?: string };
    if (typeof code !== 'string' || code.length > 100_000) {
      res.status(400).json({ error: 'Invalid or oversized code payload.' });
      return;
    }

    if (language === 'javascript' || language === 'js') {
      const outcome = runIsolatedJavaScript(code);
      res.json({
        language: 'javascript',
        stdout: outcome.logs.join('\n'),
        stderr: outcome.error || '',
        returnValue: outcome.result !== undefined ? String(outcome.result) : null,
        executionMs: outcome.executionMs,
      });
      return;
    }

    if (language === 'python' || language === 'py') {
      if (!pythonAvailable) {
        res.status(501).json({
          error: 'Python 3 runtime is unavailable on this server container.',
        });
        return;
      }
      // Restrict dangerous imports in isolated Python runner
      const guardHeader = [
        'import builtins as _b',
        '_blocked = {"os", "sys", "subprocess", "socket", "shutil", "pathlib", "http", "urllib"}',
        '_orig_import = _b.__import__',
        'def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):',
        '    root = name.split(".")[0]',
        '    if root in _blocked:',
        '        raise ImportError(f"Module {name!r} is disabled in isolated sandbox")',
        '    return _orig_import(name, globals, locals, fromlist, level)',
        '_b.__import__ = _safe_import',
        '',
      ].join('\n');
      const outcome = runIsolatedPython(guardHeader + code);
      res.json({
        language: 'python',
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        exitCode: outcome.exitCode,
        executionMs: outcome.executionMs,
      });
      return;
    }

    res.status(400).json({
      error: `Server-side execution is only supported for JavaScript and Python. Use the browser Live Preview for HTML/CSS/Web.`,
    });
  });

  // Isolated Challenge Evaluator (hidden test cases stay server-side!)
  app.post('/api/challenges/execute', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`challenge:${uid}`, 30, 60_000)) {
      res.status(429).json({ error: 'Too many challenge submissions. Please wait a minute.' });
      return;
    }

    const { challengeId, language, code } = req.body as {
      challengeId?: string;
      language?: string;
      code?: string;
    };

    if (!challengeId || !SERVER_CHALLENGE_SPECS[challengeId]) {
      res.status(404).json({ error: 'Challenge specification not found.' });
      return;
    }
    if (typeof code !== 'string' || code.trim().length === 0 || code.length > 50_000) {
      res.status(400).json({ error: 'Submission code must be between 1 and 50,000 characters.' });
      return;
    }

    const spec = SERVER_CHALLENGE_SPECS[challengeId];

    if (language === 'javascript') {
      const results = [];
      let totalMs = 0;
      let passedCount = 0;

      for (let i = 0; i < spec.tests.length; i++) {
        const tc = spec.tests[i];
        const serializedArgs = JSON.stringify(tc.args);
        const driver = `
          (function() {
            if (typeof ${spec.functionName} !== 'function') {
              throw new Error('Expected function "${spec.functionName}" to be defined.');
            }
            const __args = ${serializedArgs};
            return ${spec.functionName}(...__args);
          })();
        `;
        const run = runIsolatedJavaScript(code, driver);
        totalMs += run.executionMs;
        const passed = !run.error && deepEqual(run.result, tc.expected);
        if (passed) passedCount += 1;

        results.push({
          index: i + 1,
          isHidden: tc.isHidden,
          passed,
          inputPreview: tc.isHidden ? 'Hidden test case' : JSON.stringify(tc.args),
          expectedPreview: tc.isHidden ? 'Hidden' : JSON.stringify(tc.expected),
          actualPreview: run.error ? 'Error' : JSON.stringify(run.result),
          error: run.error,
        });
      }

      const allPassed = passedCount === spec.tests.length;
      res.json({
        challengeId,
        language,
        passed: allPassed,
        passedCount,
        totalCount: spec.tests.length,
        executionMs: totalMs,
        xpAwarded: allPassed ? spec.xpReward : 0,
        results,
      });
      return;
    }

    if (language === 'python') {
      if (!pythonAvailable) {
        res.status(501).json({ error: 'Python 3 runtime is unavailable on this server.' });
        return;
      }

      const pyFunctionMap: Record<string, string> = {
        twoSum: 'two_sum',
        isPalindrome: 'is_palindrome',
        isValidBrackets: 'is_valid_brackets',
        maxSubArray: 'max_sub_array',
        countAnagramGroups: 'count_anagram_groups',
        binarySearch: 'binary_search',
      };
      const pyFunc = pyFunctionMap[spec.functionName] || spec.functionName;
      const serializedTests = JSON.stringify(
        spec.tests.map((t) => ({ args: t.args, expected: t.expected, isHidden: t.isHidden })),
      );

      const runner = `
import json
import builtins as _b
_blocked = {"os", "sys", "subprocess", "socket", "shutil", "pathlib", "http", "urllib"}
_orig_import = _b.__import__
def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if name.split(".")[0] in _blocked:
        raise ImportError(f"Module {name!r} is disabled in isolated sandbox")
    return _orig_import(name, globals, locals, fromlist, level)
_b.__import__ = _safe_import

${code}

_tests = json.loads(${JSON.stringify(serializedTests)})
_out = []
for _idx, _t in enumerate(_tests):
    try:
        _fn = globals().get("${pyFunc}") or globals().get("${spec.functionName}")
        if not callable(_fn):
            raise NameError("Expected function ${pyFunc}")
        _actual = _fn(*_t["args"])
        _ok = (_actual == _t["expected"]) and (type(_actual) is type(_t["expected"]) or isinstance(_actual, (int, float)) and isinstance(_t["expected"], (int, float)) and not isinstance(_actual, bool) and not isinstance(_t["expected"], bool))
        _out.append({
            "index": _idx + 1,
            "isHidden": _t["isHidden"],
            "passed": bool(_ok),
            "inputPreview": "Hidden test case" if _t["isHidden"] else json.dumps(_t["args"]),
            "expectedPreview": "Hidden" if _t["isHidden"] else json.dumps(_t["expected"]),
            "actualPreview": json.dumps(_actual),
        })
    except Exception as _e:
        _out.append({
            "index": _idx + 1,
            "isHidden": _t["isHidden"],
            "passed": False,
            "inputPreview": "Hidden test case" if _t["isHidden"] else json.dumps(_t["args"]),
            "expectedPreview": "Hidden" if _t["isHidden"] else json.dumps(_t["expected"]),
            "actualPreview": "Error",
            "error": str(_e),
        })
print("__MIDEOCODE_RESULT__" + json.dumps(_out))
`;

      const outcome = runIsolatedPython(runner);
      const marker = '__MIDEOCODE_RESULT__';
      const markerIdx = outcome.stdout.lastIndexOf(marker);
      if (markerIdx === -1) {
        res.json({
          challengeId,
          language,
          passed: false,
          passedCount: 0,
          totalCount: spec.tests.length,
          executionMs: outcome.executionMs,
          xpAwarded: 0,
          results: spec.tests.map((t, i) => ({
            index: i + 1,
            isHidden: t.isHidden,
            passed: false,
            inputPreview: t.isHidden ? 'Hidden test case' : JSON.stringify(t.args),
            expectedPreview: t.isHidden ? 'Hidden' : JSON.stringify(t.expected),
            actualPreview: 'Error',
            error: outcome.stderr || 'Runtime error before test completion.',
          })),
        });
        return;
      }

      const jsonPart = outcome.stdout.slice(markerIdx + marker.length).trim();
      let parsedResults: Array<{
        index: number;
        isHidden: boolean;
        passed: boolean;
        inputPreview: string;
        expectedPreview: string;
        actualPreview: string;
        error?: string;
      }>;
      try {
        parsedResults = JSON.parse(jsonPart) as Array<{
          index: number;
          isHidden: boolean;
          passed: boolean;
          inputPreview: string;
          expectedPreview: string;
          actualPreview: string;
          error?: string;
        }>;
      } catch {
        res.json({
          challengeId,
          language,
          passed: false,
          passedCount: 0,
          totalCount: spec.tests.length,
          executionMs: outcome.executionMs,
          xpAwarded: 0,
          results: spec.tests.map((t, i) => ({
            index: i + 1,
            isHidden: t.isHidden,
            passed: false,
            inputPreview: t.isHidden ? 'Hidden test case' : JSON.stringify(t.args),
            expectedPreview: t.isHidden ? 'Hidden' : JSON.stringify(t.expected),
            actualPreview: 'Output Parse Error',
            error: outcome.stderr || 'Python test harness returned malformed output.',
          })),
        });
        return;
      }
      const passedCount = parsedResults.filter((r) => r.passed).length;
      const allPassed = passedCount === spec.tests.length;

      res.json({
        challengeId,
        language,
        passed: allPassed,
        passedCount,
        totalCount: spec.tests.length,
        executionMs: outcome.executionMs,
        xpAwarded: allPassed ? spec.xpReward : 0,
        results: parsedResults,
      });
      return;
    }

    res.status(400).json({ error: `Unsupported challenge language: ${language}` });
  });

  // -------------------------------------------------------------------------
  // Timed Mock Coding Interviews (AI Follow-up & Rubric Evaluation)
  // -------------------------------------------------------------------------
  app.post('/api/interviews/followup', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`interview-followup:${uid}`, 25, 60_000)) {
      res.status(429).json({ error: 'Interview AI rate limit reached. Wait a moment before asking again.' });
      return;
    }

    const {
      careerPathTitle,
      challengeId,
      language,
      code,
      passedCount,
      totalCount,
      elapsedSeconds,
      transcript,
    } = req.body as {
      careerPathTitle?: string;
      challengeId?: string;
      language?: 'javascript' | 'python';
      code?: string;
      passedCount?: number;
      totalCount?: number;
      elapsedSeconds?: number;
      transcript?: MockInterviewQuestionTurn[];
    };

    const challengeSpec = CHALLENGES.find((c) => c.id === challengeId);
    if (!challengeSpec) {
      res.status(404).json({ error: 'Selected coding challenge was not found.' });
      return;
    }
    if (language !== 'javascript' && language !== 'python') {
      res.status(400).json({ error: 'Mock coding interviews support javascript or python.' });
      return;
    }
    if (typeof code !== 'string' || code.length > 50_000) {
      res.status(400).json({ error: 'Invalid or oversized code payload.' });
      return;
    }

    try {
      const followup = await generateInterviewFollowup({
        careerPathTitle: (careerPathTitle || 'Software Engineer').slice(0, 100),
        challengeTitle: challengeSpec.title,
        problemStatement: challengeSpec.problemStatement,
        difficulty: challengeSpec.difficulty,
        language,
        code,
        passedCount: typeof passedCount === 'number' && Number.isFinite(passedCount) ? Math.max(0, passedCount) : 0,
        totalCount:
          typeof totalCount === 'number' && Number.isFinite(totalCount)
            ? Math.max(0, totalCount)
            : SERVER_CHALLENGE_SPECS[challengeSpec.id]?.tests.length || 0,
        elapsedSeconds:
          typeof elapsedSeconds === 'number' && Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0,
        transcript: Array.isArray(transcript) ? transcript.slice(-12) : [],
      });
      res.json(followup);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate interviewer follow-up.';
      res.status(msg.includes('GEMINI_API_KEY') ? 503 : 502).json({ error: msg });
    }
  });

  app.post('/api/interviews/evaluate', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`interview-eval:${uid}`, 15, 60_000)) {
      res.status(429).json({ error: 'Evaluation rate limit reached. Please wait a minute.' });
      return;
    }

    const {
      careerPathTitle,
      challengeId,
      language,
      code,
      passedTests,
      totalTests,
      durationMinutes,
      elapsedSeconds,
      transcript,
    } = req.body as {
      careerPathTitle?: string;
      challengeId?: string;
      language?: 'javascript' | 'python';
      code?: string;
      passedTests?: number;
      totalTests?: number;
      durationMinutes?: number;
      elapsedSeconds?: number;
      transcript?: MockInterviewQuestionTurn[];
    };

    const challengeSpec = CHALLENGES.find((c) => c.id === challengeId);
    if (!challengeSpec) {
      res.status(404).json({ error: 'Selected coding challenge was not found.' });
      return;
    }
    if (language !== 'javascript' && language !== 'python') {
      res.status(400).json({ error: 'Mock coding interviews support javascript or python.' });
      return;
    }
    if (typeof code !== 'string' || code.length > 50_000) {
      res.status(400).json({ error: 'Invalid or oversized code payload.' });
      return;
    }

    try {
      const scorecard = await evaluateInterviewSession({
        careerPathTitle: (careerPathTitle || 'Software Engineer').slice(0, 100),
        challengeTitle: challengeSpec.title,
        problemStatement: challengeSpec.problemStatement,
        difficulty: challengeSpec.difficulty,
        language,
        code,
        passedTests: typeof passedTests === 'number' && Number.isFinite(passedTests) ? Math.max(0, passedTests) : 0,
        totalTests:
          typeof totalTests === 'number' && Number.isFinite(totalTests)
            ? Math.max(1, totalTests)
            : SERVER_CHALLENGE_SPECS[challengeSpec.id]?.tests.length || 1,
        durationMinutes:
          typeof durationMinutes === 'number' && Number.isFinite(durationMinutes)
            ? Math.max(5, Math.min(120, durationMinutes))
            : 30,
        elapsedSeconds:
          typeof elapsedSeconds === 'number' && Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0,
        transcript: Array.isArray(transcript) ? transcript.slice(-24) : [],
      });
      res.json({ scorecard });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to evaluate mock interview session.';
      res.status(msg.includes('GEMINI_API_KEY') ? 503 : 502).json({ error: msg });
    }
  });

  // -------------------------------------------------------------------------
  // Mission Mode Evaluation Engine & Admin Eval Config Management
  // -------------------------------------------------------------------------
  app.get('/api/missions/eval-meta/:missionId', requireAuth, (req: AuthedRequest, res: Response) => {
    const missionId = String(req.params.missionId || '').trim();
    const spec = getMissionEvalSpec(missionId);
    if (!spec) {
      res.status(404).json({ error: 'Evaluation specification not found for this mission.' });
      return;
    }
    res.json(buildPublicEvalSummary(spec));
  });

  app.post('/api/missions/checkpoint/validate', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`mission-cp:${uid}`, 45, 60_000)) {
      res.status(429).json({ error: 'Too many checkpoint checks. Please wait briefly.' });
      return;
    }

    const { missionId, checkpointId, files } = req.body as {
      missionId?: string;
      checkpointId?: string;
      files?: SubmittedFileInput[];
    };

    if (!missionId || !checkpointId || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'missionId, checkpointId, and files are required.' });
      return;
    }

    const totalSize = files.reduce((sum, f) => sum + (typeof f?.content === 'string' ? f.content.length : 0), 0);
    if (totalSize > 250_000) {
      res.status(400).json({ error: 'Workspace payload exceeds maximum evaluation size.' });
      return;
    }

    const spec = getMissionEvalSpec(missionId);
    if (!spec) {
      res.status(404).json({ error: 'Mission evaluator configuration not found.' });
      return;
    }

    const validators = spec.checkpointValidators[checkpointId];
    if (!validators || validators.length === 0) {
      res.status(404).json({ error: `No validator configured for checkpoint "${checkpointId}".` });
      return;
    }

    let executionMs = 0;
    const testResults: MissionTestCaseResult[] = [];
    const details: string[] = [];

    for (const v of validators) {
      const outcome = runSingleMissionTest(files, v);
      executionMs += outcome.executionMs;
      testResults.push(outcome.result);
      if (!outcome.result.passed) {
        details.push(outcome.result.error || outcome.suggestion || v.requirementText);
      }
    }

    const passed = testResults.every((r) => r.passed);
    res.json({
      missionId,
      checkpointId,
      passed,
      message: passed
        ? 'Checkpoint verified successfully against server checks.'
        : details[0] || 'Checkpoint requirements not yet satisfied.',
      details,
      testResults,
      executionMs,
    });
  });

  app.post('/api/missions/evaluate', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`mission-eval:${uid}`, 30, 60_000)) {
      res.status(429).json({ error: 'Too many mission evaluations. Please wait a minute.' });
      return;
    }

    const { missionId, files } = req.body as {
      missionId?: string;
      files?: SubmittedFileInput[];
    };

    if (!missionId || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'missionId and non-empty files array are required.' });
      return;
    }

    const totalSize = files.reduce((sum, f) => sum + (typeof f?.content === 'string' ? f.content.length : 0), 0);
    if (totalSize > 250_000) {
      res.status(400).json({ error: 'Mission code payload exceeds maximum evaluation size.' });
      return;
    }

    const spec = getMissionEvalSpec(missionId);
    if (!spec || spec.submissionTests.length === 0) {
      res.status(404).json({ error: 'Mission evaluation suite is not configured.' });
      return;
    }

    const testResults: MissionTestCaseResult[] = [];
    const requirementsSatisfied: string[] = [];
    const requirementsMissing: string[] = [];
    const runtimeErrors: string[] = [];
    const suggestions: string[] = [];
    let executionMs = 0;

    for (const testSpec of spec.submissionTests) {
      const outcome = runSingleMissionTest(files, testSpec);
      executionMs += outcome.executionMs;
      testResults.push(outcome.result);
      if (outcome.result.passed) {
        requirementsSatisfied.push(testSpec.requirementText);
      } else {
        requirementsMissing.push(testSpec.requirementText);
        if (outcome.result.error && !runtimeErrors.includes(outcome.result.error)) {
          runtimeErrors.push(outcome.result.error);
        }
        if (outcome.suggestion && !suggestions.includes(outcome.suggestion)) {
          suggestions.push(outcome.suggestion);
        }
      }
    }

    const passedCount = testResults.filter((r) => r.passed).length;
    const totalCount = testResults.length;
    const passed = passedCount === totalCount;
    const xpAwarded = passed ? Math.min(250, Math.max(25, spec.xpReward)) : 0;

    const attestation = crypto
      .createHash('sha256')
      .update(`${uid}:mission:${missionId}:${passed ? 'pass' : 'fail'}:${xpAwarded}:${passedCount}/${totalCount}`)
      .digest('hex')
      .slice(0, 24);

    res.json({
      missionId,
      passed,
      passedCount,
      totalCount,
      requirementsSatisfied,
      requirementsMissing,
      testResults,
      runtimeErrors,
      suggestions,
      executionMs,
      xpAwarded,
      badgeId: passed ? spec.badgeId : null,
      badgeTitle: passed ? spec.badgeTitle : null,
      attestation,
    });
  });

  app.get('/api/admin/missions/eval-config/:missionId', requireAuth, (req: AuthedRequest, res: Response) => {
    if (!isVerifiedAdminRequest(req)) {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    const spec = getMissionEvalSpec(String(req.params.missionId || ''));
    if (!spec) {
      res.status(404).json({ error: 'No eval configuration exists yet for this mission.' });
      return;
    }
    res.json(spec);
  });

  app.post('/api/admin/missions/eval-config', requireAuth, (req: AuthedRequest, res: Response) => {
    if (!isVerifiedAdminRequest(req)) {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    const body = req.body as MissionServerEvalConfig;
    if (
      !body ||
      !body.missionId ||
      !body.language ||
      !Array.isArray(body.submissionTests) ||
      body.submissionTests.length === 0
    ) {
      res.status(400).json({ error: 'Invalid mission evaluation configuration payload.' });
      return;
    }
    const sanitized: MissionServerEvalConfig = {
      missionId: String(body.missionId).trim().slice(0, 128),
      language: body.language,
      xpReward: Math.min(250, Math.max(25, Number(body.xpReward) || 100)),
      badgeId: String(body.badgeId || 'mission_custom').slice(0, 64),
      badgeTitle: String(body.badgeTitle || 'Mission Completer').slice(0, 120),
      checkpointValidators: body.checkpointValidators || {},
      submissionTests: body.submissionTests.slice(0, 25),
    };
    saveCustomEvalSpec(sanitized);
    res.json({ saved: true, missionId: sanitized.missionId });
  });

  app.delete('/api/admin/missions/eval-config/:missionId', requireAuth, (req: AuthedRequest, res: Response) => {
    if (!isVerifiedAdminRequest(req)) {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    deleteCustomEvalSpec(String(req.params.missionId || ''));
    res.json({ deleted: true });
  });

  // Trusted XP reward validation schedule
  app.post('/api/xp/attest', requireAuth, (req: AuthedRequest, res: Response) => {
    const { sourceType, sourceId } = req.body as { sourceType?: string; sourceId?: string };
    const rewardTable: Record<string, number> = {
      lesson: 35,
      quiz: 50,
      challenge: 75,
      project: 150,
      mission: 40,
    };
    if (!sourceType || !rewardTable[sourceType] || !sourceId || sourceId.length > 100) {
      res.status(400).json({ error: 'Invalid XP attestation request.' });
      return;
    }
    let amount = rewardTable[sourceType];
    if (sourceType === 'challenge' && SERVER_CHALLENGE_SPECS[sourceId]) {
      amount = SERVER_CHALLENGE_SPECS[sourceId].xpReward;
    } else if (sourceType === 'mission') {
      const missionSpec = getMissionEvalSpec(sourceId);
      if (missionSpec) {
        amount = Math.min(250, Math.max(25, missionSpec.xpReward));
      }
    }

    const attestation = crypto
      .createHash('sha256')
      .update(`${req.uid}:${sourceType}:${sourceId}:${amount}`)
      .digest('hex')
      .slice(0, 16);

    res.json({
      verified: true,
      amount,
      sourceType,
      sourceId,
      attestation,
    });
  });

  // -------------------------------------------------------------------------
  // TestLab Endpoints (Isolated Execution, AI Generation, AI Assistant)
  // -------------------------------------------------------------------------
  app.post('/api/testlab/generate', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`testlab-gen:${uid}`, 15, 60_000)) {
      res.status(429).json({ error: 'Too many AI test generation requests. Please wait briefly.' });
      return;
    }
    const { projectTitle, language, files, testTypes, focusPrompt } = req.body as {
      projectTitle?: string;
      language?: string;
      files?: SubmittedFileInput[];
      testTypes?: TestType[];
      focusPrompt?: string;
    };
    if (!projectTitle || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'projectTitle and at least one project file are required.' });
      return;
    }
    try {
      const generated = await generateTestsWithAi({
        projectTitle,
        language: language || 'javascript',
        files,
        testTypes: Array.isArray(testTypes) && testTypes.length > 0 ? testTypes : ['unit', 'edge_case'],
        focusPrompt,
      });
      res.json(generated);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to generate tests with AI.',
      });
    }
  });

  app.post('/api/testlab/execute', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`testlab-run:${uid}`, 30, 60_000)) {
      res.status(429).json({ error: 'Too many TestLab execution runs. Please wait a moment.' });
      return;
    }
    const { language, files, cases } = req.body as {
      language?: string;
      files?: SubmittedFileInput[];
      cases?: TestCaseItem[];
    };
    if (!Array.isArray(files) || !Array.isArray(cases) || cases.length === 0) {
      res.status(400).json({ error: 'files and non-empty test cases array are required.' });
      return;
    }
    const totalPayload = files.reduce((s, f) => s + (f.content?.length || 0), 0);
    if (totalPayload > 350_000) {
      res.status(400).json({ error: 'Project code exceeds isolated execution size limit.' });
      return;
    }
    const outcome = executeTestLabSuite({
      language: language || 'javascript',
      files,
      cases: cases.slice(0, 50),
    });
    res.json(outcome);
  });

  app.post('/api/testlab/assist', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`testlab-assist:${uid}`, 20, 60_000)) {
      res.status(429).json({ error: 'Too many TestLab AI assistant messages.' });
      return;
    }
    const { question, projectTitle, language, files, failedResults, coverage } = req.body as {
      question?: string;
      projectTitle?: string;
      language?: string;
      files?: SubmittedFileInput[];
      failedResults?: TestCaseResult[];
      coverage?: TestCoverageSummary;
    };
    if (!question || !projectTitle) {
      res.status(400).json({ error: 'question and projectTitle are required.' });
      return;
    }
    try {
      const response = await assistTestingWithAi({
        question,
        projectTitle,
        language: language || 'javascript',
        files: Array.isArray(files) ? files : [],
        failedResults: Array.isArray(failedResults) ? failedResults : [],
        coverage,
      });
      res.json(response);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'TestLab AI assistant request failed.',
      });
    }
  });

  // -------------------------------------------------------------------------
  // Architect Endpoints (AI Software Architecture, Revision & Exporters)
  // -------------------------------------------------------------------------
  app.post('/api/architect/generate', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`arch-gen:${uid}`, 12, 60_000)) {
      res.status(429).json({ error: 'Too many architecture generation requests.' });
      return;
    }
    const { prompt, constraints } = req.body as { prompt?: string; constraints?: string };
    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: 'Describe your software idea to generate an architecture plan.' });
      return;
    }
    try {
      const plan = await generateArchitectureWithAi({ prompt: prompt.trim(), constraints });
      res.json(plan);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to generate architecture plan.',
      });
    }
  });

  app.post('/api/architect/revise', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || req.ip || 'anon';
    if (!checkRateLimit(`arch-rev:${uid}`, 15, 60_000)) {
      res.status(429).json({ error: 'Too many architecture revision requests.' });
      return;
    }
    const { currentPlan, revisionPrompt } = req.body as {
      currentPlan?: Omit<ArchitecturePlan, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
      revisionPrompt?: string;
    };
    if (!currentPlan || !revisionPrompt?.trim()) {
      res.status(400).json({ error: 'currentPlan and revisionPrompt are required.' });
      return;
    }
    try {
      const updated = await reviseArchitectureWithAi({
        currentPlan,
        revisionPrompt: revisionPrompt.trim(),
      });
      res.json(updated);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to revise architecture plan.',
      });
    }
  });

  app.post('/api/architect/export', requireAuth, (req: AuthedRequest, res: Response) => {
    const { format, plan } = req.body as {
      format?: 'sql' | 'openapi_json' | 'firestore_schema';
      plan?: ArchitecturePlan;
    };
    if (!plan || !format) {
      res.status(400).json({ error: 'format and plan are required.' });
      return;
    }
    if (format === 'sql') {
      res.json({ filename: `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.sql`, content: exportDatabaseSqlDdl(plan.databaseTables || []) });
      return;
    }
    if (format === 'openapi_json') {
      const spec = exportOpenApiSpecJson(plan);
      res.json({
        filename: `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.openapi.json`,
        content: JSON.stringify(spec, null, 2),
      });
      return;
    }
    if (format === 'firestore_schema') {
      const collections = (plan.databaseTables || []).map((t) => ({
        collection: t.name,
        description: t.description,
        fields: t.fields,
        indexes: t.indexes,
      }));
      res.json({
        filename: `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.firestore.json`,
        content: JSON.stringify({ collections }, null, 2),
      });
      return;
    }
    res.status(400).json({ error: `Unsupported export format: ${format}` });
  });

  // -------------------------------------------------------------------------
  // Collaboration Invite Attestation & Version Snapshot Diff Endpoints
  // -------------------------------------------------------------------------
  app.post('/api/collab/invitations/sign', requireAuth, (req: AuthedRequest, res: Response) => {
    const { projectId, inviteeEmail, role, ttlDays } = req.body as {
      projectId?: string;
      inviteeEmail?: string;
      role?: 'editor' | 'viewer';
      ttlDays?: number;
    };
    if (!projectId || !inviteeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail.trim())) {
      res.status(400).json({ error: 'Valid projectId and inviteeEmail are required.' });
      return;
    }
    const safeRole: 'editor' | 'viewer' = role === 'editor' ? 'editor' : 'viewer';
    const normalizedEmail = normalizeInviteEmail(inviteeEmail);
    const days = Math.min(30, Math.max(1, Number(ttlDays) || 7));
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const inviteId = buildDeterministicInviteId(projectId, normalizedEmail);
    const inviteSignature = signInvitationPayload({
      projectId,
      inviteeEmail: normalizedEmail,
      role: safeRole,
      expiresAt,
    });
    res.json({ inviteId, inviteeEmail: normalizedEmail, role: safeRole, expiresAt, inviteSignature });
  });

  app.post('/api/collab/invitations/verify', requireAuth, (req: AuthedRequest, res: Response) => {
    const { projectId, inviteeEmail, role, expiresAt, inviteSignature } = req.body as {
      projectId?: string;
      inviteeEmail?: string;
      role?: 'editor' | 'viewer';
      expiresAt?: string;
      inviteSignature?: string;
    };
    if (!projectId || !inviteeEmail || !role || !expiresAt || !inviteSignature) {
      res.status(400).json({ error: 'Incomplete invitation verification payload.' });
      return;
    }
    const callerEmail = normalizeInviteEmail(req.userEmail || '');
    if (callerEmail !== normalizeInviteEmail(inviteeEmail)) {
      res.status(403).json({
        valid: false,
        expired: false,
        reason: 'Signed-in account email does not match the invited email address.',
      });
      return;
    }
    const result = verifyInvitationPayload({
      projectId,
      inviteeEmail,
      role,
      expiresAt,
      inviteSignature,
    });
    res.status(result.valid ? 200 : 400).json(result);
  });

  app.post('/api/versions/diff', requireAuth, (req: AuthedRequest, res: Response) => {
    const { baseSnapshot, targetSnapshot } = req.body as {
      baseSnapshot?: ProjectVersionSnapshot[];
      targetSnapshot?: ProjectVersionSnapshot[];
    };
    if (!Array.isArray(baseSnapshot) || !Array.isArray(targetSnapshot)) {
      res.status(400).json({ error: 'baseSnapshot and targetSnapshot arrays are required.' });
      return;
    }
    res.json(computeSnapshotDiff(baseSnapshot, targetSnapshot));
  });

  // -------------------------------------------------------------------------
  // Admin Community Media Uploads (Images <= 10 MB, Videos 1 MB - 80 MB Max)
  // -------------------------------------------------------------------------
  const communityMediaDir = path.resolve(__dirname, '.mideocode-uploads', 'community');
  const communityMediaTmpDir = path.resolve(__dirname, '.mideocode-uploads', 'community-tmp');
  fs.mkdirSync(communityMediaDir, { recursive: true });
  fs.mkdirSync(communityMediaTmpDir, { recursive: true });

  const VIDEO_MIN_BYTES = 1_000_000; // 1 MB
  const VIDEO_MAX_BYTES = 80 * 1024 * 1024; // 80 MiB max
  const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB max

  interface PendingMediaUpload {
    id: string;
    adminUid: string;
    kind: 'image' | 'video';
    ext: string;
    mimeType: string;
    originalName: string;
    expectedSize: number;
    uploadedBytes: number;
    tmpPath: string;
    createdAt: number;
  }

  const pendingMediaUploads = new Map<string, PendingMediaUpload>();

  const MEDIA_MIME_TO_EXT: Record<string, { kind: 'image' | 'video'; ext: string; canonicalMime: string }> = {
    'image/png': { kind: 'image', ext: 'png', canonicalMime: 'image/png' },
    'image/jpeg': { kind: 'image', ext: 'jpg', canonicalMime: 'image/jpeg' },
    'image/jpg': { kind: 'image', ext: 'jpg', canonicalMime: 'image/jpeg' },
    'image/webp': { kind: 'image', ext: 'webp', canonicalMime: 'image/webp' },
    'image/gif': { kind: 'image', ext: 'gif', canonicalMime: 'image/gif' },
    'video/mp4': { kind: 'video', ext: 'mp4', canonicalMime: 'video/mp4' },
    'video/webm': { kind: 'video', ext: 'webm', canonicalMime: 'video/webm' },
    'video/quicktime': { kind: 'video', ext: 'mp4', canonicalMime: 'video/mp4' },
    'video/x-m4v': { kind: 'video', ext: 'mp4', canonicalMime: 'video/mp4' },
    'video/ogg': { kind: 'video', ext: 'ogv', canonicalMime: 'video/ogg' },
  };

  function validateMediaMagicBytes(head: Buffer, kind: 'image' | 'video', ext: string): boolean {
    if (head.length < 8) return false;
    if (kind === 'image') {
      if (ext === 'png') return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      if (ext === 'jpg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      if (ext === 'gif') return head.subarray(0, 3).toString('ascii') === 'GIF';
      if (ext === 'webp') {
        return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP';
      }
      return false;
    }
    if (ext === 'mp4') {
      return head.subarray(4, 8).toString('ascii') === 'ftyp';
    }
    if (ext === 'webm') {
      return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    }
    if (ext === 'ogv') {
      return head.subarray(0, 4).toString('ascii') === 'OggS';
    }
    return false;
  }

  app.post('/api/admin/community-media/init', requireAuth, (req: AuthedRequest, res: Response) => {
    if (!isVerifiedAdminRequest(req) || !req.uid) {
      res.status(403).json({ error: 'Only verified administrators can upload community media.' });
      return;
    }
    if (!checkRateLimit(`admin-media-init:${req.uid}`, 40, 10 * 60_000)) {
      res.status(429).json({ error: 'Too many upload requests. Wait a moment and try again.' });
      return;
    }
    const { kind, mimeType, fileName, sizeBytes, totalSize: bodyTotalSize } = req.body as {
      kind?: 'image' | 'video';
      mimeType?: string;
      fileName?: string;
      sizeBytes?: number;
      totalSize?: number;
    };

    const normalizedMime = String(mimeType || '').toLowerCase().split(';')[0].trim();
    const spec = MEDIA_MIME_TO_EXT[normalizedMime];
    if (!spec || (kind && spec.kind !== kind)) {
      res.status(400).json({
        error: 'Unsupported media format. Use PNG/JPG/WebP/GIF images or MP4/WebM/MOV/OGG videos.',
      });
      return;
    }

    const totalSize = Number(sizeBytes ?? bodyTotalSize);
    if (!Number.isFinite(totalSize) || totalSize <= 0) {
      res.status(400).json({ error: 'Invalid file size.' });
      return;
    }
    if (spec.kind === 'video') {
      if (totalSize < VIDEO_MIN_BYTES) {
        res.status(400).json({
          error: 'Community video must be at least 1 MB (1,000,000 bytes).',
        });
        return;
      }
      if (totalSize > VIDEO_MAX_BYTES) {
        res.status(400).json({
          error: 'Community video exceeds the 80 MB maximum limit.',
        });
        return;
      }
    } else if (totalSize > IMAGE_MAX_BYTES) {
      res.status(400).json({ error: 'Each community image must be 10 MB or smaller.' });
      return;
    }

    // Clean stale unfinished temp uploads older than 1 hour
    const now = Date.now();
    for (const [oldId, meta] of pendingMediaUploads.entries()) {
      if (now - meta.createdAt > 3600_000) {
        try {
          if (fs.existsSync(meta.tmpPath)) fs.unlinkSync(meta.tmpPath);
        } catch {
          // Ignore cleanup errors
        }
        pendingMediaUploads.delete(oldId);
      }
    }

    const uploadId = `up_${now}_${crypto.randomBytes(6).toString('hex')}`;
    const tmpPath = path.join(communityMediaTmpDir, `${uploadId}.part`);
    fs.writeFileSync(tmpPath, Buffer.alloc(0));

    pendingMediaUploads.set(uploadId, {
      id: uploadId,
      adminUid: req.uid,
      kind: spec.kind,
      ext: spec.ext,
      mimeType: spec.canonicalMime,
      originalName: String(fileName || `media.${spec.ext}`).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120),
      expectedSize: totalSize,
      uploadedBytes: 0,
      tmpPath,
      createdAt: now,
    });

    res.json({ uploadId, maxChunkBytes: 4 * 1024 * 1024 });
  });

  app.post(
    '/api/admin/community-media/chunk/:uploadId',
    express.raw({ type: 'application/octet-stream', limit: '6mb' }),
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      if (!isVerifiedAdminRequest(req) || !req.uid) {
        res.status(403).json({ error: 'Only verified administrators can upload community media.' });
        return;
      }
      const uploadId = String(req.params.uploadId || '');
      const session = pendingMediaUploads.get(uploadId);
      if (!session || session.adminUid !== req.uid) {
        res.status(404).json({ error: 'Upload session not found or expired.' });
        return;
      }
      const chunk = req.body as Buffer;
      if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
        res.status(400).json({ error: 'Empty binary chunk.' });
        return;
      }
      const maxAllowed = session.kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
      if (session.uploadedBytes + chunk.length > maxAllowed || session.uploadedBytes + chunk.length > session.expectedSize) {
        res.status(400).json({ error: 'Upload size exceeds allowed file limit.' });
        return;
      }

      fs.appendFileSync(session.tmpPath, chunk);
      session.uploadedBytes += chunk.length;
      res.json({ uploadId, uploadedBytes: session.uploadedBytes, expectedSize: session.expectedSize });
    },
  );

  app.post('/api/admin/community-media/complete/:uploadId', requireAuth, (req: AuthedRequest, res: Response) => {
    if (!isVerifiedAdminRequest(req) || !req.uid) {
      res.status(403).json({ error: 'Only verified administrators can finalize community media.' });
      return;
    }
    const uploadId = String(req.params.uploadId || '');
    const session = pendingMediaUploads.get(uploadId);
    if (!session || session.adminUid !== req.uid || !fs.existsSync(session.tmpPath)) {
      res.status(404).json({ error: 'Upload session not found or expired.' });
      return;
    }

    try {
      const stat = fs.statSync(session.tmpPath);
      if (stat.size !== session.expectedSize) {
        fs.unlinkSync(session.tmpPath);
        pendingMediaUploads.delete(uploadId);
        res.status(400).json({ error: 'Incomplete upload: file size mismatch.' });
        return;
      }
      if (session.kind === 'video' && (stat.size < VIDEO_MIN_BYTES || stat.size > VIDEO_MAX_BYTES)) {
        fs.unlinkSync(session.tmpPath);
        pendingMediaUploads.delete(uploadId);
        res.status(400).json({ error: 'Video must be between 1 MB and 80 MB.' });
        return;
      }

      const fd = fs.openSync(session.tmpPath, 'r');
      const head = Buffer.alloc(16);
      fs.readSync(fd, head, 0, 16, 0);
      fs.closeSync(fd);

      if (!validateMediaMagicBytes(head, session.kind, session.ext)) {
        fs.unlinkSync(session.tmpPath);
        pendingMediaUploads.delete(uploadId);
        res.status(400).json({
          error: `File header does not match ${session.mimeType}. Please upload a valid ${session.ext.toUpperCase()} file.`,
        });
        return;
      }

      const finalFilename = `cm_${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${session.ext}`;
      const finalPath = path.join(communityMediaDir, finalFilename);
      fs.renameSync(session.tmpPath, finalPath);
      pendingMediaUploads.delete(uploadId);

      res.json({
        url: `/api/community/media/${finalFilename}`,
        filename: finalFilename,
        name: session.originalName,
        kind: session.kind,
        mimeType: session.mimeType,
        sizeBytes: stat.size,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to finalize uploaded media.',
      });
    }
  });

  app.delete('/api/admin/community-media/:filename', requireAuth, (req: AuthedRequest, res: Response) => {
    if (!isVerifiedAdminRequest(req)) {
      res.status(403).json({ error: 'Admin privileges required.' });
      return;
    }
    const filename = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|webp|gif|mp4|webm|ogv)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid media filename.' });
      return;
    }
    const target = path.join(communityMediaDir, filename);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
    res.json({ ok: true });
  });

  app.get('/api/community/media/:filename', (req: Request, res: Response) => {
    const filename = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|webp|gif|mp4|webm|ogv)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid community media filename.' });
      return;
    }
    const filePath = path.join(communityMediaDir, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Community media not found.' });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogv': 'video/ogg',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    const isVideo = contentType.startsWith('video/');

    if (!isVideo) {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(filePath);
      return;
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
        return;
      }
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;
      const maxChunkEnd = Math.min(totalSize - 1, start + 4 * 1024 * 1024 - 1);
      const end = match[2] ? Math.min(requestedEnd, totalSize - 1) : maxChunkEnd;
      if (!Number.isFinite(start) || start >= totalSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.status(200);
    res.setHeader('Content-Length', String(totalSize));
    fs.createReadStream(filePath).pipe(res);
  });

  // -------------------------------------------------------------------------
  // MideoCode Project Rescue AI Endpoints
  // -------------------------------------------------------------------------
  app.post(
    '/api/rescue/import/zip',
    express.raw({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      limit: '25mb',
    }),
    requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const uid = req.uid || 'anon';
      if (!checkRateLimit(`rescue-zip:${uid}`, 20, 10 * 60_000)) {
        res.status(429).json({ error: 'ZIP import rate limit reached. Wait a moment before retrying.' });
        return;
      }
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (buffer.length < 4) {
        res.status(400).json({ error: 'Upload a valid non-empty .zip archive.' });
        return;
      }
      const selectedRoot =
        typeof req.query.selectedRoot === 'string'
          ? req.query.selectedRoot
          : typeof req.headers['x-selected-root'] === 'string'
            ? req.headers['x-selected-root']
            : undefined;
      const projectNameHint =
        typeof req.query.projectName === 'string'
          ? req.query.projectName
          : typeof req.headers['x-project-name'] === 'string'
            ? req.headers['x-project-name']
            : undefined;
      try {
        const result = await inspectAndExtractZipBuffer(buffer, {
          selectedRoot,
          projectNameHint,
          userId: uid,
        });
        res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to extract ZIP archive.';
        res.status(err instanceof ZipSecurityError ? 400 : 422).json({ error: msg });
      }
    },
  );

  app.post('/api/rescue/import/git', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || 'anon';
    if (!checkRateLimit(`rescue-git:${uid}`, 20, 10 * 60_000)) {
      res.status(429).json({ error: 'Git import rate limit reached. Wait a moment before retrying.' });
      return;
    }
    const { repoUrl, branch, githubToken } = req.body as {
      repoUrl?: string;
      branch?: string;
      githubToken?: string;
    };
    if (!repoUrl?.trim()) {
      res.status(400).json({ error: 'An HTTPS GitHub repository URL is required.' });
      return;
    }
    try {
      const result = await importGitRepository({
        repoUrl: repoUrl.trim(),
        branch: branch?.trim() || undefined,
        githubToken: githubToken?.trim() || undefined,
        userId: uid,
      });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Git repository import failed.';
      res.status(err instanceof ZipSecurityError ? 400 : 422).json({ error: msg });
    }
  });

  app.post('/api/rescue/jobs', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.uid || 'anon';
    if (!checkRateLimit(`rescue-job:${uid}`, 30, 10 * 60_000)) {
      res.status(429).json({ error: 'Scan rate limit reached. Wait a moment before launching another scan.' });
      return;
    }
    const { projectId, projectTitle, scanMode, files, customConfig } = req.body as {
      projectId?: string;
      projectTitle?: string;
      scanMode?: RescueScanMode;
      files?: RescueWorkspaceFile[];
      customConfig?: RescueCustomScanConfig;
    };
    if (!projectId || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'projectId and non-empty files array are required.' });
      return;
    }
    const safeMode: RescueScanMode =
      scanMode === 'quick' || scanMode === 'deep' || scanMode === 'full' || scanMode === 'custom'
        ? scanMode
        : 'deep';
    try {
      const job = startRescueScanJob({
        userId: uid,
        projectId,
        projectTitle: projectTitle || 'Workspace Project',
        scanMode: safeMode,
        files,
        customConfig,
      });
      res.json(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to launch background scan job.';
      recordRescueAdminEvent({
        kind: 'failed_scan',
        userId: uid,
        projectTitle,
        message: msg,
      });
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/rescue/jobs/:jobId', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.uid || 'anon';
    const jobId = String(req.params.jobId || '');
    const job = getUserRescueScanJob(jobId, uid);
    if (!job) {
      res.status(404).json({ error: 'Scan job not found or expired.' });
      return;
    }
    res.json(job);
  });

  app.post('/api/rescue/jobs/:jobId/cancel', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.uid || 'anon';
    const jobId = String(req.params.jobId || '');
    const job = cancelRescueScanJob(jobId, uid);
    if (!job) {
      res.status(404).json({ error: 'Scan job not found.' });
      return;
    }
    res.json(job);
  });

  app.post('/api/rescue/scan', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || 'anon';
    if (!checkRateLimit(`rescue-scan:${uid}`, 30, 10 * 60_000)) {
      res.status(429).json({ error: 'Scan rate limit reached. Please wait a moment before re-scanning.' });
      return;
    }
    const { projectId, projectTitle, scanMode, files, customConfig } = req.body as {
      projectId?: string;
      projectTitle?: string;
      scanMode?: RescueScanMode;
      files?: RescueWorkspaceFile[];
      customConfig?: RescueCustomScanConfig;
    };
    if (!projectId || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'projectId and non-empty files array are required.' });
      return;
    }
    const safeMode: RescueScanMode =
      scanMode === 'quick' || scanMode === 'deep' || scanMode === 'full' || scanMode === 'custom'
        ? scanMode
        : 'deep';
    try {
      const report = await scanProjectWorkspace({
        userId: uid,
        projectId,
        projectTitle: projectTitle || 'Workspace Project',
        scanMode: safeMode,
        files,
        customConfig,
      });
      res.json(report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Project Rescue scan failed.';
      recordRescueAdminEvent({
        kind: 'failed_scan',
        userId: uid,
        projectTitle,
        message: msg,
      });
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/rescue/investigate', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || 'anon';
    if (!checkRateLimit(`rescue-inv:${uid}`, 25, 10 * 60_000)) {
      res.status(429).json({ error: 'Investigation rate limit reached. Wait a moment before retrying.' });
      return;
    }
    const { projectTitle, files, issue, userProblemDescription, expectedBehavior, actualBehavior, screenshot } =
      req.body as {
        projectTitle?: string;
        files?: RescueWorkspaceFile[];
        issue?: RescueIssue | null;
        userProblemDescription?: string;
        expectedBehavior?: string;
        actualBehavior?: string;
        screenshot?: { mimeType: string; dataBase64: string } | null;
      };
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'Workspace files are required for investigation.' });
      return;
    }
    try {
      const analysis = await investigateProjectIssue({
        projectTitle: projectTitle || 'Workspace Project',
        files,
        issue,
        userProblemDescription,
        expectedBehavior,
        actualBehavior,
        screenshot,
      });
      res.json(analysis);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Root cause investigation failed.';
      recordRescueAdminEvent({
        kind: 'ai_error',
        userId: uid,
        projectTitle,
        message: msg,
      });
      res.status(msg.includes('GEMINI_API_KEY') ? 503 : 500).json({ error: msg });
    }
  });

  app.post('/api/rescue/analyze-impact', requireAuth, (req: AuthedRequest, res: Response) => {
    const { files, targetFilePath, proposedCode } = req.body as {
      files?: RescueWorkspaceFile[];
      targetFilePath?: string;
      proposedCode?: string;
    };
    if (!Array.isArray(files) || !targetFilePath || typeof proposedCode !== 'string') {
      res.status(400).json({ error: 'files, targetFilePath, and proposedCode are required.' });
      return;
    }
    try {
      const impact = analyzeFixImpact(files, targetFilePath, proposedCode);
      res.json(impact);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Impact analysis failed.',
      });
    }
  });

  app.post('/api/rescue/propose-fix', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || 'anon';
    if (!checkRateLimit(`rescue-fix:${uid}`, 20, 10 * 60_000)) {
      res.status(429).json({ error: 'Fix proposal rate limit reached. Wait a moment before retrying.' });
      return;
    }
    const { projectTitle, files, targetFilePath, problemDescription, rootCause, issueId } = req.body as {
      projectTitle?: string;
      files?: RescueWorkspaceFile[];
      targetFilePath?: string;
      problemDescription?: string;
      rootCause?: RescueRootCauseAnalysis | null;
      issueId?: string;
    };
    if (!Array.isArray(files) || !targetFilePath || !problemDescription) {
      res.status(400).json({ error: 'files, targetFilePath, and problemDescription are required.' });
      return;
    }
    try {
      const proposal = await proposeFixAndAnalyzeImpact({
        projectTitle: projectTitle || 'Workspace Project',
        files,
        targetFilePath,
        problemDescription,
        rootCause,
        issueId,
      });
      res.json(proposal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate fix proposal.';
      recordRescueAdminEvent({
        kind: 'ai_error',
        userId: uid,
        projectTitle,
        message: msg,
      });
      res.status(msg.includes('GEMINI_API_KEY') ? 503 : 500).json({ error: msg });
    }
  });

  app.post('/api/rescue/verify', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || 'anon';
    const { projectId, projectTitle, files, previousIssueIds, targetFilePath, testSuite } = req.body as {
      projectId?: string;
      projectTitle?: string;
      files?: RescueWorkspaceFile[];
      previousIssueIds?: string[];
      targetFilePath?: string;
      testSuite?: TestSuite | null;
    };
    if (!projectId || !Array.isArray(files) || !targetFilePath) {
      res.status(400).json({ error: 'projectId, files, and targetFilePath are required.' });
      return;
    }
    try {
      const verification = await verifyPatchedWorkspace({
        userId: uid,
        projectId,
        projectTitle: projectTitle || 'Workspace Project',
        files,
        previousIssueIds,
        targetFilePath,
        testSuite,
      });
      res.json(verification);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Fix verification check failed.',
      });
    }
  });

  app.post('/api/rescue/chat', requireAuth, async (req: AuthedRequest, res: Response) => {
    const uid = req.uid || 'anon';
    if (!checkRateLimit(`rescue-chat:${uid}`, 40, 10 * 60_000)) {
      res.status(429).json({ error: 'Rescue Chat rate limit reached. Wait a moment before sending more messages.' });
      return;
    }
    const { projectTitle, files, message, history, latestIssues } = req.body as {
      projectTitle?: string;
      files?: RescueWorkspaceFile[];
      message?: string;
      history?: RescueChatMessage[];
      latestIssues?: RescueIssue[];
    };
    if (!Array.isArray(files) || !message?.trim()) {
      res.status(400).json({ error: 'files and message are required.' });
      return;
    }
    try {
      const reply = await chatWithRescueAssistant({
        projectTitle: projectTitle || 'Workspace Project',
        files,
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
        latestIssues,
      });
      res.json(reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rescue Chat could not respond.';
      recordRescueAdminEvent({
        kind: 'ai_error',
        userId: uid,
        projectTitle,
        message: msg,
      });
      res.status(msg.includes('GEMINI_API_KEY') ? 503 : 500).json({ error: msg });
    }
  });

  app.get('/api/rescue/admin/telemetry', requireAuth, (req: AuthedRequest, res: Response) => {
    if (!isVerifiedAdminRequest(req)) {
      res.status(403).json({ error: 'Only verified administrators can view Rescue AI operations telemetry.' });
      return;
    }
    res.json(getRescueAdminTelemetry());
  });

  // Vite dev middleware or production static build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const rawEnvPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  const PORT =
    process.env.NODE_ENV !== 'production'
      ? Number(process.env.DEFAULT_APP_PORT) || 3000
      : rawEnvPort && rawEnvPort !== nginxPort
        ? rawEnvPort
        : Number(process.env.DEFAULT_APP_PORT) || 3000;
  const httpServer = http.createServer(app);
  attachPairProgrammingWebSocket(httpServer, {
    firebaseProjectId,
    firestoreDatabaseId,
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MideoCode server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MideoCode server:', err);
  process.exit(1);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  fileMatchesTestLabLanguage,
  normalizeTestLabLanguage,
  type TestLabLanguageId,
} from '../data/testLabLanguages.ts';
import type {
  TestCaseItem,
  TestCaseResult,
  TestCoverageSummary,
  TestType,
} from '../types/mideocode.ts';

export interface SubmittedWorkspaceFile {
  name: string;
  folder?: string;
  language?: string;
  content: string;
}

export interface ExecuteTestSuiteResult {
  status: 'passed' | 'failed' | 'error';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  errorTests: number;
  durationMs: number;
  results: TestCaseResult[];
  coverage: TestCoverageSummary;
}

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

function summarizeCounts(results: TestCaseResult[], startAll: number, coverage: TestCoverageSummary): ExecuteTestSuiteResult {
  const passedTests = results.filter((r) => r.status === 'passed').length;
  const failedTests = results.filter((r) => r.status === 'failed').length;
  const skippedTests = results.filter((r) => r.status === 'skipped').length;
  const errorTests = results.filter((r) => r.status === 'error').length;

  return {
    status: errorTests > 0 && passedTests === 0 ? 'error' : failedTests > 0 || errorTests > 0 ? 'failed' : 'passed',
    totalTests: results.length,
    passedTests,
    failedTests,
    skippedTests,
    errorTests,
    durationMs: Math.max(1, Date.now() - startAll),
    results,
    coverage,
  };
}

function stripTsIfNeeded(code: string, lang: string, filename: string): string {
  const lower = (filename || '').toLowerCase();
  if (lang === 'typescript' || lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    const out = transformSync(code, {
      loader: lower.endsWith('.tsx') ? 'tsx' : 'ts',
      target: 'es2022',
      format: 'esm',
    });
    return out.code
      .replace(/^\s*export\s+(default\s+)?/gm, '')
      .replace(/^\s*import\s+[^;]+;\s*$/gm, '');
  }
  return code
    .replace(/^\s*export\s+(default\s+)?/gm, '')
    .replace(/^\s*import\s+[^;]+;\s*$/gm, '');
}

function buildInstrumentedJs(files: SubmittedWorkspaceFile[]): {
  combinedSource: string;
  instrumented: boolean;
  compileError?: string;
  executableLinesByFile: Record<string, number[]>;
  definedFunctionsCount: number;
} {
  const executableLinesByFile: Record<string, number[]> = {};
  const chunks: string[] = [];
  let definedFunctionsCount = 0;
  let globalOffset = 0;

  for (const file of files) {
    let raw = '';
    try {
      raw = stripTsIfNeeded(file.content || '', file.language || 'javascript', file.name);
    } catch (err) {
      return {
        combinedSource: '',
        instrumented: false,
        compileError: `${file.name}: ${err instanceof Error ? err.message : String(err)}`,
        executableLinesByFile: {},
        definedFunctionsCount: 0,
      };
    }

    const lines = raw.split('\n');
    const execLines: number[] = [];
    const outLines: string[] = [];

    let inBlockComment = false;
    let backtickCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const prevEndsCleanly =
        i === 0 ||
        prevLine === '' ||
        prevLine.endsWith(';') ||
        prevLine.endsWith('{') ||
        prevLine.endsWith('}') ||
        prevLine.startsWith('//');

      if (trimmed.startsWith('/*')) inBlockComment = true;
      const endsBlockComment = trimmed.includes('*/');

      const unescapedBackticks = (line.match(/(?<!\\)`/g) || []).length;
      const insideTemplateBefore = backtickCount % 2 === 1;
      backtickCount += unescapedBackticks;
      const insideTemplateAfter = backtickCount % 2 === 1;

      const isCommentOrEmpty =
        !trimmed ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        inBlockComment ||
        trimmed === '{' ||
        trimmed === '}' ||
        trimmed === '};' ||
        trimmed === ');';

      if (inBlockComment && endsBlockComment) {
        inBlockComment = false;
      }

      if (
        !isCommentOrEmpty &&
        !insideTemplateBefore &&
        !insideTemplateAfter &&
        /function\s+[a-zA-Z_$]|=>/.test(trimmed)
      ) {
        definedFunctionsCount += 1;
      }

      const safeStmtStart =
        !isCommentOrEmpty &&
        !insideTemplateBefore &&
        !insideTemplateAfter &&
        prevEndsCleanly &&
        /^(const |let |var |return |if\s*\(|for\s*\(|while\s*\(|throw |switch\s*\(|[a-zA-Z_$][\w$.]*\s*(\(|=[^=>]))/.test(
          trimmed,
        ) &&
        !/^(else|catch|finally)\b/.test(trimmed);

      if (safeStmtStart) {
        execLines.push(lineNo);
        outLines.push(`__covHit(${JSON.stringify(file.name)}, ${lineNo}); ${line}`);
      } else {
        outLines.push(line);
      }
    }

    executableLinesByFile[file.name] = execLines;
    chunks.push(`// --- ${file.name} (offset ${globalOffset}) ---\n${outLines.join('\n')}`);
    globalOffset += lines.length;
  }

  const combinedSource = chunks.join('\n;\n');
  try {
    if (combinedSource.trim()) {
      new vm.Script(combinedSource);
    }
    return {
      combinedSource,
      instrumented: Object.keys(executableLinesByFile).length > 0,
      executableLinesByFile,
      definedFunctionsCount,
    };
  } catch (err) {
    const fallback = files
      .map((f) => {
        try {
          return stripTsIfNeeded(f.content || '', f.language || 'javascript', f.name);
        } catch {
          return f.content || '';
        }
      })
      .join('\n;\n');
    try {
      if (fallback.trim()) {
        new vm.Script(fallback);
      }
      return {
        combinedSource: fallback,
        instrumented: false,
        executableLinesByFile: {},
        definedFunctionsCount: 0,
      };
    } catch {
      return {
        combinedSource: fallback,
        instrumented: false,
        compileError: err instanceof Error ? err.message : String(err),
        executableLinesByFile: {},
        definedFunctionsCount: 0,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 1 & 2. JavaScript & TypeScript Isolated Node VM + esbuild Runner
// ---------------------------------------------------------------------------
function executeJavaScriptOrTsSuite(
  files: SubmittedWorkspaceFile[],
  cases: TestCaseItem[],
  lang: 'javascript' | 'typescript',
): ExecuteTestSuiteResult {
  const startAll = Date.now();
  const matchingFiles = files.filter(
    (f) =>
      fileMatchesTestLabLanguage(f, 'javascript') ||
      fileMatchesTestLabLanguage(f, 'typescript'),
  );

  const prep = buildInstrumentedJs(matchingFiles);
  const coveredHits: Record<string, Set<number>> = {};
  for (const fname of Object.keys(prep.executableLinesByFile)) {
    coveredHits[fname] = new Set<number>();
  }

  const results: TestCaseResult[] = [];

  for (const tc of cases) {
    if (!tc.enabled) {
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'skipped',
        durationMs: 0,
        expectedResult: tc.expectedResult,
        actualResult: 'Skipped (disabled by user)',
        fileRef: tc.targetFile,
        lineRef: tc.targetLine,
      });
      continue;
    }

    if (prep.compileError) {
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'error',
        durationMs: 0,
        expectedResult: tc.expectedResult,
        actualResult: `Syntax/Transpile error: ${prep.compileError}`,
        failureMessage: prep.compileError,
        fileRef: tc.targetFile,
        lineRef: tc.targetLine,
      });
      continue;
    }

    const tStart = Date.now();
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
    sandbox.__covHit = (file: string, line: number) => {
      if (coveredHits[file]) coveredHits[file].add(line);
    };
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

    const assertLib = {
      ok(cond: unknown, msg?: string) {
        if (!cond) throw new Error(msg || `Expected truthy value, got ${JSON.stringify(cond)}`);
      },
      equal(actual: unknown, expected: unknown, msg?: string) {
        if (actual != expected) {
          throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
      },
      strictEqual(actual: unknown, expected: unknown, msg?: string) {
        if (!Object.is(actual, expected)) {
          throw new Error(msg || `Expected strict ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
      },
      deepEqual(actual: unknown, expected: unknown, msg?: string) {
        const a = JSON.stringify(actual);
        const b = JSON.stringify(expected);
        if (a !== b) {
          throw new Error(msg || `Expected ${b}, got ${a}`);
        }
      },
      throws(fn: () => unknown, msg?: string) {
        let threw = false;
        try {
          fn();
        } catch {
          threw = true;
        }
        if (!threw) {
          throw new Error(msg || 'Expected function to throw an error, but it resolved cleanly');
        }
      },
    };
    sandbox.assert = assertLib;
    sandbox.expect = (actual: unknown) => ({
      toBe(expected: unknown) {
        assertLib.strictEqual(actual, expected);
      },
      toEqual(expected: unknown) {
        assertLib.deepEqual(actual, expected);
      },
      toBeTruthy() {
        assertLib.ok(actual);
      },
      toBeFalsy() {
        if (actual) throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
      },
      toContain(item: unknown) {
        if (typeof actual === 'string') {
          if (!actual.includes(String(item))) {
            throw new Error(`Expected string "${actual}" to contain "${String(item)}"`);
          }
        } else if (Array.isArray(actual)) {
          if (!actual.includes(item)) {
            throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
          }
        } else {
          throw new Error('toContain requires an array or string');
        }
      },
      toThrow() {
        if (typeof actual !== 'function') throw new Error('expect(fn).toThrow requires a function');
        assertLib.throws(actual as () => unknown);
      },
    });

    const context = vm.createContext(sandbox);
    try {
      const cleanTestCode = stripTsIfNeeded(
        tc.code || '',
        lang === 'typescript' ? 'typescript' : 'typescript',
        lang === 'typescript' ? 'test.ts' : 'test.js',
      );
      const fullProgram = prep.combinedSource.trim()
        ? `${prep.combinedSource}\n;\n${cleanTestCode}`
        : cleanTestCode;
      const script = new vm.Script(fullProgram);
      const outcome = script.runInContext(context, { timeout: 1000 });
      const durationMs = Math.max(1, Date.now() - tStart);
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'passed',
        durationMs,
        expectedResult: tc.expectedResult,
        actualResult:
          outcome !== undefined
            ? JSON.stringify(outcome)
            : logs.length > 0
              ? logs.join(' | ')
              : 'All assertions passed',
        fileRef: tc.targetFile,
        lineRef: tc.targetLine,
      });
    } catch (err) {
      const durationMs = Math.max(1, Date.now() - tStart);
      const msg = err instanceof Error ? err.message : String(err);
      const isAssertion =
        msg.startsWith('Expected') ||
        msg.includes('toContain') ||
        msg.includes('assert');
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: isAssertion ? 'failed' : 'error',
        durationMs,
        expectedResult: tc.expectedResult,
        actualResult: isAssertion ? msg : `Runtime error: ${msg}`,
        failureMessage: msg,
        fileRef: tc.targetFile,
        lineRef: tc.targetLine,
      });
    }
  }

  let coverage: TestCoverageSummary = {
    available: false,
    reason:
      matchingFiles.length === 0
        ? `Ran standalone ${lang === 'typescript' ? 'TypeScript' : 'JavaScript'} test assertions; add project .${lang === 'typescript' ? 'ts' : 'js'} files for line coverage.`
        : 'Instrumentation skipped due to script structure; test results remain authentic.',
  };

  if (prep.instrumented) {
    let totalLines = 0;
    let coveredLines = 0;
    const fileBreakdown: NonNullable<TestCoverageSummary['fileBreakdown']> = [];

    for (const [fname, execLines] of Object.entries(prep.executableLinesByFile)) {
      const hitCount = execLines.filter((l) => coveredHits[fname]?.has(l)).length;
      const total = execLines.length;
      totalLines += total;
      coveredLines += hitCount;
      fileBreakdown.push({
        file: fname,
        coveredLines: hitCount,
        totalLines: total,
        linePct: total > 0 ? Math.round((hitCount / total) * 100) : 100,
      });
    }

    if (totalLines > 0) {
      const linePct = Math.round((coveredLines / totalLines) * 100);
      coverage = {
        available: true,
        linePct,
        statementPct: linePct,
        functionPct: prep.definedFunctionsCount > 0 ? linePct : undefined,
        coveredLines,
        totalLines,
        fileBreakdown,
      };
    }
  }

  return summarizeCounts(results, startAll, coverage);
}

// ---------------------------------------------------------------------------
// 3. Python 3 Isolated Sandbox Runner
// ---------------------------------------------------------------------------
function executePythonSuite(
  files: SubmittedWorkspaceFile[],
  cases: TestCaseItem[],
): ExecuteTestSuiteResult {
  const pythonCheck = spawnSync('python3', ['--version'], { encoding: 'utf-8', timeout: 1500 });
  if (pythonCheck.status !== 0) {
    return {
      status: 'error',
      totalTests: cases.length,
      passedTests: 0,
      failedTests: 0,
      skippedTests: cases.filter((c) => !c.enabled).length,
      errorTests: cases.filter((c) => c.enabled).length,
      durationMs: 0,
      results: cases.map((c) => ({
        caseId: c.id,
        name: c.name,
        description: c.description,
        testType: c.testType,
        status: c.enabled ? 'error' : 'skipped',
        durationMs: 0,
        expectedResult: c.expectedResult,
        actualResult: 'Python 3 runtime unavailable on container',
        failureMessage: 'Python 3 runtime is not installed in the container.',
      })),
      coverage: {
        available: false,
        reason: 'Python 3 runtime unavailable on server container.',
      },
    };
  }

  const pyFiles = files.filter((f) => fileMatchesTestLabLanguage(f, 'python'));
  const combinedPy = pyFiles.map((f) => f.content || '').join('\n\n');
  const pyCasesPayload = cases.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    testType: c.testType,
    code: c.code,
    expectedResult: c.expectedResult,
    enabled: c.enabled,
    fileRef: c.targetFile,
    lineRef: c.targetLine,
  }));

  const runner = `
import ast, json, sys, time, builtins as _b

_user_src = ${JSON.stringify(combinedPy)}
_cases = json.loads(${JSON.stringify(JSON.stringify(pyCasesPayload))})

_exec_lines = set()
_func_defs = set()
_branch_lines = set()
if _user_src.strip():
    try:
        _tree = ast.parse(_user_src, filename="<project_code>")
        for _node in ast.walk(_tree):
            if isinstance(_node, ast.stmt) and hasattr(_node, "lineno"):
                _exec_lines.add(_node.lineno)
            if isinstance(_node, ast.FunctionDef) and hasattr(_node, "lineno"):
                _func_defs.add(_node.lineno)
            if isinstance(_node, (ast.If, ast.For, ast.While)) and hasattr(_node, "lineno"):
                _branch_lines.add(_node.lineno)
    except Exception:
        pass

_hit_lines = set()
_hit_funcs = set()
def _tracer(frame, event, arg):
    if frame.f_code.co_filename == "<project_code>":
        if event == "line":
            _hit_lines.add(frame.f_lineno)
        elif event == "call":
            _hit_funcs.add(frame.f_code.co_firstlineno)
    return _tracer

_blocked = {"os", "sys", "subprocess", "socket", "shutil", "pathlib", "http", "urllib", "ctypes", "importlib"}
_orig_import = _b.__import__
def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if name.split(".")[0] in _blocked:
        raise ImportError(f"Module {name!r} is disabled in isolated TestLab sandbox")
    return _orig_import(name, globals, locals, fromlist, level)

_results = []
_compile_error = None
_compiled_user = None
if _user_src.strip():
    try:
        _compiled_user = compile(_user_src, "<project_code>", "exec")
    except Exception as _ce:
        _compile_error = f"{type(_ce).__name__}: {_ce}"

sys.settrace(_tracer)
_b.__import__ = _safe_import

_all_start = time.perf_counter()
for _c in _cases:
    if not _c["enabled"]:
        _results.append({
            "caseId": _c["id"],
            "name": _c["name"],
            "description": _c["description"],
            "testType": _c["testType"],
            "status": "skipped",
            "durationMs": 0,
            "expectedResult": _c["expectedResult"],
            "actualResult": "Skipped (disabled by user)",
            "fileRef": _c.get("fileRef"),
            "lineRef": _c.get("lineRef"),
        })
        continue
    if _compile_error is not None:
        _results.append({
            "caseId": _c["id"],
            "name": _c["name"],
            "description": _c["description"],
            "testType": _c["testType"],
            "status": "error",
            "durationMs": 0,
            "expectedResult": _c["expectedResult"],
            "actualResult": _compile_error,
            "failureMessage": _compile_error,
            "fileRef": _c.get("fileRef"),
            "lineRef": _c.get("lineRef"),
        })
        continue

    _t0 = time.perf_counter()
    try:
        _ns = {}
        if _compiled_user is not None:
            exec(_compiled_user, _ns)
        _test_obj = compile(_c["code"], "<test_case>", "exec")
        exec(_test_obj, _ns)
        _ms = max(1, int((time.perf_counter() - _t0) * 1000))
        _results.append({
            "caseId": _c["id"],
            "name": _c["name"],
            "description": _c["description"],
            "testType": _c["testType"],
            "status": "passed",
            "durationMs": _ms,
            "expectedResult": _c["expectedResult"],
            "actualResult": "All Python assertions passed",
            "fileRef": _c.get("fileRef"),
            "lineRef": _c.get("lineRef"),
        })
    except AssertionError as _ae:
        _ms = max(1, int((time.perf_counter() - _t0) * 1000))
        _msg = str(_ae) or "Assertion failed"
        _results.append({
            "caseId": _c["id"],
            "name": _c["name"],
            "description": _c["description"],
            "testType": _c["testType"],
            "status": "failed",
            "durationMs": _ms,
            "expectedResult": _c["expectedResult"],
            "actualResult": f"AssertionError: {_msg}",
            "failureMessage": _msg,
            "fileRef": _c.get("fileRef"),
            "lineRef": _c.get("lineRef"),
        })
    except Exception as _ex:
        _ms = max(1, int((time.perf_counter() - _t0) * 1000))
        _msg = f"{type(_ex).__name__}: {_ex}"
        _results.append({
            "caseId": _c["id"],
            "name": _c["name"],
            "description": _c["description"],
            "testType": _c["testType"],
            "status": "error",
            "durationMs": _ms,
            "expectedResult": _c["expectedResult"],
            "actualResult": _msg,
            "failureMessage": _msg,
            "fileRef": _c.get("fileRef"),
            "lineRef": _c.get("lineRef"),
        })

sys.settrace(None)
_total_ms = max(1, int((time.perf_counter() - _all_start) * 1000))

_cov_total = len(_exec_lines)
_cov_hits = len(_exec_lines & _hit_lines)
_fn_total = len(_func_defs)
_fn_hits = len(_func_defs & _hit_funcs)
_br_total = len(_branch_lines)
_br_hits = len(_branch_lines & _hit_lines)

_coverage = {"available": False, "reason": "No project .py files attached; standalone Python tests passed." if not _user_src.strip() else "No executable Python statements traced."}
if _cov_total > 0 and _compile_error is None:
    _coverage = {
        "available": True,
        "linePct": round((_cov_hits / _cov_total) * 100),
        "statementPct": round((_cov_hits / _cov_total) * 100),
        "functionPct": round((_fn_hits / _fn_total) * 100) if _fn_total > 0 else None,
        "branchPct": round((_br_hits / _br_total) * 100) if _br_total > 0 else None,
        "coveredLines": _cov_hits,
        "totalLines": _cov_total,
    }

print("__TESTLAB_PY__" + json.dumps({
    "results": _results,
    "durationMs": _total_ms,
    "coverage": _coverage,
}))
`;

  const start = Date.now();
  const proc = spawnSync('python3', ['-I', '-S', '-c', runner], {
    encoding: 'utf-8',
    timeout: 2500,
    maxBuffer: 256 * 1024,
    env: {},
  });

  const timedOut = proc.error && 'code' in proc.error && proc.error.code === 'ETIMEDOUT';
  const marker = '__TESTLAB_PY__';
  const idx = (proc.stdout || '').lastIndexOf(marker);

  if (timedOut || idx === -1) {
    const errText = timedOut
      ? 'Python execution timed out after 2500ms in isolated sandbox.'
      : (proc.stderr || 'Python execution failed before returning results.').slice(0, 600);
    return {
      status: 'error',
      totalTests: cases.length,
      passedTests: 0,
      failedTests: 0,
      skippedTests: cases.filter((c) => !c.enabled).length,
      errorTests: cases.filter((c) => c.enabled).length,
      durationMs: Date.now() - start,
      results: cases.map((c) => ({
        caseId: c.id,
        name: c.name,
        description: c.description,
        testType: c.testType,
        status: c.enabled ? 'error' : 'skipped',
        durationMs: 0,
        expectedResult: c.expectedResult,
        actualResult: c.enabled ? errText : 'Skipped',
        failureMessage: c.enabled ? errText : undefined,
        fileRef: c.targetFile,
        lineRef: c.targetLine,
      })),
      coverage: {
        available: false,
        reason: 'Coverage unavailable because execution halted unexpectedly.',
      },
    };
  }

  const parsed = JSON.parse((proc.stdout || '').slice(idx + marker.length).trim()) as {
    results: TestCaseResult[];
    durationMs: number;
    coverage: TestCoverageSummary;
  };
  return summarizeCounts(parsed.results, start, parsed.coverage);
}

// ---------------------------------------------------------------------------
// 4. SQL Isolated In-Memory SQLite Runner
// ---------------------------------------------------------------------------
function executeSqlSuite(
  files: SubmittedWorkspaceFile[],
  cases: TestCaseItem[],
): ExecuteTestSuiteResult {
  const startAll = Date.now();
  const sqlFiles = files.filter((f) => fileMatchesTestLabLanguage(f, 'sql'));
  const schemaScript = sqlFiles.map((f) => f.content || '').join('\n;\n');

  const sqlCasesPayload = cases.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    testType: c.testType,
    code: c.code,
    expectedResult: c.expectedResult,
    enabled: c.enabled,
    fileRef: c.targetFile,
    lineRef: c.targetLine,
  }));

  const runner = `
import json, re, sqlite3, time

_schema_sql = ${JSON.stringify(schemaScript)}
_cases = json.loads(${JSON.stringify(JSON.stringify(sqlCasesPayload))})

def _split_sql(script):
    stmts = []
    buf = ""
    for line in script.splitlines(True):
        buf += line
        if sqlite3.complete_statement(buf):
            s = buf.strip()
            if s:
                stmts.append(s)
            buf = ""
    if buf.strip():
        stmts.append(buf.strip())
    return stmts

_results = []
for _c in _cases:
    if not _c["enabled"]:
        _results.append({
            "caseId": _c["id"],
            "name": _c["name"],
            "description": _c["description"],
            "testType": _c["testType"],
            "status": "skipped",
            "durationMs": 0,
            "expectedResult": _c["expectedResult"],
            "actualResult": "Skipped (disabled by user)",
            "fileRef": _c.get("fileRef"),
            "lineRef": _c.get("lineRef"),
        })
        continue

    _t0 = time.perf_counter()
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    try:
        if _schema_sql.strip():
            conn.executescript(_schema_sql)
    except Exception as _se:
        _ms = max(1, int((time.perf_counter() - _t0) * 1000))
        _results.append({
            "caseId": _c["id"],
            "name": _c["name"],
            "description": _c["description"],
            "testType": _c["testType"],
            "status": "error",
            "durationMs": _ms,
            "expectedResult": _c["expectedResult"],
            "actualResult": f"Project schema SQL error: {_se}",
            "failureMessage": str(_se),
            "fileRef": _c.get("fileRef"),
            "lineRef": _c.get("lineRef"),
        })
        conn.close()
        continue

    raw_sql = _c["code"] or ""
    expect_error = bool(re.search(r"--\\s*@expect_error\\b", raw_sql, re.IGNORECASE))
    row_checks = re.findall(r"--\\s*@expect_rows\\s*(==|=|>=|<=|>|<)\\s*(\\d+)", raw_sql, re.IGNORECASE)
    contains_checks = [m.strip() for m in re.findall(r"--\\s*@expect_contains\\s+(.+)", raw_sql, re.IGNORECASE)]

    try:
        last_rows = []
        last_cols = []
        statements = _split_sql(raw_sql)
        if not statements:
            raise ValueError("Test SQL is empty.")
        for st in statements:
            cur = conn.execute(st)
            if cur.description:
                last_cols = [d[0] for d in cur.description]
                last_rows = [dict(r) for r in cur.fetchall()]
        conn.commit()

        if expect_error:
            raise AssertionError("Expected SQL error (-- @expect_error), but statements succeeded.")

        for op, num_str in row_checks:
            target_n = int(num_str)
            actual_n = len(last_rows)
            ok = (
                (op in ("==", "=") and actual_n == target_n)
                or (op == ">=" and actual_n >= target_n)
                or (op == "<=" and actual_n <= target_n)
                or (op == ">" and actual_n > target_n)
                or (op == "<" and actual_n < target_n)
            )
            if not ok:
                raise AssertionError(f"Expected row count {op} {target_n}, got {actual_n}")

        serialized_rows = json.dumps(last_rows)
        for needle in contains_checks:
            if needle.lower() not in serialized_rows.lower():
                raise AssertionError(f"Expected query results to contain '{needle}', got {serialized_rows[:240]}")

        _ms = max(1, int((time.perf_counter() - _t0) * 1000))
        summary = (
            f"{len(last_rows)} row(s): {serialized_rows[:240]}"
            if last_cols
            else f"{len(statements)} SQL statement(s) committed cleanly"
        )
        _results.append({
            "caseId": _c["id"],
            "name": _c["name"],
            "description": _c["description"],
            "testType": _c["testType"],
            "status": "passed",
            "durationMs": _ms,
            "expectedResult": _c["expectedResult"],
            "actualResult": summary,
            "fileRef": _c.get("fileRef"),
            "lineRef": _c.get("lineRef"),
        })
    except AssertionError as _ae:
        _ms = max(1, int((time.perf_counter() - _t0) * 1000))
        _results.append({
            "caseId": _c["id"],
            "name": _c["name"],
            "description": _c["description"],
            "testType": _c["testType"],
            "status": "failed",
            "durationMs": _ms,
            "expectedResult": _c["expectedResult"],
            "actualResult": str(_ae),
            "failureMessage": str(_ae),
            "fileRef": _c.get("fileRef"),
            "lineRef": _c.get("lineRef"),
        })
    except Exception as _ex:
        _ms = max(1, int((time.perf_counter() - _t0) * 1000))
        if expect_error:
            _results.append({
                "caseId": _c["id"],
                "name": _c["name"],
                "description": _c["description"],
                "testType": _c["testType"],
                "status": "passed",
                "durationMs": _ms,
                "expectedResult": _c["expectedResult"],
                "actualResult": f"Expected constraint/SQL error triggered: {_ex}",
                "fileRef": _c.get("fileRef"),
                "lineRef": _c.get("lineRef"),
            })
        else:
            _results.append({
                "caseId": _c["id"],
                "name": _c["name"],
                "description": _c["description"],
                "testType": _c["testType"],
                "status": "failed" if "constraint" in str(_ex).lower() else "error",
                "durationMs": _ms,
                "expectedResult": _c["expectedResult"],
                "actualResult": f"SQLite Error: {_ex}",
                "failureMessage": str(_ex),
                "fileRef": _c.get("fileRef"),
                "lineRef": _c.get("lineRef"),
            })
    finally:
        conn.close()

print("__TESTLAB_SQL__" + json.dumps({"results": _results}))
`;

  const proc = spawnSync('python3', ['-I', '-S', '-c', runner], {
    encoding: 'utf-8',
    timeout: 2500,
    maxBuffer: 256 * 1024,
    env: {},
  });

  const marker = '__TESTLAB_SQL__';
  const idx = (proc.stdout || '').lastIndexOf(marker);
  if (idx === -1) {
    const errText = (proc.stderr || 'SQLite execution failed before returning results.').slice(0, 600);
    return summarizeCounts(
      cases.map((c) => ({
        caseId: c.id,
        name: c.name,
        description: c.description,
        testType: c.testType,
        status: c.enabled ? 'error' : 'skipped',
        durationMs: 0,
        expectedResult: c.expectedResult,
        actualResult: c.enabled ? errText : 'Skipped',
        failureMessage: c.enabled ? errText : undefined,
        fileRef: c.targetFile,
        lineRef: c.targetLine,
      })),
      startAll,
      {
        available: false,
        reason: 'SQL execution engine encountered a runner error.',
      },
    );
  }

  const parsed = JSON.parse((proc.stdout || '').slice(idx + marker.length).trim()) as {
    results: TestCaseResult[];
  };
  return summarizeCounts(parsed.results, startAll, {
    available: false,
    reason: 'SQL queries ran in isolated in-memory SQLite 3 (statement coverage does not apply to SQL queries).',
  });
}

// ---------------------------------------------------------------------------
// 5. C++17 Isolated g++ Compiler & Binary Sandbox Runner
// ---------------------------------------------------------------------------
const UNSAFE_CPP_PATTERN =
  /(#include\s*<\s*(filesystem|fstream|sys\/socket\.h|unistd\.h|netdb\.h|arpa\/inet\.h|fcntl\.h)\s*>|#include\s*"\s*(\.\.|\/etc\/|\/proc\/)|\b(system|popen|fork|execv|execl|execve|dlopen|remove|rename)\s*\()/i;

function executeCppSuite(
  files: SubmittedWorkspaceFile[],
  cases: TestCaseItem[],
): ExecuteTestSuiteResult {
  const startAll = Date.now();
  const gppCheck = spawnSync('g++', ['--version'], { encoding: 'utf-8', timeout: 1500 });
  if (gppCheck.status !== 0) {
    return summarizeCounts(
      cases.map((c) => ({
        caseId: c.id,
        name: c.name,
        description: c.description,
        testType: c.testType,
        status: c.enabled ? 'error' : 'skipped',
        durationMs: 0,
        expectedResult: c.expectedResult,
        actualResult: 'g++ compiler unavailable on server container',
        failureMessage: 'Install g++ to compile and execute C++ tests.',
        fileRef: c.targetFile,
        lineRef: c.targetLine,
      })),
      startAll,
      { available: false, reason: 'g++ C++17 compiler is not installed on host container.' },
    );
  }

  const cppFiles = files.filter((f) => fileMatchesTestLabLanguage(f, 'cpp'));
  const headerFiles = cppFiles.filter((f) => {
    const lower = f.name.toLowerCase();
    return lower.endsWith('.h') || lower.endsWith('.hpp');
  });
  const sourceFiles = cppFiles.filter((f) => {
    const lower = f.name.toLowerCase();
    return !lower.endsWith('.h') && !lower.endsWith('.hpp');
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mideo-cpp-'));
  const results: TestCaseResult[] = [];

  try {
    // Write safe project header files so local #include "..." resolves cleanly inside tempDir
    for (const hf of headerFiles) {
      if (UNSAFE_CPP_PATTERN.test(hf.content || '')) continue;
      const safeName = path.basename(hf.name);
      fs.writeFileSync(path.join(tempDir, safeName), hf.content || '', 'utf-8');
    }

    const projectDefs = sourceFiles
      .map((sf) =>
        (sf.content || '').replace(/\bint\s+main\s*\(/g, 'int __mideo_project_main('),
      )
      .join('\n\n');

    for (const tc of cases) {
      if (!tc.enabled) {
        results.push({
          caseId: tc.id,
          name: tc.name,
          description: tc.description,
          testType: tc.testType,
          status: 'skipped',
          durationMs: 0,
          expectedResult: tc.expectedResult,
          actualResult: 'Skipped (disabled by user)',
          fileRef: tc.targetFile,
          lineRef: tc.targetLine,
        });
        continue;
      }

      const t0 = Date.now();
      const rawCode = tc.code || '';
      const combinedCheckText = `${projectDefs}\n${rawCode}`;
      if (UNSAFE_CPP_PATTERN.test(combinedCheckText)) {
        results.push({
          caseId: tc.id,
          name: tc.name,
          description: tc.description,
          testType: tc.testType,
          status: 'error',
          durationMs: Math.max(1, Date.now() - t0),
          expectedResult: tc.expectedResult,
          actualResult: 'Blocked unsafe C++ system/filesystem API in TestLab sandbox',
          failureMessage: 'System calls, filesystem writes, and network sockets are blocked inside isolated TestLab C++ runs.',
          fileRef: tc.targetFile,
          lineRef: tc.targetLine,
        });
        continue;
      }

      const hasMain = /\bint\s+main\s*\(/.test(rawCode);
      const testProgram = hasMain
        ? `${projectDefs}\n${rawCode}`
        : `#include <iostream>
#include <cassert>
#include <string>
#include <vector>
#include <algorithm>
#include <cmath>
#include <map>
#include <set>
${projectDefs}

int main() {
${rawCode}
  return 0;
}
`;

      const cppPath = path.join(tempDir, `case_${tc.id.replace(/[^a-zA-Z0-9_]/g, '_')}.cpp`);
      const binPath = path.join(tempDir, `case_${tc.id.replace(/[^a-zA-Z0-9_]/g, '_')}.out`);
      fs.writeFileSync(cppPath, testProgram, 'utf-8');

      const compileRes = spawnSync('g++', ['-std=c++17', '-O1', cppPath, '-I', tempDir, '-o', binPath], {
        encoding: 'utf-8',
        timeout: 4500,
        maxBuffer: 256 * 1024,
      });

      if (compileRes.status !== 0) {
        const compErr = (compileRes.stderr || compileRes.stdout || 'C++ compilation failed.').slice(0, 700);
        results.push({
          caseId: tc.id,
          name: tc.name,
          description: tc.description,
          testType: tc.testType,
          status: 'error',
          durationMs: Math.max(1, Date.now() - t0),
          expectedResult: tc.expectedResult,
          actualResult: 'Compilation failed',
          failureMessage: compErr,
          fileRef: tc.targetFile,
          lineRef: tc.targetLine,
        });
        continue;
      }

      const execRes = spawnSync(binPath, [], {
        encoding: 'utf-8',
        timeout: 1500,
        maxBuffer: 256 * 1024,
        env: {},
        cwd: tempDir,
      });

      const timedOut = execRes.error && 'code' in execRes.error && execRes.error.code === 'ETIMEDOUT';
      const durationMs = Math.max(1, Date.now() - t0);
      if (timedOut) {
        results.push({
          caseId: tc.id,
          name: tc.name,
          description: tc.description,
          testType: tc.testType,
          status: 'error',
          durationMs,
          expectedResult: tc.expectedResult,
          actualResult: 'Execution timed out after 1500ms',
          failureMessage: 'C++ binary exceeded 1500ms timeout.',
          fileRef: tc.targetFile,
          lineRef: tc.targetLine,
        });
      } else if (execRes.status !== 0 || execRes.signal) {
        const errOut = (execRes.stderr || execRes.stdout || `Exited with status ${execRes.status} (${execRes.signal || 'failed'})`).slice(0, 600);
        results.push({
          caseId: tc.id,
          name: tc.name,
          description: tc.description,
          testType: tc.testType,
          status: 'failed',
          durationMs,
          expectedResult: tc.expectedResult,
          actualResult: errOut,
          failureMessage: errOut,
          fileRef: tc.targetFile,
          lineRef: tc.targetLine,
        });
      } else {
        const out = (execRes.stdout || '').trim();
        results.push({
          caseId: tc.id,
          name: tc.name,
          description: tc.description,
          testType: tc.testType,
          status: 'passed',
          durationMs,
          expectedResult: tc.expectedResult,
          actualResult: out ? out.slice(0, 260) : 'Compiled with g++ -std=c++17 and passed cleanly',
          fileRef: tc.targetFile,
          lineRef: tc.targetLine,
        });
      }
    }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup issues on temp workspace
    }
  }

  return summarizeCounts(results, startAll, {
    available: false,
    reason: 'Compiled and executed with g++ (-std=c++17) inside an isolated temporary sandbox (gcov instrumentation is disabled).',
  });
}

// ---------------------------------------------------------------------------
// 6 & 7. HTML DOM Validator & CSS esbuild Parser Runners
// ---------------------------------------------------------------------------
function checkHtmlTagBalance(html: string): { balanced: boolean; details?: string } {
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<style[\s\S]*?<\/style>/gi, '<style></style>');

  const stack: string[] = [];
  const tagRx = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*?)?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRx.exec(cleaned)) !== null) {
    const raw = m[0];
    const tag = m[1].toLowerCase();
    const selfClose = m[2] === '/' || voidTags.has(tag);
    if (raw.startsWith('</')) {
      const top = stack.pop();
      if (!top) {
        return { balanced: false, details: `Unexpected closing </${tag}> tag with no matching opening tag.` };
      }
      if (top !== tag) {
        return { balanced: false, details: `Mismatched closing </${tag}>; expected </${top}>.` };
      }
    } else if (!selfClose) {
      stack.push(tag);
    }
  }
  if (stack.length > 0) {
    return { balanced: false, details: `Unclosed HTML tag(s): <${stack.join('>, <')}>.` };
  }
  return { balanced: true };
}

function executeHtmlOrCssSuite(
  lang: 'html' | 'css',
  files: SubmittedWorkspaceFile[],
  cases: TestCaseItem[],
): ExecuteTestSuiteResult {
  const startAll = Date.now();
  const langFiles = files.filter((f) => fileMatchesTestLabLanguage(f, lang));
  const combinedSource = langFiles.map((f) => f.content || '').join('\n');
  const results: TestCaseResult[] = [];

  for (const tc of cases) {
    if (!tc.enabled) {
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'skipped',
        durationMs: 0,
        expectedResult: tc.expectedResult,
        actualResult: 'Skipped (disabled by user)',
        fileRef: tc.targetFile,
        lineRef: tc.targetLine,
      });
      continue;
    }

    const t0 = Date.now();
    const target =
      langFiles.find((f) => f.name.toLowerCase() === (tc.targetFile || '').toLowerCase()) ||
      langFiles[0] ||
      files[0];
    const source = target && fileMatchesTestLabLanguage(target, lang)
      ? target.content || ''
      : combinedSource;

    const sandbox: Record<string, unknown> = Object.create(null);
    sandbox.source = source;
    sandbox.files = files.map((f) => ({ name: f.name, content: f.content, language: f.language }));
    sandbox.RegExp = RegExp;
    sandbox.String = String;
    sandbox.Array = Array;
    sandbox.Object = Object;
    sandbox.JSON = JSON;

    sandbox.assert = {
      ok(cond: unknown, msg?: string) {
        if (!cond) throw new Error(msg || 'Assertion failed');
      },
      includes(needle: string, msg?: string) {
        if (!source.toLowerCase().includes(String(needle).toLowerCase())) {
          throw new Error(msg || `Expected ${target?.name || lang} source to include "${needle}"`);
        }
      },
      matches(pattern: string | RegExp, msg?: string) {
        const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'im');
        if (!rx.test(source)) {
          throw new Error(msg || `Pattern check failed on ${target?.name || lang}`);
        }
      },
      hasTag(tagName: string, msg?: string) {
        const rx = new RegExp(`<${tagName}\\b[^>]*>`, 'i');
        if (!rx.test(source)) {
          throw new Error(msg || `Expected <${tagName}> element in HTML markup`);
        }
      },
      hasId(idName: string, msg?: string) {
        const rx = new RegExp(`id\\s*=\\s*["']${idName}["']`, 'i');
        if (!rx.test(source)) {
          throw new Error(msg || `Expected element with id="${idName}"`);
        }
      },
      hasClass(clsName: string, msg?: string) {
        const rx = new RegExp(`class\\s*=\\s*["'][^"']*\\b${clsName}\\b[^"']*["']`, 'i');
        if (!rx.test(source)) {
          throw new Error(msg || `Expected element with class "${clsName}"`);
        }
      },
      hasAttribute(tagName: string, attrName: string, msg?: string) {
        const rx = new RegExp(`<${tagName}\\b[^>]*\\b${attrName}\\b`, 'i');
        if (!rx.test(source)) {
          throw new Error(msg || `Expected <${tagName}> to declare attribute "${attrName}"`);
        }
      },
      balancedTags() {
        if (!source.trim()) throw new Error('HTML source is empty');
        const check = checkHtmlTagBalance(source);
        if (!check.balanced) throw new Error(check.details || 'Unbalanced HTML tags detected');
      },
      validCss() {
        if (!source.trim()) throw new Error('CSS source is empty');
        try {
          transformSync(source, { loader: 'css' });
        } catch (cssErr) {
          throw new Error(`CSS syntax error: ${cssErr instanceof Error ? cssErr.message : String(cssErr)}`);
        }
      },
      hasSelector(selector: string, msg?: string) {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(`${escaped}\\s*\\{`, 'm');
        if (!rx.test(source)) {
          throw new Error(msg || `Expected CSS rule for selector "${selector}"`);
        }
      },
      hasProperty(prop: string, msg?: string) {
        const rx = new RegExp(`\\b${prop}\\s*:`, 'i');
        if (!rx.test(source)) {
          throw new Error(msg || `Expected CSS property "${prop}"`);
        }
      },
      hasCssVar(varName: string, msg?: string) {
        const normalized = varName.startsWith('--') ? varName : `--${varName}`;
        if (!source.includes(normalized)) {
          throw new Error(msg || `Expected CSS custom property "${normalized}"`);
        }
      },
    };

    try {
      const script = new vm.Script(tc.code);
      script.runInContext(vm.createContext(sandbox), { timeout: 800 });
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'passed',
        durationMs: Math.max(1, Date.now() - t0),
        expectedResult: tc.expectedResult,
        actualResult: lang === 'css' ? 'CSS parsed & assertions passed' : 'HTML structure & tag assertions passed',
        fileRef: target?.name || tc.targetFile,
        lineRef: tc.targetLine,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'failed',
        durationMs: Math.max(1, Date.now() - t0),
        expectedResult: tc.expectedResult,
        actualResult: msg,
        failureMessage: msg,
        fileRef: target?.name || tc.targetFile,
        lineRef: tc.targetLine,
      });
    }
  }

  return summarizeCounts(results, startAll, {
    available: false,
    reason:
      lang === 'css'
        ? 'Validated via esbuild CSS parser and rule assertions (line coverage does not apply to stylesheets).'
        : 'Validated via HTML structural tag parser and DOM assertions (line coverage does not apply to markup).',
  });
}

// ---------------------------------------------------------------------------
// 8 & 9. C# & Java Honest Lexical & Structural Verification Runner
// ---------------------------------------------------------------------------
function checkBalancedDelimiters(code: string): { balanced: boolean; error?: string } {
  const stack: string[] = [];
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
  const closeToOpen: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
  let inLineComment = false;
  let inBlockComment = false;
  let quote: string | null = null;
  let line = 1;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '\n') {
      inLineComment = false;
      line++;
      continue;
    }
    if (inLineComment) continue;
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (ch === '\\') {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (pairs[ch]) {
      stack.push(ch);
    } else if (closeToOpen[ch]) {
      const top = stack.pop();
      if (top !== closeToOpen[ch]) {
        return { balanced: false, error: `Mismatched delimiter "${ch}" at line ${line}.` };
      }
    }
  }

  if (quote) return { balanced: false, error: `Unclosed string literal (${quote}).` };
  if (inBlockComment) return { balanced: false, error: 'Unclosed block comment /* ... */.' };
  if (stack.length > 0) {
    return { balanced: false, error: `Unclosed delimiter(s): ${stack.join(' ')}` };
  }
  return { balanced: true };
}

function executeCSharpOrJavaSuite(
  lang: 'csharp' | 'java',
  files: SubmittedWorkspaceFile[],
  cases: TestCaseItem[],
): ExecuteTestSuiteResult {
  const startAll = Date.now();
  const langFiles = files.filter((f) => fileMatchesTestLabLanguage(f, lang));
  const combinedSource = langFiles.map((f) => f.content || '').join('\n');
  const results: TestCaseResult[] = [];
  const label = lang === 'csharp' ? 'C#' : 'Java';

  for (const tc of cases) {
    if (!tc.enabled) {
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'skipped',
        durationMs: 0,
        expectedResult: tc.expectedResult,
        actualResult: 'Skipped (disabled by user)',
        fileRef: tc.targetFile,
        lineRef: tc.targetLine,
      });
      continue;
    }

    const t0 = Date.now();
    const target =
      langFiles.find((f) => f.name.toLowerCase() === (tc.targetFile || '').toLowerCase()) ||
      langFiles[0];
    const source = target ? target.content || '' : combinedSource;

    const sandbox: Record<string, unknown> = Object.create(null);
    sandbox.source = source;
    sandbox.files = files.map((f) => ({ name: f.name, content: f.content, language: f.language }));
    sandbox.RegExp = RegExp;
    sandbox.String = String;
    sandbox.Array = Array;
    sandbox.Object = Object;
    sandbox.JSON = JSON;

    sandbox.assert = {
      ok(cond: unknown, msg?: string) {
        if (!cond) throw new Error(msg || `${label} structural assertion failed`);
      },
      includes(needle: string, msg?: string) {
        if (!source.toLowerCase().includes(String(needle).toLowerCase())) {
          throw new Error(msg || `Expected ${target?.name || label} source to include "${needle}"`);
        }
      },
      matches(pattern: string | RegExp, msg?: string) {
        const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'im');
        if (!rx.test(source)) {
          throw new Error(msg || `Pattern check failed on ${target?.name || label} source`);
        }
      },
      balancedBraces() {
        if (!source.trim()) throw new Error(`No ${label} source file present to check delimiters.`);
        const res = checkBalancedDelimiters(source);
        if (!res.balanced) throw new Error(res.error || 'Unbalanced braces or delimiters');
      },
      hasClass(className: string, msg?: string) {
        const rx = new RegExp(`\\b(class|interface|record|enum|struct)\\s+${className}\\b`);
        if (!rx.test(source)) {
          throw new Error(msg || `Expected ${label} type declaration "${className}"`);
        }
      },
      hasMethod(methodName: string, msg?: string) {
        const rx = new RegExp(`\\b${methodName}\\s*\\([^)]*\\)\\s*(\\{|=>)`);
        if (!rx.test(source)) {
          throw new Error(msg || `Expected ${label} method "${methodName}(...)"`);
        }
      },
      hasNamespaceOrPackage(name: string, msg?: string) {
        const kw = lang === 'csharp' ? 'namespace' : 'package';
        const rx = new RegExp(`\\b${kw}\\s+${name.replace(/\./g, '\\.')}\\b`);
        if (!rx.test(source)) {
          throw new Error(msg || `Expected ${kw} "${name}"`);
        }
      },
    };

    try {
      // Support both `assert.*` JS assertions and raw structural inspection
      const script = new vm.Script(tc.code);
      script.runInContext(vm.createContext(sandbox), { timeout: 800 });
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'passed',
        durationMs: Math.max(1, Date.now() - t0),
        expectedResult: tc.expectedResult,
        actualResult: `${label} static structural check passed (compiler binary unavailable in sandbox)`,
        fileRef: target?.name || tc.targetFile,
        lineRef: tc.targetLine,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'failed',
        durationMs: Math.max(1, Date.now() - t0),
        expectedResult: tc.expectedResult,
        actualResult: msg,
        failureMessage: msg,
        fileRef: target?.name || tc.targetFile,
        lineRef: tc.targetLine,
      });
    }
  }

  return summarizeCounts(results, startAll, {
    available: false,
    reason:
      lang === 'csharp'
        ? 'Verified statically via lexical delimiter and C# class/method structure checks (.NET SDK dotnet is not installed in this Linux container).'
        : 'Verified statically via lexical delimiter and Java class/method structure checks (JDK javac is not installed in this Linux container).',
  });
}

// ---------------------------------------------------------------------------
// 10, 11 & 12. Go, Rust & PHP Honest Lexical & Structural Verification Runner
// ---------------------------------------------------------------------------
function executeGoRustOrPhpSuite(
  lang: 'go' | 'rust' | 'php',
  files: SubmittedWorkspaceFile[],
  cases: TestCaseItem[],
): ExecuteTestSuiteResult {
  const startAll = Date.now();
  const langFiles = files.filter((f) => fileMatchesTestLabLanguage(f, lang));
  const combinedSource = langFiles.map((f) => f.content || '').join('\n');
  const results: TestCaseResult[] = [];
  const label = lang === 'go' ? 'Go' : lang === 'rust' ? 'Rust' : 'PHP';
  const missingBinaryNote =
    lang === 'go'
      ? 'go compiler binary is not installed in this Linux container'
      : lang === 'rust'
        ? 'rustc compiler binary is not installed in this Linux container'
        : 'php CLI binary is not installed in this Linux container';

  for (const tc of cases) {
    if (!tc.enabled) {
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'skipped',
        durationMs: 0,
        expectedResult: tc.expectedResult,
        actualResult: 'Skipped (disabled by user)',
        fileRef: tc.targetFile,
        lineRef: tc.targetLine,
      });
      continue;
    }

    const t0 = Date.now();
    const target =
      langFiles.find((f) => f.name.toLowerCase() === (tc.targetFile || '').toLowerCase()) ||
      langFiles[0];
    const source = target ? target.content || '' : combinedSource;

    const sandbox: Record<string, unknown> = Object.create(null);
    sandbox.source = source;
    sandbox.files = files.map((f) => ({ name: f.name, content: f.content, language: f.language }));
    sandbox.RegExp = RegExp;
    sandbox.String = String;
    sandbox.Array = Array;
    sandbox.Object = Object;
    sandbox.JSON = JSON;

    sandbox.assert = {
      ok(cond: unknown, msg?: string) {
        if (!cond) throw new Error(msg || `${label} structural assertion failed`);
      },
      includes(needle: string, msg?: string) {
        if (!source.toLowerCase().includes(String(needle).toLowerCase())) {
          throw new Error(msg || `Expected ${target?.name || label} source to include "${needle}"`);
        }
      },
      matches(pattern: string | RegExp, msg?: string) {
        const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'im');
        if (!rx.test(source)) {
          throw new Error(msg || `Pattern check failed on ${target?.name || label} source`);
        }
      },
      balancedBraces() {
        if (!source.trim()) throw new Error(`No ${label} source file present to check delimiters.`);
        const res = checkBalancedDelimiters(source);
        if (!res.balanced) throw new Error(res.error || 'Unbalanced braces or delimiters');
      },
      hasPackage(pkgName: string, msg?: string) {
        const rx = new RegExp(`^\\s*package\\s+${pkgName}\\b`, 'm');
        if (!rx.test(source)) {
          throw new Error(msg || `Expected Go package declaration "package ${pkgName}"`);
        }
      },
      hasFunc(funcName: string, msg?: string) {
        const rx = new RegExp(`\\bfunc\\s+(?:\\([^)]*\\)\\s*)?${funcName}\\s*\\(`);
        if (!rx.test(source)) {
          throw new Error(msg || `Expected Go function "${funcName}(...)"`);
        }
      },
      hasFn(fnName: string, msg?: string) {
        const rx = new RegExp(`\\bfn\\s+${fnName}\\s*(?:<[^>]*>)?\\s*\\(`);
        if (!rx.test(source)) {
          throw new Error(msg || `Expected Rust function "fn ${fnName}(...)"`);
        }
      },
      hasStruct(structName: string, msg?: string) {
        const rx = new RegExp(
          lang === 'go'
            ? `\\btype\\s+${structName}\\s+struct\\b`
            : `\\b(?:struct|enum|trait)\\s+${structName}\\b`,
        );
        if (!rx.test(source)) {
          throw new Error(msg || `Expected ${label} struct "${structName}"`);
        }
      },
      hasImpl(typeName: string, msg?: string) {
        const rx = new RegExp(`\\bimpl(?:\\s*<[^>]*>)?\\s+(?:\\w+\\s+for\\s+)?${typeName}\\b`);
        if (!rx.test(source)) {
          throw new Error(msg || `Expected Rust impl block for "${typeName}"`);
        }
      },
      hasFunction(funcName: string, msg?: string) {
        const rx = new RegExp(`\\bfunction\\s+${funcName}\\s*\\(`);
        if (!rx.test(source)) {
          throw new Error(msg || `Expected PHP function "${funcName}(...)"`);
        }
      },
      hasClass(className: string, msg?: string) {
        const rx = new RegExp(`\\b(class|interface|trait|enum)\\s+${className}\\b`);
        if (!rx.test(source)) {
          throw new Error(msg || `Expected ${label} class declaration "${className}"`);
        }
      },
      hasPhpOpenTag(msg?: string) {
        if (!/<\?php/i.test(source)) {
          throw new Error(msg || 'Expected PHP opening tag "<?php"');
        }
      },
    };

    try {
      const script = new vm.Script(tc.code);
      script.runInContext(vm.createContext(sandbox), { timeout: 800 });
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'passed',
        durationMs: Math.max(1, Date.now() - t0),
        expectedResult: tc.expectedResult,
        actualResult: `${label} static structural check passed (${missingBinaryNote})`,
        fileRef: target?.name || tc.targetFile,
        lineRef: tc.targetLine,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        caseId: tc.id,
        name: tc.name,
        description: tc.description,
        testType: tc.testType,
        status: 'failed',
        durationMs: Math.max(1, Date.now() - t0),
        expectedResult: tc.expectedResult,
        actualResult: msg,
        failureMessage: msg,
        fileRef: target?.name || tc.targetFile,
        lineRef: tc.targetLine,
      });
    }
  }

  return summarizeCounts(results, startAll, {
    available: false,
    reason: `Verified statically via lexical delimiter and ${label} symbol structure checks (${missingBinaryNote}).`,
  });
}

// ---------------------------------------------------------------------------
// Unified TestLab Suite Dispatcher (12 Runtimes / 9 Selectable Languages)
// ---------------------------------------------------------------------------
export function executeTestLabSuite(input: {
  language: string;
  files: SubmittedWorkspaceFile[];
  cases: TestCaseItem[];
}): ExecuteTestSuiteResult {
  const normalized: TestLabLanguageId = normalizeTestLabLanguage(input.language, input.files);

  if (normalized === 'python') {
    return executePythonSuite(input.files, input.cases);
  }
  if (normalized === 'sql') {
    return executeSqlSuite(input.files, input.cases);
  }
  if (normalized === 'cpp') {
    return executeCppSuite(input.files, input.cases);
  }
  if (normalized === 'html' || normalized === 'css') {
    return executeHtmlOrCssSuite(normalized, input.files, input.cases);
  }
  if (normalized === 'csharp' || normalized === 'java') {
    return executeCSharpOrJavaSuite(normalized, input.files, input.cases);
  }
  if (normalized === 'go' || normalized === 'rust' || normalized === 'php') {
    return executeGoRustOrPhpSuite(normalized, input.files, input.cases);
  }

  return executeJavaScriptOrTsSuite(
    input.files,
    input.cases,
    normalized === 'typescript' ? 'typescript' : 'javascript',
  );
}

// ---------------------------------------------------------------------------
// AI Test Suite Generator (Runtime-Aware)
// ---------------------------------------------------------------------------
function getAiRuntimeHint(lang: TestLabLanguageId): string {
  switch (lang) {
    case 'python':
      return 'Python 3 isolated sandbox (pure Python assertions using `assert condition, "message"` — NO os, sys, subprocess, socket, pathlib imports; project .py symbols are already loaded in globals).';
    case 'typescript':
      return 'esbuild TypeScript + isolated Node VM sandbox (`assert.ok`, `assert.equal`, `assert.strictEqual`, `assert.deepEqual`, `assert.throws`, or `expect(x).toBe/toEqual/toContain/toThrow` — TypeScript types are valid and stripped automatically before execution; project functions are already in scope; NEVER use require/import/fs/process).';
    case 'javascript':
      return 'Isolated Node VM sandbox (`assert.ok`, `assert.equal`, `assert.strictEqual`, `assert.deepEqual`, `assert.throws`, or `expect(x).toBe/toEqual/toContain/toThrow` — project functions are already in scope; NEVER use `require`, `import`, `process`, or `fs`).';
    case 'sql':
      return 'In-memory SQLite 3 runner (raw SQL statements ending with semicolons; optional comment assertions on top lines like `-- @expect_rows >= 1`, `-- @expect_contains expectedText`, or `-- @expect_error`; project .sql files are already executed in memory before each test).';
    case 'cpp':
      return 'Isolated g++ -std=c++17 sandbox (write C++17 assertion body statements using `assert(...)` and `<iostream>`/`<string>`/`<vector>`; project helper functions/headers are already included above `int main()` automatically, or provide a full `int main()`. Never include `<filesystem>`, `<fstream>`, or `system()`).';
    case 'html':
      return 'HTML DOM & structural validator sandbox (`assert.balancedTags()`, `assert.hasTag("h1")`, `assert.hasId("app")`, `assert.hasClass("btn")`, `assert.hasAttribute("img", "alt")`, `assert.includes("...")`, `assert.matches("...")` where `source` is the target .html file text).';
    case 'css':
      return 'esbuild CSS syntax parser & structural sandbox (`assert.validCss()`, `assert.hasSelector(".card")`, `assert.hasProperty("display")`, `assert.hasCssVar("--primary")`, `assert.includes("...")`, `assert.matches("...")` where `source` is the target .css file text).';
    case 'csharp':
      return 'C# static structural verifier sandbox (`assert.balancedBraces()`, `assert.hasClass("ClassName")`, `assert.hasMethod("MethodName")`, `assert.hasNamespaceOrPackage("MyApp")`, `assert.includes("...")`, `assert.matches("...")` where `source` is the target .cs file text).';
    case 'java':
      return 'Java static structural verifier sandbox (`assert.balancedBraces()`, `assert.hasClass("ClassName")`, `assert.hasMethod("methodName")`, `assert.hasNamespaceOrPackage("com.example")`, `assert.includes("...")`, `assert.matches("...")` where `source` is the target .java file text).';
    case 'go':
      return 'Go static structural verifier sandbox (`assert.balancedBraces()`, `assert.hasPackage("main")`, `assert.hasFunc("FuncName")`, `assert.hasStruct("StructName")`, `assert.includes("...")`, `assert.matches("...")` where `source` is the target .go file text).';
    case 'rust':
      return 'Rust static structural verifier sandbox (`assert.balancedBraces()`, `assert.hasFn("fn_name")`, `assert.hasStruct("StructName")`, `assert.hasImpl("TypeName")`, `assert.includes("...")`, `assert.matches("...")` where `source` is the target .rs file text).';
    case 'php':
      return 'PHP static structural verifier sandbox (`assert.balancedBraces()`, `assert.hasPhpOpenTag()`, `assert.hasFunction("funcName")`, `assert.hasClass("ClassName")`, `assert.includes("...")`, `assert.matches("...")` where `source` is the target .php file text).';
  }
}

export async function generateTestsWithAi(input: {
  projectTitle: string;
  language: string;
  files: SubmittedWorkspaceFile[];
  testTypes: TestType[];
  focusPrompt?: string;
}): Promise<{
  framework: string;
  suiteTitle: string;
  cases: TestCaseItem[];
}> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on this server. AI test generation requires a valid API key.');
  }

  const lang = normalizeTestLabLanguage(input.language, input.files);
  const runtimeHint = getAiRuntimeHint(lang);

  const fileSummary = input.files
    .slice(0, 12)
    .map((f) => `=== FILE: ${f.name} (${f.language || lang}) ===\n${f.content.slice(0, 8000)}`)
    .join('\n\n');

  const prompt = `Inspect the real project "${input.projectTitle}" (target TestLab language: ${lang}) and generate 4 to 6 high-value, directly runnable test cases covering: ${input.testTypes.join(', ')}.
${input.focusPrompt ? `Developer focus request: ${input.focusPrompt}\n` : ''}
CRITICAL EXECUTION ENVIRONMENT RULES:
- Target runtime: ${runtimeHint}
- Every test's "code" field MUST run cleanly inside that exact target runtime against the actual symbols, tables, classes, functions, or markup in the files below (or self-contained expressions if no ${lang} file exists yet).
- Keep assertions deterministic and concise.

PROJECT FILES:
${fileSummary}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          framework: { type: Type.STRING },
          suiteTitle: { type: Type.STRING },
          cases: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                testType: {
                  type: Type.STRING,
                  enum: ['unit', 'integration', 'functional', 'api', 'regression', 'component', 'edge_case'],
                },
                targetFile: { type: Type.STRING },
                targetLine: { type: Type.NUMBER },
                code: { type: Type.STRING },
                expectedResult: { type: Type.STRING },
              },
              required: ['name', 'description', 'testType', 'targetFile', 'code', 'expectedResult'],
            },
          },
        },
        required: ['framework', 'suiteTitle', 'cases'],
      },
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('AI returned an empty response during test generation.');
  }

  const parsed = JSON.parse(rawText) as {
    framework: string;
    suiteTitle: string;
    cases: Array<{
      name: string;
      description: string;
      testType: TestType;
      targetFile: string;
      targetLine?: number;
      code: string;
      expectedResult: string;
    }>;
  };

  return {
    framework: parsed.framework || `Mideo ${lang.toUpperCase()} Runner`,
    suiteTitle: parsed.suiteTitle || `${input.projectTitle} (${lang.toUpperCase()}) Suite`,
    cases: (parsed.cases || []).slice(0, 12).map((c, idx) => ({
      id: `tc_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
      name: c.name,
      description: c.description,
      testType: c.testType || 'unit',
      targetFile: c.targetFile || input.files[0]?.name || 'main',
      targetLine: typeof c.targetLine === 'number' && c.targetLine >= 1 ? Math.round(c.targetLine) : undefined,
      code: c.code,
      expectedResult: c.expectedResult,
      enabled: true,
      aiGenerated: true,
    })),
  };
}

export async function assistTestingWithAi(input: {
  question: string;
  projectTitle: string;
  language: string;
  files: SubmittedWorkspaceFile[];
  failedResults: TestCaseResult[];
  coverage?: TestCoverageSummary;
}): Promise<{ reply: string; suggestedTests?: TestCaseItem[] }> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on this server.');
  }

  const failureContext =
    input.failedResults.length > 0
      ? input.failedResults
          .map(
            (r) =>
              `- [${r.status.toUpperCase()}] ${r.name} (${r.fileRef || 'unknown'}${r.lineRef ? `:${r.lineRef}` : ''})\n  Expected: ${r.expectedResult}\n  Actual: ${r.actualResult}\n  Message: ${r.failureMessage || 'n/a'}`,
          )
          .join('\n')
      : 'No failures supplied.';

  const fileSnippet = input.files
    .slice(0, 6)
    .map((f) => `FILE ${f.name}:\n${f.content.slice(0, 4000)}`)
    .join('\n\n');

  const prompt = `You are the MideoCode TestLab AI Testing Assistant.
Project: "${input.projectTitle}" (${input.language})
Coverage Status: ${input.coverage?.available ? `${input.coverage.linePct}% line coverage` : input.coverage?.reason || 'Not measured'}

Failures / Results Context:
${failureContext}

Source Files:
${fileSnippet}

Developer Question:
${input.question}

Provide a clear, specific, actionable answer referencing actual symbol names, line expectations, and concrete fixes.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    },
  });

  return {
    reply: response.text || 'Unable to generate testing analysis.',
  };
}

import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
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

function stripTsIfNeeded(code: string, lang: string, filename: string): string {
  const lower = (filename || '').toLowerCase();
  if (lang === 'typescript' || lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    const out = transformSync(code, {
      loader: lower.endsWith('.tsx') ? 'tsx' : 'ts',
      target: 'es2022',
      format: 'esm',
    });
    // Remove bare export keywords so top-level bindings live directly in sandbox scope
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
  executableLinesByFile: Record<string, number[]>;
  definedFunctionsCount: number;
} {
  const executableLinesByFile: Record<string, number[]> = {};
  const chunks: string[] = [];
  let definedFunctionsCount = 0;
  let globalOffset = 0;

  for (const file of files) {
    const raw = stripTsIfNeeded(file.content || '', file.language || 'javascript', file.name);
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
    // Verify instrumented script compiles cleanly
    new vm.Script(combinedSource);
    return {
      combinedSource,
      instrumented: true,
      executableLinesByFile,
      definedFunctionsCount,
    };
  } catch {
    const fallback = files
      .map((f) => stripTsIfNeeded(f.content || '', f.language || 'javascript', f.name))
      .join('\n;\n');
    return {
      combinedSource: fallback,
      instrumented: false,
      executableLinesByFile: {},
      definedFunctionsCount: 0,
    };
  }
}

function executeJavaScriptSuite(
  files: SubmittedWorkspaceFile[],
  cases: TestCaseItem[],
): ExecuteTestSuiteResult {
  const startAll = Date.now();
  const jsFiles = files.filter((f) => {
    const lower = f.name.toLowerCase();
    return (
      lower.endsWith('.js') ||
      lower.endsWith('.mjs') ||
      lower.endsWith('.ts') ||
      lower.endsWith('.tsx') ||
      f.language === 'javascript' ||
      f.language === 'typescript'
    );
  });

  if (jsFiles.length === 0) {
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
        actualResult: c.enabled ? 'No JavaScript or TypeScript source files found in project' : 'Skipped',
        failureMessage: c.enabled ? 'Add at least one .js or .ts file to run JS tests.' : undefined,
        fileRef: c.targetFile,
        lineRef: c.targetLine,
      })),
      coverage: {
        available: false,
        reason: 'No JavaScript/TypeScript source files present to instrument.',
      },
    };
  }

  const prep = buildInstrumentedJs(jsFiles);
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
      const cleanTestCode = stripTsIfNeeded(tc.code || '', 'typescript', 'test.ts');
      const fullProgram = `${prep.combinedSource}\n;\n${cleanTestCode}`;
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
    reason: 'Instrumentation skipped due to script structure; test results remain authentic.',
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
    } else {
      coverage = {
        available: false,
        reason: 'No executable statements were detected in the JavaScript/TypeScript files.',
      };
    }
  }

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

  const pyFiles = files.filter(
    (f) => f.name.toLowerCase().endsWith('.py') || f.language === 'python',
  );
  if (pyFiles.length === 0) {
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
        actualResult: 'No .py files found in project',
        failureMessage: 'Create at least one .py file to run Python tests.',
      })),
      coverage: {
        available: false,
        reason: 'No Python source files found.',
      },
    };
  }

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
import ast, json, sys, time, traceback, builtins as _b

_user_src = ${JSON.stringify(combinedPy)}
_cases = json.loads(${JSON.stringify(JSON.stringify(pyCasesPayload))})

_exec_lines = set()
_func_defs = set()
_branch_lines = set()
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

_coverage = {"available": False, "reason": "No executable Python statements traced."}
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
  const passedTests = parsed.results.filter((r) => r.status === 'passed').length;
  const failedTests = parsed.results.filter((r) => r.status === 'failed').length;
  const skippedTests = parsed.results.filter((r) => r.status === 'skipped').length;
  const errorTests = parsed.results.filter((r) => r.status === 'error').length;

  return {
    status: errorTests > 0 && passedTests === 0 ? 'error' : failedTests > 0 || errorTests > 0 ? 'failed' : 'passed',
    totalTests: parsed.results.length,
    passedTests,
    failedTests,
    skippedTests,
    errorTests,
    durationMs: parsed.durationMs,
    results: parsed.results,
    coverage: parsed.coverage,
  };
}

function executeWebOrStaticSuite(
  files: SubmittedWorkspaceFile[],
  cases: TestCaseItem[],
): ExecuteTestSuiteResult {
  // For 'web' projects containing JS files, execute real JS tests via Node VM if cases target JS,
  // or evaluate explicit HTML/CSS/SQL checks cleanly.
  const hasJsTestCode = cases.some(
    (c) =>
      c.enabled &&
      (c.targetFile?.endsWith('.js') ||
        c.code.includes('assert.') ||
        c.code.includes('expect(')),
  );
  const hasJsFiles = files.some((f) => f.name.toLowerCase().endsWith('.js') || f.name.toLowerCase().endsWith('.ts'));

  if (hasJsTestCode && hasJsFiles) {
    return executeJavaScriptSuite(files, cases);
  }

  const results: TestCaseResult[] = [];
  const startAll = Date.now();

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
        actualResult: 'Skipped',
      });
      continue;
    }

    const t0 = Date.now();
    const target = files.find((f) => f.name.toLowerCase() === (tc.targetFile || '').toLowerCase()) || files[0];
    const source = target?.content || '';

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
        if (!cond) throw new Error(msg || 'Structural assertion failed');
      },
      includes(needle: string, msg?: string) {
        if (!source.toLowerCase().includes(String(needle).toLowerCase())) {
          throw new Error(msg || `Expected ${target?.name || 'source'} to include "${needle}"`);
        }
      },
      matches(pattern: string | RegExp, msg?: string) {
        const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'im');
        if (!rx.test(source)) {
          throw new Error(msg || `Pattern check failed on ${target?.name || 'source'}`);
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
        actualResult: 'Checks passed',
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

  const passedTests = results.filter((r) => r.status === 'passed').length;
  const failedTests = results.filter((r) => r.status === 'failed').length;
  const skippedTests = results.filter((r) => r.status === 'skipped').length;
  const errorTests = results.filter((r) => r.status === 'error').length;

  return {
    status: failedTests > 0 || errorTests > 0 ? 'failed' : 'passed',
    totalTests: results.length,
    passedTests,
    failedTests,
    skippedTests,
    errorTests,
    durationMs: Math.max(1, Date.now() - startAll),
    results,
    coverage: {
      available: false,
      reason: 'Line coverage is not instrumentable for static HTML/CSS/structural assertions.',
    },
  };
}

export function executeTestLabSuite(input: {
  language: string;
  files: SubmittedWorkspaceFile[];
  cases: TestCaseItem[];
}): ExecuteTestSuiteResult {
  const lang = (input.language || 'javascript').toLowerCase();
  if (lang === 'python') {
    return executePythonSuite(input.files, input.cases);
  }
  if (lang === 'javascript' || lang === 'typescript') {
    return executeJavaScriptSuite(input.files, input.cases);
  }
  return executeWebOrStaticSuite(input.files, input.cases);
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

  const lang = input.language.toLowerCase();
  const runtimeHint =
    lang === 'python'
      ? 'Python 3 isolated sandbox (pure Python assertions using `assert condition, "message"` — NO os, sys, subprocess, socket, pathlib imports; user source code is already loaded into globals before each test runs).'
      : lang === 'javascript' || lang === 'typescript'
        ? 'Isolated Node VM sandbox (`assert.ok`, `assert.equal`, `assert.strictEqual`, `assert.deepEqual`, `assert.throws`, or `expect(x).toBe/toEqual/toContain/toThrow` — user project functions/classes are already in scope; NEVER use `require`, `import`, `process`, or `fs`).'
        : 'Web/HTML/CSS structural sandbox (`assert.includes("substring")`, `assert.matches("regex")`, `assert.ok(source.length > 0)` where `source` is the target file text).';

  const fileSummary = input.files
    .slice(0, 12)
    .map((f) => `=== FILE: ${f.name} (${f.language || lang}) ===\n${f.content.slice(0, 8000)}`)
    .join('\n\n');

  const prompt = `Inspect the real project "${input.projectTitle}" (${lang}) and generate 4 to 6 high-value, directly runnable test cases covering: ${input.testTypes.join(', ')}.
${input.focusPrompt ? `Developer focus request: ${input.focusPrompt}\n` : ''}
CRITICAL EXECUTION ENVIRONMENT RULES:
- Target runtime: ${runtimeHint}
- Every test's "code" field MUST execute cleanly against the actual symbols, functions, classes, or HTML/CSS markup present in the files below—never invent non-existent function names unless testing missing behavior explicitly.
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
    framework: parsed.framework || (lang === 'python' ? 'Mideo PyAssert' : 'Mideo VM Assert'),
    suiteTitle: parsed.suiteTitle || `${input.projectTitle} Automated Suite`,
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

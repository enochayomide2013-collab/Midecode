export type TestLabLanguageId =
  | 'javascript'
  | 'python'
  | 'sql'
  | 'cpp'
  | 'csharp'
  | 'java'
  | 'go'
  | 'rust'
  | 'php'
  | 'html'
  | 'css'
  | 'typescript';

export interface TestLabLanguageSpec {
  id: TestLabLanguageId;
  label: string;
  extension: string;
  framework: string;
  runtimeMode: 'sandbox_exec' | 'native_compiler' | 'parser_validator' | 'static_structural';
  runtimeLabel: string;
  runnerNote: string;
  starterTargetFile: string;
  starterProjectContent: string;
  starterTestName: string;
  starterTestCode: string;
  starterExpected: string;
}

// The exact 9 selectable languages exposed in the TestLab dropdown & quick matrix
export const TESTLAB_LANGUAGES: TestLabLanguageSpec[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    extension: '.js',
    framework: 'Mideo VM Assert',
    runtimeMode: 'sandbox_exec',
    runtimeLabel: 'Isolated Node VM',
    runnerNote: 'Executes in an isolated Node VM sandbox with live statement & line coverage tracing.',
    starterTargetFile: 'script.js',
    starterProjectContent: `function sum(a, b) {
  return a + b;
}
`,
    starterTestName: 'JavaScript expression and assertions execute cleanly',
    starterTestCode: `expect(1 + 2).toBe(3);
expect([10, 20, 30]).toContain(20);`,
    starterExpected: 'Assertions evaluate cleanly inside isolated VM',
  },
  {
    id: 'python',
    label: 'Python',
    extension: '.py',
    framework: 'Mideo PyAssert',
    runtimeMode: 'sandbox_exec',
    runtimeLabel: 'Isolated Python 3 Sandbox',
    runnerNote: 'Runs in isolated python3 (-I -S) sandbox with AST tracing for line and branch coverage.',
    starterTargetFile: 'main.py',
    starterProjectContent: `def add(a: int, b: int) -> int:
    return a + b
`,
    starterTestName: 'Python assertions execute in isolated interpreter',
    starterTestCode: `def multiply(a, b):
    return a * b

assert multiply(4, 5) == 20, "Expected 4 * 5 to equal 20"`,
    starterExpected: 'Python assertion evaluates cleanly',
  },
  {
    id: 'sql',
    label: 'SQL',
    extension: '.sql',
    framework: 'Mideo SQLite Engine',
    runtimeMode: 'sandbox_exec',
    runtimeLabel: 'In-Memory SQLite 3',
    runnerNote: 'Runs project .sql schemas + test queries inside isolated :memory: SQLite with -- @expect_* assertions.',
    starterTargetFile: 'schema.sql',
    starterProjectContent: `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL
);

INSERT INTO users (name, role) VALUES ('Ada Lovelace', 'admin');
`,
    starterTestName: 'SQL table query returns expected records',
    starterTestCode: `-- @expect_rows >= 1
-- @expect_contains Ada
SELECT id, name, role FROM users ORDER BY id;`,
    starterExpected: 'Query returns at least 1 row containing Ada',
  },
  {
    id: 'cpp',
    label: 'C++',
    extension: '.cpp',
    framework: 'Mideo g++ C++17 Runner',
    runtimeMode: 'native_compiler',
    runtimeLabel: 'g++ C++17 Native Sandbox',
    runnerNote: 'Compiles C++17 code via g++ in an isolated temp directory and executes the binary with strict timeout.',
    starterTargetFile: 'main.cpp',
    starterProjectContent: `#include <iostream>

int square(int x) {
    return x * x;
}
`,
    starterTestName: 'C++17 compilation and assertion check',
    starterTestCode: `auto clampScore = [](int val, int lo, int hi) {
  return val < lo ? lo : (val > hi ? hi : val);
};
assert(clampScore(120, 0, 100) == 100);
assert(clampScore(-5, 0, 100) == 0);
std::cout << "C++ checks passed" << std::endl;`,
    starterExpected: 'Compiles cleanly with g++ -std=c++17 and passes cassert checks',
  },
  {
    id: 'csharp',
    label: 'C#',
    extension: '.cs',
    framework: 'Mideo C# Structural Analyzer',
    runtimeMode: 'static_structural',
    runtimeLabel: 'C# Static Structural Check',
    runnerNote: 'Verifies lexical brace/delimiter balance, class/method signatures, and structural pattern assertions (.NET SDK binary is not installed in this container).',
    starterTargetFile: 'Program.cs',
    starterProjectContent: `using System;

public class Calculator {
    public int Add(int a, int b) {
        return a + b;
    }
}
`,
    starterTestName: 'C# class structure and balanced delimiters check',
    starterTestCode: `assert.balancedBraces();
assert.hasClass('Calculator');
assert.hasMethod('Add');`,
    starterExpected: 'Valid C# class, method, and balanced braces structure',
  },
  {
    id: 'java',
    label: 'Java',
    extension: '.java',
    framework: 'Mideo Java Structural Analyzer',
    runtimeMode: 'static_structural',
    runtimeLabel: 'Java Static Structural Check',
    runnerNote: 'Verifies lexical brace/delimiter balance, class/method declarations, and structural assertions (JDK javac is not installed in this container).',
    starterTargetFile: 'Main.java',
    starterProjectContent: `public class Main {
    public static int add(int a, int b) {
        return a + b;
    }
}
`,
    starterTestName: 'Java class declaration and delimiter integrity check',
    starterTestCode: `assert.balancedBraces();
assert.hasClass('Main');
assert.hasMethod('add');`,
    starterExpected: 'Valid Java class structure and balanced braces',
  },
  {
    id: 'go',
    label: 'Go',
    extension: '.go',
    framework: 'Mideo Go Structural Analyzer',
    runtimeMode: 'static_structural',
    runtimeLabel: 'Go Static Structural Check',
    runnerNote: 'Verifies Go package declarations, func/struct definitions, and lexical delimiter integrity (Go toolchain binary is not installed in this container).',
    starterTargetFile: 'main.go',
    starterProjectContent: `package main

func Add(a int, b int) int {
	return a + b
}

func main() {
	_ = Add(2, 3)
}
`,
    starterTestName: 'Go package, function declarations, and delimiter integrity',
    starterTestCode: `assert.balancedBraces();
assert.hasPackage('main');
assert.hasFunc('Add');
assert.hasFunc('main');`,
    starterExpected: 'Valid Go package main with Add() and main() and balanced delimiters',
  },
  {
    id: 'rust',
    label: 'Rust',
    extension: '.rs',
    framework: 'Mideo Rust Structural Analyzer',
    runtimeMode: 'static_structural',
    runtimeLabel: 'Rust Static Structural Check',
    runnerNote: 'Verifies Rust fn/struct/impl definitions, balanced delimiters, and safety checks (Rust rustc compiler binary is not installed in this container).',
    starterTargetFile: 'main.rs',
    starterProjectContent: `pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn main() {
    let total = add(4, 6);
    println!("Total: {}", total);
}
`,
    starterTestName: 'Rust function signatures and delimiter balance check',
    starterTestCode: `assert.balancedBraces();
assert.hasFn('add');
assert.hasFn('main');`,
    starterExpected: 'Valid Rust fn add and fn main with balanced delimiters',
  },
  {
    id: 'php',
    label: 'PHP',
    extension: '.php',
    framework: 'Mideo PHP Structural Analyzer',
    runtimeMode: 'static_structural',
    runtimeLabel: 'PHP Static Structural Check',
    runnerNote: 'Verifies <?php opening tags, function/class definitions, and lexical delimiter balance (PHP CLI binary is not installed in this container).',
    starterTargetFile: 'index.php',
    starterProjectContent: `<?php
declare(strict_types=1);

function sumValues(int $a, int $b): int {
    return $a + $b;
}
`,
    starterTestName: 'PHP opening tag, function signature, and delimiter check',
    starterTestCode: `assert.balancedBraces();
assert.hasPhpOpenTag();
assert.hasFunction('sumValues');`,
    starterExpected: 'Valid <?php tag, sumValues function, and balanced delimiters',
  },
];

// Auxiliary language specs preserved for Web (HTML/CSS/TypeScript) project auto-detection
export const AUXILIARY_TESTLAB_LANGUAGES: TestLabLanguageSpec[] = [
  {
    id: 'html',
    label: 'HTML',
    extension: '.html',
    framework: 'Mideo HTML Validator',
    runtimeMode: 'parser_validator',
    runtimeLabel: 'HTML DOM & Tag Validator',
    runnerNote: 'Validates balanced HTML tags, attributes, IDs, classes, and structure assertions.',
    starterTargetFile: 'index.html',
    starterProjectContent: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Mideo App</title>
  </head>
  <body>
    <main id="app" class="container">
      <h1>Welcome to MideoCode</h1>
    </main>
  </body>
</html>
`,
    starterTestName: 'HTML contains balanced tags and main container',
    starterTestCode: `assert.balancedTags();
assert.hasTag('h1');
assert.hasId('app');`,
    starterExpected: 'Balanced markup with <h1> and #app container',
  },
  {
    id: 'css',
    label: 'CSS',
    extension: '.css',
    framework: 'Mideo CSS Parser',
    runtimeMode: 'parser_validator',
    runtimeLabel: 'esbuild CSS Parser',
    runnerNote: 'Parses CSS with esbuild to catch syntax errors and checks selectors, variables, and properties.',
    starterTargetFile: 'styles.css',
    starterProjectContent: `:root {
  --brand-primary: #2563eb;
}

.container {
  display: flex;
  gap: 1rem;
  color: var(--brand-primary);
}
`,
    starterTestName: 'CSS parses cleanly and defines layout rules',
    starterTestCode: `assert.validCss();
assert.hasSelector('.container');
assert.hasProperty('display');`,
    starterExpected: 'Valid CSS syntax with .container display rule',
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    extension: '.ts',
    framework: 'Mideo TS VM Runner',
    runtimeMode: 'sandbox_exec',
    runtimeLabel: 'esbuild TypeScript + Node VM',
    runnerNote: 'Transpiles TypeScript with esbuild, verifies TS syntax, and executes with line coverage.',
    starterTargetFile: 'main.ts',
    starterProjectContent: `export function greet(name: string): string {
  return \`Hello, \${name}\`;
}
`,
    starterTestName: 'Typed helper transforms and runs cleanly',
    starterTestCode: `const formatScore = (score: number, max: number): number => Math.round((score / max) * 100);
expect(formatScore(18, 20)).toBe(90);`,
    starterExpected: 'TypeScript transpiles without syntax errors and evaluates to 90',
  },
];

export const ALL_TESTLAB_LANGUAGES: TestLabLanguageSpec[] = [
  ...TESTLAB_LANGUAGES,
  ...AUXILIARY_TESTLAB_LANGUAGES,
];

export function getTestLabLanguageSpec(lang?: string): TestLabLanguageSpec {
  const normalized = normalizeTestLabLanguage(lang);
  return ALL_TESTLAB_LANGUAGES.find((l) => l.id === normalized) || TESTLAB_LANGUAGES[0];
}

export function normalizeSelectableTestLabLanguage(
  lang?: string,
  files?: { name: string; language?: string }[],
): 'javascript' | 'python' | 'sql' | 'cpp' | 'csharp' | 'java' | 'go' | 'rust' | 'php' {
  const detected = normalizeTestLabLanguage(lang, files);
  if (detected === 'html' || detected === 'css' || detected === 'typescript') {
    return 'javascript';
  }
  return detected;
}

export function normalizeTestLabLanguage(
  lang?: string,
  files?: { name: string; language?: string }[],
): TestLabLanguageId {
  const raw = (lang || '').trim().toLowerCase();
  if (raw === 'c++' || raw === 'cpp') return 'cpp';
  if (raw === 'c#' || raw === 'csharp' || raw === 'cs') return 'csharp';
  if (raw === 'ts' || raw === 'tsx' || raw === 'typescript') return 'typescript';
  if (raw === 'js' || raw === 'jsx' || raw === 'javascript') return 'javascript';
  if (raw === 'py' || raw === 'python') return 'python';
  if (raw === 'sql') return 'sql';
  if (raw === 'html') return 'html';
  if (raw === 'css') return 'css';
  if (raw === 'java') return 'java';
  if (raw === 'go' || raw === 'golang') return 'go';
  if (raw === 'rs' || raw === 'rust') return 'rust';
  if (raw === 'php') return 'php';

  if (raw === 'web' && files && files.length > 0) {
    if (files.some((f) => f.name.toLowerCase().endsWith('.js') || f.name.toLowerCase().endsWith('.ts'))) {
      return 'javascript';
    }
    if (files.some((f) => f.name.toLowerCase().endsWith('.html'))) {
      return 'html';
    }
    if (files.some((f) => f.name.toLowerCase().endsWith('.css'))) {
      return 'css';
    }
  }
  return 'javascript';
}

export function fileMatchesTestLabLanguage(
  file: { name: string; language?: string },
  lang: TestLabLanguageId,
): boolean {
  const lower = (file.name || '').toLowerCase();
  const declared = (file.language || '').toLowerCase();
  switch (lang) {
    case 'html':
      return declared === 'html' || lower.endsWith('.html') || lower.endsWith('.htm');
    case 'css':
      return declared === 'css' || lower.endsWith('.css');
    case 'javascript':
      return declared === 'javascript' || lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.jsx');
    case 'typescript':
      return declared === 'typescript' || lower.endsWith('.ts') || lower.endsWith('.tsx');
    case 'python':
      return declared === 'python' || lower.endsWith('.py');
    case 'sql':
      return declared === 'sql' || lower.endsWith('.sql');
    case 'cpp':
      return (
        declared === 'cpp' ||
        declared === 'c++' ||
        lower.endsWith('.cpp') ||
        lower.endsWith('.cc') ||
        lower.endsWith('.cxx') ||
        lower.endsWith('.hpp') ||
        lower.endsWith('.h')
      );
    case 'csharp':
      return declared === 'csharp' || declared === 'c#' || lower.endsWith('.cs');
    case 'java':
      return declared === 'java' || lower.endsWith('.java');
    case 'go':
      return declared === 'go' || declared === 'golang' || lower.endsWith('.go');
    case 'rust':
      return declared === 'rust' || lower.endsWith('.rs');
    case 'php':
      return declared === 'php' || lower.endsWith('.php');
  }
}

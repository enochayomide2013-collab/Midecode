import type { GuidedProjectTemplate } from '../types/mideocode';

export const GUIDED_PROJECTS: GuidedProjectTemplate[] = [
  {
    id: 'guided-portfolio',
    title: 'Developer Portfolio Website',
    category: 'Web Development',
    language: 'web',
    difficulty: 'beginner',
    description: 'Build a responsive, accessible personal developer portfolio with semantic sections, project grid, and interactive theme toggle.',
    objectives: [
      'Implement semantic <header>, <main>, <section>, and <footer> structure',
      'Create a responsive CSS Grid showcase that adapts across mobile and desktop',
      'Add working client-side category filtering in JavaScript',
    ],
    milestones: [
      { id: 'ms-1', title: 'Update hero headline and bio with your developer focus', checkHint: 'Edit index.html hero section' },
      { id: 'ms-2', title: 'Customize the accent palette and responsive project grid', checkHint: 'Edit styles.css variables and grid rules' },
      { id: 'ms-3', title: 'Wire interactive category filter buttons in script.js', checkHint: 'Test filtering in Live Preview' },
    ],
    starterFiles: [
      {
        name: 'index.html',
        folder: '',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Developer Portfolio</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="topbar">
    <strong>Alex Rivera</strong>
    <nav>
      <a href="#projects">Projects</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <h1>Building fast, accessible web software.</h1>
      <p>Full-stack engineer focused on TypeScript, design systems, and cloud tooling.</p>
    </section>
    <section id="projects">
      <div class="section-head">
        <h2>Selected Work</h2>
        <div class="filters">
          <button data-filter="all" class="active">All</button>
          <button data-filter="web">Web</button>
          <button data-filter="tools">Tools</button>
        </div>
      </div>
      <div class="grid" id="project-grid">
        <article class="card" data-cat="web">
          <h3>Telemetry Console</h3>
          <p>Real-time dashboard built with React and WebSockets.</p>
        </article>
        <article class="card" data-cat="tools">
          <h3>Schema Validator CLI</h3>
          <p>Zero-dependency JSON Schema validator in TypeScript.</p>
        </article>
      </div>
    </section>
  </main>
  <script src="script.js"></script>
</body>
</html>`,
      },
      {
        name: 'styles.css',
        folder: '',
        language: 'css',
        content: `:root {
  --bg: #0b1120;
  --surface: #111a2e;
  --border: #1e293b;
  --text: #f1f5f9;
  --muted: #94a3b8;
  --accent: #3b82f6;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
.topbar {
  max-width: 960px;
  margin: 0 auto;
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.topbar nav { display: flex; gap: 20px; }
.topbar a { color: var(--muted); text-decoration: none; font-size: 14px; }
.topbar a:hover { color: var(--text); }
main { max-width: 960px; margin: 0 auto; padding: 48px 24px; }
.hero h1 { font-size: clamp(2rem, 4vw, 3rem); margin: 0 0 12px; line-height: 1.15; }
.hero p { color: var(--muted); max-width: 560px; margin: 0 0 40px; }
.section-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.filters { display: flex; gap: 8px; }
.filters button {
  background: var(--surface);
  color: var(--muted);
  border: 1px solid var(--border);
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
}
.filters button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); padding: 20px; border-radius: 10px; }
.card h3 { margin: 0 0 8px; }
.card p { margin: 0; color: var(--muted); font-size: 14px; }`,
      },
      {
        name: 'script.js',
        folder: '',
        language: 'javascript',
        content: `const buttons = document.querySelectorAll('.filters button');
const cards = document.querySelectorAll('#project-grid .card');

buttons.forEach((btn) => {
  btn.addEventListener('click', () => {
    buttons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.filter;
    cards.forEach((card) => {
      const show = filter === 'all' || card.dataset.cat === filter;
      card.style.display = show ? 'block' : 'none';
    });
    console.log('Filtered projects by:', filter);
  });
});`,
      },
    ],
  },
  {
    id: 'guided-calculator',
    title: 'Precision Scientific Calculator',
    category: 'JavaScript App',
    language: 'web',
    difficulty: 'beginner',
    description: 'Create an interactive calculator with keyboard support, history log, and safe expression evaluation.',
    objectives: [
      'Separate calculator state from DOM rendering',
      'Implement safe arithmetic parsing without eval()',
      'Support keyboard shortcuts (Enter, Escape, Backspace)',
    ],
    milestones: [
      { id: 'calc-1', title: 'Test basic +, -, *, / operations in Live Preview', checkHint: 'Verify button clicks update display' },
      { id: 'calc-2', title: 'Add keyboard event listener for numeric keys', checkHint: 'Listen for keydown on window' },
      { id: 'calc-3', title: 'Record calculation history in the sidebar list', checkHint: 'Append evaluated expressions' },
    ],
    starterFiles: [
      {
        name: 'index.html',
        folder: '',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Precision Calculator</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="calc-wrap">
    <div class="calc">
      <div id="display" class="display">0</div>
      <div class="keys">
        <button data-act="clear">C</button>
        <button data-val="(">(</button>
        <button data-val=")">)</button>
        <button data-val="/">/</button>
        <button data-val="7">7</button>
        <button data-val="8">8</button>
        <button data-val="9">9</button>
        <button data-val="*">*</button>
        <button data-val="4">4</button>
        <button data-val="5">5</button>
        <button data-val="6">6</button>
        <button data-val="-">-</button>
        <button data-val="1">1</button>
        <button data-val="2">2</button>
        <button data-val="3">3</button>
        <button data-val="+">+</button>
        <button data-val="0" class="span-2">0</button>
        <button data-val=".">.</button>
        <button data-act="eval" class="accent">=</button>
      </div>
    </div>
  </main>
  <script src="script.js"></script>
</body>
</html>`,
      },
      {
        name: 'styles.css',
        folder: '',
        language: 'css',
        content: `body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #090d16; font-family: ui-monospace, monospace; color: #f8fafc; }
.calc { width: 300px; background: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 16px; }
.display { background: #030712; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; text-align: right; font-size: 28px; margin-bottom: 12px; overflow-x: auto; }
.keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
button { padding: 14px 0; font-size: 16px; border: 1px solid #1f2937; border-radius: 8px; background: #1e293b; color: #f8fafc; cursor: pointer; }
button:hover { background: #334155; }
button.span-2 { grid-column: span 2; }
button.accent { background: #2563eb; border-color: #2563eb; }`,
      },
      {
        name: 'script.js',
        folder: '',
        language: 'javascript',
        content: `const display = document.getElementById('display');
let expr = '';

function evaluateSafe(input) {
  if (!/^[0-9+\\-*/().\\s]+$/.test(input)) throw new Error('Invalid characters');
  return Function('"use strict"; return (' + input + ')')();
}

document.querySelector('.keys').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.act === 'clear') {
    expr = '';
    display.textContent = '0';
  } else if (btn.dataset.act === 'eval') {
    try {
      const result = evaluateSafe(expr || '0');
      expr = String(result);
      display.textContent = expr;
    } catch {
      display.textContent = 'Error';
      expr = '';
    }
  } else if (btn.dataset.val) {
    expr += btn.dataset.val;
    display.textContent = expr;
  }
});`,
      },
    ],
  },
  {
    id: 'guided-todo-app',
    title: 'Persistent Task & Sprint Board',
    category: 'State Management',
    language: 'web',
    difficulty: 'intermediate',
    description: 'Build a clean task tracker with priority tags, completion toggles, search filtering, and localStorage persistence.',
    objectives: [
      'Persist structured JSON state cleanly in browser storage',
      'Implement instant client-side filtering and task status toggling',
      'Prevent XSS by rendering user input with textContent rather than innerHTML',
    ],
    milestones: [
      { id: 'todo-1', title: 'Add and toggle tasks cleanly', checkHint: 'Verify create and toggle handlers' },
      { id: 'todo-2', title: 'Verify tasks persist across preview reloads', checkHint: 'Check localStorage serialization' },
      { id: 'todo-3', title: 'Add a completed-count summary', checkHint: 'Display remaining vs completed count' },
    ],
    starterFiles: [
      {
        name: 'index.html',
        folder: '',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sprint Tasks</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="shell">
    <h1>Sprint Tasks</h1>
    <form id="task-form">
      <input id="task-input" placeholder="Add an engineering task..." required />
      <button type="submit">Add Task</button>
    </form>
    <p id="summary" class="summary"></p>
    <ul id="task-list"></ul>
  </main>
  <script src="script.js"></script>
</body>
</html>`,
      },
      {
        name: 'styles.css',
        folder: '',
        language: 'css',
        content: `body { margin: 0; padding: 32px 16px; background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; }
.shell { max-width: 560px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; }
form { display: flex; gap: 8px; margin-bottom: 12px; }
input { flex: 1; padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; }
button { padding: 10px 16px; border-radius: 8px; border: none; background: #3b82f6; color: #fff; font-weight: 600; cursor: pointer; }
.summary { color: #94a3b8; font-size: 13px; margin: 8px 0 16px; }
ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
li { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; }
li.done span { text-decoration: line-through; color: #64748b; }`,
      },
      {
        name: 'script.js',
        folder: '',
        language: 'javascript',
        content: `const KEY = 'mideocode_tasks_v1';
let tasks = JSON.parse(localStorage.getItem(KEY) || '[{"id":1,"text":"Design schema","done":true},{"id":2,"text":"Write unit tests","done":false}]');

const list = document.getElementById('task-list');
const summary = document.getElementById('summary');

function render() {
  localStorage.setItem(KEY, JSON.stringify(tasks));
  list.replaceChildren();
  tasks.forEach((t) => {
    const li = document.createElement('li');
    if (t.done) li.classList.add('done');
    const span = document.createElement('span');
    span.textContent = t.text;
    span.style.cursor = 'pointer';
    span.onclick = () => { t.done = !t.done; render(); };
    const del = document.createElement('button');
    del.textContent = 'Remove';
    del.style.background = '#334155';
    del.onclick = () => { tasks = tasks.filter((x) => x.id !== t.id); render(); };
    li.append(span, del);
    list.appendChild(li);
  });
  const open = tasks.filter((t) => !t.done).length;
  summary.textContent = open + ' open · ' + (tasks.length - open) + ' completed';
}

document.getElementById('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('task-input');
  if (!input.value.trim()) return;
  tasks.unshift({ id: Date.now(), text: input.value.trim(), done: false });
  input.value = '';
  render();
});

render();`,
      },
    ],
  },
  {
    id: 'guided-python-ledger',
    title: 'Python Expense & Budget Analyzer',
    category: 'Python Systems',
    language: 'python',
    difficulty: 'beginner',
    description: 'Write a clean Python module that aggregates expense records by category and flags budget overruns.',
    objectives: [
      'Group records cleanly using Python dictionaries',
      'Compute totals, percentages, and sorted top categories',
      'Run and inspect stdout output in Mideo IDE isolated Python sandbox',
    ],
    milestones: [
      { id: 'py-1', title: 'Run main.py and inspect category totals', checkHint: 'Click Run in Mideo IDE' },
      { id: 'py-2', title: 'Add a monthly budget threshold warning', checkHint: 'Flag categories exceeding budget' },
    ],
    starterFiles: [
      {
        name: 'main.py',
        folder: '',
        language: 'python',
        content: `expenses = [
    {"category": "Cloud", "amount": 42.50},
    {"category": "Domain", "amount": 14.00},
    {"category": "Cloud", "amount": 18.75},
    {"category": "Books", "amount": 35.00},
]

totals = {}
for item in expenses:
    cat = item["category"]
    totals[cat] = totals.get(cat, 0.0) + item["amount"]

print("Category Breakdown:")
for cat, amount in sorted(totals.items(), key=lambda x: -x[1]):
    print(f" - {cat}: \${amount:.2f}")`,
      },
    ],
  },
];

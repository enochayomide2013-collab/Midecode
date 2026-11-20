import type { Mission, MissionCategory, MissionDifficulty } from '../types/mideocode';

export const MISSION_CATEGORIES: MissionCategory[] = [
  'HTML and CSS',
  'JavaScript',
  'Python',
  'Frontend Development',
  'Backend Development',
  'Full-Stack Development',
  'Database Development',
  'Algorithms and Data Structures',
  'API Development',
  'Software Engineering',
];

export const MISSION_DIFFICULTIES: MissionDifficulty[] = [
  'Beginner',
  'Intermediate',
  'Advanced',
  'Expert',
];

export const CURATED_MISSIONS: Mission[] = [
  // 1. HTML and CSS (Beginner, Featured)
  {
    id: 'mission-responsive-pricing-landing',
    title: 'Accessible Responsive SaaS Pricing Matrix',
    description:
      'Architect a semantic HTML5 pricing comparison section with CSS Grid, custom properties, accessible billing toggle markup, and mobile-first breakpoints.',
    category: 'HTML and CSS',
    difficulty: 'Beginner',
    language: 'web',
    supportedLanguages: ['HTML', 'CSS'],
    requiredSkills: ['Semantic HTML5', 'CSS Grid', 'CSS Custom Properties', 'Responsive Breakpoints', 'Accessibility'],
    prerequisiteMissionIds: [],
    prerequisiteSummary: 'Recommended after completing HTML & Modern CSS Architecture lessons.',
    prerequisitesOptional: true,
    relatedLessonIds: [
      'html-css-architecture::lesson-semantic-landmarks',
      'html-css-architecture::lesson-css-flexbox',
    ],
    learningObjectives: [
      'Structure pricing tiers inside semantic <main>, <header>, and <section>/<article> landmarks',
      'Build a responsive CSS Grid card layout using grid-template-columns and gap without horizontal overflow',
      'Style accessible focus rings and visually clear recommended tier emphasis using CSS variables',
    ],
    estimatedMinutes: 35,
    scenario:
      'Northstar Cloud is launching its developer compute tiers (Starter, Pro, Enterprise). The marketing team needs a semantic, responsive pricing page that keyboard and screen-reader users can navigate effortlessly across desktop and mobile viewports.',
    requirements: [
      'Use semantic <header> and <main> landmarks with exactly one <h1> heading',
      'Render three pricing tier cards (Starter, Pro, Enterprise) inside a CSS Grid container (.pricing-grid)',
      'Each tier card must include a plan name, formatted monthly price, feature list (<ul>/<li>), and a native <button> or <a> call-to-action',
      'Define CSS custom properties inside :root for brand surface/accent colors and configure a responsive @media query for smaller viewports',
    ],
    instructions: [
      'Inspect index.html and replace generic container tags with semantic <header>, <main>, and <section> landmarks.',
      'Build the three tier cards inside .pricing-grid, highlighting the Pro tier with data-featured="true" or .tier-featured.',
      'In styles.css, define :root theme variables, configure display: grid with gap on .pricing-grid, and add a @media breakpoint for mobile stacking.',
      'Review focus-visible keyboard contrast and test desktop, tablet, and mobile viewports in Live Preview before submitting.',
    ],
    hints: [
      {
        id: 'hint-html-1',
        order: 1,
        level: 'nudge',
        title: 'Start with Semantic Landmarks',
        content: 'Wrap the top banner in <header> and the pricing matrix in <main>. Ensure there is a single <h1> describing the pricing matrix.',
      },
      {
        id: 'hint-html-2',
        order: 2,
        level: 'concept',
        title: 'Responsive CSS Grid Pattern',
        content: 'Using grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)) with gap: 1.5rem adapts cleanly across viewports, and adding a @media (max-width: 768px) rule guarantees predictable mobile layout.',
      },
      {
        id: 'hint-html-3',
        order: 3,
        level: 'structure',
        title: 'Card Markup Checklist',
        content: 'Each <article class="tier-card"> should hold an <h2> plan name, <p class="price">, a <ul> list of included quotas, and a <button type="button"> action button.',
      },
      {
        id: 'hint-html-4',
        order: 4,
        level: 'walkthrough',
        title: 'Custom Properties & Focus Ring',
        content: 'Declare :root { --bg: #0b1120; --surface: #111827; --accent: #2563eb; } and style button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }.',
      },
    ],
    completionCriteria:
      'Pass both automated structural checkpoints and full HTML/CSS evaluation checks with semantic landmarks, 3 tier cards, CSS Grid, custom properties, and responsive rules.',
    xpReward: 100,
    badgeId: 'mission_html_architect',
    badgeTitle: 'Semantic Layout Architect',
    isFeatured: true,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'Document contains semantic <header>, <main>, single <h1>, and 3 pricing tier <article> elements',
      'styles.css defines :root CSS custom properties and .pricing-grid uses CSS Grid',
      'Includes responsive @media query and accessible native <button> CTAs',
    ],
    starterFiles: [
      {
        id: 'file_pricing_html',
        name: 'index.html',
        folder: '',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Northstar Cloud Pricing</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- TODO: Use semantic <header> and <main> landmarks -->
  <div class="page-top">
    <h1>Predictable Compute Pricing</h1>
    <p>Scale from prototype workloads to production clusters.</p>
  </div>

  <div class="pricing-grid">
    <!-- TODO: Add 3 <article class="tier-card"> cards: Starter ($19), Pro ($49, featured), Enterprise ($149) -->
  </div>
</body>
</html>
`,
      },
      {
        id: 'file_pricing_css',
        name: 'styles.css',
        folder: '',
        language: 'css',
        content: `/* TODO: Define :root custom properties and responsive CSS Grid layout */
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0b1120;
  color: #f8fafc;
  padding: 24px;
}

.pricing-grid {
  max-width: 1040px;
  margin: 24px auto;
}
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-html-landmarks',
        missionId: 'mission-responsive-pricing-landing',
        order: 1,
        title: 'Semantic Landmarks & 3 Pricing Tiers',
        instructions: 'Replace generic wrappers with <header> and <main>, and create 3 <article class="tier-card"> tiers containing headings, prices, <ul> feature lists, and <button> CTAs.',
        requirements: [
          'Include <header> and <main> elements',
          'Render exactly one <h1> and 3 <article> tier cards',
          'Each tier card contains a <ul> list and <button>',
        ],
        completionCriteria: 'Verified semantic markup and 3 complete pricing tier cards.',
        validationMethod: 'html',
        dependsOn: [],
        hint: 'Use <article class="tier-card"> inside <section class="pricing-grid"> for Starter, Pro, and Enterprise.',
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-css-grid-responsive',
        missionId: 'mission-responsive-pricing-landing',
        order: 2,
        title: 'CSS Custom Properties, Grid & Mobile Breakpoint',
        instructions: 'Style .pricing-grid with CSS Grid and gap, define :root theme variables, highlight the Pro tier, and configure a @media query.',
        requirements: [
          'Define CSS custom properties inside :root',
          'Configure .pricing-grid with display: grid and gap',
          'Add at least one @media query for responsive screens',
        ],
        completionCriteria: 'Verified :root variables, CSS Grid layout, and responsive media query.',
        validationMethod: 'css',
        dependsOn: ['cp-html-landmarks'],
        hint: 'Add :root { --accent: #3b82f6; }, .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }, and @media (max-width: 768px) { .pricing-grid { grid-template-columns: 1fr; } }.',
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-a11y-review',
        missionId: 'mission-responsive-pricing-landing',
        order: 3,
        title: 'Inspect Mobile Preview & Contrast (Review Step)',
        instructions: 'Switch the Live Preview viewport between Desktop and Mobile to verify zero horizontal clipping and crisp focus states before final submission.',
        requirements: ['Confirm cards stack cleanly at 375px width', 'Confirm CTA buttons have visible keyboard focus'],
        completionCriteria: 'Manual viewport inspection acknowledged.',
        validationMethod: 'instructional',
        dependsOn: ['cp-css-grid-responsive'],
        isAssessed: false,
        status: 'active',
      },
    ],
  },

  // 2. JavaScript (Beginner)
  {
    id: 'mission-js-telemetry-ledger',
    title: 'Expense & Usage Ledger Aggregator',
    description:
      'Build pure JavaScript data-processing functions to filter valid billing events, summarize spend by category, and compute budget alerts safely.',
    category: 'JavaScript',
    difficulty: 'Beginner',
    language: 'javascript',
    supportedLanguages: ['JavaScript'],
    requiredSkills: ['Array map/filter/reduce', 'Input Validation', 'Pure Functions', 'Object Aggregation'],
    prerequisiteMissionIds: [],
    prerequisiteSummary: 'Great first JavaScript mission after Array Transformations.',
    prerequisitesOptional: true,
    relatedLessonIds: [
      'javascript-core::lesson-js-arrays',
      'javascript-core::lesson-js-async',
    ],
    learningObjectives: [
      'Normalize and filter untrusted transaction records without mutating input arrays',
      'Aggregate totals per category cleanly using reduce and plain objects',
      'Handle empty arrays, invalid amounts, and floating-point precision accurately',
    ],
    estimatedMinutes: 30,
    scenario:
      'A SaaS finance dashboard receives raw usage ledger entries that occasionally contain cancelled items or negative corrupted amounts. Your utility module powers the monthly billing breakdown and overrun warning banner.',
    requirements: [
      'Implement summarizeLedger(entries): ignores entries with status !== "settled" or amount <= 0, returns { totalCents, byCategory, count } without mutating entries',
      'Implement findOverBudgetCategories(byCategory, limitCents): returns sorted array of category names exceeding limitCents',
      'Round fractional totals reliably and preserve alphabetical order for over-budget alerts',
    ],
    instructions: [
      'Implement summarizeLedger(entries) in ledger.js so it validates status === "settled" and finite positive numbers.',
      'Store integer-rounded totals in totalCents and accumulate per-category sums in byCategory.',
      'Implement findOverBudgetCategories(byCategory, limitCents) returning sorted category keys strictly greater than limitCents.',
      'Verify each checkpoint in the panel before submitting for full hidden edge-case grading.',
    ],
    hints: [
      {
        id: 'hint-js-1',
        order: 1,
        level: 'nudge',
        title: 'Validate Before Accumulating',
        content: 'Filter entries where entry && entry.status === "settled" && typeof entry.amount === "number" && Number.isFinite(entry.amount) && entry.amount > 0.',
      },
      {
        id: 'hint-js-2',
        order: 2,
        level: 'concept',
        title: 'Avoid Mutation Side Effects',
        content: 'Never push into or sort the caller\'s original arrays or mutate input objects. Always construct new accumulator objects.',
      },
      {
        id: 'hint-js-3',
        order: 3,
        level: 'structure',
        title: 'Return Shape of summarizeLedger',
        content: 'Return { totalCents, byCategory, count } where count is the number of valid settled entries and category defaults to "uncategorized" if missing.',
      },
      {
        id: 'hint-js-4',
        order: 4,
        level: 'walkthrough',
        title: 'Over-Budget Filter & Sort',
        content: 'Use Object.entries(byCategory || {}).filter(([, val]) => val > limitCents).map(([k]) => k).sort().',
      },
    ],
    completionCriteria: 'All public and hidden JavaScript unit tests pass in the isolated VM evaluator.',
    xpReward: 100,
    badgeId: 'mission_js_ledger',
    badgeTitle: 'JavaScript Data Engineer',
    isFeatured: false,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'summarizeLedger aggregates settled positive records and excludes pending/refunded rows',
      'findOverBudgetCategories returns sorted categories strictly above threshold',
      'Handles empty inputs and avoids mutating source arrays',
    ],
    starterFiles: [
      {
        id: 'file_ledger_js',
        name: 'ledger.js',
        folder: '',
        language: 'javascript',
        content: `function summarizeLedger(entries) {
  // TODO: Filter settled entries with positive finite amount
  // Return { totalCents, byCategory, count }
  return { totalCents: 0, byCategory: {}, count: 0 };
}

function findOverBudgetCategories(byCategory, limitCents) {
  // TODO: Return alphabetically sorted category names where total > limitCents
  return [];
}

// Local smoke test
const sample = [
  { id: '1', category: 'compute', status: 'settled', amount: 1200 },
  { id: '2', category: 'storage', status: 'pending', amount: 500 },
  { id: '3', category: 'compute', status: 'settled', amount: 800 },
];
console.log(summarizeLedger(sample));
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-js-summarize',
        missionId: 'mission-js-telemetry-ledger',
        order: 1,
        title: 'Implement summarizeLedger Filtering & Sums',
        instructions: 'Filter for status === "settled" and positive finite amounts, then compute totalCents, count, and byCategory.',
        requirements: ['Ignore pending/cancelled or <= 0 entries', 'Compute exact totalCents and count'],
        completionCriteria: 'Passes settled aggregation and invalid-record exclusion checks.',
        validationMethod: 'javascript',
        dependsOn: [],
        hint: 'Check Number.isFinite(e.amount) && e.amount > 0 && e.status === "settled".',
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-js-overbudget',
        missionId: 'mission-js-telemetry-ledger',
        order: 2,
        title: 'Implement findOverBudgetCategories Alerts',
        instructions: 'Return sorted category names whose spend strictly exceeds limitCents.',
        requirements: ['Strict > comparison against limitCents', 'Alphabetically sorted output'],
        completionCriteria: 'Passes threshold and sorting verification.',
        validationMethod: 'javascript',
        dependsOn: ['cp-js-summarize'],
        isAssessed: true,
        status: 'active',
      },
    ],
  },

  // 3. Python (Beginner)
  {
    id: 'mission-python-log-sanitizer',
    title: 'Server Log Analyzer & PII Redactor',
    description:
      'Write a Python log-processing module that parses structured HTTP log lines, aggregates latency metrics by route, and redacts email addresses cleanly.',
    category: 'Python',
    difficulty: 'Beginner',
    language: 'python',
    supportedLanguages: ['Python'],
    requiredSkills: ['Python Dictionaries', 'String Parsing', 'Regex Redaction', 'Summary Metrics'],
    prerequisiteMissionIds: [],
    prerequisiteSummary: 'Builds on Python Core & Problem Solving comprehensions and dictionaries.',
    prerequisitesOptional: true,
    relatedLessonIds: ['python-engineering::lesson-py-comprehensions'],
    learningObjectives: [
      'Redact sensitive email addresses from log strings using Python re module',
      'Parse structured log records safely and skip malformed lines',
      'Aggregate request counts, error counts (status >= 500), and average latency per path',
    ],
    estimatedMinutes: 35,
    scenario:
      'Platform ops engineers need to share diagnostic HTTP log summaries with external vendors without leaking user emails. You are building the automated sanitizer and metrics aggregator.',
    requirements: [
      'Implement redact_emails(text): replaces email patterns with "[REDACTED_EMAIL]"',
      'Implement analyze_logs(lines): accepts list of "METHOD PATH STATUS LATENCY_MS" strings, skips malformed rows, returns {"total": int, "errors_5xx": int, "routes": {path: {"count": int, "avg_ms": float}}}',
      'Round avg_ms to 2 decimal places',
    ],
    instructions: [
      'Use Python\'s re.sub inside redact_emails(text) to mask any standard email address.',
      'In analyze_logs(lines), split each line safely, validate numeric status and latency, and skip blank/malformed lines.',
      'Accumulate count and latency sums per route, then compute rounded avg_ms.',
      'Run Checkpoint checks and submit for isolated Python 3 verification.',
    ],
    hints: [
      {
        id: 'hint-py-1',
        order: 1,
        level: 'nudge',
        title: 'Email Regex Pattern',
        content: 'import re; pattern = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}" works reliably with re.sub.',
      },
      {
        id: 'hint-py-2',
        order: 2,
        level: 'concept',
        title: 'Defensive Line Parsing',
        content: 'Split each line with .strip().split(). If len(parts) != 4, skip it; wrap int(status) and float(latency) in try/except ValueError.',
      },
      {
        id: 'hint-py-3',
        order: 3,
        level: 'structure',
        title: 'Route Dictionary Structure',
        content: 'Track route_sums[path] and route_counts[path] first, then compute round(route_sums[path] / count, 2).',
      },
      {
        id: 'hint-py-4',
        order: 4,
        level: 'walkthrough',
        title: '5xx Status Count',
        content: 'Increment errors_5xx whenever 500 <= status_code < 600.',
      },
    ],
    completionCriteria: 'Passes all Python 3 runtime test cases including edge cases with empty lists and malformed lines.',
    xpReward: 100,
    badgeId: 'mission_py_sanitizer',
    badgeTitle: 'Python Diagnostics Builder',
    isFeatured: false,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'redact_emails masks single and multiple email addresses with [REDACTED_EMAIL]',
      'analyze_logs aggregates route counts, rounded avg_ms, and 5xx totals',
      'Gracefully ignores malformed or blank log lines',
    ],
    starterFiles: [
      {
        id: 'file_log_py',
        name: 'analyzer.py',
        folder: '',
        language: 'python',
        content: `import re

def redact_emails(text: str) -> str:
    # TODO: Replace email addresses with "[REDACTED_EMAIL]"
    return text

def analyze_logs(lines: list[str]) -> dict:
    # TODO: Parse lines formatted as "METHOD PATH STATUS LATENCY_MS"
    return {"total": 0, "errors_5xx": 0, "routes": {}}

if __name__ == "__main__":
    sample = [
        "GET /api/health 200 12",
        "POST /api/login 500 84",
        "BAD LINE",
        "GET /api/health 200 18",
    ]
    print(analyze_logs(sample))
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-py-redact',
        missionId: 'mission-python-log-sanitizer',
        order: 1,
        title: 'Implement redact_emails(text)',
        instructions: 'Replace all email patterns cleanly with "[REDACTED_EMAIL]".',
        requirements: ['Handles multiple emails per line', 'Leaves non-email text unchanged'],
        completionCriteria: 'Passes Python email redaction tests.',
        validationMethod: 'python',
        dependsOn: [],
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-py-analyze',
        missionId: 'mission-python-log-sanitizer',
        order: 2,
        title: 'Implement analyze_logs(lines)',
        instructions: 'Compute total valid logs, 5xx errors, and per-route count + avg_ms.',
        requirements: ['Skips malformed lines', 'Rounds avg_ms to 2 decimals'],
        completionCriteria: 'Passes Python log metrics tests.',
        validationMethod: 'python',
        dependsOn: ['cp-py-redact'],
        isAssessed: true,
        status: 'active',
      },
    ],
  },

  // 4. Frontend Development (Intermediate)
  {
    id: 'mission-frontend-filter-board',
    title: 'Interactive Task Triage & Filter Board',
    description:
      'Engineer an interactive DOM-driven sprint board supporting real-time search, priority filtering, status toggling, and keyboard-accessible item creation.',
    category: 'Frontend Development',
    difficulty: 'Intermediate',
    language: 'web',
    supportedLanguages: ['HTML', 'CSS', 'JavaScript'],
    requiredSkills: ['DOM State Sync', 'Event Delegation', 'Live Search Filtering', 'Accessible Forms'],
    prerequisiteMissionIds: ['mission-responsive-pricing-landing'],
    prerequisiteSummary: 'Builds on Accessible Responsive SaaS Pricing Matrix.',
    prerequisitesOptional: true,
    relatedLessonIds: [
      'html-css-architecture::lesson-semantic-landmarks',
      'javascript-core::lesson-js-arrays',
    ],
    learningObjectives: [
      'Maintain a single source-of-truth state array in JavaScript and render UI deterministically',
      'Filter items simultaneously by text query and priority dropdown without losing edits',
      'Implement clean form submission handling with validation and accessible DOM controls',
    ],
    estimatedMinutes: 45,
    scenario:
      'Product engineers on your team need a lightweight browser triage board to filter incoming bug reports by priority, search titles, add new issues, and toggle resolved status without page reloads.',
    requirements: [
      'Provide index.html controls: search input (#search-input), priority select (#priority-filter), add-task form (#task-form with #task-title), and list container (#task-list)',
      'Expose helper filterTasks(tasks, query, priority) in app.js for deterministic state filtering',
      'Render tasks dynamically into #task-list and support adding new tasks and toggling completion state',
    ],
    instructions: [
      'Wire the form, search input, and priority filter elements in index.html with semantic IDs.',
      'Implement filterTasks(tasks, query, priority) in app.js supporting case-insensitive search and priority ("all" | "high" | "medium" | "low").',
      'Connect renderTasks() and event listeners so Live Preview updates immediately as you type or add items.',
    ],
    hints: [
      {
        id: 'hint-fe-1',
        order: 1,
        level: 'nudge',
        title: 'Keep DOM Elements Predictable',
        content: 'Ensure #search-input, #priority-filter, #task-form, #task-title, and #task-list exist in index.html.',
      },
      {
        id: 'hint-fe-2',
        order: 2,
        level: 'concept',
        title: 'Pure Filter Helper',
        content: 'Write filterTasks(tasks, query, priority) as a pure function first so both the DOM renderer and automated unit tests can call it directly.',
      },
      {
        id: 'hint-fe-3',
        order: 3,
        level: 'structure',
        title: 'Prevent Empty Submissions',
        content: 'In the #task-form submit handler, call event.preventDefault(), trim #task-title.value, and skip empty strings.',
      },
      {
        id: 'hint-fe-4',
        order: 4,
        level: 'walkthrough',
        title: 'Event Delegation Toggle',
        content: 'Store data-id on each task button inside #task-list and toggle task.done on click before calling renderTasks().',
      },
    ],
    completionCriteria: 'Passes HTML structure checks, CSS layout checks, and JavaScript state filtering tests.',
    xpReward: 150,
    badgeId: 'mission_frontend_board',
    badgeTitle: 'Frontend State Crafter',
    isFeatured: false,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'HTML includes #search-input, #priority-filter, #task-form, #task-title, and #task-list',
      'filterTasks(tasks, query, priority) filters cleanly by substring and priority',
      'app.js wires DOM events and renders task cards without errors',
    ],
    starterFiles: [
      {
        id: 'file_fe_html',
        name: 'index.html',
        folder: '',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sprint Triage Board</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="board">
    <h1>Sprint Triage Board</h1>
    <div class="controls">
      <input id="search-input" type="search" placeholder="Search issues..." />
      <select id="priority-filter">
        <option value="all">All Priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    </div>

    <form id="task-form">
      <input id="task-title" type="text" placeholder="New issue title..." required />
      <button type="submit">Add Issue</button>
    </form>

    <ul id="task-list"></ul>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
      },
      {
        id: 'file_fe_css',
        name: 'styles.css',
        folder: '',
        language: 'css',
        content: `body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
.board { max-width: 720px; margin: 0 auto; }
.controls, #task-form { display: flex; gap: 10px; margin-bottom: 14px; }
input, select, button { padding: 8px 12px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #f8fafc; }
button { background: #2563eb; border-color: #2563eb; cursor: pointer; }
#task-list { list-style: none; padding: 0; display: grid; gap: 8px; }
`,
      },
      {
        id: 'file_fe_js',
        name: 'app.js',
        folder: '',
        language: 'javascript',
        content: `const initialTasks = [
  { id: 't1', title: 'Fix mobile nav focus trap', priority: 'high', done: false },
  { id: 't2', title: 'Update API pagination docs', priority: 'low', done: false },
  { id: 't3', title: 'Add CSV export button', priority: 'medium', done: true },
];

function filterTasks(tasks, query, priority) {
  // TODO: Filter tasks by case-insensitive query in title and exact priority (unless priority === 'all')
  return tasks;
}

if (typeof document !== 'undefined') {
  let tasks = [...initialTasks];
  const listEl = document.getElementById('task-list');
  const searchEl = document.getElementById('search-input');
  const filterEl = document.getElementById('priority-filter');
  const formEl = document.getElementById('task-form');
  const titleEl = document.getElementById('task-title');

  function render() {
    if (!listEl) return;
    const visible = filterTasks(tasks, searchEl?.value || '', filterEl?.value || 'all');
    listEl.innerHTML = visible.map((t) =>
      \`<li class="task-item"><span>[\${t.priority}] \${t.title}</span></li>\`
    ).join('');
  }

  searchEl?.addEventListener('input', render);
  filterEl?.addEventListener('change', render);
  formEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = (titleEl?.value || '').trim();
    if (!title) return;
    tasks = [{ id: 't_' + Date.now(), title, priority: 'medium', done: false }, ...tasks];
    if (titleEl) titleEl.value = '';
    render();
  });

  render();
}
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-fe-dom',
        missionId: 'mission-frontend-filter-board',
        order: 1,
        title: 'Verify Interactive Controls & Task Form Markup',
        instructions: 'Ensure semantic controls (#search-input, #priority-filter, #task-form, #task-title, #task-list) are wired cleanly.',
        requirements: ['All required control IDs present', 'Responsive CSS flex/grid spacing applied'],
        completionCriteria: 'HTML & CSS structural rules pass.',
        validationMethod: 'html',
        dependsOn: [],
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-fe-filter',
        missionId: 'mission-frontend-filter-board',
        order: 2,
        title: 'Implement Deterministic filterTasks & Toggle Logic',
        instructions: 'Complete filterTasks(tasks, query, priority) and verify interactive search + filter + toggle rendering.',
        requirements: ['Case-insensitive substring matching', 'Supports "all" and specific priorities'],
        completionCriteria: 'Unit tests on filterTasks pass across all edge cases.',
        validationMethod: 'javascript',
        dependsOn: ['cp-fe-dom'],
        isAssessed: true,
        status: 'active',
      },
    ],
  },

  // 5. Database Development (Intermediate)
  {
    id: 'mission-sql-analytics-schema',
    title: 'Multi-Tenant SaaS Analytics SQL Schema & Queries',
    description:
      'Design normalized SQLite/PostgreSQL-compatible relational tables with foreign keys and write accurate JOIN + GROUP BY reporting queries.',
    category: 'Database Development',
    difficulty: 'Intermediate',
    language: 'sql',
    supportedLanguages: ['SQL'],
    requiredSkills: ['Relational Modeling', 'Foreign Keys', 'LEFT JOIN', 'GROUP BY & HAVING'],
    prerequisiteMissionIds: [],
    prerequisiteSummary: 'Recommended after SQL & Relational Database Design.',
    prerequisitesOptional: true,
    relatedLessonIds: ['sql-databases::lesson-sql-joins'],
    learningObjectives: [
      'Define relational tables with PRIMARY KEY, NOT NULL, and FOREIGN KEY constraints',
      'Write LEFT JOIN + GROUP BY queries that preserve zero-activity workspaces',
      'Compute revenue and active seat summaries accurately without duplicate row inflation',
    ],
    estimatedMinutes: 40,
    scenario:
      'Your analytics team needs a clean relational reporting layer tracking organizations, users, and subscription invoices. You will create the core reporting views/queries executed against an isolated in-memory SQLite engine.',
    requirements: [
      'Write schema DDL creating organizations, users, and invoices tables with foreign keys in schema.sql',
      'Write a reporting SELECT query in report.sql named org_revenue returning (org_name, member_count, total_paid_cents) including organizations with 0 paid invoices, sorted by total_paid_cents DESC, org_name ASC',
    ],
    instructions: [
      'Review schema.sql and add foreign-key references linking users.org_id and invoices.org_id to organizations(id).',
      'In report.sql, write a query joining organizations with users and paid invoices (status = \'paid\') using LEFT JOIN and subqueries/CTEs so member counts do not multiply by invoice rows.',
      'Test both Checkpoint 1 (Schema) and Checkpoint 2 (Reporting Query) against the real SQL engine.',
    ],
    hints: [
      {
        id: 'hint-sql-1',
        order: 1,
        level: 'nudge',
        title: 'Prevent Join Fan-Out',
        content: 'Joining both users and invoices directly to organizations in one SELECT multiplies rows. Aggregate users and invoices in separate CTEs or use COUNT(DISTINCT u.id) and pre-aggregated invoice totals!',
      },
      {
        id: 'hint-sql-2',
        order: 2,
        level: 'concept',
        title: 'COALESCE Zero Totals',
        content: 'Use COALESCE(SUM(...), 0) so organizations without paid invoices report 0 instead of NULL.',
      },
      {
        id: 'hint-sql-3',
        order: 3,
        level: 'structure',
        title: 'CTE Pattern for Exact Numbers',
        content: 'WITH user_counts AS (SELECT org_id, COUNT(*) AS member_count FROM users GROUP BY org_id), rev AS (SELECT org_id, SUM(amount_cents) AS total_paid_cents FROM invoices WHERE status = \'paid\' GROUP BY org_id) SELECT ...',
      },
      {
        id: 'hint-sql-4',
        order: 4,
        level: 'walkthrough',
        title: 'Ordering Tie-Breaker',
        content: 'End the query with ORDER BY total_paid_cents DESC, org_name ASC; so ties sort deterministically.',
      },
    ],
    completionCriteria: 'Real SQLite `:memory:` execution verifies schema constraints and exact reporting output across seeded datasets.',
    xpReward: 150,
    badgeId: 'mission_sql_analyst',
    badgeTitle: 'Relational Query Architect',
    isFeatured: false,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'schema.sql executes cleanly with PRIMARY KEY and FOREIGN KEY constraints enforced',
      'report.sql returns org_name, member_count, and total_paid_cents without join row duplication',
      'Includes organizations with 0 invoices and 0 members using LEFT JOIN + COALESCE',
    ],
    starterFiles: [
      {
        id: 'file_sql_schema',
        name: 'schema.sql',
        folder: '',
        language: 'sql',
        content: `CREATE TABLE organizations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  email TEXT NOT NULL UNIQUE,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
`,
      },
      {
        id: 'file_sql_report',
        name: 'report.sql',
        folder: '',
        language: 'sql',
        content: `-- TODO: Return columns: org_name, member_count, total_paid_cents
-- Include organizations with zero users or zero paid invoices.
-- Avoid row multiplication when counting members and summing paid invoices.
SELECT
  o.name AS org_name,
  0 AS member_count,
  0 AS total_paid_cents
FROM organizations o
ORDER BY total_paid_cents DESC, org_name ASC;
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-sql-schema',
        missionId: 'mission-sql-analytics-schema',
        order: 1,
        title: 'Validate Relational Tables & Foreign Keys',
        instructions: 'Ensure schema.sql compiles in SQLite with PRAGMA foreign_keys = ON and valid constraints.',
        requirements: ['organizations, users, and invoices tables defined', 'Foreign key relations enforced'],
        completionCriteria: 'Schema DDL runs cleanly on an empty database.',
        validationMethod: 'sql',
        dependsOn: [],
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-sql-report',
        missionId: 'mission-sql-analytics-schema',
        order: 2,
        title: 'Verify Accurate Multi-Table Aggregation Query',
        instructions: 'Update report.sql so it outputs exact member_count and total_paid_cents per organization without fan-out inflation.',
        requirements: ['Uses LEFT JOIN + COALESCE', 'Filters status = \'paid\' safely without dropping unpaid orgs'],
        completionCriteria: 'Exact column names and values match server test datasets.',
        validationMethod: 'sql',
        dependsOn: ['cp-sql-schema'],
        isAssessed: true,
        status: 'active',
      },
    ],
  },

  // 6. Backend Development (Intermediate)
  {
    id: 'mission-backend-rate-limiter',
    title: 'Token-Bucket API Rate Limiter & Auth Middleware',
    description:
      'Implement a deterministic sliding-window/token-bucket rate limiter and express-style request validation pipeline in Node/JavaScript.',
    category: 'Backend Development',
    difficulty: 'Intermediate',
    language: 'javascript',
    supportedLanguages: ['JavaScript'],
    requiredSkills: ['Middleware Pipeline', 'Rate Limiting', 'HTTP Status Codes', 'State Maps'],
    prerequisiteMissionIds: ['mission-js-telemetry-ledger'],
    prerequisiteSummary: 'Recommended after Expense & Usage Ledger Aggregator.',
    prerequisitesOptional: false,
    relatedLessonIds: ['git-apis-tooling::lesson-rest-json'],
    learningObjectives: [
      'Implement a reusable rate limiter tracking per-key token buckets and window resets',
      'Return structured 401/403/429 JSON error responses before executing protected route handlers',
      'Handle burst traffic and window expiration deterministically using injected clock functions',
    ],
    estimatedMinutes: 45,
    scenario:
      'Your backend API gateway is experiencing burst abuse on authentication endpoints. Build the core rate-limiter and middleware guard that enforces per-user quotas and rejects unauthorized calls before hitting downstream handlers.',
    requirements: [
      'Implement createRateLimiter({ maxRequests, windowMs, nowFn }) returning check(key) -> { allowed, remaining, resetAt }',
      'Implement guardRequest(req, limiter, handler) that verifies req.headers?.authorization starts with "Bearer ", checks limiter.check(req.ip || "anon"), returns 401 if unauthenticated, 429 if rate-limited, or delegates to handler(req)',
    ],
    instructions: [
      'Build createRateLimiter tracking per-key count and resetAt timestamp using nowFn() (default Date.now).',
      'Reset the bucket cleanly when now >= bucket.resetAt.',
      'Implement guardRequest(req, limiter, handler) returning { status, body } for rejected requests and handler(req) on allowed requests.',
    ],
    hints: [
      {
        id: 'hint-be-1',
        order: 1,
        level: 'nudge',
        title: 'Inject Clock Function for Deterministic Tests',
        content: 'Accept nowFn = Date.now in createRateLimiter so automated tests can simulate time advancing without sleeping.',
      },
      {
        id: 'hint-be-2',
        order: 2,
        level: 'concept',
        title: 'Order of Security Checks',
        content: 'Authenticate the Bearer token BEFORE consuming rate-limit quota or check IP quota consistently — here check auth first (401 on missing/invalid Bearer), then check limiter.',
      },
      {
        id: 'hint-be-3',
        order: 3,
        level: 'structure',
        title: 'Bucket Return Shape',
        content: 'On a fresh window: resetAt = now + windowMs, count = 1, remaining = maxRequests - 1, allowed = true.',
      },
      {
        id: 'hint-be-4',
        order: 4,
        level: 'walkthrough',
        title: 'Rejecting Over Quota',
        content: 'When count >= maxRequests and now < resetAt, return { allowed: false, remaining: 0, resetAt } without incrementing count.',
      },
    ],
    completionCriteria: 'Passes isolated Node VM behavioral and security edge-case tests.',
    xpReward: 160,
    badgeId: 'mission_backend_guard',
    badgeTitle: 'Backend Gateway Defender',
    isFeatured: false,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'createRateLimiter enforces maxRequests within windowMs and resets after expiration',
      'guardRequest returns HTTP 401 when Bearer authorization is missing',
      'guardRequest returns HTTP 429 when quota is exhausted and delegates cleanly when allowed',
    ],
    starterFiles: [
      {
        id: 'file_be_mw',
        name: 'middleware.js',
        folder: '',
        language: 'javascript',
        content: `function createRateLimiter({ maxRequests, windowMs, nowFn = Date.now }) {
  const buckets = new Map();
  return {
    check(key) {
      // TODO: Implement fixed-window bucket tracking returning { allowed, remaining, resetAt }
      return { allowed: true, remaining: maxRequests - 1, resetAt: nowFn() + windowMs };
    },
  };
}

function guardRequest(req, limiter, handler) {
  // TODO: Validate Bearer token -> 401, check limiter -> 429, else call handler(req)
  return handler(req);
}
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-be-limiter',
        missionId: 'mission-backend-rate-limiter',
        order: 1,
        title: 'Implement createRateLimiter Window Tracking',
        instructions: 'Track per-key request counts and reset cleanly once windowMs elapses.',
        requirements: ['Separate buckets per key', 'Accurately decrements remaining count', 'Resets after windowMs'],
        completionCriteria: 'Passes deterministic clock rate-limiter unit tests.',
        validationMethod: 'javascript',
        dependsOn: [],
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-be-guard',
        missionId: 'mission-backend-rate-limiter',
        order: 2,
        title: 'Implement guardRequest Auth & 429 Handling',
        instructions: 'Enforce Bearer header validation (401) and rate limiting (429) before calling handler.',
        requirements: ['Returns { status: 401, body: ... } on missing/blank Bearer token', 'Returns { status: 429, body: ... } when disallowed'],
        completionCriteria: 'Passes auth + rate limit guard tests.',
        validationMethod: 'javascript',
        dependsOn: ['cp-be-limiter'],
        isAssessed: true,
        status: 'active',
      },
    ],
  },

  // 7. Algorithms and Data Structures (Advanced)
  {
    id: 'mission-algo-lru-scheduler',
    title: 'O(1) LRU Cache & Dependency Task Scheduler',
    description:
      'Build an O(1) Least-Recently-Used cache alongside a topological dependency resolver for ordered build pipelines.',
    category: 'Algorithms and Data Structures',
    difficulty: 'Advanced',
    language: 'python',
    supportedLanguages: ['Python'],
    requiredSkills: ['OrderedDict / Doubly-Linked Hash', 'Topological Sort (Kahn)', 'Cycle Detection', 'O(1) Complexity'],
    prerequisiteMissionIds: ['mission-python-log-sanitizer'],
    prerequisiteSummary: 'Requires Python fundamentals and dictionary mastery.',
    prerequisitesOptional: false,
    relatedLessonIds: ['algorithms-data-structures::lesson-stacks-brackets'],
    learningObjectives: [
      'Implement an LRUCache with O(1) get and put operations and capacity eviction',
      'Sort directed acyclic task graphs topologically using Kahn\'s algorithm',
      'Detect dependency cycles cleanly and raise ValueError instead of hanging',
    ],
    estimatedMinutes: 55,
    scenario:
      'Your CI build runner caches artifact lookups in memory and orders build steps respecting upstream dependencies while failing fast if engineers introduce circular imports.',
    requirements: [
      'Implement class LRUCache(capacity: int) with get(key) -> int (-1 if missing) and put(key, value)',
      'Implement resolve_execution_order(tasks: list[str], deps: list[tuple[str, str]]) where (a, b) means b depends on a; detect cycles by raising ValueError',
    ],
    instructions: [
      'Use collections.OrderedDict (or a doubly-linked list + dict) to implement O(1) get/put with LRU eviction.',
      'Build an adjacency list and in-degree map in resolve_execution_order(tasks, deps) using deque for deterministic tie-breaking.',
      'If processed count != len(tasks), raise ValueError("Cyclic dependency detected").',
    ],
    hints: [
      {
        id: 'hint-algo-1',
        order: 1,
        level: 'nudge',
        title: 'OrderedDict move_to_end',
        content: 'from collections import OrderedDict provides cache.move_to_end(key) and cache.popitem(last=False) in O(1) time.',
      },
      {
        id: 'hint-algo-2',
        order: 2,
        level: 'concept',
        title: 'Kahn\'s Topological Sort',
        content: 'Initialize a queue with all tasks having in_degree == 0. Pop nodes, append to order, decrement neighbor in_degree, and enqueue when 0.',
      },
      {
        id: 'hint-algo-3',
        order: 3,
        level: 'structure',
        title: 'Edge Direction Convention',
        content: 'For tuple (prereq, dependent), add dependent to adj[prereq] and increment in_degree[dependent].',
      },
      {
        id: 'hint-algo-4',
        order: 4,
        level: 'walkthrough',
        title: 'Cycle Detection Guard',
        content: 'After the BFS loop completes, check if len(order) != len(tasks) and raise ValueError("Cycle detected").',
      },
    ],
    completionCriteria: 'Passes all Python 3 LRU eviction, topological sort, and cycle detection hidden tests.',
    xpReward: 200,
    badgeId: 'mission_algo_master',
    badgeTitle: 'Systems Algorithm Strategist',
    isFeatured: false,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'LRUCache evicts least recently used keys on capacity overflow',
      'resolve_execution_order outputs valid prerequisite-first order',
      'Raises ValueError immediately on cyclic dependencies',
    ],
    starterFiles: [
      {
        id: 'file_algo_py',
        name: 'scheduler.py',
        folder: '',
        language: 'python',
        content: `from collections import OrderedDict, deque

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = OrderedDict()

    def get(self, key: int) -> int:
        # TODO: Return value and mark recently used, else -1
        return -1

    def put(self, key: int, value: int) -> None:
        # TODO: Insert/update and evict least recently used when exceeding capacity
        pass

def resolve_execution_order(tasks: list[str], deps: list[tuple[str, str]]) -> list[str]:
    # deps tuple (u, v) means u must finish before v
    # TODO: Topological sort with cycle detection (raise ValueError on cycle)
    return []
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-algo-lru',
        missionId: 'mission-algo-lru-scheduler',
        order: 1,
        title: 'Implement O(1) LRUCache get & put',
        instructions: 'Ensure cache hits refresh recency and puts past capacity evict the oldest untouched key.',
        requirements: ['Handles capacity = 1 and capacity = 2+', 'Updates recency on both get and put overwrites'],
        completionCriteria: 'Passes LRU sequence verification.',
        validationMethod: 'python',
        dependsOn: [],
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-algo-topo',
        missionId: 'mission-algo-lru-scheduler',
        order: 2,
        title: 'Implement Topological Dependency Resolver',
        instructions: 'Order tasks respecting all dependencies and raise ValueError on cycles.',
        requirements: ['Valid topological ordering for DAGs', 'Raises ValueError when cycle exists'],
        completionCriteria: 'Passes DAG and cycle test suite.',
        validationMethod: 'python',
        dependsOn: ['cp-algo-lru'],
        isAssessed: true,
        status: 'active',
      },
    ],
  },

  // 8. API Development (Advanced)
  {
    id: 'mission-api-webhook-router',
    title: 'Idempotent Webhook Signature & REST API Handler',
    description:
      'Build a REST webhook & pagination processor with payload validation, HMAC signature verification, and idempotency key deduplication.',
    category: 'API Development',
    difficulty: 'Advanced',
    language: 'javascript',
    supportedLanguages: ['JavaScript'],
    requiredSkills: ['REST Contracts', 'Idempotency Keys', 'Pagination Cursors', 'Schema Validation'],
    prerequisiteMissionIds: ['mission-backend-rate-limiter'],
    prerequisiteSummary: 'Builds on Token-Bucket API Rate Limiter & Auth Middleware.',
    prerequisitesOptional: true,
    relatedLessonIds: ['git-apis-tooling::lesson-rest-json'],
    learningObjectives: [
      'Verify webhook integrity using constant-time comparison and payload validation',
      'Guarantee exactly-once side-effect processing with idempotency key stores',
      'Implement cursor-based pagination over sorted API collections',
    ],
    estimatedMinutes: 50,
    scenario:
      'Payment and CI providers frequently retry webhooks when network timeouts occur. You are building the webhook ingestion router and cursor-paginated events API so duplicate deliveries never double-charge or double-credit users.',
    requirements: [
      'Implement processWebhookEvent(event, store, expectedSecret) checking event.secret === expectedSecret (401), valid event.id & event.type (400), and deduplicating via store (Set) returning { status: 200, duplicate: true|false }',
      'Implement paginateItems(items, cursor, limit) returning { data, nextCursor, hasMore } cleanly clamped between 1 and 50 items',
    ],
    instructions: [
      'Validate required fields (id, type, secret) cleanly before mutating store.',
      'Check if store.has(event.id) to return duplicate: true without re-applying effects.',
      'Implement slice-based cursor pagination returning numeric string nextCursor or null.',
    ],
    hints: [
      {
        id: 'hint-api-1',
        order: 1,
        level: 'nudge',
        title: 'Check Secret & Fields Explicitly',
        content: 'Reject missing/mismatched event.secret with status 401 before checking store deduplication.',
      },
      {
        id: 'hint-api-2',
        order: 2,
        level: 'concept',
        title: 'Idempotency Store Contract',
        content: 'If store.has(event.id) is true, return { status: 200, duplicate: true, eventId: event.id }. Otherwise call store.add(event.id) and return duplicate: false.',
      },
      {
        id: 'hint-api-3',
        order: 3,
        level: 'structure',
        title: 'Pagination Clamping',
        content: 'Clamp limit with Math.min(50, Math.max(1, Number(limit) || 10)). Parse start = Math.max(0, parseInt(cursor || "0", 10) || 0).',
      },
      {
        id: 'hint-api-4',
        order: 4,
        level: 'walkthrough',
        title: 'Next Cursor Calculation',
        content: 'const nextOffset = start + data.length; hasMore = nextOffset < items.length; nextCursor = hasMore ? String(nextOffset) : null.',
      },
    ],
    completionCriteria: 'Passes idempotency, status contract, and cursor pagination test suites.',
    xpReward: 200,
    badgeId: 'mission_api_architect',
    badgeTitle: 'API Contract Specialist',
    isFeatured: false,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'Rejects invalid webhook secret with status 401 and malformed payloads with 400',
      'Deduplicates replayed event IDs via idempotency Set',
      'paginateItems clamps limits and returns accurate nextCursor and hasMore flags',
    ],
    starterFiles: [
      {
        id: 'file_api_js',
        name: 'webhooks.js',
        folder: '',
        language: 'javascript',
        content: `function processWebhookEvent(event, processedIds, expectedSecret) {
  // TODO: Validate secret (401), payload fields (400), and deduplicate using processedIds Set
  return { status: 501, duplicate: false };
}

function paginateItems(items, cursor = '0', limit = 10) {
  // TODO: Return { data, nextCursor, hasMore }
  return { data: [], nextCursor: null, hasMore: false };
}
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-api-webhook',
        missionId: 'mission-api-webhook-router',
        order: 1,
        title: 'Implement Idempotent Webhook Processor',
        instructions: 'Validate secret, schema, and deduplicate repeated event IDs.',
        requirements: ['401 on wrong secret', '400 on missing id/type', 'Idempotent replay returns duplicate: true'],
        completionCriteria: 'Passes webhook validation and replay suite.',
        validationMethod: 'javascript',
        dependsOn: [],
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-api-paginate',
        missionId: 'mission-api-webhook-router',
        order: 2,
        title: 'Implement Cursor Pagination',
        instructions: 'Paginate items deterministically with clamped bounds and nextCursor.',
        requirements: ['Clamps limit between 1 and 50', 'Returns null nextCursor on final page'],
        completionCriteria: 'Passes multi-page cursor traversal tests.',
        validationMethod: 'javascript',
        dependsOn: ['cp-api-webhook'],
        isAssessed: true,
        status: 'active',
      },
    ],
  },

  // 9. Software Engineering (Advanced)
  {
    id: 'mission-se-circuit-breaker',
    title: 'Resilient Circuit Breaker & State Machine Test Harness',
    description:
      'Design a fault-tolerant Circuit Breaker state machine (CLOSED, OPEN, HALF_OPEN) with structured diagnostics and failure threshold recovery.',
    category: 'Software Engineering',
    difficulty: 'Advanced',
    language: 'javascript',
    supportedLanguages: ['JavaScript'],
    requiredSkills: ['State Machines', 'Fault Tolerance', 'Clean Architecture', 'Error Boundaries'],
    prerequisiteMissionIds: [],
    prerequisiteSummary: 'Recommended for engineers designing resilient distributed clients.',
    prerequisitesOptional: true,
    relatedLessonIds: ['javascript-core::lesson-js-async'],
    learningObjectives: [
      'Implement CLOSED -> OPEN -> HALF_OPEN -> CLOSED state transitions cleanly',
      'Fail fast with clear diagnostic errors when a downstream dependency is OPEN',
      'Recover safely after cooldownMs via controlled half-open probe calls',
    ],
    estimatedMinutes: 50,
    scenario:
      'When an upstream payment or search service degrades, retrying blindly causes cascading latency failures. Implement a clean CircuitBreaker class that trips open after consecutive failures and probes recovery automatically.',
    requirements: [
      'Implement createCircuitBreaker({ failureThreshold, cooldownMs, nowFn }) exposing getState() and execute(fn)',
      'Trip from CLOSED to OPEN once consecutive failures reach failureThreshold',
      'While OPEN, reject calls immediately without invoking fn() until elapsed >= cooldownMs, then transition to HALF_OPEN',
      'If a HALF_OPEN probe succeeds, reset failures and transition to CLOSED; if it fails, return to OPEN immediately',
    ],
    instructions: [
      'Maintain internal state ("CLOSED" | "OPEN" | "HALF_OPEN"), failures count, and openedAt timestamp.',
      'Inside execute(fn), check cooldown expiry when state === "OPEN". If still cooling down, throw new Error("Circuit is OPEN").',
      'Wrap fn() in try/catch to update state cleanly on success or failure.',
    ],
    hints: [
      {
        id: 'hint-se-1',
        order: 1,
        level: 'nudge',
        title: 'Transition Before Probe',
        content: 'When state === "OPEN" and nowFn() - openedAt >= cooldownMs, switch state = "HALF_OPEN" before invoking fn().',
      },
      {
        id: 'hint-se-2',
        order: 2,
        level: 'concept',
        title: 'Reset Counter on Success',
        content: 'Any successful call inside CLOSED or HALF_OPEN resets failures = 0 and sets state = "CLOSED".',
      },
      {
        id: 'hint-se-3',
        order: 3,
        level: 'structure',
        title: 'Error Handling Inside execute',
        content: 'In the catch block, increment failures; if state === "HALF_OPEN" or failures >= failureThreshold, set state = "OPEN" and openedAt = nowFn(), then rethrow the original error.',
      },
      {
        id: 'hint-se-4',
        order: 4,
        level: 'walkthrough',
        title: 'Preserve Return Value',
        content: 'Return the exact value returned by fn() when the call succeeds.',
      },
    ],
    completionCriteria: 'Passes all state transition, fail-fast, and cooldown recovery tests.',
    xpReward: 210,
    badgeId: 'mission_se_resilience',
    badgeTitle: 'Resilient Systems Engineer',
    isFeatured: false,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'Trips OPEN after failureThreshold consecutive failures and skips invoking fn()',
      'Transitions to HALF_OPEN after cooldownMs and closes on probe success',
      'Re-trips OPEN immediately if HALF_OPEN probe throws',
    ],
    starterFiles: [
      {
        id: 'file_se_cb',
        name: 'circuitBreaker.js',
        folder: '',
        language: 'javascript',
        content: `function createCircuitBreaker({ failureThreshold = 3, cooldownMs = 5000, nowFn = Date.now } = {}) {
  let state = 'CLOSED';
  let failures = 0;
  let openedAt = 0;

  return {
    getState() {
      if (state === 'OPEN' && nowFn() - openedAt >= cooldownMs) {
        return 'HALF_OPEN';
      }
      return state;
    },
    execute(fn) {
      // TODO: Implement CLOSED -> OPEN -> HALF_OPEN state machine around fn()
      return fn();
    },
  };
}
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-se-trip',
        missionId: 'mission-se-circuit-breaker',
        order: 1,
        title: 'Trip OPEN & Fail-Fast Protection',
        instructions: 'Track consecutive errors and block fn() invocations once OPEN.',
        requirements: ['Transitions to OPEN at failureThreshold', 'Throws "Circuit is OPEN" without calling fn()'],
        completionCriteria: 'Passes trip & fail-fast tests.',
        validationMethod: 'javascript',
        dependsOn: [],
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-se-recover',
        missionId: 'mission-se-circuit-breaker',
        order: 2,
        title: 'HALF_OPEN Cooldown Recovery & Re-Trip',
        instructions: 'Allow single probe after cooldownMs; close on success or re-open on probe failure.',
        requirements: ['Recovers to CLOSED after probe success', 'Re-opens immediately on probe failure'],
        completionCriteria: 'Passes full state machine recovery suite.',
        validationMethod: 'javascript',
        dependsOn: ['cp-se-trip'],
        isAssessed: true,
        status: 'active',
      },
    ],
  },

  // 10. Full-Stack Development (Expert)
  {
    id: 'mission-fullstack-order-pipeline',
    title: 'Full-Stack Checkout Validation, UI Summary & Inventory Engine',
    description:
      'Deliver a cohesive full-stack feature spanning accessible checkout UI markup, client-side order state formatting, and transactional inventory reservation logic.',
    category: 'Full-Stack Development',
    difficulty: 'Expert',
    language: 'web',
    supportedLanguages: ['HTML', 'CSS', 'JavaScript'],
    requiredSkills: ['Full-Stack Architecture', 'Transactional Validation', 'Accessible Checkout UI', 'Idempotent Totals'],
    prerequisiteMissionIds: ['mission-frontend-filter-board', 'mission-api-webhook-router'],
    prerequisiteSummary: 'Capstone integrating Frontend State & Backend Contracts.',
    prerequisitesOptional: true,
    relatedLessonIds: [
      'html-css-architecture::lesson-semantic-landmarks',
      'javascript-core::lesson-js-arrays',
      'git-apis-tooling::lesson-rest-json',
    ],
    learningObjectives: [
      'Synchronize interactive cart UI controls with authoritative server-style price calculations',
      'Enforce stock limits, promo discount clamping, and atomic inventory rollback on failure',
      'Design a responsive two-column checkout layout combining clear UX feedback with strict data integrity',
    ],
    estimatedMinutes: 65,
    scenario:
      'You are shipping the flagship checkout module for a developer hardware store. Never trust client-submitted subtotals: compute totals from catalog prices, validate inventory atomically, and display real-time order summaries in the browser UI.',
    requirements: [
      'Build semantic checkout markup in index.html with #checkout-form, #promo-input, #order-items, #order-total, and #checkout-status',
      'Implement calculateOrderSummary(cartItems, catalog, promoCode) returning { items, subtotalCents, discountCents, totalCents } using catalog prices only',
      'Implement reserveInventory(cartItems, stockMap) returning { ok, updatedStock, errors } atomically (never partially decrementing stock if any item lacks inventory)',
    ],
    instructions: [
      'Verify semantic HTML landmarks and accessible checkout summary IDs in index.html + two-column responsive layout in styles.css.',
      'Implement calculateOrderSummary supporting promo code "DEV10" (10% discount rounded to nearest cent) and ignoring unknown items or invalid quantities.',
      'Implement atomic reserveInventory so out-of-stock requests leave updatedStock completely unchanged and list clear errors.',
    ],
    hints: [
      {
        id: 'hint-fs-1',
        order: 1,
        level: 'nudge',
        title: 'Never Trust Untrusted Cart Prices',
        content: 'Look up unitCents from catalog[item.sku] rather than reading item.price.',
      },
      {
        id: 'hint-fs-2',
        order: 2,
        level: 'concept',
        title: 'Two-Phase Atomic Stock Check',
        content: 'First validate EVERY item quantity against stockMap[sku]; only build and mutate a cloned updatedStock map if errors.length === 0.',
      },
      {
        id: 'hint-fs-3',
        order: 3,
        level: 'structure',
        title: 'Promo Code DEV10 Calculation',
        content: 'discountCents = promoCode === "DEV10" ? Math.round(subtotalCents * 0.1) : 0; totalCents = Math.max(0, subtotalCents - discountCents).',
      },
      {
        id: 'hint-fs-4',
        order: 4,
        level: 'walkthrough',
        title: 'Aggregate Duplicate SKUs Safely',
        content: 'When checking stock, sum quantities per SKU if a cart passes duplicate SKU entries so combined demand cannot slip past single-line checks!',
      },
    ],
    completionCriteria: 'Passes semantic UI checks, server-authoritative pricing verification, and atomic inventory rollback tests.',
    xpReward: 250,
    badgeId: 'mission_fullstack_capstone',
    badgeTitle: 'Full-Stack Capstone Architect',
    isFeatured: true,
    status: 'published',
    authorId: 'system',
    source: 'curated',
    publicTestPreviews: [
      'Checkout UI renders #checkout-form, #promo-input, #order-items, #order-total, and #checkout-status cleanly',
      'calculateOrderSummary computes totals strictly from catalog and applies DEV10 discount accurately',
      'reserveInventory validates all SKUs atomically and prevents partial stock decrements on failure',
    ],
    starterFiles: [
      {
        id: 'file_fs_html',
        name: 'index.html',
        folder: '',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Mideo Hardware Checkout</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="checkout-shell">
    <section>
      <h1>Hardware Store Checkout</h1>
      <ul id="order-items"></ul>
      <form id="checkout-form">
        <label for="promo-input">Promo Code</label>
        <input id="promo-input" type="text" placeholder="Try DEV10" />
        <button type="submit">Complete Order</button>
      </form>
      <p id="checkout-status" aria-live="polite"></p>
    </section>
    <aside class="summary-panel">
      <h2>Order Summary</h2>
      <p>Total: <strong id="order-total">$0.00</strong></p>
    </aside>
  </main>
  <script src="checkout.js"></script>
</body>
</html>
`,
      },
      {
        id: 'file_fs_css',
        name: 'styles.css',
        folder: '',
        language: 'css',
        content: `body { margin: 0; font-family: system-ui, sans-serif; background: #0b1120; color: #f8fafc; padding: 24px; }
.checkout-shell { max-width: 900px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
.summary-panel { background: #111827; border: 1px solid #1e293b; border-radius: 10px; padding: 20px; }
@media (max-width: 720px) { .checkout-shell { grid-template-columns: 1fr; } }
`,
      },
      {
        id: 'file_fs_js',
        name: 'checkout.js',
        folder: '',
        language: 'javascript',
        content: `const STORE_CATALOG = {
  'mech-kb': { name: 'Mechanical Keyboard', unitCents: 12900 },
  'usb-hub': { name: 'USB-C Dev Hub', unitCents: 4900 },
};

function calculateOrderSummary(cartItems, catalog = STORE_CATALOG, promoCode = '') {
  // TODO: Compute subtotalCents, discountCents (DEV10 = 10%), totalCents from catalog prices only
  return { items: [], subtotalCents: 0, discountCents: 0, totalCents: 0 };
}

function reserveInventory(cartItems, stockMap) {
  // TODO: Validate aggregated SKU demand atomically against stockMap
  return { ok: false, updatedStock: { ...stockMap }, errors: ['Not implemented'] };
}
`,
      },
    ],
    checkpoints: [
      {
        id: 'cp-fs-ui',
        missionId: 'mission-fullstack-order-pipeline',
        order: 1,
        title: 'Checkout UI Structure & Responsive Summary Layout',
        instructions: 'Confirm #checkout-form, #promo-input, #order-items, #order-total, and #checkout-status exist inside responsive grid markup.',
        requirements: ['Semantic <main> and <aside> layout', 'All required checkout DOM IDs present'],
        completionCriteria: 'HTML/CSS layout validation passes.',
        validationMethod: 'html',
        dependsOn: [],
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-fs-pricing',
        missionId: 'mission-fullstack-order-pipeline',
        order: 2,
        title: 'Authoritative Pricing & Promo Engine',
        instructions: 'Implement calculateOrderSummary using server catalog prices and DEV10 10% discount.',
        requirements: ['Ignores client-tampered prices', 'Applies DEV10 rounded discount cleanly'],
        completionCriteria: 'Pricing & promo tests pass.',
        validationMethod: 'javascript',
        dependsOn: ['cp-fs-ui'],
        isAssessed: true,
        status: 'active',
      },
      {
        id: 'cp-fs-inventory',
        missionId: 'mission-fullstack-order-pipeline',
        order: 3,
        title: 'Atomic Inventory Reservation',
        instructions: 'Implement reserveInventory with aggregated SKU checking and zero partial writes on failure.',
        requirements: ['Aggregates duplicate SKU lines', 'Leaves stockMap unmutated on insufficient stock'],
        completionCriteria: 'Atomic rollback & reservation tests pass.',
        validationMethod: 'javascript',
        dependsOn: ['cp-fs-pricing'],
        isAssessed: true,
        status: 'active',
      },
    ],
  },
];

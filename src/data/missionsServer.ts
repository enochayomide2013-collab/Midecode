import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import type { MissionServerEvalConfig, MissionRuntimeTestSpec } from '../types/mideocode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CUSTOM_EVAL_PATH = path.resolve(__dirname, '..', '..', '.mideocode-custom-missions-eval.json');

export const CURATED_MISSION_EVAL_SPECS: Record<string, MissionServerEvalConfig> = {
  // 1. HTML and CSS
  'mission-responsive-pricing-landing': {
    missionId: 'mission-responsive-pricing-landing',
    language: 'web',
    xpReward: 100,
    badgeId: 'mission_html_architect',
    badgeTitle: 'Semantic Layout Architect',
    checkpointValidators: {
      'cp-html-landmarks': [
        {
          id: 'chk-html-1',
          label: 'Semantic <header>, <main>, single <h1>, and 3 pricing <article> cards with <ul> & <button>',
          isHidden: false,
          kind: 'html_css',
          targetFile: 'index.html',
          driverOrQuery: 'html-pricing-landmarks',
          regexChecks: [
            '<header[\\s>]',
            '<main[\\s>]',
            '<h1[\\s>]',
            '(?:<article[^>]*>[\\s\\S]*?){3}',
            '<ul[\\s>]',
            '<li[\\s>]',
            '<button[\\s>]',
          ],
          requirementText: 'Use <header>, <main>, single <h1>, and 3 <article> cards each with list items and native <button>',
        },
      ],
      'cp-css-grid-responsive': [
        {
          id: 'chk-css-1',
          label: 'CSS :root custom properties, CSS Grid (.pricing-grid), and @media breakpoint',
          isHidden: false,
          kind: 'html_css',
          targetFile: 'styles.css',
          driverOrQuery: 'css-pricing-grid',
          regexChecks: [
            ':root\\s*\\{[\\s\\S]*?--[a-zA-Z0-9-]+\\s*:',
            '\\.pricing-grid\\s*\\{[\\s\\S]*?display\\s*:\\s*grid',
            'gap\\s*:',
            '@media\\s*\\(',
          ],
          requirementText: 'Define :root variables, configure .pricing-grid with display: grid and gap, and add a @media query',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-html-1',
        label: 'Semantic landmarks & single <h1> constraint',
        isHidden: false,
        kind: 'html_css',
        targetFile: 'index.html',
        driverOrQuery: 'single-h1-landmarks',
        regexChecks: ['<header[\\s>]', '<main[\\s>]', '^((?!<h1[\\s>])[\\s\\S])*<h1[\\s>][\\s\\S]*<\\/h1>((?!<h1[\\s>])[\\s\\S])*$'],
        requirementText: 'Include <header>, <main>, and exactly one <h1>',
      },
      {
        id: 'sub-html-2',
        label: 'Three tier cards inside .pricing-grid with Starter, Pro, Enterprise labels',
        isHidden: false,
        kind: 'html_css',
        targetFile: 'index.html',
        driverOrQuery: 'three-tiers',
        mustContainAll: ['pricing-grid', 'Starter', 'Pro', 'Enterprise'],
        regexChecks: ['(?:<article[\\s>][\\s\\S]*?<\\/article>[\\s\\S]*?){3}', '<ul[\\s>]', '<button[\\s>]'],
        requirementText: 'Render Starter, Pro, and Enterprise <article> cards with <ul> features and <button> CTAs',
      },
      {
        id: 'sub-css-1',
        label: 'CSS Grid + :root custom properties + responsive @media breakpoint',
        isHidden: false,
        kind: 'html_css',
        targetFile: 'styles.css',
        driverOrQuery: 'css-grid-vars',
        regexChecks: [':root\\s*\\{[\\s\\S]*?--', 'display\\s*:\\s*grid', 'grid-template-columns\\s*:', 'gap\\s*:', '@media\\s*\\('],
        requirementText: 'Define :root theme variables, grid-template-columns, gap, and responsive @media rules',
      },
      {
        id: 'sub-html-hidden',
        label: 'Featured tier & keyboard focus-visible accessibility styling',
        isHidden: true,
        kind: 'html_css',
        targetFile: 'styles.css',
        driverOrQuery: 'focus-visible-check',
        regexChecks: ['focus-visible|focus\\b'],
        requirementText: 'Define accessible focus styles for keyboard navigation',
      },
    ],
  },

  // 2. JavaScript
  'mission-js-telemetry-ledger': {
    missionId: 'mission-js-telemetry-ledger',
    language: 'javascript',
    xpReward: 100,
    badgeId: 'mission_js_ledger',
    badgeTitle: 'JavaScript Data Engineer',
    checkpointValidators: {
      'cp-js-summarize': [
        {
          id: 'chk-js-sum-1',
          label: 'summarizeLedger aggregates settled positive rows and excludes invalid/pending rows',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'ledger.js',
          driverOrQuery: `
            (function() {
              const input = [
                { id: '1', category: 'compute', status: 'settled', amount: 1200 },
                { id: '2', category: 'storage', status: 'pending', amount: 500 },
                { id: '3', category: 'compute', status: 'settled', amount: 800 },
                { id: '4', category: 'refund', status: 'settled', amount: -200 }
              ];
              return summarizeLedger(input);
            })()
          `,
          expectedJson: { totalCents: 2000, byCategory: { compute: 2000 }, count: 2 },
          requirementText: 'Filter status === "settled" and positive amounts accurately',
        },
      ],
      'cp-js-overbudget': [
        {
          id: 'chk-js-ob-1',
          label: 'findOverBudgetCategories returns sorted categories strictly > limitCents',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'ledger.js',
          driverOrQuery: `findOverBudgetCategories({ storage: 900, compute: 1500, auth: 1200, ai: 2000 }, 1200)`,
          expectedJson: ['ai', 'compute'],
          requirementText: 'Return alphabetically sorted category names strictly above limitCents',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-js-1',
        label: 'summarizeLedger filters settled positive entries across categories',
        isHidden: false,
        kind: 'javascript',
        targetFile: 'ledger.js',
        driverOrQuery: `summarizeLedger([
          { category: 'compute', status: 'settled', amount: 1200 },
          { category: 'storage', status: 'pending', amount: 500 },
          { category: 'compute', status: 'settled', amount: 800 },
          { category: 'ai', status: 'settled', amount: 450 }
        ])`,
        expectedJson: { totalCents: 2450, byCategory: { compute: 2000, ai: 450 }, count: 3 },
        requirementText: 'Aggregate settled records cleanly per category',
      },
      {
        id: 'sub-js-2',
        label: 'findOverBudgetCategories strictly greater than threshold & sorted',
        isHidden: false,
        kind: 'javascript',
        targetFile: 'ledger.js',
        driverOrQuery: `findOverBudgetCategories({ zebra: 1000, alpha: 1001, beta: 2500 }, 1000)`,
        expectedJson: ['alpha', 'beta'],
        requirementText: 'Strictly compare > limitCents and sort alphabetically',
      },
      {
        id: 'sub-js-3-hidden',
        label: 'Empty input, NaN/Infinity guards, and zero input mutation',
        isHidden: true,
        kind: 'javascript',
        targetFile: 'ledger.js',
        driverOrQuery: `
          (function() {
            const orig = [
              { category: 'net', status: 'settled', amount: NaN },
              { category: 'net', status: 'settled', amount: Infinity },
              { status: 'settled', amount: 150 }
            ];
            const snap = JSON.stringify(orig);
            const res = summarizeLedger(orig);
            const emptyRes = summarizeLedger([]);
            return {
              res,
              emptyRes,
              unmutated: JSON.stringify(orig) === snap
            };
          })()
        `,
        expectedJson: {
          res: { totalCents: 150, byCategory: { uncategorized: 150 }, count: 1 },
          emptyRes: { totalCents: 0, byCategory: {}, count: 0 },
          unmutated: true,
        },
        requirementText: 'Guard against NaN/Infinity, default missing category to uncategorized, and never mutate inputs',
      },
    ],
  },

  // 3. Python
  'mission-python-log-sanitizer': {
    missionId: 'mission-python-log-sanitizer',
    language: 'python',
    xpReward: 100,
    badgeId: 'mission_py_sanitizer',
    badgeTitle: 'Python Diagnostics Builder',
    checkpointValidators: {
      'cp-py-redact': [
        {
          id: 'chk-py-1',
          label: 'redact_emails replaces emails with [REDACTED_EMAIL]',
          isHidden: false,
          kind: 'python',
          targetFile: 'analyzer.py',
          driverOrQuery: `redact_emails("User alice.dev@example.com failed login from bob+ops@sub.io")`,
          expectedJson: 'User [REDACTED_EMAIL] failed login from [REDACTED_EMAIL]',
          requirementText: 'Mask all email addresses with [REDACTED_EMAIL]',
        },
      ],
      'cp-py-analyze': [
        {
          id: 'chk-py-2',
          label: 'analyze_logs parses valid rows, counts 5xx errors, and computes rounded avg_ms',
          isHidden: false,
          kind: 'python',
          targetFile: 'analyzer.py',
          driverOrQuery: `analyze_logs(["GET /api/health 200 10", "POST /api/pay 502 85", "MALFORMED", "GET /api/health 200 15"])`,
          expectedJson: {
            total: 3,
            errors_5xx: 1,
            routes: {
              '/api/health': { count: 2, avg_ms: 12.5 },
              '/api/pay': { count: 1, avg_ms: 85.0 },
            },
          },
          requirementText: 'Skip malformed lines, count 5xx responses, and compute per-route count and avg_ms',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-py-1',
        label: 'redact_emails masks multiple addresses while keeping surrounding message intact',
        isHidden: false,
        kind: 'python',
        targetFile: 'analyzer.py',
        driverOrQuery: `redact_emails("Contact ops@mideocode.dev or lead_1@acme.co.uk")`,
        expectedJson: 'Contact [REDACTED_EMAIL] or [REDACTED_EMAIL]',
        requirementText: 'Support complex subdomains and multi-email log messages',
      },
      {
        id: 'sub-py-2',
        label: 'analyze_logs computes accurate route metrics and ignores invalid rows',
        isHidden: false,
        kind: 'python',
        targetFile: 'analyzer.py',
        driverOrQuery: `analyze_logs(["GET /items 200 10", "GET /items 200 20", "GET /items 200 31", "BAD ROW", "", "POST /auth 500 120"])`,
        expectedJson: {
          total: 4,
          errors_5xx: 1,
          routes: {
            '/items': { count: 3, avg_ms: 20.33 },
            '/auth': { count: 1, avg_ms: 120.0 },
          },
        },
        requirementText: 'Round avg_ms to 2 decimals and skip blank/malformed lines',
      },
      {
        id: 'sub-py-hidden',
        label: 'Hidden empty log list and non-numeric latency tolerance',
        isHidden: true,
        kind: 'python',
        targetFile: 'analyzer.py',
        driverOrQuery: `analyze_logs(["GET /x oops 10", "GET /x 404 nope"])`,
        expectedJson: { total: 0, errors_5xx: 0, routes: {} },
        requirementText: 'Skip lines with non-numeric status or latency without crashing',
      },
    ],
  },

  // 4. Frontend Development
  'mission-frontend-filter-board': {
    missionId: 'mission-frontend-filter-board',
    language: 'web',
    xpReward: 150,
    badgeId: 'mission_frontend_board',
    badgeTitle: 'Frontend State Crafter',
    checkpointValidators: {
      'cp-fe-dom': [
        {
          id: 'chk-fe-html',
          label: 'Required DOM controls exist (#search-input, #priority-filter, #task-form, #task-title, #task-list)',
          isHidden: false,
          kind: 'html_css',
          targetFile: 'index.html',
          driverOrQuery: 'fe-board-controls',
          mustContainAll: ['search-input', 'priority-filter', 'task-form', 'task-title', 'task-list'],
          requirementText: 'Include all required board control IDs in index.html',
        },
      ],
      'cp-fe-filter': [
        {
          id: 'chk-fe-js',
          label: 'filterTasks filters case-insensitively by query and priority',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'app.js',
          driverOrQuery: `
            (function() {
              const sample = [
                { id: '1', title: 'Fix Auth Bug', priority: 'high', done: false },
                { id: '2', title: 'Docs Cleanup', priority: 'low', done: false },
                { id: '3', title: 'Auth Token Refresh', priority: 'medium', done: true }
              ];
              return {
                allAuth: filterTasks(sample, 'auth', 'all').map(t => t.id),
                highAuth: filterTasks(sample, 'AUTH', 'high').map(t => t.id)
              };
            })()
          `,
          expectedJson: { allAuth: ['1', '3'], highAuth: ['1'] },
          requirementText: 'Combine substring search and priority filtering cleanly',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-fe-1',
        label: 'HTML includes required semantic board controls & form',
        isHidden: false,
        kind: 'html_css',
        targetFile: 'index.html',
        driverOrQuery: 'fe-dom',
        mustContainAll: ['search-input', 'priority-filter', 'task-form', 'task-title', 'task-list'],
        requirementText: 'Provide all triage board inputs and list container IDs',
      },
      {
        id: 'sub-fe-2',
        label: 'filterTasks filters by substring and priority without mutation',
        isHidden: false,
        kind: 'javascript',
        targetFile: 'app.js',
        driverOrQuery: `
          (function() {
            const sample = [
              { id: 'a', title: 'Deploy Webhook', priority: 'high', done: false },
              { id: 'b', title: 'Deploy Docs', priority: 'low', done: true }
            ];
            return {
              lowOnly: filterTasks(sample, '', 'low').map(x => x.id),
              searchDeploy: filterTasks(sample, '  deploy ', 'high').map(x => x.id)
            };
          })()
        `,
        expectedJson: { lowOnly: ['b'], searchDeploy: ['a'] },
        requirementText: 'Trim query whitespace and match case-insensitively',
      },
      {
        id: 'sub-fe-hidden',
        label: 'Empty matches return empty array cleanly',
        isHidden: true,
        kind: 'javascript',
        targetFile: 'app.js',
        driverOrQuery: `filterTasks([{ id: '1', title: 'Setup DB', priority: 'medium', done: false }], 'missing', 'all')`,
        expectedJson: [],
        requirementText: 'Return empty array when no tasks match',
      },
    ],
  },

  // 5. Database Development
  'mission-sql-analytics-schema': {
    missionId: 'mission-sql-analytics-schema',
    language: 'sql',
    xpReward: 150,
    badgeId: 'mission_sql_analyst',
    badgeTitle: 'Relational Query Architect',
    checkpointValidators: {
      'cp-sql-schema': [
        {
          id: 'chk-sql-ddl',
          label: 'schema.sql defines organizations, users, and invoices with valid foreign keys',
          isHidden: false,
          kind: 'sql',
          targetFile: 'schema.sql',
          driverOrQuery: `
            SELECT count(*) AS cnt FROM sqlite_master WHERE type='table' AND name IN ('organizations', 'users', 'invoices');
          `,
          expectedJson: [[3]],
          requirementText: 'Create organizations, users, and invoices relational tables',
        },
      ],
      'cp-sql-report': [
        {
          id: 'chk-sql-query',
          label: 'report.sql computes accurate member_count and total_paid_cents without join fan-out',
          isHidden: false,
          kind: 'sql',
          targetFile: 'report.sql',
          driverOrQuery: `
            INSERT INTO organizations (id, name) VALUES (1, 'Acme'), (2, 'Beta'), (3, 'ZeroOrg');
            INSERT INTO users (id, org_id, email) VALUES
              (1, 1, 'a@acme.io'), (2, 1, 'b@acme.io'), (3, 2, 'c@beta.io');
            INSERT INTO invoices (id, org_id, amount_cents, status) VALUES
              (1, 1, 5000, 'paid'), (2, 1, 2500, 'paid'), (3, 1, 9999, 'void'),
              (4, 2, 1200, 'pending');
          `,
          expectedJson: [
            ['Acme', 2, 7500],
            ['Beta', 1, 0],
            ['ZeroOrg', 0, 0],
          ],
          requirementText: 'Return accurate org_name, member_count, and total_paid_cents including unpaid/empty orgs',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-sql-1',
        label: 'Schema creates normalized tables & enforces foreign keys',
        isHidden: false,
        kind: 'sql',
        targetFile: 'schema.sql',
        driverOrQuery: `
          SELECT name FROM sqlite_master WHERE type='table' AND name IN ('organizations', 'users', 'invoices') ORDER BY name ASC;
        `,
        expectedJson: [['invoices'], ['organizations'], ['users']],
        requirementText: 'Define organizations, users, and invoices tables cleanly',
      },
      {
        id: 'sub-sql-2',
        label: 'Reporting query avoids join fan-out across multi-user multi-invoice orgs',
        isHidden: false,
        kind: 'sql',
        targetFile: 'report.sql',
        driverOrQuery: `
          INSERT INTO organizations (id, name) VALUES (1, 'Acme'), (2, 'Beta'), (3, 'Gamma');
          INSERT INTO users (id, org_id, email) VALUES
            (1, 1, 'u1@a.io'), (2, 1, 'u2@a.io'), (3, 1, 'u3@a.io'), (4, 2, 'u4@b.io');
          INSERT INTO invoices (id, org_id, amount_cents, status) VALUES
            (1, 1, 1000, 'paid'), (2, 1, 2000, 'paid'), (3, 2, 4000, 'paid'), (4, 2, 500, 'failed');
        `,
        expectedJson: [
          ['Beta', 1, 4000],
          ['Acme', 3, 3000],
          ['Gamma', 0, 0],
        ],
        requirementText: 'Compute independent member counts and paid sums per org with LEFT JOIN + COALESCE',
      },
      {
        id: 'sub-sql-hidden',
        label: 'Tie-breaker sorting by org_name ASC when total_paid_cents matches',
        isHidden: true,
        kind: 'sql',
        targetFile: 'report.sql',
        driverOrQuery: `
          INSERT INTO organizations (id, name) VALUES (1, 'Zeta'), (2, 'Alpha');
          INSERT INTO users (id, org_id, email) VALUES (1, 1, 'z@z.io');
          INSERT INTO invoices (id, org_id, amount_cents, status) VALUES (1, 1, 1500, 'paid'), (2, 2, 1500, 'paid');
        `,
        expectedJson: [
          ['Alpha', 0, 1500],
          ['Zeta', 1, 1500],
        ],
        requirementText: 'Sort ties alphabetically by org_name ASC',
      },
    ],
  },

  // 6. Backend Development
  'mission-backend-rate-limiter': {
    missionId: 'mission-backend-rate-limiter',
    language: 'javascript',
    xpReward: 160,
    badgeId: 'mission_backend_guard',
    badgeTitle: 'Backend Gateway Defender',
    checkpointValidators: {
      'cp-be-limiter': [
        {
          id: 'chk-be-1',
          label: 'createRateLimiter enforces maxRequests & resets after windowMs',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'middleware.js',
          driverOrQuery: `
            (function() {
              let now = 1000;
              const lim = createRateLimiter({ maxRequests: 2, windowMs: 500, nowFn: () => now });
              const r1 = lim.check('u1').allowed;
              const r2 = lim.check('u1').allowed;
              const r3 = lim.check('u1').allowed;
              const other = lim.check('u2').allowed;
              now = 1600;
              const r4 = lim.check('u1').allowed;
              return { r1, r2, r3, other, r4 };
            })()
          `,
          expectedJson: { r1: true, r2: true, r3: false, other: true, r4: true },
          requirementText: 'Enforce isolated per-key quotas and reset bucket when window expires',
        },
      ],
      'cp-be-guard': [
        {
          id: 'chk-be-2',
          label: 'guardRequest returns 401 when unauthenticated and 429 when over limit',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'middleware.js',
          driverOrQuery: `
            (function() {
              const lim = createRateLimiter({ maxRequests: 1, windowMs: 1000, nowFn: () => 500 });
              const noAuth = guardRequest({ ip: '1.1.1.1', headers: {} }, lim, () => ({ status: 200, body: { ok: true } }));
              const ok1 = guardRequest({ ip: '1.1.1.1', headers: { authorization: 'Bearer tok' } }, lim, () => ({ status: 200, body: { ok: true } }));
              const limited = guardRequest({ ip: '1.1.1.1', headers: { authorization: 'Bearer tok' } }, lim, () => ({ status: 200, body: { ok: true } }));
              return { noAuthStatus: noAuth.status, okStatus: ok1.status, limitedStatus: limited.status };
            })()
          `,
          expectedJson: { noAuthStatus: 401, okStatus: 200, limitedStatus: 429 },
          requirementText: 'Reject missing auth with 401 and throttled requests with 429',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-be-1',
        label: 'Rate limiter tracks remaining quota accurately across window reset',
        isHidden: false,
        kind: 'javascript',
        targetFile: 'middleware.js',
        driverOrQuery: `
          (function() {
            let t = 100;
            const lim = createRateLimiter({ maxRequests: 3, windowMs: 200, nowFn: () => t });
            const a = lim.check('k');
            const b = lim.check('k');
            const c = lim.check('k');
            const d = lim.check('k');
            t = 300;
            const e = lim.check('k');
            return [a.remaining, b.remaining, c.remaining, d.allowed, d.remaining, e.allowed, e.remaining];
          })()
        `,
        expectedJson: [2, 1, 0, false, 0, true, 2],
        requirementText: 'Return accurate remaining count and reset at window boundary',
      },
      {
        id: 'sub-be-2-hidden',
        label: 'Empty "Bearer " header rejected with 401 without invoking handler',
        isHidden: true,
        kind: 'javascript',
        targetFile: 'middleware.js',
        driverOrQuery: `
          (function() {
            let called = false;
            const lim = createRateLimiter({ maxRequests: 5, windowMs: 1000 });
            const res = guardRequest({ ip: '2.2.2.2', headers: { authorization: 'Bearer   ' } }, lim, () => {
              called = true;
              return { status: 200, body: {} };
            });
            return { status: res.status, called };
          })()
        `,
        expectedJson: { status: 401, called: false },
        requirementText: 'Reject blank Bearer tokens and skip downstream handler execution',
      },
    ],
  },

  // 7. Algorithms and Data Structures
  'mission-algo-lru-scheduler': {
    missionId: 'mission-algo-lru-scheduler',
    language: 'python',
    xpReward: 200,
    badgeId: 'mission_algo_master',
    badgeTitle: 'Systems Algorithm Strategist',
    checkpointValidators: {
      'cp-algo-lru': [
        {
          id: 'chk-algo-1',
          label: 'LRUCache evicts oldest unused key when exceeding capacity',
          isHidden: false,
          kind: 'python',
          targetFile: 'scheduler.py',
          driverOrQuery: `
(lambda: (
  c := LRUCache(2),
  c.put(1, 10),
  c.put(2, 20),
  g1 := c.get(1),
  c.put(3, 30),
  g2 := c.get(2),
  g3 := c.get(3),
  [g1, g2, g3]
)[-1])()
          `,
          expectedJson: [10, -1, 30],
          requirementText: 'Refresh recency on get(key) and evict least recently used item on put overflow',
        },
      ],
      'cp-algo-topo': [
        {
          id: 'chk-algo-2',
          label: 'resolve_execution_order orders prerequisites first and rejects cycles',
          isHidden: false,
          kind: 'python',
          targetFile: 'scheduler.py',
          driverOrQuery: `
(lambda: (
  order := resolve_execution_order(["lint", "build", "test"], [("lint", "build"), ("build", "test")]),
  order == ["lint", "build", "test"]
))()
          `,
          expectedJson: true,
          requirementText: 'Return topological order where every prerequisite precedes its dependents',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-algo-1',
        label: 'LRUCache overwrites existing key without premature eviction',
        isHidden: false,
        kind: 'python',
        targetFile: 'scheduler.py',
        driverOrQuery: `
(lambda: (
  c := LRUCache(2),
  c.put(1, 100),
  c.put(2, 200),
  c.put(1, 150),
  c.put(3, 300),
  [c.get(1), c.get(2), c.get(3)]
)[-1])()
        `,
        expectedJson: [150, -1, 300],
        requirementText: 'Refresh recency on put() updates and preserve updated value',
      },
      {
        id: 'sub-algo-2',
        label: 'resolve_execution_order validates branching DAG constraints',
        isHidden: false,
        kind: 'python',
        targetFile: 'scheduler.py',
        driverOrQuery: `
(lambda: (
  tasks := ["a", "b", "c", "d"],
  deps := [("a", "b"), ("a", "c"), ("b", "d"), ("c", "d")],
  out := resolve_execution_order(tasks, deps),
  pos := {k: i for i, k in enumerate(out)},
  len(out) == 4 and all(pos[u] < pos[v] for u, v in deps)
))()
        `,
        expectedJson: true,
        requirementText: 'Respect every edge (u, v) in topological output',
      },
      {
        id: 'sub-algo-hidden',
        label: 'Hidden cycle detection raises ValueError',
        isHidden: true,
        kind: 'python',
        targetFile: 'scheduler.py',
        driverOrQuery: `resolve_execution_order(["x", "y"], [("x", "y"), ("y", "x")])`,
        expectedJson: 'VALUE_ERROR_RAISED',
        requirementText: 'Raise ValueError when dependency graph contains a cycle',
      },
    ],
  },

  // 8. API Development
  'mission-api-webhook-router': {
    missionId: 'mission-api-webhook-router',
    language: 'javascript',
    xpReward: 200,
    badgeId: 'mission_api_architect',
    badgeTitle: 'API Contract Specialist',
    checkpointValidators: {
      'cp-api-webhook': [
        {
          id: 'chk-api-1',
          label: 'processWebhookEvent validates secret, payload, and idempotency Set',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'webhooks.js',
          driverOrQuery: `
            (function() {
              const seen = new Set();
              const bad = processWebhookEvent({ id: 'e1', type: 'charge', secret: 'wrong' }, seen, 'sec_123');
              const first = processWebhookEvent({ id: 'e1', type: 'charge', secret: 'sec_123' }, seen, 'sec_123');
              const replay = processWebhookEvent({ id: 'e1', type: 'charge', secret: 'sec_123' }, seen, 'sec_123');
              return { badStatus: bad.status, firstDup: first.duplicate, replayDup: replay.duplicate, size: seen.size };
            })()
          `,
          expectedJson: { badStatus: 401, firstDup: false, replayDup: true, size: 1 },
          requirementText: 'Return 401 on invalid secret and deduplicate replays cleanly',
        },
      ],
      'cp-api-paginate': [
        {
          id: 'chk-api-2',
          label: 'paginateItems returns exact slices, clamped limits, and nextCursor',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'webhooks.js',
          driverOrQuery: `
            (function() {
              const items = ['a', 'b', 'c', 'd', 'e'];
              const p1 = paginateItems(items, '0', 2);
              const p2 = paginateItems(items, p1.nextCursor, 2);
              const p3 = paginateItems(items, p2.nextCursor, 2);
              return { p1, p2, p3 };
            })()
          `,
          expectedJson: {
            p1: { data: ['a', 'b'], nextCursor: '2', hasMore: true },
            p2: { data: ['c', 'd'], nextCursor: '4', hasMore: true },
            p3: { data: ['e'], nextCursor: null, hasMore: false },
          },
          requirementText: 'Produce accurate cursor pages ending with nextCursor: null and hasMore: false',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-api-1',
        label: 'Webhook schema error returns 400 without polluting idempotency store',
        isHidden: false,
        kind: 'javascript',
        targetFile: 'webhooks.js',
        driverOrQuery: `
          (function() {
            const seen = new Set();
            const badSchema = processWebhookEvent({ secret: 'sec' }, seen, 'sec');
            return { status: badSchema.status, seenSize: seen.size };
          })()
        `,
        expectedJson: { status: 400, seenSize: 0 },
        requirementText: 'Reject missing id or type with HTTP 400',
      },
      {
        id: 'sub-api-2-hidden',
        label: 'Limit clamping caps over-sized page limit to 50',
        isHidden: true,
        kind: 'javascript',
        targetFile: 'webhooks.js',
        driverOrQuery: `
          (function() {
            const big = Array.from({ length: 65 }, (_, i) => i);
            const p = paginateItems(big, '0', 200);
            return { len: p.data.length, nextCursor: p.nextCursor, hasMore: p.hasMore };
          })()
        `,
        expectedJson: { len: 50, nextCursor: '50', hasMore: true },
        requirementText: 'Clamp limit strictly to 50 max items per page',
      },
    ],
  },

  // 9. Software Engineering
  'mission-se-circuit-breaker': {
    missionId: 'mission-se-circuit-breaker',
    language: 'javascript',
    xpReward: 210,
    badgeId: 'mission_se_resilience',
    badgeTitle: 'Resilient Systems Engineer',
    checkpointValidators: {
      'cp-se-trip': [
        {
          id: 'chk-se-1',
          label: 'Circuit breaker trips OPEN at threshold and skips downstream calls',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'circuitBreaker.js',
          driverOrQuery: `
            (function() {
              let now = 1000;
              let calls = 0;
              const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 500, nowFn: () => now });
              const tryFail = () => { try { cb.execute(() => { calls++; throw new Error('boom'); }); return 'ok'; } catch (e) { return e.message; } };
              const e1 = tryFail();
              const e2 = tryFail();
              const st = cb.getState();
              const e3 = tryFail();
              return { e1, e2, st, e3, calls };
            })()
          `,
          expectedJson: { e1: 'boom', e2: 'boom', st: 'OPEN', e3: 'Circuit is OPEN', calls: 2 },
          requirementText: 'Trip OPEN at failureThreshold and fail fast without calling fn()',
        },
      ],
      'cp-se-recover': [
        {
          id: 'chk-se-2',
          label: 'Circuit breaker recovers CLOSED via HALF_OPEN probe after cooldownMs',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'circuitBreaker.js',
          driverOrQuery: `
            (function() {
              let now = 1000;
              const cb = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 300, nowFn: () => now });
              try { cb.execute(() => { throw new Error('down'); }); } catch {}
              const stateOpen = cb.getState();
              now = 1350;
              const stateHalf = cb.getState();
              const val = cb.execute(() => 'healthy');
              const stateClosed = cb.getState();
              return { stateOpen, stateHalf, val, stateClosed };
            })()
          `,
          expectedJson: { stateOpen: 'OPEN', stateHalf: 'HALF_OPEN', val: 'healthy', stateClosed: 'CLOSED' },
          requirementText: 'Transition OPEN -> HALF_OPEN -> CLOSED on successful probe',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-se-1',
        label: 'Failed HALF_OPEN probe immediately re-trips circuit OPEN for another cooldown',
        isHidden: false,
        kind: 'javascript',
        targetFile: 'circuitBreaker.js',
        driverOrQuery: `
          (function() {
            let now = 0;
            const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 100, nowFn: () => now });
            try { cb.execute(() => { throw new Error('1'); }); } catch {}
            try { cb.execute(() => { throw new Error('2'); }); } catch {}
            now = 150;
            try { cb.execute(() => { throw new Error('probe fail'); }); } catch {}
            const afterFailState = cb.getState();
            let blocked = '';
            try { cb.execute(() => 'should block'); } catch (e) { blocked = e.message; }
            return { afterFailState, blocked };
          })()
        `,
        expectedJson: { afterFailState: 'OPEN', blocked: 'Circuit is OPEN' },
        requirementText: 'Re-open circuit immediately when HALF_OPEN probe throws',
      },
      {
        id: 'sub-se-hidden',
        label: 'Successful call resets consecutive failure counter while CLOSED',
        isHidden: true,
        kind: 'javascript',
        targetFile: 'circuitBreaker.js',
        driverOrQuery: `
          (function() {
            const cb = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 100 });
            try { cb.execute(() => { throw new Error('err'); }); } catch {}
            cb.execute(() => 'ok');
            try { cb.execute(() => { throw new Error('err2'); }); } catch {}
            return cb.getState();
          })()
        `,
        expectedJson: 'CLOSED',
        requirementText: 'Reset failure counter on success so non-consecutive failures do not trip OPEN',
      },
    ],
  },

  // 10. Full-Stack Development
  'mission-fullstack-order-pipeline': {
    missionId: 'mission-fullstack-order-pipeline',
    language: 'web',
    xpReward: 250,
    badgeId: 'mission_fullstack_capstone',
    badgeTitle: 'Full-Stack Capstone Architect',
    checkpointValidators: {
      'cp-fs-ui': [
        {
          id: 'chk-fs-html',
          label: 'Checkout HTML contains #checkout-form, #promo-input, #order-items, #order-total, and #checkout-status',
          isHidden: false,
          kind: 'html_css',
          targetFile: 'index.html',
          driverOrQuery: 'fs-checkout-dom',
          mustContainAll: ['checkout-form', 'promo-input', 'order-items', 'order-total', 'checkout-status'],
          requirementText: 'Include all checkout form and order summary DOM IDs',
        },
      ],
      'cp-fs-pricing': [
        {
          id: 'chk-fs-price',
          label: 'calculateOrderSummary computes totals from catalog and applies DEV10 discount',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'checkout.js',
          driverOrQuery: `
            (function() {
              const cat = { kb: { name: 'KB', unitCents: 10000 }, hub: { name: 'Hub', unitCents: 5000 } };
              return calculateOrderSummary([{ sku: 'kb', qty: 1, price: 1 }, { sku: 'hub', qty: 2 }], cat, 'DEV10');
            })()
          `,
          expectedJson: {
            items: [
              { sku: 'kb', name: 'KB', qty: 1, unitCents: 10000, lineCents: 10000 },
              { sku: 'hub', name: 'Hub', qty: 2, unitCents: 5000, lineCents: 10000 },
            ],
            subtotalCents: 20000,
            discountCents: 2000,
            totalCents: 18000,
          },
          requirementText: 'Ignore client price tampering and compute DEV10 discount from catalog totals',
        },
      ],
      'cp-fs-inventory': [
        {
          id: 'chk-fs-inv',
          label: 'reserveInventory prevents partial writes when any SKU exceeds available stock',
          isHidden: false,
          kind: 'javascript',
          targetFile: 'checkout.js',
          driverOrQuery: `
            (function() {
              const stock = { kb: 2, hub: 1 };
              const failRes = reserveInventory([{ sku: 'kb', qty: 1 }, { sku: 'hub', qty: 2 }], stock);
              const okRes = reserveInventory([{ sku: 'kb', qty: 1 }, { sku: 'hub', qty: 1 }], stock);
              return { failOk: failRes.ok, failStock: failRes.updatedStock, okOk: okRes.ok, okStock: okRes.updatedStock };
            })()
          `,
          expectedJson: {
            failOk: false,
            failStock: { kb: 2, hub: 1 },
            okOk: true,
            okStock: { kb: 1, hub: 0 },
          },
          requirementText: 'Roll back / leave stock untouched if any cart line lacks sufficient inventory',
        },
      ],
    },
    submissionTests: [
      {
        id: 'sub-fs-1',
        label: 'Checkout HTML & responsive CSS summary structure',
        isHidden: false,
        kind: 'html_css',
        targetFile: 'index.html',
        driverOrQuery: 'fs-ui-check',
        mustContainAll: ['checkout-form', 'promo-input', 'order-items', 'order-total', 'checkout-status'],
        requirementText: 'Render accessible checkout form and live summary controls',
      },
      {
        id: 'sub-fs-2',
        label: 'Server-authoritative pricing & promo rounding',
        isHidden: false,
        kind: 'javascript',
        targetFile: 'checkout.js',
        driverOrQuery: `
          (function() {
            const cat = { mouse: { name: 'Mouse', unitCents: 455 } };
            return calculateOrderSummary([{ sku: 'mouse', qty: 1, price: 0 }], cat, 'DEV10');
          })()
        `,
        expectedJson: {
          items: [{ sku: 'mouse', name: 'Mouse', qty: 1, unitCents: 455, lineCents: 455 }],
          subtotalCents: 455,
          discountCents: 46,
          totalCents: 409,
        },
        requirementText: 'Round 10% promo discount accurately to nearest cent',
      },
      {
        id: 'sub-fs-hidden',
        label: 'Duplicate SKU lines aggregated before stock check & zero input mutation',
        isHidden: true,
        kind: 'javascript',
        targetFile: 'checkout.js',
        driverOrQuery: `
          (function() {
            const stock = { kb: 2 };
            const res = reserveInventory([{ sku: 'kb', qty: 2 }, { sku: 'kb', qty: 1 }], stock);
            return { ok: res.ok, origKb: stock.kb, returnedKb: res.updatedStock.kb };
          })()
        `,
        expectedJson: { ok: false, origKb: 2, returnedKb: 2 },
        requirementText: 'Aggregate split lines of the same SKU so total quantity cannot bypass stock guard',
      },
    ],
  },
};

// Custom admin-authored evaluation specifications persisted server-side
export function loadCustomEvalSpecs(): Record<string, MissionServerEvalConfig> {
  try {
    if (!fs.existsSync(CUSTOM_EVAL_PATH)) return {};
    const raw = fs.readFileSync(CUSTOM_EVAL_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, MissionServerEvalConfig>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCustomEvalSpec(config: MissionServerEvalConfig): void {
  const all = loadCustomEvalSpecs();
  all[config.missionId] = config;
  fs.writeFileSync(CUSTOM_EVAL_PATH, JSON.stringify(all, null, 2), 'utf-8');
}

export function deleteCustomEvalSpec(missionId: string): void {
  const all = loadCustomEvalSpecs();
  if (all[missionId]) {
    delete all[missionId];
    fs.writeFileSync(CUSTOM_EVAL_PATH, JSON.stringify(all, null, 2), 'utf-8');
  }
}

export function getMissionEvalSpec(missionId: string): MissionServerEvalConfig | null {
  const custom = loadCustomEvalSpecs();
  if (custom[missionId]) return custom[missionId];
  return CURATED_MISSION_EVAL_SPECS[missionId] || null;
}

export function buildPublicEvalSummary(spec: MissionServerEvalConfig): {
  missionId: string;
  xpReward: number;
  checkpointIds: string[];
  publicTests: { id: string; label: string; requirementText: string }[];
  hiddenCount: number;
} {
  const tests = Array.isArray(spec.submissionTests) ? spec.submissionTests : [];
  return {
    missionId: spec.missionId,
    xpReward: spec.xpReward,
    checkpointIds: Object.keys(spec.checkpointValidators || {}),
    publicTests: tests
      .filter((t) => !t.isHidden)
      .map((t) => ({ id: t.id, label: t.label, requirementText: t.requirementText })),
    hiddenCount: tests.filter((t) => t.isHidden).length,
  };
}

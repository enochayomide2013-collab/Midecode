import type { Course } from '../types/mideocode';

export const ACADEMY_COURSES: Course[] = [
  {
    id: 'html-css-architecture',
    title: 'HTML & Modern CSS Architecture',
    category: 'Web Development',
    language: 'HTML / CSS',
    difficulty: 'beginner',
    estimatedHours: 8,
    overview:
      'Build accessible, semantic web interfaces and resilient responsive layouts using modern HTML5, CSS Grid, and Flexbox.',
    objectives: [
      'Structure accessible documents using semantic HTML5 landmarks',
      'Master CSS Flexbox and CSS Grid for responsive multi-column interfaces',
      'Apply custom properties and clean typography scales',
    ],
    prerequisites: ['No prior programming experience required'],
    completionCriteria: 'Complete all lessons, submit the interactive exercises, and score 100% on module quizzes.',
    relatedProjectId: 'guided-portfolio',
    modules: [
      {
        id: 'mod-html-landmarks',
        title: 'Module 1: Semantic HTML & Document Structure',
        description: 'Why meaning-first markup improves accessibility, SEO, and maintainability.',
        lessons: [
          {
            id: 'lesson-semantic-landmarks',
            moduleId: 'mod-html-landmarks',
            courseId: 'html-css-architecture',
            title: 'Semantic Landmarks & Accessible Structure',
            durationMinutes: 15,
            summary: 'Replace generic div soup with <header>, <nav>, <main>, <article>, and <footer>.',
            explanation: [
              'Screen readers and search engines rely on semantic HTML landmarks to navigate a page quickly. Using <main> identifies the primary content, while <nav> announces navigation regions.',
              'Every interactive control should use native elements like <button> or <a href="..."> so keyboard navigation, focus states, and Enter/Space activation work out of the box.',
            ],
            codeExample: {
              language: 'html',
              filename: 'index.html',
              code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 16px; }
    main { margin-top: 24px; max-width: 640px; }
    article { background: #1e293b; padding: 20px; border-radius: 10px; border: 1px solid #334155; }
  </style>
</head>
<body>
  <header>
    <strong>DevJournal</strong>
    <nav aria-label="Primary">
      <a href="#articles" style="color:#60a5fa;">Articles</a>
    </nav>
  </header>
  <main id="articles">
    <article>
      <h1>Understanding Semantic HTML</h1>
      <p>Semantic tags communicate structure to both browsers and assistive technology.</p>
    </article>
  </main>
</body>
</html>`,
              expectedOutput: 'Renders a dark-navy page with a semantic header, navigation link, and structured article card.',
            },
            commonMistakes: [
              'Using clickable <div> elements instead of <button> for actions.',
              'Including multiple <h1> headings or skipping heading levels (e.g., jumping from <h1> to <h4>).',
            ],
            exercise: {
              id: 'ex-semantic-card',
              title: 'Build an Accessible Profile Card',
              prompt: 'Update the markup so the main card uses an <article> tag and includes an <h1> heading.',
              language: 'html',
              starterCode: `<div class="card">\n  <span>Ada Lovelace</span>\n  <p>First computer programmer.</p>\n</div>`,
              expectedOutputIncludes: '<article',
              hint: 'Replace <div class="card"> with <article class="card"> and <span> with <h1>.',
            },
            quiz: [
              {
                id: 'q-sem-1',
                prompt: 'Which HTML element should wrap the primary unique content of a document?',
                options: ['<section>', '<main>', '<div id="main">', '<article>'],
                correctIndex: 1,
                explanation: '<main> is the semantic landmark for the dominant, unique content of the document body.',
              },
              {
                id: 'q-sem-2',
                prompt: 'Why should interactive actions use <button> instead of <div>?',
                options: [
                  'Buttons load faster over HTTP',
                  'Buttons provide built-in keyboard focus and Enter/Space activation',
                  'Divs cannot be styled with CSS',
                  'Buttons automatically connect to Firestore',
                ],
                correctIndex: 1,
                explanation: 'Native <button> elements carry built-in accessibility roles and keyboard behavior.',
              },
            ],
            relatedDocId: 'doc-html-semantics',
            labToolId: 'html-explorer',
          },
          {
            id: 'lesson-css-flexbox',
            moduleId: 'mod-html-landmarks',
            courseId: 'html-css-architecture',
            title: 'Flexbox Alignment & Responsive Layouts',
            durationMinutes: 20,
            summary: 'Control one-dimensional layout direction, spacing, and alignment with CSS Flexbox.',
            explanation: [
              'Flexbox solves one-dimensional layout problems cleanly. Setting display: flex on a container turns its direct children into flex items arranged along a main axis (row or column).',
              'Use justify-content to align items along the main axis, align-items for the cross axis, and gap to add consistent spacing without messy margin hacks.',
            ],
            codeExample: {
              language: 'html',
              filename: 'flexbox.html',
              code: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 24px; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px; background: #1e293b; border-radius: 10px; }
    .actions { display: flex; gap: 8px; }
    button { background: #2563eb; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>Workspace</strong>
    <div class="actions">
      <button>Save</button>
      <button>Deploy</button>
    </div>
  </div>
</body>
</html>`,
              expectedOutput: 'Renders a responsive horizontal toolbar with title on the left and spaced buttons on the right.',
            },
            commonMistakes: [
              'Applying justify-content on a child element instead of the flex container.',
              'Using fixed pixel widths that overflow on mobile screens instead of flex-wrap or min-width: 0.',
            ],
            exercise: {
              id: 'ex-flexbox-row',
              title: 'Center & Space Flex Children',
              prompt: 'Configure .container to use Flexbox with space-between justification and 12px gap.',
              language: 'css',
              starterCode: `.container {\n  /* Add flex properties here */\n}`,
              expectedOutputIncludes: 'display: flex',
              hint: 'Add display: flex; justify-content: space-between; align-items: center; gap: 12px;',
            },
            quiz: [
              {
                id: 'q-flex-1',
                prompt: 'Which CSS property adds consistent spacing between flex items without outer margins?',
                options: ['padding', 'gap', 'border-spacing', 'align-content'],
                correctIndex: 1,
                explanation: 'The gap property inserts space strictly between adjacent flex or grid items.',
              },
            ],
            relatedDocId: 'doc-css-flexbox',
            labToolId: 'flexbox',
          },
        ],
      },
    ],
  },
  {
    id: 'javascript-core',
    title: 'JavaScript Engineering Fundamentals',
    category: 'Web Development',
    language: 'JavaScript',
    difficulty: 'beginner',
    estimatedHours: 12,
    overview:
      'Learn variables, closures, array transformations, asynchronous promises, and DOM state patterns in modern ES2022+ JavaScript.',
    objectives: [
      'Write clean, predictable functions with const/let and lexical scope',
      'Transform structured data using map, filter, reduce, and Map/Set',
      'Handle asynchronous operations safely with async/await and try/catch',
    ],
    prerequisites: ['Basic computer literacy'],
    completionCriteria: 'Pass every lesson exercise and module assessment.',
    relatedProjectId: 'guided-calculator',
    relatedChallengeId: 'two-sum-indices',
    modules: [
      {
        id: 'mod-js-data',
        title: 'Module 1: Functions, Arrays & Immutability',
        description: 'Master pure functions and modern array methods for clean application logic.',
        lessons: [
          {
            id: 'lesson-js-arrays',
            moduleId: 'mod-js-data',
            courseId: 'javascript-core',
            title: 'Transforming Data with map, filter & reduce',
            durationMinutes: 18,
            summary: 'Process lists cleanly without mutating original arrays.',
            explanation: [
              'Modern JavaScript favors immutable transformations. Array.prototype.filter creates a new array containing only items matching a predicate, while .map transforms each element 1-to-1.',
              'Array.prototype.reduce folds a list into a single summary value such as a total, lookup map, or grouped object.',
            ],
            codeExample: {
              language: 'javascript',
              filename: 'orders.js',
              code: `const orders = [
  { id: 1, status: 'paid', total: 45 },
  { id: 2, status: 'pending', total: 30 },
  { id: 3, status: 'paid', total: 80 },
];

const paidRevenue = orders
  .filter((order) => order.status === 'paid')
  .map((order) => order.total)
  .reduce((sum, amount) => sum + amount, 0);

console.log('Total paid revenue:', paidRevenue);`,
              expectedOutput: 'Total paid revenue: 125',
            },
            commonMistakes: [
              'Forgetting to return the accumulator in .reduce() when using curly braces.',
              'Using .map() just for side effects when .forEach() or for...of is clearer.',
            ],
            exercise: {
              id: 'ex-js-filter',
              title: 'Filter Active Scores',
              prompt: 'Write a function getPassingScores(scores) that returns only scores >= 70.',
              language: 'javascript',
              starterCode: `function getPassingScores(scores) {\n  // Return scores >= 70\n}\nconsole.log(getPassingScores([45, 72, 88, 60]));`,
              expectedOutputIncludes: '.filter(',
              hint: 'Use return scores.filter((s) => s >= 70);',
            },
            quiz: [
              {
                id: 'q-js-1',
                prompt: 'What does Array.prototype.filter return when no elements match the condition?',
                options: ['null', 'undefined', 'An empty array []', 'false'],
                correctIndex: 2,
                explanation: '.filter() always returns a new array, which is empty ([]) if zero items pass.',
              },
            ],
            relatedDocId: 'doc-js-arrays',
            labToolId: 'js-console',
          },
          {
            id: 'lesson-js-async',
            moduleId: 'mod-js-data',
            courseId: 'javascript-core',
            title: 'Asynchronous JavaScript & Error Handling',
            durationMinutes: 22,
            summary: 'Coordinate promises cleanly with async/await and structured try/catch recovery.',
            explanation: [
              'Network requests, timers, and database queries are asynchronous. An async function always returns a Promise, and await pauses execution within that function until the Promise settles.',
              'Always wrap awaited operations in try/catch blocks so failed network calls surface clear error feedback instead of unhandled rejections.',
            ],
            codeExample: {
              language: 'javascript',
              filename: 'async-demo.js',
              code: `function fetchCourseSummary(id) {
  return new Promise((resolve, reject) => {
    if (!id) reject(new Error('Missing course id'));
    else resolve({ id, title: 'JavaScript Fundamentals', lessons: 12 });
  });
}

async function load() {
  try {
    const course = await fetchCourseSummary('js-101');
    console.log('Loaded:', course.title);
  } catch (err) {
    console.error('Load failed:', err.message);
  }
}

load();`,
              expectedOutput: 'Loaded: JavaScript Fundamentals',
            },
            commonMistakes: [
              'Forgetting await inside an async function and accidentally logging Promise { <pending> }.',
              'Swallowing errors in an empty catch block without informing the caller or user.',
            ],
            exercise: {
              id: 'ex-js-async',
              title: 'Safe Async Wrapper',
              prompt: 'Write an async function loadItem(fn) that awaits fn() inside try/catch and returns null on error.',
              language: 'javascript',
              starterCode: `async function loadItem(fn) {\n  // await fn() safely\n}`,
              expectedOutputIncludes: 'await fn()',
              hint: 'Use try { return await fn(); } catch { return null; }',
            },
            quiz: [
              {
                id: 'q-async-1',
                prompt: 'What does an async function always return?',
                options: ['The raw value synchronously', 'A Promise', 'An Observable', 'undefined'],
                correctIndex: 1,
                explanation: 'Any function marked async automatically wraps its return value in a Promise.',
              },
            ],
            relatedDocId: 'doc-js-async',
            labToolId: 'js-console',
          },
        ],
      },
    ],
  },
  {
    id: 'python-engineering',
    title: 'Python Core & Problem Solving',
    category: 'Programming Languages',
    language: 'Python',
    difficulty: 'beginner',
    estimatedHours: 14,
    overview:
      'Master Python syntax, dictionaries, comprehensions, functions, and clean algorithmic problem solving.',
    objectives: [
      'Write expressive Pythonic code using list and dictionary comprehensions',
      'Model data cleanly with dictionaries, sets, and tuples',
      'Solve algorithmic problems efficiently with O(n) hash lookups',
    ],
    prerequisites: ['No prior Python experience required'],
    completionCriteria: 'Complete all Python modules and pass verification exercises.',
    relatedChallengeId: 'valid-palindrome',
    modules: [
      {
        id: 'mod-py-basics',
        title: 'Module 1: Pythonic Collections & Comprehensions',
        description: 'Harness lists, dicts, sets, and comprehensions for concise, readable code.',
        lessons: [
          {
            id: 'lesson-py-comprehensions',
            moduleId: 'mod-py-basics',
            courseId: 'python-engineering',
            title: 'Lists, Dictionaries & Comprehensions',
            durationMinutes: 16,
            summary: 'Transform and filter sequences in a single readable expression.',
            explanation: [
              'List comprehensions provide a concise syntax for building lists: [expr for item in iterable if condition].',
              'Dictionaries map hashable keys to values in O(1) average lookup time, making them indispensable for frequency counting and caching.',
            ],
            codeExample: {
              language: 'python',
              filename: 'inventory.py',
              code: `prices = {"keyboard": 120, "mouse": 45, "monitor": 340, "cable": 12}

premium = [name for name, price in prices.items() if price >= 100]
discounted = {name: round(price * 0.9, 2) for name, price in prices.items()}

print("Premium items:", premium)
print("Discounted monitor:", discounted["monitor"])`,
              expectedOutput: "Premium items: ['keyboard', 'monitor']\nDiscounted monitor: 306.0",
            },
            commonMistakes: [
              'Mutating a list while iterating over it inside a for loop.',
              'Using a list when checking membership repeatedly instead of a set (O(n) vs O(1)).',
            ],
            exercise: {
              id: 'ex-py-comp',
              title: 'Square Even Numbers',
              prompt: 'Write a list comprehension returning squares of even numbers from nums.',
              language: 'python',
              starterCode: `nums = [1, 2, 3, 4, 5, 6]\nevens_squared = [] # replace with comprehension\nprint(evens_squared)`,
              expectedOutputIncludes: 'for ',
              hint: 'evens_squared = [n * n for n in nums if n % 2 == 0]',
            },
            quiz: [
              {
                id: 'q-py-1',
                prompt: 'What is the average time complexity of checking `key in my_dict` in Python?',
                options: ['O(n)', 'O(log n)', 'O(1)', 'O(n^2)'],
                correctIndex: 2,
                explanation: 'Python dictionaries are hash tables, providing O(1) average-case key lookup.',
              },
            ],
            relatedDocId: 'doc-python-dicts',
          },
        ],
      },
    ],
  },
  {
    id: 'sql-databases',
    title: 'SQL & Relational Database Design',
    category: 'Databases',
    language: 'SQL',
    difficulty: 'intermediate',
    estimatedHours: 10,
    overview:
      'Design normalized relational schemas and write fast JOIN, GROUP BY, and aggregate queries for PostgreSQL and MySQL.',
    objectives: [
      'Normalize tables with primary keys and foreign key constraints',
      'Combine relational data accurately using INNER and LEFT JOINs',
      'Aggregate metrics cleanly with GROUP BY and HAVING',
    ],
    prerequisites: ['Basic familiarity with tabular data'],
    completionCriteria: 'Complete SQL lessons and pass query accuracy checks.',
    modules: [
      {
        id: 'mod-sql-joins',
        title: 'Module 1: Relational Queries & Joins',
        description: 'Query across normalized tables without losing records or creating Cartesian explosions.',
        lessons: [
          {
            id: 'lesson-sql-joins',
            moduleId: 'mod-sql-joins',
            courseId: 'sql-databases',
            title: 'INNER JOIN, LEFT JOIN & Aggregations',
            durationMinutes: 20,
            summary: 'Connect users, enrollments, and course completions accurately.',
            explanation: [
              'INNER JOIN returns only rows where matching keys exist in both tables. LEFT JOIN keeps every row from the left table even when no matching row exists on the right.',
              'Combine JOIN with COUNT() and GROUP BY to compute per-user or per-course analytics cleanly.',
            ],
            codeExample: {
              language: 'sql',
              filename: 'analytics.sql',
              code: `SELECT
  c.title AS course_title,
  COUNT(e.user_id) AS enrolled_learners
FROM courses c
LEFT JOIN enrollments e ON e.course_id = c.id
GROUP BY c.id, c.title
ORDER BY enrolled_learners DESC;`,
              expectedOutput: 'Returns each course title alongside its total enrolled learner count, including courses with 0 learners.',
            },
            commonMistakes: [
              'Filtering a LEFT JOIN right-table column in WHERE instead of ON, accidentally turning it into an INNER JOIN.',
              'Forgetting non-aggregated SELECT columns inside GROUP BY.',
            ],
            exercise: {
              id: 'ex-sql-join',
              title: 'Select Active Users with Projects',
              prompt: 'Write a SQL query joining users u and projects p on u.id = p.owner_id.',
              language: 'javascript',
              starterCode: `-- Write your SQL query in a string or test directly\nconst sql = \`SELECT u.name, p.title FROM users u INNER JOIN projects p ON u.id = p.owner_id;\`;\nconsole.log(sql);`,
              expectedOutputIncludes: 'INNER JOIN',
              hint: 'Use INNER JOIN projects p ON u.id = p.owner_id.',
            },
            quiz: [
              {
                id: 'q-sql-1',
                prompt: 'Which JOIN preserves all rows from the left table even if there is no match on the right?',
                options: ['INNER JOIN', 'LEFT JOIN', 'CROSS JOIN', 'NATURAL INNER JOIN'],
                correctIndex: 1,
                explanation: 'LEFT JOIN retains every row from the left table and fills unmatched right columns with NULL.',
              },
            ],
            relatedDocId: 'doc-sql-joins',
          },
        ],
      },
    ],
  },
  {
    id: 'algorithms-data-structures',
    title: 'Algorithms & Data Structures',
    category: 'Computer Science',
    language: 'TypeScript / JS',
    difficulty: 'intermediate',
    estimatedHours: 16,
    overview:
      'Build intuition for time/space complexity, hash tables, stacks, two-pointers, binary search, and dynamic programming.',
    objectives: [
      'Analyze algorithm scalability with Big-O time and space bounds',
      'Apply hash maps, stacks, and binary search to eliminate quadratic loops',
      'Verify edge cases systematically with automated tests',
    ],
    prerequisites: ['JavaScript or Python basics'],
    completionCriteria: 'Complete lessons and solve linked coding challenges.',
    relatedChallengeId: 'balanced-brackets',
    modules: [
      {
        id: 'mod-algo-patterns',
        title: 'Module 1: Stacks, Hash Maps & Binary Search',
        description: 'Core interview and systems engineering patterns.',
        lessons: [
          {
            id: 'lesson-stacks-brackets',
            moduleId: 'mod-algo-patterns',
            courseId: 'algorithms-data-structures',
            title: 'LIFO Stacks & Balanced Bracket Validation',
            durationMinutes: 18,
            summary: 'Use Last-In-First-Out stacks to parse nested expressions in O(n) time.',
            explanation: [
              'A stack enforces Last-In, First-Out (LIFO) ordering. Whenever you encounter an opening delimiter like (, [, or {, push its expected closing counterpart onto the stack.',
              'When a closing delimiter arrives, pop the top of the stack and verify it matches. If the stack is empty at the end, every bracket closed in the exact nested order.',
            ],
            codeExample: {
              language: 'javascript',
              filename: 'brackets.js',
              code: `function isValidBrackets(s) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  for (const ch of s) {
    if (pairs[ch]) {
      stack.push(pairs[ch]);
    } else if (stack.pop() !== ch) {
      return false;
    }
  }
  return stack.length === 0;
}

console.log(isValidBrackets('{[()]}'));
console.log(isValidBrackets('([)]'));`,
              expectedOutput: 'true\nfalse',
            },
            commonMistakes: [
              'Returning true at the end without checking stack.length === 0 (fails on unclosed opening brackets like "((").',
            ],
            exercise: {
              id: 'ex-algo-stack',
              title: 'Validate Parentheses',
              prompt: 'Complete isValidBrackets using an array stack with push() and pop().',
              language: 'javascript',
              starterCode: `function isValidBrackets(s) {\n  const stack = [];\n  // implement LIFO check\n  return stack.length === 0;\n}`,
              expectedOutputIncludes: 'stack.pop()',
              hint: 'Push expected closing brackets on open, and compare stack.pop() !== ch on close.',
            },
            quiz: [
              {
                id: 'q-algo-1',
                prompt: 'What is the time complexity of validating a string of length n using a stack?',
                options: ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'],
                correctIndex: 2,
                explanation: 'Each character is pushed and popped at most once, giving O(n) linear time.',
              },
            ],
            relatedDocId: 'doc-big-o',
            labToolId: 'algorithm-visualizer',
          },
        ],
      },
    ],
  },
  {
    id: 'git-apis-tooling',
    title: 'Git, REST APIs & Developer Tooling',
    category: 'Development Tools',
    language: 'Git / JSON / HTTP',
    difficulty: 'beginner',
    estimatedHours: 7,
    overview:
      'Collaborate cleanly with Git branches, understand HTTP status codes and JSON payloads, and inspect API responses safely.',
    objectives: [
      'Manage feature branches, commits, and pull requests without losing work',
      'Design and consume JSON REST APIs with proper HTTP status semantics',
      'Validate JSON payloads and handle error status codes gracefully',
    ],
    prerequisites: ['Basic familiarity with code editors'],
    completionCriteria: 'Complete tooling lessons and quizzes.',
    modules: [
      {
        id: 'mod-git-http',
        title: 'Module 1: Git Workflows & HTTP APIs',
        description: 'Essential daily engineering tools for shipping production software.',
        lessons: [
          {
            id: 'lesson-rest-json',
            moduleId: 'mod-git-http',
            courseId: 'git-apis-tooling',
            title: 'HTTP Methods, Status Codes & JSON Contracts',
            durationMinutes: 15,
            summary: 'Understand GET, POST, PATCH, DELETE and 2xx/4xx/5xx semantics.',
            explanation: [
              'REST APIs map HTTP methods to resource actions: GET reads, POST creates, PATCH updates partially, and DELETE removes.',
              'Always check response.ok before parsing JSON, and handle 400 (validation), 401 (unauthenticated), 403 (forbidden), and 429 (rate limited) explicitly.',
            ],
            codeExample: {
              language: 'javascript',
              filename: 'api-client.js',
              code: `const sampleResponse = {
  status: 200,
  ok: true,
  data: { service: 'MideoCode API', healthy: true },
};

if (!sampleResponse.ok) {
  throw new Error('Request failed with status ' + sampleResponse.status);
}
console.log(JSON.stringify(sampleResponse.data, null, 2));`,
              expectedOutput: '{\n  "service": "MideoCode API",\n  "healthy": true\n}',
            },
            commonMistakes: [
              'Assuming fetch() throws on HTTP 404 or 500 — fetch only rejects on network failure, so always check response.ok.',
            ],
            exercise: {
              id: 'ex-api-check',
              title: 'Check response.ok Guard',
              prompt: 'Write a helper parseResponse(res) that throws an Error when !res.ok.',
              language: 'javascript',
              starterCode: `function parseResponse(res) {\n  // Check res.ok before returning res.data\n}`,
              expectedOutputIncludes: 'res.ok',
              hint: 'if (!res.ok) throw new Error("HTTP " + res.status); return res.data;',
            },
            quiz: [
              {
                id: 'q-http-1',
                prompt: 'Which HTTP status code indicates the request lacks valid authentication credentials?',
                options: ['200 OK', '401 Unauthorized', '404 Not Found', '500 Internal Server Error'],
                correctIndex: 1,
                explanation: '401 Unauthorized signals missing or invalid authentication credentials.',
              },
            ],
            relatedDocId: 'doc-rest-apis',
            labToolId: 'json-formatter',
          },
        ],
      },
    ],
  },
];

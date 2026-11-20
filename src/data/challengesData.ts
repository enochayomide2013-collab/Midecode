import type { Challenge, CareerPathway } from '../types/mideocode';

export const CHALLENGES: Challenge[] = [
  {
    id: 'two-sum-indices',
    title: 'Two Sum Indices',
    difficulty: 'easy',
    category: 'Hash Maps',
    cadence: 'daily',
    xpReward: 60,
    supportedLanguages: ['javascript', 'python'],
    problemStatement:
      'Given an array of integers `nums` and an integer `target`, return the indices `[i, j]` of the two numbers such that they add up to `target`. You may assume exactly one valid solution exists and you cannot use the same element twice.',
    inputDescription: 'nums: number[], target: number',
    outputDescription: 'number[] of length 2 containing zero-based indices [i, j].',
    constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i], target <= 10^9', 'Aim for O(n) time complexity'],
    examples: [
      { input: 'nums = [2, 7, 11, 15], target = 9', output: '[0, 1]', explanation: 'nums[0] + nums[1] == 9' },
      { input: 'nums = [3, 2, 4], target = 6', output: '[1, 2]', explanation: 'nums[1] + nums[2] == 6' },
    ],
    hints: [
      'Store each visited number and its index inside a Map / dict as you iterate.',
      'For each element x, check if (target - x) has already been seen.',
    ],
    explanation: 'Using a hash map turns the naive O(n^2) nested loop into a single O(n) pass.',
    starterCode: {
      javascript: `function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (seen.has(complement)) {\n      return [seen.get(complement), i];\n    }\n    seen.set(nums[i], i);\n  }\n  return [];\n}`,
      python: `def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        comp = target - num\n        if comp in seen:\n            return [seen[comp], i]\n        seen[num] = i\n    return []`,
    },
    relatedCourseId: 'algorithms-data-structures',
  },
  {
    id: 'valid-palindrome',
    title: 'Alphanumeric Palindrome Check',
    difficulty: 'easy',
    category: 'Two Pointers',
    cadence: 'topic',
    xpReward: 50,
    supportedLanguages: ['javascript', 'python'],
    problemStatement:
      'Return true if a string `s` is a palindrome after converting all uppercase letters into lowercase and removing all non-alphanumeric characters.',
    inputDescription: 's: string',
    outputDescription: 'boolean (true or false)',
    constraints: ['1 <= s.length <= 2 * 10^5', 'Consider only ASCII letters and digits'],
    examples: [
      { input: '"A man, a plan, a canal: Panama"', output: 'true', explanation: '"amanaplanacanalpanama" reads the same forward and backward.' },
      { input: '"race a car"', output: 'false', explanation: '"raceacar" is not a palindrome.' },
    ],
    hints: ['Normalize with regex or use two pointers skipping non-alphanumeric characters.'],
    explanation: 'Two pointers from left and right compare characters in O(n) time and O(1) extra space.',
    starterCode: {
      javascript: `function isPalindrome(s) {\n  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');\n  let l = 0, r = clean.length - 1;\n  while (l < r) {\n    if (clean[l] !== clean[r]) return false;\n    l++; r--;\n  }\n  return true;\n}`,
      python: `def is_palindrome(s):\n    clean = [c.lower() for c in s if c.isalnum()]\n    return clean == clean[::-1]`,
    },
    relatedCourseId: 'python-engineering',
  },
  {
    id: 'balanced-brackets',
    title: 'Balanced Brackets Parser',
    difficulty: 'medium',
    category: 'Stacks',
    cadence: 'weekly',
    xpReward: 75,
    supportedLanguages: ['javascript', 'python'],
    problemStatement:
      'Given a string `s` containing only `(`, `)`, `{`, `}`, `[`, `]`, determine whether every opening bracket is closed by the same type of bracket in valid nested order.',
    inputDescription: 's: string',
    outputDescription: 'boolean',
    constraints: ['1 <= s.length <= 10^4'],
    examples: [
      { input: '"()[]{}"', output: 'true', explanation: 'Each pair opens and closes cleanly.' },
      { input: '"([)]"', output: 'false', explanation: 'Brackets overlap out of order.' },
    ],
    hints: ['Use a LIFO stack pushing expected closing brackets when opening characters appear.'],
    explanation: 'A stack tracks the most recently opened delimiter, enforcing strict nesting.',
    starterCode: {
      javascript: `function isValidBrackets(s) {\n  // Write your stack solution here\n  return false;\n}`,
      python: `def is_valid_brackets(s):\n    # Write your stack solution here\n    return False`,
    },
    relatedCourseId: 'algorithms-data-structures',
  },
  {
    id: 'max-subarray-sum',
    title: 'Maximum Subarray Sum',
    difficulty: 'medium',
    category: 'Dynamic Programming',
    cadence: 'weekly',
    xpReward: 90,
    supportedLanguages: ['javascript', 'python'],
    problemStatement:
      'Given an integer array `nums`, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum.',
    inputDescription: 'nums: number[]',
    outputDescription: 'number',
    constraints: ['1 <= nums.length <= 10^5', 'Handle arrays with all negative numbers'],
    examples: [
      { input: '[-2, 1, -3, 4, -1, 2, 1, -5, 4]', output: '6', explanation: 'Subarray [4, -1, 2, 1] has sum 6.' },
    ],
    hints: ["Kadane's Algorithm: current = Math.max(num, current + num)."],
    explanation: "Kadane's algorithm scans once in O(n) time, deciding at each index whether to extend or restart.",
    starterCode: {
      javascript: `function maxSubArray(nums) {\n  let cur = nums[0], best = nums[0];\n  for (let i = 1; i < nums.length; i++) {\n    cur = Math.max(nums[i], cur + nums[i]);\n    best = Math.max(best, cur);\n  }\n  return best;\n}`,
      python: `def max_sub_array(nums):\n    cur = best = nums[0]\n    for n in nums[1:]:\n        cur = max(n, cur + n)\n        best = max(best, cur)\n    return best`,
    },
    relatedCourseId: 'algorithms-data-structures',
  },
  {
    id: 'group-anagrams-count',
    title: 'Count Anagram Groups',
    difficulty: 'hard',
    category: 'Strings & Hashing',
    cadence: 'topic',
    xpReward: 100,
    supportedLanguages: ['javascript', 'python'],
    problemStatement:
      'Given an array of strings `strs`, group all anagrams together and return the total number of distinct anagram groups.',
    inputDescription: 'strs: string[]',
    outputDescription: 'number (count of distinct anagram groups)',
    constraints: ['1 <= strs.length <= 10^4', 'Strings consist of lowercase English letters'],
    examples: [
      { input: '["eat","tea","tan","ate","nat","bat"]', output: '3', explanation: 'Groups: [eat,tea,ate], [tan,nat], [bat].' },
    ],
    hints: ['Sort each string alphabetically to build a canonical group key in a Set.'],
    explanation: 'Canonicalizing each string by sorted characters maps every anagram to the exact same Set key.',
    starterCode: {
      javascript: `function countAnagramGroups(strs) {\n  // Return number of unique anagram groups\n  return 0;\n}`,
      python: `def count_anagram_groups(strs):\n    # Return number of unique anagram groups\n    return 0`,
    },
    relatedCourseId: 'algorithms-data-structures',
  },
  {
    id: 'binary-search-target',
    title: 'Binary Search Target Index',
    difficulty: 'easy',
    category: 'Binary Search',
    cadence: 'topic',
    xpReward: 65,
    supportedLanguages: ['javascript', 'python'],
    problemStatement:
      'Given a sorted array of distinct integers `nums` and a `target` value, return the index if `target` is found. Otherwise return -1. Your algorithm must run in O(log n) time.',
    inputDescription: 'nums: number[], target: number',
    outputDescription: 'number (index or -1)',
    constraints: ['1 <= nums.length <= 10^4', 'nums is sorted in strictly ascending order'],
    examples: [
      { input: 'nums = [-1,0,3,5,9,12], target = 9', output: '4', explanation: '9 is located at index 4.' },
    ],
    hints: ['Maintain left and right bounds and halve the search interval on each step.'],
    explanation: 'Binary search halves the search range each iteration for O(log n) lookup.',
    starterCode: {
      javascript: `function binarySearch(nums, target) {\n  let l = 0, r = nums.length - 1;\n  while (l <= r) {\n    const m = Math.floor((l + r) / 2);\n    if (nums[m] === target) return m;\n    if (nums[m] < target) l = m + 1;\n    else r = m - 1;\n  }\n  return -1;\n}`,
      python: `def binary_search(nums, target):\n    l, r = 0, len(nums) - 1\n    while l <= r:\n        m = (l + r) // 2\n        if nums[m] == target:\n            return m\n        if nums[m] < target:\n            l = m + 1\n        else:\n            r = m - 1\n    return -1`,
    },
    relatedCourseId: 'algorithms-data-structures',
  },
];

export const PLAYGROUND_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Canvas',
    html: '<main class="app">\n  <h1>Hello MideoCode</h1>\n  <p>Start building with HTML, CSS, and JavaScript.</p>\n</main>',
    css: 'body { margin: 0; padding: 32px; font-family: system-ui, sans-serif; background: #0b1120; color: #f8fafc; }',
    js: 'console.log("Playground initialized");',
  },
  {
    id: 'html-starter',
    name: 'Semantic HTML Starter',
    html: '<header><h1>Editorial Article</h1></header>\n<main>\n  <article>\n    <h2>Structured Markup</h2>\n    <p>Clean semantic HTML improves accessibility and maintainability.</p>\n  </article>\n</main>',
    css: 'body { font-family: Georgia, serif; max-width: 680px; margin: 40px auto; padding: 0 20px; line-height: 1.7; background: #0f172a; color: #e2e8f0; }',
    js: 'console.log("Article loaded:", document.querySelector("h1").textContent);',
  },
  {
    id: 'css-starter',
    name: 'CSS Grid Bento Starter',
    html: '<section class="bento">\n  <div class="tile wide">Primary Module</div>\n  <div class="tile">Metrics</div>\n  <div class="tile">Logs</div>\n</section>',
    css: 'body { background: #090d16; color: #f8fafc; font-family: system-ui, sans-serif; padding: 24px; }\n.bento { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }\n.tile { background: #1e293b; border: 1px solid #334155; padding: 24px; border-radius: 10px; }\n.wide { grid-column: span 2; background: #1d4ed8; }',
    js: '',
  },
  {
    id: 'js-starter',
    name: 'Interactive Counter & State',
    html: '<div class="box">\n  <h2 id="count">0</h2>\n  <button id="inc">+ Increment</button>\n  <button id="reset">Reset</button>\n</div>',
    css: 'body { display: grid; place-items: center; min-height: 90vh; background: #0b1120; color: #fff; font-family: system-ui, sans-serif; }\n.box { text-align: center; background: #111827; padding: 32px; border-radius: 12px; border: 1px solid #1f2937; }\nbutton { margin: 4px; padding: 8px 16px; border-radius: 6px; border: none; background: #2563eb; color: #fff; cursor: pointer; }',
    js: 'let n = 0;\nconst el = document.getElementById("count");\ndocument.getElementById("inc").onclick = () => { n++; el.textContent = String(n); };\ndocument.getElementById("reset").onclick = () => { n = 0; el.textContent = "0"; };',
  },
  {
    id: 'responsive-webpage',
    name: 'Responsive Landing Card',
    html: '<section class="hero">\n  <h1>Ship Reliable Software</h1>\n  <p>Clean responsive typography and adaptive layout grid.</p>\n  <button id="cta">Inspect Layout</button>\n</section>',
    css: 'body { margin: 0; padding: 32px; background: #070b14; color: #f8fafc; font-family: system-ui, sans-serif; }\n.hero { max-width: 720px; margin: 0 auto; padding: 36px; border-radius: 12px; background: #111827; border: 1px solid #1e293b; }\nbutton { margin-top: 12px; padding: 10px 18px; background: #3b82f6; border: none; color: #fff; border-radius: 8px; cursor: pointer; }',
    js: 'document.getElementById("cta").onclick = () => console.log("Viewport width:", window.innerWidth);',
  },
  {
    id: 'animation-demo',
    name: 'CSS Transform Motion',
    html: '<div class="stage">\n  <div class="orbit"></div>\n</div>',
    css: 'body { margin: 0; display: grid; place-items: center; min-height: 90vh; background: #070b14; }\n.stage { width: 160px; height: 160px; border: 1px solid #1e293b; border-radius: 16px; display: grid; place-items: center; }\n.orbit { width: 48px; height: 48px; border-radius: 10px; background: #3b82f6; animation: spin 3s cubic-bezier(0.16, 1, 0.3, 1) infinite; }\n@keyframes spin { 0% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.15); } 100% { transform: rotate(360deg) scale(1); } }',
    js: '',
  },
];

export const CAREER_PATHWAYS: CareerPathway[] = [
  {
    id: 'frontend-developer',
    title: 'Frontend Developer',
    summary: 'Design and engineer accessible, high-performance user interfaces in HTML, CSS, JavaScript, and React.',
    requiredSkills: [
      { id: 'fe-html', name: 'Semantic HTML5 & Accessibility', category: 'Core Web' },
      { id: 'fe-css', name: 'Responsive CSS Grid & Flexbox', category: 'Styling' },
      { id: 'fe-js', name: 'Modern JavaScript & Async State', category: 'Language' },
      { id: 'fe-dom', name: 'DOM Performance & Browser APIs', category: 'Runtime' },
      { id: 'fe-api', name: 'REST API Consumption & Error Handling', category: 'Integration' },
    ],
    recommendedCourseIds: ['html-css-architecture', 'javascript-core', 'git-apis-tooling'],
    prerequisites: ['Basic comfort using a code editor and browser DevTools'],
    recommendedProjectIds: ['guided-portfolio', 'guided-calculator', 'guided-todo-app'],
    milestones: [
      'Complete Semantic HTML & Flexbox modules',
      'Build and publish a responsive portfolio workspace',
      'Pass 3 JavaScript array/async exercises and challenges',
    ],
    portfolioChecklist: [
      'Deployed responsive portfolio with working filter interactions',
      'Clean semantic landmarks and keyboard-accessible controls',
      'One state-driven web app with persistent storage and error states',
    ],
    cvTips: [
      'Highlight concrete engineering outcomes (accessibility audits, bundle optimization, state architecture) instead of generic skill bars.',
      'Link directly to live working demos and clean source repositories.',
    ],
    interviewQuestions: [
      {
        question: 'How does the browser event loop coordinate microtasks (Promises) and macrotasks (setTimeout)?',
        keyPoints: ['Call stack must empty first', 'Microtask queue drains completely before next render/macrotask', 'Prevents UI starvation when used carefully'],
      },
      {
        question: 'When would you choose CSS Grid over Flexbox?',
        keyPoints: ['Flexbox for 1D axis distribution', 'Grid for explicit 2D row + column alignment', 'Combining both inside component hierarchies'],
      },
    ],
  },
  {
    id: 'backend-developer',
    title: 'Backend Developer',
    summary: 'Architect reliable APIs, relational databases, authentication workflows, and isolated execution services.',
    requiredSkills: [
      { id: 'be-sql', name: 'Relational Modeling & SQL Joins', category: 'Databases' },
      { id: 'be-rest', name: 'REST API Contracts & Status Codes', category: 'APIs' },
      { id: 'be-auth', name: 'Token Verification & RBAC Security', category: 'Security' },
      { id: 'be-algo', name: 'Data Structures & Complexity Analysis', category: 'CS Core' },
    ],
    recommendedCourseIds: ['sql-databases', 'git-apis-tooling', 'algorithms-data-structures'],
    prerequisites: ['Familiarity with JavaScript or Python basics'],
    recommendedProjectIds: ['guided-python-ledger'],
    milestones: [
      'Master SQL JOINs and GROUP BY aggregations',
      'Complete REST API security & HTTP status module',
      'Solve Hash Map & Binary Search challenges',
    ],
    portfolioChecklist: [
      'Documented API endpoints with input validation and auth checks',
      'Normalized database schema with clear entity relationships',
    ],
    cvTips: [
      'Document latency, security boundaries, and data integrity guarantees you implemented.',
    ],
    interviewQuestions: [
      {
        question: 'Why must authorization and XP/reward validation run on the server or security rules rather than client code?',
        keyPoints: ['Browser requests can be forged', 'Always verify identity via signed tokens', 'Enforce invariants server-side'],
      },
    ],
  },
  {
    id: 'fullstack-developer',
    title: 'Full-Stack Developer',
    summary: 'Connect modern frontend interfaces with cloud databases, real authentication, and API services end to end.',
    requiredSkills: [
      { id: 'fs-ui', name: 'Component UI & State Management', category: 'Frontend' },
      { id: 'fs-db', name: 'Cloud Firestore & SQL Persistence', category: 'Data' },
      { id: 'fs-auth', name: 'Multi-Provider Auth & Session Security', category: 'Security' },
      { id: 'fs-api', name: 'Full-Stack APIs & Error Handling', category: 'Integration' },
    ],
    recommendedCourseIds: ['html-css-architecture', 'javascript-core', 'sql-databases', 'git-apis-tooling'],
    prerequisites: ['HTML/CSS and basic JavaScript'],
    recommendedProjectIds: ['guided-portfolio', 'guided-todo-app'],
    milestones: [
      'Complete Frontend + SQL core courses',
      'Ship a persistent multi-file project in Mideo Cloud',
    ],
    portfolioChecklist: [
      'End-to-end authenticated app with persisted user state',
      'Clean separation between UI views, services, and backend routes',
    ],
    cvTips: [
      'Show full-stack ownership: schema design, API contracts, and responsive UI.',
    ],
    interviewQuestions: [
      {
        question: 'How do you handle optimistic UI updates vs confirmed cloud persistence when network errors occur?',
        keyPoints: ['Keep sync status honest', 'Roll back or surface conflict resolution', 'Never overwrite newer server state silently'],
      },
    ],
  },
  {
    id: 'python-developer',
    title: 'Python & Algorithms Developer',
    summary: 'Build clean Python data pipelines, CLI utilities, and algorithmic problem-solving fluency.',
    requiredSkills: [
      { id: 'py-core', name: 'Python Data Structures & Comprehensions', category: 'Language' },
      { id: 'py-algo', name: 'Algorithms & Big-O Analysis', category: 'CS Core' },
      { id: 'py-sql', name: 'SQL Querying & Data Aggregation', category: 'Data' },
    ],
    recommendedCourseIds: ['python-engineering', 'algorithms-data-structures', 'sql-databases'],
    prerequisites: ['None'],
    recommendedProjectIds: ['guided-python-ledger'],
    milestones: [
      'Complete Python Core module',
      'Solve 4 coding challenges in Python',
    ],
    portfolioChecklist: [
      'Clean, well-tested Python CLI or data analyzer project',
    ],
    cvTips: [
      'Highlight data structures chosen and measurable runtime improvements.',
    ],
    interviewQuestions: [
      {
        question: 'Explain the performance difference between membership lookup in a Python list vs a set.',
        keyPoints: ['List scan is O(n)', 'Set/dict uses hash table for O(1) average lookup'],
      },
    ],
  },
];

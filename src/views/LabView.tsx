import { useState } from 'react';
import { Code2, Copy, Play, RotateCcw } from 'lucide-react';
import { useMideo } from '../context/MideoContext';

type LabToolId =
  | 'flexbox'
  | 'grid'
  | 'gradient'
  | 'json-formatter'
  | 'regex'
  | 'algorithm-visualizer'
  | 'html-explorer'
  | 'js-console';

const LAB_TOOLS: { id: LabToolId; label: string }[] = [
  { id: 'flexbox', label: 'Flexbox Visualizer' },
  { id: 'grid', label: 'CSS Grid Visualizer' },
  { id: 'gradient', label: 'Color & Gradient' },
  { id: 'json-formatter', label: 'JSON Formatter' },
  { id: 'regex', label: 'Regex Tester' },
  { id: 'algorithm-visualizer', label: 'Algorithm Visualizer' },
  { id: 'html-explorer', label: 'HTML Structure' },
  { id: 'js-console', label: 'JS Sandbox Console' },
];

export function LabView() {
  const { selectedLabTool, openLab, openInIde, notify } = useMideo();
  const activeTool = (LAB_TOOLS.some((t) => t.id === selectedLabTool) ? selectedLabTool : 'flexbox') as LabToolId;

  // Flexbox state
  const [flexDir, setFlexDir] = useState<'row' | 'column'>('row');
  const [justify, setJustify] = useState('space-between');
  const [align, setAlign] = useState('center');
  const [flexGap, setFlexGap] = useState(12);

  // Grid state
  const [gridCols, setGridCols] = useState(3);
  const [gridGap, setGridGap] = useState(12);

  // Gradient state
  const [colorA, setColorA] = useState('#1d4ed8');
  const [colorB, setColorB] = useState('#7c3aed');
  const [angle, setAngle] = useState(135);

  // JSON formatter state
  const [jsonInput, setJsonInput] = useState('{"platform":"MideoCode","systems":12,"secure":true}');
  const [jsonStatus, setJsonStatus] = useState<string>('Valid JSON');

  // Regex tester state
  const [regexPattern, setRegexPattern] = useState('\\b[A-Z][a-z]+\\b');
  const [regexFlags, setRegexFlags] = useState('g');
  const [regexSample, setRegexSample] = useState('MideoCode teaches TypeScript, Python, and Systems Engineering.');

  // Algorithm visualizer state (Bubble sort step array)
  const [algoArray, setAlgoArray] = useState<number[]>([42, 18, 76, 29, 64, 12, 53]);
  const [algoStepInfo, setAlgoStepInfo] = useState('Click Step or Sort to inspect adjacent comparisons.');
  const [algoHighlight, setAlgoHighlight] = useState<number[]>([]);

  // HTML structure explorer
  const [htmlInput, setHtmlInput] = useState('<header><nav><a>Home</a></nav></header><main><article><h1>Title</h1><p>Body</p></article></main>');

  // JS Console
  const [jsInput, setJsInput] = useState('const nums = [2, 4, 6, 8];\nconsole.log("Sum:", nums.reduce((a, b) => a + b, 0));');
  const [jsLogs, setJsLogs] = useState<string[]>([]);

  const flexCss = `.flex-box {\n  display: flex;\n  flex-direction: ${flexDir};\n  justify-content: ${justify};\n  align-items: ${align};\n  gap: ${flexGap}px;\n}`;
  const gridCss = `.grid-box {\n  display: grid;\n  grid-template-columns: repeat(${gridCols}, minmax(0, 1fr));\n  gap: ${gridGap}px;\n}`;
  const gradCss = `background: linear-gradient(${angle}deg, ${colorA}, ${colorB});`;

  const copyCss = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', 'Copied to clipboard.');
    } catch {
      notify('error', 'Clipboard copy blocked by browser permissions.');
    }
  };

  const runAlgorithmStep = () => {
    const arr = [...algoArray];
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] > arr[i + 1]) {
        const tmp = arr[i];
        arr[i] = arr[i + 1];
        arr[i + 1] = tmp;
        setAlgoArray(arr);
        setAlgoHighlight([i, i + 1]);
        setAlgoStepInfo(`Swapped index ${i} (${arr[i + 1]}) and ${i + 1} (${arr[i]}).`);
        return;
      }
    }
    setAlgoHighlight([]);
    setAlgoStepInfo('Array is completely sorted in ascending order.');
  };

  const computeRegexMatches = () => {
    try {
      const rx = new RegExp(regexPattern, regexFlags);
      const matches = Array.from(regexSample.matchAll(rx.global ? rx : new RegExp(regexPattern, regexFlags + 'g')));
      return { matches: matches.map((m) => m[0]), error: null };
    } catch (err) {
      return { matches: [], error: err instanceof Error ? err.message : 'Invalid regular expression' };
    }
  };

  const parseHtmlOutline = (src: string): string[] => {
    try {
      const doc = new DOMParser().parseFromString(src, 'text/html');
      const lines: string[] = [];
      const walk = (el: Element, depth: number) => {
        if (el.tagName === 'HTML' || el.tagName === 'HEAD') return;
        if (el.tagName !== 'BODY') {
          lines.push(`${'  '.repeat(depth)}<${el.tagName.toLowerCase()}>`);
        }
        Array.from(el.children).forEach((c) => walk(c, el.tagName === 'BODY' ? depth : depth + 1));
      };
      walk(doc.body, 0);
      return lines;
    } catch {
      return ['Unable to parse HTML'];
    }
  };

  const runJsConsole = () => {
    const logs: string[] = [];
    const safeConsole = {
      log: (...args: unknown[]) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
      error: (...args: unknown[]) => logs.push('[error] ' + args.join(' ')),
    };
    try {
      const fn = new Function('console', `"use strict";\n${jsInput}`);
      const res = fn(safeConsole);
      if (res !== undefined) logs.push(`=> ${String(res)}`);
      setJsLogs(logs.length ? logs : ['Executed with no console output.']);
    } catch (err) {
      setJsLogs([`[error] ${err instanceof Error ? err.message : String(err)}`]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Mideo Lab</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Interactive visualizers and utilities kept separate from your saved projects unless you import them.
        </p>
      </div>

      {/* Tool Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {LAB_TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => openLab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
              activeTool === t.id
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Flexbox Visualizer */}
      {activeTool === 'flexbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
          <div className="lg:col-span-7 space-y-4">
            <div
              className="min-h-[280px] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] p-4"
              style={{ display: 'flex', flexDirection: flexDir, justifyContent: justify, alignItems: align, gap: `${flexGap}px` }}
            >
              {[1, 2, 3].map((n) => (
                <div key={n} className="px-5 py-4 rounded-lg bg-blue-600 text-white font-mono text-sm font-semibold">
                  Item {n}
                </div>
              ))}
            </div>
            <pre className="p-3 rounded-lg bg-[#0B1020] text-slate-100 font-mono text-xs">{flexCss}</pre>
          </div>
          <div className="lg:col-span-5 space-y-4 text-xs">
            <div>
              <label className="block font-medium mb-1">flex-direction</label>
              <select value={flexDir} onChange={(e) => setFlexDir(e.target.value as 'row' | 'column')} className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <option value="row">row</option>
                <option value="column">column</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">justify-content</label>
              <select value={justify} onChange={(e) => setJustify(e.target.value)} className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                {['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">align-items</label>
              <select value={align} onChange={(e) => setAlign(e.target.value)} className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                {['stretch', 'flex-start', 'center', 'flex-end'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">gap: {flexGap}px</label>
              <input type="range" min={0} max={40} value={flexGap} onChange={(e) => setFlexGap(Number(e.target.value))} className="w-full" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => copyCss(flexCss)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">
                <Copy className="w-3.5 h-3.5" /> Copy CSS
              </button>
              <button
                onClick={() => openInIde({
                  title: 'Flexbox Lab Export',
                  language: 'web',
                  files: [
                    { name: 'index.html', folder: '', language: 'html', content: '<div class="flex-box">\n  <div class="box">1</div>\n  <div class="box">2</div>\n  <div class="box">3</div>\n</div>' },
                    { name: 'styles.css', folder: '', language: 'css', content: `${flexCss}\n.box { padding: 16px 24px; background: #2563eb; color: #fff; border-radius: 8px; }` },
                  ],
                })}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" /> Import to IDE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS Grid Visualizer */}
      {activeTool === 'grid' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
          <div className="lg:col-span-7 space-y-4">
            <div
              className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14]"
              style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gap: `${gridGap}px` }}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="p-6 rounded-lg bg-violet-600/90 text-white text-center font-mono text-sm font-semibold">
                  Cell {n}
                </div>
              ))}
            </div>
            <pre className="p-3 rounded-lg bg-[#0B1020] text-slate-100 font-mono text-xs">{gridCss}</pre>
          </div>
          <div className="lg:col-span-5 space-y-4 text-xs">
            <div>
              <label className="block font-medium mb-1">Columns: {gridCols}</label>
              <input type="range" min={1} max={6} value={gridCols} onChange={(e) => setGridCols(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block font-medium mb-1">Grid Gap: {gridGap}px</label>
              <input type="range" min={0} max={36} value={gridGap} onChange={(e) => setGridGap(Number(e.target.value))} className="w-full" />
            </div>
            <button onClick={() => copyCss(gridCss)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer">
              <Copy className="w-3.5 h-3.5" /> Copy Grid CSS
            </button>
          </div>
        </div>
      )}

      {/* Gradient Generator */}
      {activeTool === 'gradient' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="h-60 rounded-xl border border-slate-200 dark:border-slate-800" style={{ background: `linear-gradient(${angle}deg, ${colorA}, ${colorB})` }} />
            <pre className="p-3 rounded-lg bg-[#0B1020] text-slate-100 font-mono text-xs">{gradCss}</pre>
          </div>
          <div className="lg:col-span-5 space-y-4 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <label className="block font-medium mb-1">Start Color</label>
                <input type="color" value={colorA} onChange={(e) => setColorA(e.target.value)} className="h-10 w-20 rounded cursor-pointer" />
              </div>
              <div>
                <label className="block font-medium mb-1">End Color</label>
                <input type="color" value={colorB} onChange={(e) => setColorB(e.target.value)} className="h-10 w-20 rounded cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1">Angle: {angle} deg</label>
              <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-full" />
            </div>
            <button onClick={() => copyCss(gradCss)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer">
              <Copy className="w-3.5 h-3.5" /> Copy CSS Gradient
            </button>
          </div>
        </div>
      )}

      {/* JSON Formatter */}
      {activeTool === 'json-formatter' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{jsonStatus}</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  try {
                    const parsed = JSON.parse(jsonInput);
                    setJsonInput(JSON.stringify(parsed, null, 2));
                    setJsonStatus('Valid JSON (Formatted)');
                  } catch (err) {
                    setJsonStatus(`Invalid JSON: ${err instanceof Error ? err.message : 'Syntax error'}`);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Format & Validate
              </button>
              <button
                onClick={() => {
                  try {
                    setJsonInput(JSON.stringify(JSON.parse(jsonInput)));
                    setJsonStatus('Valid JSON (Minified)');
                  } catch (err) {
                    setJsonStatus(`Invalid JSON: ${err instanceof Error ? err.message : 'Syntax error'}`);
                  }
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                Minify
              </button>
            </div>
          </div>
          <textarea
            rows={10}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            className="w-full p-4 rounded-lg bg-[#0B1020] text-slate-100 font-mono text-xs border border-slate-800"
          />
        </div>
      )}

      {/* Regex Tester */}
      {activeTool === 'regex' && (() => {
        const { matches, error } = computeRegexMatches();
        return (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                value={regexPattern}
                onChange={(e) => setRegexPattern(e.target.value)}
                placeholder="Pattern"
                className="sm:col-span-3 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs"
              />
              <input
                value={regexFlags}
                onChange={(e) => setRegexFlags(e.target.value)}
                placeholder="Flags (g, i, m)"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs"
              />
            </div>
            <textarea
              rows={4}
              value={regexSample}
              onChange={(e) => setRegexSample(e.target.value)}
              className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
            />
            {error ? (
              <p className="text-xs text-red-500">{error}</p>
            ) : (
              <div className="text-xs">
                <strong className="text-slate-900 dark:text-white">{matches.length} matches: </strong>
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  {matches.length ? matches.join(', ') : 'None'}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Algorithm Visualizer */}
      {activeTool === 'algorithm-visualizer' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">{algoStepInfo}</p>
            <div className="flex gap-2">
              <button onClick={runAlgorithmStep} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
                <Play className="w-3.5 h-3.5" /> Next Bubble Swap
              </button>
              <button
                onClick={() => {
                  setAlgoArray([42, 18, 76, 29, 64, 12, 53]);
                  setAlgoHighlight([]);
                  setAlgoStepInfo('Reset array.');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            </div>
          </div>
          <div className="h-56 flex items-end justify-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
            {algoArray.map((val, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5">
                <span className="text-xs font-mono tabular-nums">{val}</span>
                <div
                  className={`w-10 rounded-t transition-all ${
                    algoHighlight.includes(idx) ? 'bg-violet-500' : 'bg-blue-600'
                  }`}
                  style={{ height: `${val * 2}px` }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HTML Structure Explorer */}
      {activeTool === 'html-explorer' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6">
          <textarea
            rows={8}
            value={htmlInput}
            onChange={(e) => setHtmlInput(e.target.value)}
            className="w-full p-3 rounded-lg bg-[#0B1020] text-slate-100 font-mono text-xs"
          />
          <pre className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs">
            {parseHtmlOutline(htmlInput).join('\n')}
          </pre>
        </div>
      )}

      {/* JS Sandbox Console */}
      {activeTool === 'js-console' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
          <textarea
            rows={6}
            value={jsInput}
            onChange={(e) => setJsInput(e.target.value)}
            className="w-full p-4 rounded-lg bg-[#0B1020] text-slate-100 font-mono text-xs"
          />
          <button onClick={runJsConsole} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">
            Execute Snippet
          </button>
          <pre className="p-4 rounded-lg bg-[#070B14] text-slate-200 font-mono text-xs min-h-[80px]">
            {jsLogs.length ? jsLogs.join('\n') : 'Console output appears here.'}
          </pre>
        </div>
      )}
    </div>
  );
}

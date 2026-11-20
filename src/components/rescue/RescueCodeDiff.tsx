import { useMemo, useState } from 'react';
import { Check, Columns2, Copy, FileDiff } from 'lucide-react';

interface DiffRow {
  type: 'unchanged' | 'removed' | 'added';
  oldLine?: number;
  newLine?: number;
  text: string;
}

function computeLineDiff(beforeText: string, afterText: string): DiffRow[] {
  const a = beforeText.split('\n');
  const b = afterText.split('\n');
  const m = a.length;
  const n = b.length;

  // Fallback for very large files to keep UI instantaneous
  if (m * n > 250_000) {
    const out: DiffRow[] = [];
    const maxLen = Math.max(m, n);
    for (let i = 0; i < maxLen; i++) {
      if (i < m && i < n && a[i] === b[i]) {
        out.push({ type: 'unchanged', oldLine: i + 1, newLine: i + 1, text: a[i] });
      } else {
        if (i < m) out.push({ type: 'removed', oldLine: i + 1, text: a[i] });
        if (i < n) out.push({ type: 'added', newLine: i + 1, text: b[i] });
      }
    }
    return out;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  let oldLn = 1;
  let newLn = 1;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      rows.push({ type: 'unchanged', oldLine: oldLn++, newLine: newLn++, text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'removed', oldLine: oldLn++, text: a[i] });
      i++;
    } else {
      rows.push({ type: 'added', newLine: newLn++, text: b[j] });
      j++;
    }
  }
  while (i < m) rows.push({ type: 'removed', oldLine: oldLn++, text: a[i++] });
  while (j < n) rows.push({ type: 'added', newLine: newLn++, text: b[j++] });
  return rows;
}

export function RescueCodeDiff({
  filePath,
  originalCode,
  proposedCode,
  onCopied,
}: {
  filePath: string;
  originalCode: string;
  proposedCode: string;
  onCopied?: () => void;
}) {
  const [viewMode, setViewMode] = useState<'diff' | 'split'>('diff');
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => computeLineDiff(originalCode, proposedCode), [originalCode, proposedCode]);
  const additions = useMemo(() => rows.filter((r) => r.type === 'added').length, [rows]);
  const deletions = useMemo(() => rows.filter((r) => r.type === 'removed').length, [rows]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(proposedCode);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono font-semibold text-slate-200 truncate">{filePath}</span>
          <span className="text-[11px] font-mono tabular-nums text-emerald-400">+{additions}</span>
          <span className="text-[11px] font-mono tabular-nums text-rose-400">-{deletions}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('diff')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
              viewMode === 'diff'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <FileDiff className="w-3 h-3" />
            Unified Diff
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
              viewMode === 'split'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Columns2 className="w-3 h-3" />
            Original / Proposed
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-slate-200 hover:bg-slate-800 text-[11px] font-medium cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy Fix'}
          </button>
        </div>
      </div>

      {viewMode === 'diff' ? (
        <div className="max-h-[420px] overflow-auto font-mono text-[11px] leading-5">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className={`flex items-start px-3 py-0.5 whitespace-pre ${
                row.type === 'added'
                  ? 'bg-emerald-950/60 text-emerald-200'
                  : row.type === 'removed'
                    ? 'bg-rose-950/60 text-rose-200'
                    : 'text-slate-300'
              }`}
            >
              <span className="w-8 shrink-0 text-right pr-2 text-slate-500 select-none tabular-nums">
                {row.oldLine ?? ''}
              </span>
              <span className="w-8 shrink-0 text-right pr-2 text-slate-500 select-none tabular-nums">
                {row.newLine ?? ''}
              </span>
              <span className="w-4 shrink-0 select-none font-bold">
                {row.type === 'added' ? '+' : row.type === 'removed' ? '-' : ' '}
              </span>
              <span className="flex-1 min-w-0 break-all">{row.text || ' '}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          <div className="flex flex-col min-w-0">
            <div className="px-3 py-1.5 bg-rose-950/30 border-b border-slate-800 text-[11px] font-mono text-rose-300">
              Original Code
            </div>
            <pre className="p-3 max-h-[380px] overflow-auto text-[11px] font-mono text-slate-300 leading-5">
              <code>{originalCode}</code>
            </pre>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="px-3 py-1.5 bg-emerald-950/30 border-b border-slate-800 text-[11px] font-mono text-emerald-300">
              Proposed Corrected Code
            </div>
            <pre className="p-3 max-h-[380px] overflow-auto text-[11px] font-mono text-slate-100 leading-5">
              <code>{proposedCode}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

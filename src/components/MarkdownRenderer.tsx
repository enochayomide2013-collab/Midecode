import React, { useState } from 'react';
import { Check, Code2, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onOpenCodeInIde?: (code: string, language: string, filename?: string) => void;
}

function defaultFilenameForLanguage(language: string): string {
  const norm = language.toLowerCase().trim();
  if (norm === 'python' || norm === 'py') return 'main.py';
  if (norm === 'typescript' || norm === 'ts' || norm === 'tsx') return 'index.ts';
  if (norm === 'html') return 'index.html';
  if (norm === 'css') return 'styles.css';
  if (norm === 'sql') return 'query.sql';
  return 'index.js';
}

function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={`b_${keyIdx++}`} className="font-semibold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={`c_${keyIdx++}`}
          className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-blue-700 dark:text-blue-300 font-mono text-[12px]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(
        <em key={`i_${keyIdx++}`} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith('[') && match[2]) {
      const labelEnd = token.indexOf('](');
      const label = labelEnd !== -1 ? token.slice(1, labelEnd) : token;
      const href = match[2];
      tokens.push(
        <a
          key={`a_${keyIdx++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:opacity-80"
        >
          {label}
        </a>,
      );
    } else {
      tokens.push(token);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

function CodeBlock({
  code,
  language,
  onOpenCodeInIde,
}: {
  code: string;
  language: string;
  onOpenCodeInIde?: (code: string, language: string, filename?: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const langLabel = language.trim() || 'code';
  const normalizedLang = langLabel.toLowerCase();
  const canOpenInIde =
    Boolean(onOpenCodeInIde) &&
    ['javascript', 'js', 'typescript', 'ts', 'python', 'py', 'html', 'css', 'sql', 'web'].includes(
      normalizedLang,
    );

  return (
    <div className="my-3 rounded-lg border border-slate-300 dark:border-slate-700/90 overflow-hidden bg-[#090D16]">
      <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-300">
        <span className="font-mono uppercase tracking-wide text-slate-400">{langLabel}</span>
        <div className="flex items-center gap-2">
          {canOpenInIde && onOpenCodeInIde && (
            <button
              type="button"
              onClick={() =>
                onOpenCodeInIde(
                  code,
                  normalizedLang === 'python' || normalizedLang === 'py' ? 'python' : 'javascript',
                  defaultFilenameForLanguage(normalizedLang),
                )
              }
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white transition-colors cursor-pointer"
            >
              <Code2 className="w-3 h-3" />
              Open in IDE
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="p-3.5 text-slate-100 font-mono text-xs leading-relaxed overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderTextSegment(
  segment: string,
  segmentKey: string,
): React.ReactNode[] {
  const lines = segment.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(
        <hr key={`${segmentKey}_hr_${i}`} className="my-3 border-slate-200 dark:border-slate-800" />,
      );
      i += 1;
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const cls =
        level === 1
          ? 'text-base font-bold text-slate-900 dark:text-white mt-3 mb-1.5'
          : level === 2
            ? 'text-sm font-bold text-slate-900 dark:text-white mt-3 mb-1'
            : 'text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mt-2.5 mb-1';
      blocks.push(
        <div key={`${segmentKey}_h_${i}`} className={cls}>
          {renderInline(text)}
        </div>,
      );
      i += 1;
      continue;
    }

    // Blockquotes
    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`${segmentKey}_q_${i}`}
          className="my-2 pl-3 border-l-2 border-blue-500/60 text-slate-600 dark:text-slate-300 italic text-sm space-y-1"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx}>{renderInline(ql)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Markdown table
    if (
      trimmed.startsWith('|') &&
      i + 1 < lines.length &&
      /^\|\s*[-:| ]+\|$/.test(lines[i + 1].trim())
    ) {
      const parseRow = (rowLine: string) =>
        rowLine
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const headers = parseRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={`${segmentKey}_tbl_${i}`} className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
              <tr>
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="px-3 py-2 font-semibold border-b border-slate-200 dark:border-slate-700">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((r, rIdx) => (
                <tr key={rIdx}>
                  {r.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Bullet list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`${segmentKey}_ul_${i}`} className="my-2 pl-5 list-disc space-y-1 text-sm text-slate-800 dark:text-slate-200">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`${segmentKey}_ol_${i}`} className="my-2 pl-5 list-decimal space-y-1 text-sm text-slate-800 dark:text-slate-200">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph (collect contiguous plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s+|[-*+]\s+|\d+\.\s+|>\s+|(-{3,}|\*{3,})$|\|)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`${segmentKey}_p_${i}`} className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed my-1.5">
        {renderInline(paraLines.join(' '))}
      </p>,
    );
  }

  return blocks;
}

export function MarkdownRenderer({ content, onOpenCodeInIde }: MarkdownRendererProps) {
  // Split content by fenced code blocks (supports incomplete trailing block during streaming)
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  const fenceRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].replace(/\n$/, ''),
    });
    lastIndex = fenceRegex.lastIndex;
  }

  const remaining = content.slice(lastIndex);
  const openFenceMatch = remaining.match(/^([\s\S]*?)```([a-zA-Z0-9_+-]*)\n([\s\S]*)$/);
  if (openFenceMatch) {
    if (openFenceMatch[1]) {
      parts.push({ type: 'text', content: openFenceMatch[1] });
    }
    parts.push({
      type: 'code',
      language: openFenceMatch[2] || 'text',
      content: openFenceMatch[3],
    });
  } else if (remaining) {
    parts.push({ type: 'text', content: remaining });
  }

  return (
    <div className="space-y-1">
      {parts.map((part, idx) =>
        part.type === 'code' ? (
          <CodeBlock
            key={`cb_${idx}`}
            code={part.content}
            language={part.language || 'code'}
            onOpenCodeInIde={onOpenCodeInIde}
          />
        ) : (
          <React.Fragment key={`txt_${idx}`}>{renderTextSegment(part.content, `seg_${idx}`)}</React.Fragment>
        ),
      )}
    </div>
  );
}

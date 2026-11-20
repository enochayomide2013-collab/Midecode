import { useState } from 'react';
import { BookOpen, Check, Code2, Copy, Search } from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { DOC_ARTICLES } from '../data/docsData';

export function DocsView() {
  const { selectedDocId, openDoc, openCourse, openInIde, notify } = useMideo();
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [copied, setCopied] = useState(false);

  const categories = ['All', 'Web', 'Languages', 'Databases', 'Tools', 'Concepts'];
  const filtered = DOC_ARTICLES.filter((d) => {
    const matchCat = catFilter === 'All' || d.category === catFilter;
    const q = query.trim().toLowerCase();
    const matchQ =
      !q ||
      d.title.toLowerCase().includes(q) ||
      d.overview.toLowerCase().includes(q) ||
      d.definition.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const activeDoc = DOC_ARTICLES.find((d) => d.id === selectedDocId) || filtered[0] || DOC_ARTICLES[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeDoc.exampleCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify('error', 'Clipboard copy blocked by browser permissions.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Mideo Docs</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Verified syntax references, parameters, pitfalls, and live examples linked to Academy and IDE.
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documentation..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
              catFilter === cat
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-4 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-500 p-3">No matching documentation topics.</p>
          ) : (
            filtered.map((doc) => (
              <button
                key={doc.id}
                onClick={() => openDoc(doc.id)}
                className={`w-full px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                  doc.id === activeDoc.id
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-xs font-semibold">{doc.title}</div>
                <div className={`text-[11px] mt-0.5 ${doc.id === activeDoc.id ? 'text-blue-100' : 'text-slate-500'}`}>
                  {doc.category} · {doc.version}
                </div>
              </button>
            ))
          )}
        </aside>

        <article className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              {activeDoc.category} · {activeDoc.version}
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{activeDoc.title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">{activeDoc.overview}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Definition</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{activeDoc.definition}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Syntax</h3>
            <pre className="p-4 rounded-lg bg-[#0B1020] text-slate-100 font-mono text-xs overflow-x-auto">
              {activeDoc.syntax}
            </pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Key Parameters</h3>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                {activeDoc.parameters.map((p) => (
                  <li key={p.name}>
                    <code className="font-mono text-blue-600 dark:text-blue-400">{p.name}</code> ({p.type}): {p.description}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Return Value / Behavior</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{activeDoc.returnValue}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold">Runnable Example ({activeDoc.exampleLanguage})</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() =>
                    openInIde({
                      title: `Doc: ${activeDoc.title}`,
                      language: activeDoc.exampleLanguage === 'python' ? 'python' : activeDoc.exampleLanguage === 'html' ? 'web' : 'javascript',
                      files: [
                        {
                          name:
                            activeDoc.exampleLanguage === 'python'
                              ? 'example.py'
                              : activeDoc.exampleLanguage === 'html'
                                ? 'index.html'
                                : activeDoc.exampleLanguage === 'css'
                                  ? 'styles.css'
                                  : activeDoc.exampleLanguage === 'sql'
                                    ? 'query.sql'
                                    : 'example.js',
                          folder: '',
                          language: activeDoc.exampleLanguage,
                          content: activeDoc.exampleCode,
                        },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 text-white text-xs font-medium cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  Open in IDE
                </button>
                {activeDoc.relatedCourseId && (
                  <button
                    onClick={() => openCourse(activeDoc.relatedCourseId!)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Lesson
                  </button>
                )}
              </div>
            </div>
            <pre className="p-4 bg-[#0B1020] text-slate-100 font-mono text-xs overflow-x-auto">
              {activeDoc.exampleCode}
            </pre>
            <div className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
              <strong>Expected Output: </strong>
              <span className="font-mono">{activeDoc.expectedOutput}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Common Mistakes</h3>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                {activeDoc.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Best Practices</h3>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                {activeDoc.bestPractices.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          </div>

          {activeDoc.relatedIds.length > 0 && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Related topics:</span>
              {activeDoc.relatedIds.map((rid) => {
                const rel = DOC_ARTICLES.find((x) => x.id === rid);
                return rel ? (
                  <button
                    key={rid}
                    onClick={() => openDoc(rid)}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {rel.title}
                  </button>
                ) : null;
              })}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

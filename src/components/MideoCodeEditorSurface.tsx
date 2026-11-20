import React, { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  FilePlus,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { getIdTokenHeader } from '../services/authService';
import type { UserSettings } from '../types/mideocode';

export interface EditorSurfaceFile {
  id: string;
  name: string;
  folder: string;
  language: string;
  content: string;
  readOnly?: boolean;
}

export type EditorSyncStatus = 'synced' | 'dirty' | 'saving' | 'offline' | 'failed' | 'conflict';

interface MideoCodeEditorSurfaceProps {
  files: EditorSurfaceFile[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onChangeFileContent: (fileId: string, nextContent: string) => void;
  onAddFile?: (name: string, language: string) => Promise<void> | void;
  onRenameFile?: (fileId: string, nextName: string) => Promise<void> | void;
  onDeleteFile?: (fileId: string) => Promise<void> | void;
  onSave?: () => Promise<void> | void;
  syncStatus?: EditorSyncStatus;
  syncLabel?: string;
  settings?: UserSettings | null;
  readOnly?: boolean;
  showPreview?: boolean;
  compactLayout?: boolean;
  onConsoleErrorChange?: (latestError: string) => void;
  extraToolbarActions?: React.ReactNode;
}

export function inferLanguageFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'py') return 'python';
  if (ext === 'sql') return 'sql';
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'json') return 'json';
  return 'javascript';
}

export function MideoCodeEditorSurface({
  files,
  activeFileId,
  onSelectFile,
  onChangeFileContent,
  onAddFile,
  onRenameFile,
  onDeleteFile,
  onSave,
  syncStatus = 'synced',
  syncLabel,
  settings,
  readOnly = false,
  showPreview = true,
  compactLayout = false,
  onConsoleErrorChange,
  extraToolbarActions,
}: MideoCodeEditorSurfaceProps) {
  const [openFileIds, setOpenFileIds] = useState<string[]>(() => (activeFileId ? [activeFileId] : []));
  const [dirtyIds, setDirtyIds] = useState<Record<string, boolean>>({});
  const [fileSearch, setFileSearch] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [runningServer, setRunningServer] = useState(false);

  const [newFileModal, setNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EditorSurfaceFile | null>(null);

  useEffect(() => {
    if (activeFileId && !openFileIds.includes(activeFileId)) {
      setOpenFileIds((prev) => [...prev, activeFileId]);
    }
  }, [activeFileId, openFileIds]);

  useEffect(() => {
    if (syncStatus === 'synced') {
      setDirtyIds({});
    }
  }, [syncStatus]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.__mideoConsole) {
        const line = String(e.data.text);
        setConsoleLogs((prev) => [...prev.slice(-80), line]);
        if ((line.includes('[runtime error]') || line.includes('[error]')) && onConsoleErrorChange) {
          onConsoleErrorChange(line);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onConsoleErrorChange]);

  const activeFile = files.find((f) => f.id === activeFileId) || files[0] || null;

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, fileSearch]);

  const editorExtensions = useMemo(() => {
    const lang = activeFile?.language || 'javascript';
    if (lang === 'html') return [html()];
    if (lang === 'css') return [css()];
    if (lang === 'python' || lang === 'py') return [python()];
    if (lang === 'sql') return [sql()];
    return [javascript({ jsx: true, typescript: lang === 'typescript' })];
  }, [activeFile?.language]);

  const buildPreviewSrcDoc = useMemo(() => {
    const htmlFile = files.find((f) => f.name.toLowerCase().endsWith('.html'));
    const cssFiles = files.filter((f) => f.name.toLowerCase().endsWith('.css'));
    const jsFiles = files.filter((f) => f.name.toLowerCase().endsWith('.js'));

    const rawHtml = htmlFile ? htmlFile.content : '<div id="app" style="padding:16px;font-family:system-ui,sans-serif;color:#64748b;">No HTML file in workspace. Use Run to execute JavaScript or Python.</div>';
    const cssText = cssFiles.map((f) => f.content).join('\n');
    const jsText = jsFiles.map((f) => f.content).join('\n');

    const consoleBridge = `<script>
      (function(){
        function send(prefix, args){
          try {
            parent.postMessage({ __mideoConsole: true, text: prefix + Array.from(args).map(function(a){ return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ') }, '*');
          } catch(e){}
        }
        var origLog = console.log, origErr = console.error, origWarn = console.warn;
        console.log = function(){ send('', arguments); origLog.apply(console, arguments); };
        console.warn = function(){ send('[warn] ', arguments); origWarn.apply(console, arguments); };
        console.error = function(){ send('[error] ', arguments); origErr.apply(console, arguments); };
        window.onerror = function(msg, src, line){ send('[runtime error] ', [msg + ' (line ' + line + ')']); };
      })();
    <\/script>`;

    if (rawHtml.includes('</head>') && rawHtml.includes('</body>')) {
      return rawHtml
        .replace('</head>', `${consoleBridge}<style>${cssText}</style></head>`)
        .replace('</body>', `<script>${jsText}<\/script></body>`);
    }
    return `<!DOCTYPE html><html><head>${consoleBridge}<style>${cssText}</style></head><body>${rawHtml}<script>${jsText}<\/script></body></html>`;
  }, [files, previewNonce]);

  const handleRunCode = async () => {
    if (!activeFile) return;
    const lang = activeFile.language;
    if (lang !== 'javascript' && lang !== 'python') {
      setPreviewNonce((n) => n + 1);
      setConsoleLogs((prev) => [...prev, `Live preview refreshed for ${activeFile.name}.`]);
      return;
    }

    setRunningServer(true);
    try {
      const headers = await getIdTokenHeader();
      const res = await fetch('/api/ide/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ language: lang, code: activeFile.content }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = `[error] ${data.error || 'Execution failed'}`;
        setConsoleLogs((prev) => [...prev, msg]);
        onConsoleErrorChange?.(msg);
        return;
      }
      const outLines: string[] = [];
      if (data.stdout) outLines.push(String(data.stdout).trimEnd());
      if (data.returnValue && !data.stdout) outLines.push(`=> ${data.returnValue}`);
      if (data.stderr) {
        const errTxt = `[stderr] ${String(data.stderr).trimEnd()}`;
        outLines.push(errTxt);
        onConsoleErrorChange?.(errTxt);
      }
      outLines.push(`Completed in ${data.executionMs}ms`);
      setConsoleLogs((prev) => [...prev, ...outLines]);
    } catch (err) {
      const msg = `[error] ${err instanceof Error ? err.message : 'Run failed'}`;
      setConsoleLogs((prev) => [...prev, msg]);
      onConsoleErrorChange?.(msg);
    } finally {
      setRunningServer(false);
    }
  };

  const handleCreateFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddFile || !newFileName.trim()) return;
    const trimmed = newFileName.trim();
    await onAddFile(trimmed, inferLanguageFromFilename(trimmed));
    setNewFileName('');
    setNewFileModal(false);
  };

  const statusText =
    syncLabel ||
    (syncStatus === 'saving'
      ? 'Saving...'
      : syncStatus === 'dirty'
        ? 'Unsaved edits'
        : syncStatus === 'offline'
          ? 'Offline draft queued'
          : syncStatus === 'failed'
            ? 'Save failed (local backup active)'
            : syncStatus === 'conflict'
              ? 'Version conflict'
              : 'Saved');

  return (
    <div className="space-y-3">
      {/* Shared Editor Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono text-slate-600 dark:text-slate-300">{activeFile?.name || 'No file selected'}</span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span
            className={`tabular-nums ${
              syncStatus === 'failed' || syncStatus === 'conflict'
                ? 'text-amber-500 font-medium'
                : syncStatus === 'dirty' || syncStatus === 'offline'
                  ? 'text-blue-500 font-medium'
                  : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {statusText}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRunCode}
            disabled={runningServer || !activeFile}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            {activeFile?.language === 'python' || activeFile?.language === 'javascript' ? 'Run' : 'Refresh Preview'}
          </button>
          {onSave && !readOnly && (
            <button
              type="button"
              onClick={() => onSave()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          )}
          {extraToolbarActions}
        </div>
      </div>

      {/* Main Editor Grid: Explorer + Editor + Preview/Console */}
      <div className={`grid grid-cols-1 ${showPreview ? 'xl:grid-cols-12' : 'xl:grid-cols-10'} gap-3`}>
        {/* File Explorer */}
        <aside className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-2.5 flex flex-col min-h-[260px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-white">Files</span>
            {onAddFile && !readOnly && (
              <button
                type="button"
                onClick={() => setNewFileModal(true)}
                aria-label="Add file"
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <FilePlus className="w-4 h-4 text-blue-500" />
              </button>
            )}
          </div>

          <div className="relative mb-2">
            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              placeholder="Filter files..."
              className="w-full pl-6 pr-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1 flex-1 overflow-y-auto max-h-[340px]">
            {filteredFiles.map((f) => (
              <div
                key={f.id}
                className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer ${
                  f.id === activeFile?.id
                    ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
                onClick={() => {
                  onSelectFile(f.id);
                  if (!openFileIds.includes(f.id)) setOpenFileIds((prev) => [...prev, f.id]);
                }}
                onDoubleClick={() => {
                  if (onRenameFile && !readOnly) {
                    setRenamingId(f.id);
                    setRenameText(f.name);
                  }
                }}
              >
                {renamingId === f.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={async () => {
                      if (renameText.trim() && renameText !== f.name && onRenameFile) {
                        await onRenameFile(f.id, renameText.trim());
                      }
                      setRenamingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="w-full bg-slate-900 text-white px-1 rounded text-xs"
                  />
                ) : (
                  <>
                    <span className="truncate font-mono">{f.name}</span>
                    {onDeleteFile && !readOnly && files.length > 1 && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setDeleteTarget(f);
                        }}
                        aria-label={`Delete ${f.name}`}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-0.5 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            Ctrl/Cmd+F to search in code
          </p>
        </aside>

        {/* CodeMirror Editor */}
        <div
          className={`${
            showPreview ? (compactLayout ? 'xl:col-span-5' : 'xl:col-span-5') : 'xl:col-span-8'
          } rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] flex flex-col overflow-hidden`}
        >
          <div className="flex items-center gap-1 px-2 pt-1.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto bg-slate-50 dark:bg-slate-900/60">
            {openFileIds.map((id) => {
              const f = files.find((x) => x.id === id);
              if (!f) return null;
              const isDirty = Boolean(dirtyIds[f.id]);
              return (
                <div
                  key={f.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-t-lg border-b-2 whitespace-nowrap ${
                    f.id === activeFile?.id
                      ? 'border-blue-600 bg-white dark:bg-[#0D1322] text-slate-900 dark:text-white'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectFile(f.id)}
                    className="cursor-pointer"
                  >
                    {f.name}
                    {isDirty ? ' *' : ''}
                  </button>
                  {openFileIds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = openFileIds.filter((x) => x !== f.id);
                        setOpenFileIds(next);
                        if (activeFile?.id === f.id && next.length > 0) {
                          onSelectFile(next[0]);
                        }
                      }}
                      aria-label={`Close ${f.name}`}
                      className="text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex-1 min-h-[380px] overflow-auto">
            {activeFile && (
              <CodeMirror
                value={activeFile.content}
                height={compactLayout ? '420px' : '500px'}
                theme={settings?.editorTheme === 'githubLight' ? 'light' : oneDark}
                extensions={editorExtensions}
                readOnly={readOnly || Boolean(activeFile.readOnly)}
                onChange={(value) => {
                  if (readOnly || activeFile.readOnly) return;
                  setDirtyIds((prev) => ({ ...prev, [activeFile.id]: true }));
                  onChangeFileContent(activeFile.id, value);
                }}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  autocompletion: true,
                  searchKeymap: true,
                  tabSize: settings?.tabSize || 2,
                }}
                style={{ fontSize: `${settings?.editorFontSize || 14}px` }}
              />
            )}
          </div>
        </div>

        {/* Live Preview & Console */}
        {showPreview && (
          <div
            className={`${
              previewFullscreen
                ? 'fixed inset-4 z-50 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xl'
                : 'xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800'
            } bg-white dark:bg-[#0D1322] flex flex-col overflow-hidden`}
          >
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/60">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">Live Preview</span>
              <div className="flex items-center gap-1">
                {(['desktop', 'tablet', 'mobile'] as const).map((vp) => (
                  <button
                    key={vp}
                    type="button"
                    onClick={() => setViewportMode(vp)}
                    className={`px-2 py-1 rounded text-[11px] font-medium capitalize cursor-pointer ${
                      viewportMode === vp
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    {vp}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPreviewNonce((n) => n + 1)}
                  aria-label="Refresh preview"
                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFullscreen((v) => !v)}
                  aria-label={previewFullscreen ? 'Exit preview fullscreen' : 'Fullscreen preview'}
                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  {previewFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-100 dark:bg-[#070B14] flex justify-center p-2 overflow-auto min-h-[240px]">
              <iframe
                key={previewNonce}
                title="MideoCode Live Preview"
                sandbox="allow-scripts"
                srcDoc={buildPreviewSrcDoc}
                className={`bg-white rounded border border-slate-300 dark:border-slate-700 h-full min-h-[230px] transition-all ${
                  viewportMode === 'mobile'
                    ? 'w-[375px]'
                    : viewportMode === 'tablet'
                      ? 'w-[768px]'
                      : 'w-full'
                }`}
              />
            </div>

            <div className="h-36 border-t border-slate-200 dark:border-slate-800 bg-[#090D16] text-slate-200 flex flex-col">
              <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>Console Output</span>
                <button type="button" onClick={() => setConsoleLogs([])} className="hover:text-white cursor-pointer">
                  Clear
                </button>
              </div>
              <div className="flex-1 p-2.5 overflow-y-auto font-mono text-xs space-y-1">
                {consoleLogs.length === 0 ? (
                  <span className="text-slate-500">
                    Ready. Run JavaScript/Python or inspect live browser console output here.
                  </span>
                ) : (
                  consoleLogs.map((line, i) => (
                    <div
                      key={i}
                      className={`whitespace-pre-wrap ${
                        line.includes('[error]') || line.includes('[runtime error]') || line.includes('[stderr]')
                          ? 'text-red-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add File Modal */}
      {newFileModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFileSubmit}
            className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">New File</h3>
            <input
              autoFocus
              required
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="e.g. utils.js or helper.py"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewFileModal(false)} className="px-3 py-1.5 text-xs cursor-pointer">
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Create File
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete File Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete "{deleteTarget.name}"?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              This removes the file from your active workspace.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-xs cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onDeleteFile) await onDeleteFile(deleteTarget.id);
                  setOpenFileIds((prev) => prev.filter((id) => id !== deleteTarget.id));
                  setDeleteTarget(null);
                }}
                className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

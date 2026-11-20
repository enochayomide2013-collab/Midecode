import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html as htmlLang } from '@codemirror/lang-html';
import { css as cssLang } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Check,
  Code2,
  Copy,
  GitFork,
  Globe,
  Lock,
  Play,
  RotateCcw,
  Save,
  Terminal,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { PLAYGROUND_TEMPLATES } from '../data/challengesData';
import {
  listPublicPlaygrounds,
  listUserPlaygrounds,
  savePlayground,
} from '../services/dataService';
import type { PlaygroundItem } from '../types/mideocode';

export function PlaygroundView() {
  const { firebaseUser, profile, settings, openInIde, notify } = useMideo();

  const [savedList, setSavedList] = useState<PlaygroundItem[]>([]);
  const [publicList, setPublicList] = useState<PlaygroundItem[]>([]);
  const [activePgId, setActivePgId] = useState<string | undefined>(undefined);
  const [templateId, setTemplateId] = useState(PLAYGROUND_TEMPLATES[0].id);
  const [title, setTitle] = useState(PLAYGROUND_TEMPLATES[0].name);
  const [htmlCode, setHtmlCode] = useState(PLAYGROUND_TEMPLATES[0].html);
  const [cssCode, setCssCode] = useState(PLAYGROUND_TEMPLATES[0].css);
  const [jsCode, setJsCode] = useState(PLAYGROUND_TEMPLATES[0].js);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [forkedFrom, setForkedFrom] = useState<string | undefined>(undefined);

  const [activeTab, setActiveTab] = useState<'html' | 'css' | 'js'>('html');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [runNonce, setRunNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const loadPlaygrounds = async () => {
    if (!firebaseUser) return;
    try {
      const [mine, pub] = await Promise.all([
        listUserPlaygrounds(firebaseUser.uid),
        listPublicPlaygrounds(),
      ]);
      setSavedList(mine);
      setPublicList(pub.filter((p) => p.ownerId !== firebaseUser.uid));
    } catch {
      // Ignore transient read errors
    }
  };

  useEffect(() => {
    loadPlaygrounds();
  }, [firebaseUser]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data && typeof e.data === 'object' && e.data.__mideoPgLog) {
        setConsoleLogs((prev) => [...prev.slice(-49), String(e.data.message)]);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const srcDoc = useMemo(() => {
    const safeJs = jsCode.replace(/<\/script>/gi, '<\\/script>');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${cssCode}</style>
</head>
<body>
${htmlCode}
<script>
(function(){
  function send(level, args) {
    try {
      var msg = Array.prototype.slice.call(args).map(function(a){
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
      }).join(' ');
      window.parent.postMessage({ __mideoPgLog: true, message: '[' + level + '] ' + msg }, '*');
    } catch (err) {}
  }
  console.log = function(){ send('log', arguments); };
  console.warn = function(){ send('warn', arguments); };
  console.error = function(){ send('error', arguments); };
  window.onerror = function(msg){ send('error', [msg]); };
})();
</script>
<script>${safeJs}</script>
</body>
</html>`;
  }, [htmlCode, cssCode, jsCode, runNonce]);

  const applyTemplate = (tplId: string) => {
    const tpl = PLAYGROUND_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    setActivePgId(undefined);
    setForkedFrom(undefined);
    setTemplateId(tpl.id);
    setTitle(tpl.name);
    setHtmlCode(tpl.html);
    setCssCode(tpl.css);
    setJsCode(tpl.js);
    setVisibility('private');
    setConsoleLogs([]);
    setRunNonce((n) => n + 1);
  };

  const loadPlaygroundItem = (item: PlaygroundItem, asFork = false) => {
    if (asFork) {
      setActivePgId(undefined);
      setForkedFrom(item.id);
      setTitle(`${item.title} (Fork)`);
      setVisibility('private');
    } else {
      setActivePgId(item.id);
      setForkedFrom(item.forkedFrom);
      setTitle(item.title);
      setVisibility(item.visibility);
    }
    setTemplateId(item.templateId);
    setHtmlCode(item.html);
    setCssCode(item.css);
    setJsCode(item.js);
    setConsoleLogs([]);
    setRunNonce((n) => n + 1);
  };

  const handleSave = async () => {
    if (!firebaseUser || !profile) {
      notify('error', 'Sign in to save playgrounds to your cloud account.');
      return;
    }
    setSaving(true);
    try {
      const saved = await savePlayground(firebaseUser.uid, profile.displayName, {
        id: activePgId,
        title: title.trim() || 'Untitled Playground',
        templateId,
        html: htmlCode,
        css: cssCode,
        js: jsCode,
        visibility,
        forkedFrom,
      });
      setActivePgId(saved.id);
      await loadPlaygrounds();
      notify('success', `Saved playground (${saved.visibility}).`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save playground.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFullHtml = async () => {
    const combined = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<title>${title}</title>\n<style>\n${cssCode}\n</style>\n</head>\n<body>\n${htmlCode}\n<script>\n${jsCode}\n</script>\n</body>\n</html>`;
    try {
      await navigator.clipboard.writeText(combined);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      notify('info', 'Combined HTML copied to clipboard.');
    } catch {
      notify('error', 'Clipboard copy blocked by browser permissions.');
    }
  };

  const handleOpenInIde = async () => {
    await openInIde({
      title: title.trim() || 'Playground Export',
      language: 'web',
      files: [
        {
          name: 'index.html',
          folder: '',
          language: 'html',
          content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>${title}</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n${htmlCode}\n  <script src="script.js"></script>\n</body>\n</html>`,
        },
        { name: 'styles.css', folder: '', language: 'css', content: cssCode },
        { name: 'script.js', folder: '', language: 'javascript', content: jsCode },
      ],
    });
  };

  const editorTheme = settings?.editorTheme === 'githubLight' ? 'light' : oneDark;

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Playground title"
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-sm font-semibold text-slate-900 dark:text-white"
          />
          <select
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            aria-label="Starter template"
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs text-slate-700 dark:text-slate-200"
          >
            {PLAYGROUND_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                Template: {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setVisibility((v) => (v === 'private' ? 'public' : 'private'))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
            title="Playgrounds stay private unless you explicitly publish them"
          >
            {visibility === 'private' ? (
              <>
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                Private
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
                Public
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setConsoleLogs([]);
              setRunNonce((n) => n + 1);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            Run Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => applyTemplate(templateId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={handleCopyFullHtml}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            Copy HTML
          </button>
          <button
            onClick={handleOpenInIde}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs font-medium cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            Save to Mideo IDE
          </button>
        </div>
      </div>

      {/* Main Split Editor + Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] overflow-hidden flex flex-col">
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
            {(['html', 'css', 'js'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'html' ? 'index.html' : tab === 'css' ? 'styles.css' : 'script.js'}
              </button>
            ))}
          </div>

          <div className="min-h-[380px]">
            {activeTab === 'html' && (
              <CodeMirror
                value={htmlCode}
                height="380px"
                theme={editorTheme}
                extensions={[htmlLang()]}
                onChange={(val) => setHtmlCode(val)}
              />
            )}
            {activeTab === 'css' && (
              <CodeMirror
                value={cssCode}
                height="380px"
                theme={editorTheme}
                extensions={[cssLang()]}
                onChange={(val) => setCssCode(val)}
              />
            )}
            {activeTab === 'js' && (
              <CodeMirror
                value={jsCode}
                height="380px"
                theme={editorTheme}
                extensions={[javascript()]}
                onChange={(val) => setJsCode(val)}
              />
            )}
          </div>
        </div>

        {/* Sandboxed Live Output & Console */}
        <div className="lg:col-span-6 space-y-4 flex flex-col">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] overflow-hidden flex-1 flex flex-col">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">Sandboxed Live Output</span>
              <span className="font-mono">sandbox="allow-scripts"</span>
            </div>
            <iframe
              ref={iframeRef}
              key={runNonce}
              title="Mideo Playground Output"
              sandbox="allow-scripts"
              srcDoc={srcDoc}
              className="w-full h-[270px] bg-white"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-200 p-3.5">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="inline-flex items-center gap-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5" />
                Playground Console
              </span>
              <button
                onClick={() => setConsoleLogs([])}
                className="text-[11px] hover:text-white cursor-pointer"
              >
                Clear
              </button>
            </div>
            <div className="font-mono text-xs space-y-1 max-h-24 overflow-y-auto">
              {consoleLogs.length === 0 ? (
                <div className="text-slate-500">Console output from console.log() appears here.</div>
              ) : (
                consoleLogs.map((line, i) => (
                  <div key={i} className="break-all">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Saved & Community Public Playgrounds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Your Saved Playgrounds ({savedList.length})
          </h2>
          {savedList.length === 0 ? (
            <p className="text-xs text-slate-500">Save a playground above to access it anytime.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {savedList.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-500">{item.visibility}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadPlaygroundItem(item, false)}
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => loadPlaygroundItem(item, true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                    >
                      <GitFork className="w-3 h-3" />
                      Fork
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Public Community Playgrounds ({publicList.length})
          </h2>
          {publicList.length === 0 ? (
            <p className="text-xs text-slate-500">
              No public playgrounds shared yet. Set your visibility to Public to share yours.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {publicList.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-500">by {item.ownerName}</div>
                  </div>
                  <button
                    onClick={() => loadPlaygroundItem(item, true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
                  >
                    <GitFork className="w-3 h-3" />
                    Fork & Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

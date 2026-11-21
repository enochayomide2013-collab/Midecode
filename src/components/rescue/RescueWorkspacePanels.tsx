import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Code2,
  Compass,
  FileCode2,
  FileText,
  FolderGit2,
  FolderOpen,
  History,
  Info,
  LifeBuoy,
  Network,
  RefreshCw,
  ScanSearch,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UploadCloud,
  X,
} from 'lucide-react';
import type {
  Project,
  ProjectFile,
  RescueAppliedFixRecord,
  RescueCustomScanConfig,
  RescueInternalTab,
  RescueInvestigationRecord,
  RescueIssue,
  RescueIssueCategory,
  RescueProjectIndex,
  RescueScanReport,
} from '../../types/mideocode';
import { formatMediaBytes } from '../../services/rescueService';

export const ALL_RESCUE_CATEGORIES: { id: RescueIssueCategory; label: string }[] = [
  { id: 'syntax', label: 'Syntax Errors' },
  { id: 'type', label: 'Type Errors' },
  { id: 'runtime', label: 'Runtime Risks' },
  { id: 'import', label: 'Broken Imports' },
  { id: 'dependency', label: 'Dependencies' },
  { id: 'config', label: 'Configuration' },
  { id: 'api_integration', label: 'API Integration' },
  { id: 'database', label: 'Database' },
  { id: 'auth', label: 'Authentication' },
  { id: 'security', label: 'Security' },
  { id: 'performance', label: 'Performance' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'documentation', label: 'Documentation' },
];

function getFileDisplayPath(f: { folder?: string; name: string }): string {
  return f.folder ? `${f.folder.replace(/^\/+|\/+$/g, '')}/${f.name}` : f.name;
}

// ---------------------------------------------------------------------------
// 1. Welcome Dashboard & Empty State
// ---------------------------------------------------------------------------
export function RescueWelcomeScreen({
  accessibleProjects,
  scanHistory,
  investigationHistory,
  fixHistory,
  onOpenImportModal,
  onSelectProject,
  onOpenTab,
}: {
  accessibleProjects: Project[];
  scanHistory: RescueScanReport[];
  investigationHistory: RescueInvestigationRecord[];
  fixHistory: RescueAppliedFixRecord[];
  onOpenImportModal: (mode?: 'zip' | 'folder' | 'files' | 'git') => void;
  onSelectProject: (projectId: string, targetTab?: RescueInternalTab) => void;
  onOpenTab: (tab: RescueInternalTab) => void;
}) {
  const unresolvedProjectIds = useMemo(() => {
    const ids = new Set<string>();
    const latestByProj = new Map<string, RescueScanReport>();
    for (const s of scanHistory) {
      if (!latestByProj.has(s.projectId)) latestByProj.set(s.projectId, s);
    }
    for (const [pid, rep] of latestByProj.entries()) {
      if (rep.confirmedCount > 0 || rep.severityCounts.critical > 0 || rep.severityCounts.high > 0) {
        ids.add(pid);
      }
    }
    return ids;
  }, [scanHistory]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <LifeBuoy className="w-4 h-4" />
              MideoCode Project Rescue AI
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Understand your project, discover what&apos;s broken, investigate errors and repair your code with intelligent AI assistance.
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Import any coding workspace via ZIP archive, local folder, individual files, or GitHub repository. Project Rescue AI inspects real files, builds dependency &amp; documentation intelligence, traces root causes, and verifies fixes safely.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenImportModal('zip')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              Import New Project
            </button>
            {accessibleProjects.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectProject(accessibleProjects[0].id, 'overview')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-blue-500 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4 text-emerald-500" />
                Continue Previous Project
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (accessibleProjects.length > 0) {
                  onSelectProject(accessibleProjects[0].id, 'history');
                } else {
                  onOpenTab('history');
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-blue-500 cursor-pointer"
            >
              <History className="w-4 h-4 text-violet-500" />
              View Recent Investigations ({investigationHistory.length})
            </button>
          </div>
        </div>

        {/* Account KPI Strip (Real account records only) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
            <div className="text-[11px] text-slate-500">Workspace Projects</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {accessibleProjects.length}
            </div>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
            <div className="text-[11px] text-slate-500">Recent Scans</div>
            <div className="text-xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1">
              {scanHistory.length}
            </div>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
            <div className="text-[11px] text-slate-500">Saved Investigations</div>
            <div className="text-xl font-bold font-mono tabular-nums text-violet-600 dark:text-violet-400 mt-1">
              {investigationHistory.length}
            </div>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
            <div className="text-[11px] text-slate-500">Applied Fixes</div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
              {fixHistory.filter((f) => f.status === 'applied').length}
            </div>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
            <div className="text-[11px] text-slate-500">With Unresolved Issues</div>
            <div className="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
              {unresolvedProjectIds.size}
            </div>
          </div>
        </div>
      </div>

      {accessibleProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] p-12 text-center space-y-4">
          <FolderGit2 className="w-10 h-10 text-blue-500 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Your project workspace is ready.
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Import a coding project to begin understanding, scanning and repairing your code.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenImportModal('zip')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              Import Project
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recently Opened Projects */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Continue Previous Project
            </h3>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {accessibleProjects.slice(0, 6).map((proj) => {
                const latestScan = scanHistory.find((s) => s.projectId === proj.id);
                const hasUnresolved = unresolvedProjectIds.has(proj.id);
                return (
                  <div key={proj.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {proj.title}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">
                          {proj.language} · v{proj.version}
                        </span>
                        {hasUnresolved && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                            Needs Attention
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {latestScan
                          ? `Last scan: ${latestScan.healthScore}/100 · ${latestScan.confirmedCount} confirmed issues`
                          : proj.description || 'Not scanned yet'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectProject(proj.id, 'overview')}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Investigations */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Recent Investigations
            </h3>
            {investigationHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No saved root-cause investigations yet. Run a scan or investigate an error to record your findings.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {investigationHistory.slice(0, 6).map((inv) => (
                  <div key={inv.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {inv.problemTitle}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-[10px]">
                          {inv.confidence}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                        {inv.projectTitle} · {inv.responsibleFile}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectProject(inv.projectId, 'history')}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium shrink-0 cursor-pointer"
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Interactive Project File Explorer Tab
// ---------------------------------------------------------------------------
export function RescueFilesTab({
  files,
  activeReport,
  projectIssues,
  fingerprintStale,
  onInvestigateIssue,
  onProposeFixForFile,
  onRefreshProject,
  onTriggerScan,
}: {
  files: ProjectFile[];
  activeReport: RescueScanReport | null;
  projectIssues: RescueIssue[];
  fingerprintStale: boolean;
  onInvestigateIssue: (issue: RescueIssue) => void;
  onProposeFixForFile: (filePath: string, desc: string) => void;
  onRefreshProject: () => void;
  onTriggerScan: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [selectedPath, setSelectedPath] = useState<string>(() =>
    files[0] ? getFileDisplayPath(files[0]) : '',
  );
  const [viewMode, setViewMode] = useState<'preview' | 'analysis'>('preview');

  const languages = useMemo(
    () => Array.from(new Set(files.map((f) => f.language))).sort(),
    [files],
  );

  const issueCountByPath = useMemo(() => {
    const map = new Map<string, RescueIssue[]>();
    for (const iss of projectIssues) {
      const list = map.get(iss.filePath) || [];
      list.push(iss);
      map.set(iss.filePath, list);
    }
    return map;
  }, [projectIssues]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return files.filter((f) => {
      if (langFilter !== 'all' && f.language !== langFilter) return false;
      if (!q) return true;
      const p = getFileDisplayPath(f).toLowerCase();
      return p.includes(q) || (f.content || '').toLowerCase().includes(q);
    });
  }, [files, langFilter, searchQuery]);

  const activeFile =
    files.find((f) => getFileDisplayPath(f) === selectedPath) || filteredFiles[0] || files[0] || null;
  const activePath = activeFile ? getFileDisplayPath(activeFile) : '';
  const activeSummary = activeReport?.projectIndex.files.find((s) => s.path === activePath);
  const activeFileIssues = activePath ? issueCountByPath.get(activePath) || [] : [];
  const excludedSet = new Set(activeReport?.excludedPaths || []);

  const lines = useMemo(() => (activeFile?.content || '').split('\n'), [activeFile?.content]);

  return (
    <div className="space-y-4">
      {fingerprintStale && (
        <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Workspace files changed since the last scan. Existing scan metrics may be outdated.
            </span>
          </div>
          <button
            type="button"
            onClick={onTriggerScan}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer"
          >
            Re-Scan Updated Files
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Explorer List */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Project Files ({filteredFiles.length}/{files.length})
            </h2>
            <button
              type="button"
              onClick={onRefreshProject}
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search filenames or code..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-xs"
              />
            </div>
            <select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              aria-label="Filter files by language"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-xs"
            >
              <option value="all">All Languages ({files.length})</option>
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
            {filteredFiles.map((file) => {
              const p = getFileDisplayPath(file);
              const fileIssues = issueCountByPath.get(p) || [];
              const isSelected = p === activePath;
              const isExcluded = Array.from(excludedSet).some(
                (ex) => p === ex || p.startsWith(`${ex}/`),
              );
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setSelectedPath(p)}
                  className={`w-full text-left py-2.5 px-2.5 rounded-lg transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/15 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-medium truncate">{p}</div>
                    <div className="text-[10px] text-slate-500">
                      {file.language} · {formatMediaBytes(file.content?.length || 0)}
                      {isExcluded ? ' · Excluded' : activeReport ? ' · Analyzed' : ' · Not Analyzed'}
                    </div>
                  </div>
                  {fileIssues.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-mono font-bold shrink-0">
                      {fileIssues.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* File Preview & File Analysis */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] overflow-hidden">
          {!activeFile ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Select a file to inspect source code and relationships.
            </div>
          ) : (
            <>
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-sm font-mono font-bold text-slate-900 dark:text-white truncate">
                      {activePath}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono uppercase">
                      {activeFile.language}
                    </span>
                    {activeSummary?.role && (
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-mono">
                        {activeSummary.role}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                    {lines.length} lines · {formatMediaBytes(activeFile.content.length)} ·{' '}
                    {activeFileIssues.length} detected issue{activeFileIssues.length === 1 ? '' : 's'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setViewMode('preview')}
                      className={`px-3 py-1 cursor-pointer ${
                        viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Source Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('analysis')}
                      className={`px-3 py-1 cursor-pointer ${
                        viewMode === 'analysis' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      File Analysis ({activeFileIssues.length})
                    </button>
                  </div>
                </div>
              </div>

              {viewMode === 'preview' ? (
                <div className="max-h-[500px] overflow-auto bg-slate-950 text-slate-200 font-mono text-[11px] leading-5 p-3">
                  {lines.slice(0, 600).map((ln, idx) => (
                    <div key={idx} className="flex items-start hover:bg-slate-900/80 px-2">
                      <span className="w-10 shrink-0 text-right pr-3 text-slate-500 select-none tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="whitespace-pre-wrap break-all flex-1">{ln || ' '}</span>
                    </div>
                  ))}
                  {lines.length > 600 && (
                    <div className="p-3 text-center text-slate-400">
                      Preview truncated at 600 lines ({lines.length} total lines).
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 space-y-4 text-xs">
                  {activeSummary ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17]">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Imports: </span>
                        <span className="font-mono text-slate-500">
                          {activeSummary.imports.length > 0 ? activeSummary.imports.join(', ') : 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Imported By: </span>
                        <span className="font-mono text-slate-500">
                          {activeSummary.importedBy.length > 0 ? activeSummary.importedBy.join(', ') : 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Exports: </span>
                        <span className="font-mono text-slate-500">
                          {activeSummary.exports.length > 0 ? activeSummary.exports.join(', ') : 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">API Calls / Routes: </span>
                        <span className="font-mono text-slate-500">
                          {[...activeSummary.apiCalls, ...activeSummary.apiRoutes].join(', ') || 'None'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500">
                      Run a project scan to compute imports, exports, and dependency graph metadata for this file.
                    </p>
                  )}

                  {activeFileIssues.length === 0 ? (
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {activeReport
                          ? 'No issues detected inside this file during the latest scan.'
                          : 'Not yet scanned. Click Scan Project to analyze this file.'}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {activeFileIssues.map((iss) => (
                        <div
                          key={iss.id}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {iss.title} {iss.line ? `(Line ${iss.line})` : ''}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onInvestigateIssue(iss)}
                                className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:border-blue-500 font-medium cursor-pointer"
                              >
                                Investigate
                              </button>
                              <button
                                type="button"
                                onClick={() => onProposeFixForFile(iss.filePath, `${iss.title}: ${iss.summary}`)}
                                className="px-2.5 py-1 rounded-md bg-blue-600 text-white font-semibold cursor-pointer"
                              >
                                Propose Fix
                              </button>
                            </div>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">{iss.developerExplanation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Project Intelligence Tab
// ---------------------------------------------------------------------------
export function RescueIntelligenceTab({
  projectIndex,
  onTriggerScan,
}: {
  projectIndex?: RescueProjectIndex | null;
  onTriggerScan: () => void;
}) {
  if (!projectIndex) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-10 text-center space-y-3">
        <Network className="w-8 h-8 text-blue-500 mx-auto" />
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          Project Intelligence Not Built Yet
        </h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Run Deep Scan or Full Project Scan to map frameworks, entry points, module dependencies, circular imports, and API connections.
        </p>
        <button
          type="button"
          onClick={onTriggerScan}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
        >
          Run Project Scan
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-2">
          <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-blue-500" />
            Detected Frameworks &amp; Stack
          </div>
          <div className="flex flex-wrap gap-1.5">
            {projectIndex.frameworksDetected.length > 0 ? (
              projectIndex.frameworksDetected.map((fw) => (
                <span key={fw} className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-mono">
                  {fw}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">Standard language workspace</span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-2">
          <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-500" />
            Entry Points ({projectIndex.entryPoints.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {projectIndex.entryPoints.length > 0 ? (
              projectIndex.entryPoints.map((ep) => (
                <span key={ep} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono">
                  {ep}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">No standard entrypoint detected</span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-2">
          <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Code2 className="w-4 h-4 text-violet-500" />
            Declared Dependencies ({projectIndex.packageDependencies.length})
          </div>
          <div className="max-h-20 overflow-y-auto flex flex-wrap gap-1">
            {projectIndex.packageDependencies.slice(0, 30).map((dep) => (
              <span key={dep} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                {dep}
              </span>
            ))}
            {projectIndex.packageDependencies.length === 0 && (
              <span className="text-xs text-slate-500">No package manifest dependencies</span>
            )}
          </div>
        </div>
      </div>

      {/* File Relationship Matrix */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Module Relationship &amp; Role Map
        </h3>
        <div className="overflow-x-auto max-h-[380px]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-2 pr-3 font-medium">File</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Imports From</th>
                <th className="py-2 font-medium">Referenced By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {projectIndex.files.map((f) => (
                <tr key={f.path}>
                  <td className="py-2 pr-3 font-mono font-semibold text-slate-900 dark:text-white">{f.path}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-blue-500">{f.role || 'module'}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-slate-500">
                    {f.imports.slice(0, 4).join(', ') || '—'}
                  </td>
                  <td className="py-2 font-mono text-[11px] text-slate-500">
                    {f.importedBy.slice(0, 4).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unreferenced Files & Circular Dependencies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-2">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white">
            Circular Dependency Cycles ({projectIndex.circularDependencies.length})
          </h3>
          {projectIndex.circularDependencies.length === 0 ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">No circular import cycles detected.</p>
          ) : (
            <div className="space-y-1">
              {projectIndex.circularDependencies.map((cyc, idx) => (
                <p key={idx} className="text-xs font-mono text-amber-600 dark:text-amber-400">
                  {cyc.join(' → ')}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] space-y-2">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white">
            Unreferenced Source Files ({projectIndex.unreferencedFiles.length})
          </h3>
          {projectIndex.unreferencedFiles.length === 0 ? (
            <p className="text-xs text-slate-500">All module files are connected.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {projectIndex.unreferencedFiles.map((uf) => (
                <span key={uf} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
                  {uf}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Documentation Analysis Tab
// ---------------------------------------------------------------------------
export function RescueDocumentationTab({
  activeReport,
  onTriggerScan,
}: {
  activeReport: RescueScanReport | null;
  onTriggerScan: () => void;
}) {
  const docReport = activeReport?.documentationReport;

  if (!activeReport) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-10 text-center space-y-3">
        <BookOpen className="w-8 h-8 text-blue-500 mx-auto" />
        <p className="text-sm font-bold text-slate-900 dark:text-white">No Documentation Scan Available</p>
        <p className="text-xs text-slate-500">Run a scan to inspect README, API docs, setup scripts, and compare documentation against implementation.</p>
        <button
          type="button"
          onClick={onTriggerScan}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
        >
          Scan Documentation &amp; Project
        </button>
      </div>
    );
  }

  if (!docReport || docReport.docFiles.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-8 space-y-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
          <FileText className="w-4 h-4 text-amber-500" />
          No Project Documentation Files Detected
        </div>
        <p className="text-slate-500">
          Adding a <code className="font-mono">README.md</code> or architecture notes helps Project Rescue AI understand expected endpoints, setup steps, and intended behavior.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-500" />
          Documentation Understanding Report ({docReport.docFiles.length} doc files)
        </h2>
        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          {docReport.purposeSummary}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">Setup / CLI Instructions Found</h3>
            {docReport.setupInstructions.length === 0 ? (
              <p className="text-slate-500">No explicit setup commands extracted.</p>
            ) : (
              <ul className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                {docReport.setupInstructions.map((s, idx) => (
                  <li key={idx}>$ {s}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">Documented API Endpoints &amp; Paths</h3>
            <div className="flex flex-wrap gap-1.5">
              {docReport.documentedEndpoints.map((ep) => (
                <span key={ep} className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-[11px]">
                  {ep}
                </span>
              ))}
              {docReport.referencedPaths.map((rp) => (
                <span key={rp} className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[11px]">
                  {rp}
                </span>
              ))}
              {docReport.documentedEndpoints.length === 0 && docReport.referencedPaths.length === 0 && (
                <span className="text-slate-500">None referenced explicitly.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Documentation vs Implementation Discrepancies */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          Documentation vs Implementation Verification ({docReport.discrepancies.length})
        </h3>
        {docReport.discrepancies.length === 0 ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            No missing documented routes, scripts, or file references detected.
          </p>
        ) : (
          <div className="space-y-2">
            {docReport.discrepancies.map((d, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs space-y-1"
              >
                <div className="flex items-center gap-2 font-mono text-[11px] text-amber-700 dark:text-amber-300">
                  <span className="uppercase font-bold">{d.kind.replace(/_/g, ' ')}</span>
                  <span>·</span>
                  <span>{d.docFile}</span>
                  <span>→</span>
                  <span className="font-bold">{d.target}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-200">{d.details}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Discovered Doc Files */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Documentation Inventory</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {docReport.docFiles.map((df) => (
            <div key={df.path} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-slate-900 dark:text-white">{df.path}</span>
                <span className="text-[11px] text-slate-500">{df.wordCount} words</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 line-clamp-3">{df.excerpt}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Settings & Custom Scan Modal
// ---------------------------------------------------------------------------
export function RescueSettingsTab({
  customConfig,
  onChangeCustomConfig,
  explanationLevel,
  onChangeExplanationLevel,
  onRunCustomScan,
}: {
  customConfig: RescueCustomScanConfig;
  onChangeCustomConfig: (next: RescueCustomScanConfig) => void;
  explanationLevel: 'beginner' | 'developer';
  onChangeExplanationLevel: (next: 'beginner' | 'developer') => void;
  onRunCustomScan: () => void;
}) {
  const [excludeInput, setExcludeInput] = useState('');

  const toggleCheck = (cat: RescueIssueCategory) => {
    const exists = customConfig.checks.includes(cat);
    const nextChecks = exists
      ? customConfig.checks.filter((c) => c !== cat)
      : [...customConfig.checks, cat];
    onChangeCustomConfig({ ...customConfig, checks: nextChecks });
  };

  const addExcluded = () => {
    const clean = excludeInput.trim().replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    if (!customConfig.excludedPaths.includes(clean)) {
      onChangeCustomConfig({
        ...customConfig,
        excludedPaths: [...customConfig.excludedPaths, clean],
      });
    }
    setExcludeInput('');
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-500" />
            Rescue Scan Configuration &amp; Preferences
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Customize diagnostic categories, excluded folders/files, and default explanation depth.
          </p>
        </div>
        <button
          type="button"
          onClick={onRunCustomScan}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
        >
          <ScanSearch className="w-3.5 h-3.5" />
          Run Custom Scan Now
        </button>
      </div>

      {/* Default Explanation Level */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">Default Explanation Level</div>
          <div className="text-slate-500">Switch between Beginner plain-English guidance and Technical Developer notes.</div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => onChangeExplanationLevel('beginner')}
            className={`px-3 py-1.5 cursor-pointer ${
              explanationLevel === 'beginner' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900'
            }`}
          >
            Beginner Mode
          </button>
          <button
            type="button"
            onClick={() => onChangeExplanationLevel('developer')}
            className={`px-3 py-1.5 cursor-pointer ${
              explanationLevel === 'developer' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900'
            }`}
          >
            Developer Mode
          </button>
        </div>
      </div>

      {/* Diagnostic Categories */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
            Custom Scan Diagnostic Categories ({customConfig.checks.length}/{ALL_RESCUE_CATEGORIES.length})
          </h3>
          <button
            type="button"
            onClick={() =>
              onChangeCustomConfig({
                ...customConfig,
                checks: ALL_RESCUE_CATEGORIES.map((c) => c.id),
              })
            }
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Enable All
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {ALL_RESCUE_CATEGORIES.map((cat) => {
            const checked = customConfig.checks.includes(cat.id);
            return (
              <label
                key={cat.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer ${
                  checked
                    ? 'border-blue-500/50 bg-blue-500/10 text-slate-900 dark:text-white font-medium'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCheck(cat.id)}
                />
                <span>{cat.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Excluded Paths */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
          Excluded Files or Folders
        </h3>
        <div className="flex gap-2">
          <input
            value={excludeInput}
            onChange={(e) => setExcludeInput(e.target.value)}
            placeholder="e.g. legacy/ or mock-data.ts"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono"
          />
          <button
            type="button"
            onClick={addExcluded}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
          >
            Exclude Path
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {customConfig.excludedPaths.length === 0 ? (
            <span className="text-xs text-slate-500">No custom path exclusions configured.</span>
          ) : (
            customConfig.excludedPaths.map((ep) => (
              <span
                key={ep}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-xs"
              >
                {ep}
                <button
                  type="button"
                  onClick={() =>
                    onChangeCustomConfig({
                      ...customConfig,
                      excludedPaths: customConfig.excludedPaths.filter((p) => p !== ep),
                    })
                  }
                  className="text-slate-400 hover:text-red-500 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Transparent Health Score Formula Info */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-xs space-y-1">
        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-500" />
          Health Score Calculation Methodology
        </div>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          Starts at 100 and deducts weighted penalties exclusively from verified findings: Critical (-18 pts), High (-10 pts), Medium (-5 pts), Low (-2 pts), and Suggestions (-0.5 pts, capped). Confidence &amp; certainty are preserved separately so unverified hypotheses never inflate critical counts.
        </p>
      </div>
    </div>
  );
}

export function RescueCustomScanModal({
  open,
  customConfig,
  onChangeCustomConfig,
  onClose,
  onStartCustomScan,
}: {
  open: boolean;
  customConfig: RescueCustomScanConfig;
  onChangeCustomConfig: (next: RescueCustomScanConfig) => void;
  onClose: () => void;
  onStartCustomScan: () => void;
}) {
  const [excludeInput, setExcludeInput] = useState('');
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-500" />
            Configure Custom Project Scan
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
          {ALL_RESCUE_CATEGORIES.map((cat) => {
            const checked = customConfig.checks.includes(cat.id);
            return (
              <label
                key={cat.id}
                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? customConfig.checks.filter((c) => c !== cat.id)
                      : [...customConfig.checks, cat.id];
                    onChangeCustomConfig({ ...customConfig, checks: next });
                  }}
                />
                <span>{cat.label}</span>
              </label>
            );
          })}
        </div>

        <div className="space-y-2 text-xs">
          <label className="block font-medium text-slate-700 dark:text-slate-300">
            Exclude Folder / File Pattern
          </label>
          <div className="flex gap-2">
            <input
              value={excludeInput}
              onChange={(e) => setExcludeInput(e.target.value)}
              placeholder="e.g. docs/legacy or test.fixture.js"
              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
            />
            <button
              type="button"
              onClick={() => {
                const clean = excludeInput.trim();
                if (clean && !customConfig.excludedPaths.includes(clean)) {
                  onChangeCustomConfig({
                    ...customConfig,
                    excludedPaths: [...customConfig.excludedPaths, clean],
                  });
                }
                setExcludeInput('');
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-medium cursor-pointer"
            >
              Add
            </button>
          </div>
          {customConfig.excludedPaths.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customConfig.excludedPaths.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
                  {p}
                  <button
                    type="button"
                    onClick={() =>
                      onChangeCustomConfig({
                        ...customConfig,
                        excludedPaths: customConfig.excludedPaths.filter((x) => x !== p),
                      })
                    }
                    className="cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onStartCustomScan();
            }}
            disabled={customConfig.checks.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
          >
            <ScanSearch className="w-3.5 h-3.5" />
            Start Custom Scan
          </button>
        </div>
      </div>
    </div>
  );
}

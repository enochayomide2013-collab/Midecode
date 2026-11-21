import React, { useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  FileCode2,
  FolderGit2,
  FolderUp,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  RESCUE_IMPORT_ACCEPT,
  formatMediaBytes,
  importGitRepoViaApi,
  importZipArchiveViaApi,
  type ImportedFileInput,
  type NormalizedImportedFile,
} from '../../services/rescueService';
import type { RescueImportSummary, RescueZipRootCandidate } from '../../types/mideocode';

export type RescueImportModalMode = 'zip' | 'folder' | 'files' | 'git';

interface RescueImportModalProps {
  open: boolean;
  initialMode?: RescueImportModalMode;
  hasActiveProject: boolean;
  activeProjectTitle?: string;
  canModifyProject: boolean;
  defaultTargetMode: 'new' | 'current';
  isRefreshMode?: boolean;
  onClose: () => void;
  onCompleteRawEntries: (
    entries: ImportedFileInput[],
    sourceType: 'folder' | 'files',
    targetMode: 'new' | 'current',
    isRefresh: boolean,
  ) => Promise<void>;
  onCompleteNormalizedFiles: (input: {
    files: NormalizedImportedFile[];
    summary: RescueImportSummary;
    targetMode: 'new' | 'current';
    isRefresh: boolean;
  }) => Promise<void>;
}

export function RescueImportModal({
  open,
  initialMode = 'zip',
  hasActiveProject,
  activeProjectTitle,
  canModifyProject,
  defaultTargetMode,
  isRefreshMode = false,
  onClose,
  onCompleteRawEntries,
  onCompleteNormalizedFiles,
}: RescueImportModalProps) {
  const [sourceTab, setSourceTab] = useState<RescueImportModalMode>(initialMode);
  const [targetMode, setTargetMode] = useState<'new' | 'current'>(
    isRefreshMode && hasActiveProject && canModifyProject ? 'current' : defaultTargetMode,
  );
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ZIP state
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const [zipRootCandidates, setZipRootCandidates] = useState<RescueZipRootCandidate[]>([]);
  const [selectedZipRoot, setSelectedZipRoot] = useState<string>('');
  const zipInputRef = useRef<HTMLInputElement | null>(null);

  // Folder / Files state
  const [dragOver, setDragOver] = useState(false);
  const folderPickerRef = useRef<HTMLInputElement | null>(null);
  const multiFilePickerRef = useRef<HTMLInputElement | null>(null);

  // GitHub state
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [gitToken, setGitToken] = useState('');

  React.useEffect(() => {
    if (open) {
      setSourceTab(initialMode);
      setTargetMode(isRefreshMode && hasActiveProject && canModifyProject ? 'current' : defaultTargetMode);
      setErrorMsg(null);
      setZipRootCandidates([]);
    }
  }, [open, initialMode, isRefreshMode, hasActiveProject, canModifyProject, defaultTargetMode]);

  if (!open) return null;

  const effectiveTargetMode: 'new' | 'current' =
    isRefreshMode && hasActiveProject && canModifyProject
      ? 'current'
      : hasActiveProject && canModifyProject
        ? targetMode
        : 'new';

  const handleZipExtract = async (file: File, rootOverride?: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const result = await importZipArchiveViaApi(file, {
        selectedRoot: rootOverride || undefined,
        projectNameHint: file.name.replace(/\.zip$/i, ''),
      });

      if (result.requiresRootSelection && result.rootCandidates.length > 1) {
        setZipRootCandidates(result.rootCandidates);
        setSelectedZipRoot(result.rootCandidates[0]?.rootPath || '');
        setBusy(false);
        return;
      }

      if (!result.files || result.files.length === 0) {
        throw new Error(
          'No supported source files (.js, .ts, .tsx, .py, .html, .sql, .json, .md, etc.) were found in that ZIP archive.',
        );
      }

      await onCompleteNormalizedFiles({
        files: result.files,
        summary: result.summary,
        targetMode: effectiveTargetMode,
        isRefresh: isRefreshMode,
      });
      setZipRootCandidates([]);
      setSelectedZipFile(null);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ZIP inspection failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGitImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUrl.trim()) {
      setErrorMsg('Enter a valid GitHub repository URL (e.g. https://github.com/owner/repo).');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const result = await importGitRepoViaApi({
        repoUrl: gitUrl.trim(),
        branch: gitBranch.trim() || undefined,
        githubToken: gitToken.trim() || undefined,
      });
      if (!result.files || result.files.length === 0) {
        throw new Error('No supported source code files were found in this repository.');
      }
      await onCompleteNormalizedFiles({
        files: result.files,
        summary: result.summary,
        targetMode: effectiveTargetMode,
        isRefresh: isRefreshMode,
      });
      setGitToken('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'GitHub repository import failed.');
    } finally {
      setBusy(false);
    }
  };

  const readFileListToEntries = async (picked: File[]): Promise<ImportedFileInput[]> => {
    const entries: ImportedFileInput[] = [];
    for (const f of picked) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const lowerRel = rel.replace(/\\/g, '/').toLowerCase();
      if (
        lowerRel.includes('/node_modules/') ||
        lowerRel.startsWith('node_modules/') ||
        lowerRel.includes('/.git/') ||
        lowerRel.startsWith('.git/') ||
        lowerRel.includes('/dist/') ||
        lowerRel.includes('/build/') ||
        lowerRel.includes('/.next/') ||
        lowerRel.includes('/__pycache__/') ||
        f.size > 250_000
      ) {
        entries.push({ relativePath: rel, sizeBytes: f.size, text: '' });
        continue;
      }
      const text = await f.text();
      entries.push({ relativePath: rel, sizeBytes: f.size, text });
    }
    return entries;
  };

  const handlePickerFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
    source: 'folder' | 'files',
  ) => {
    const fileList = e.target.files;
    e.target.value = '';
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const entries = await readFileListToEntries(Array.from(fileList));
      await onCompleteRawEntries(entries, source, effectiveTargetMode, isRefreshMode);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not import selected files.');
    } finally {
      setBusy(false);
    }
  };

  const readDroppedEntry = async (
    entry: FileSystemEntry,
    parentPath: string,
    collected: ImportedFileInput[],
  ): Promise<void> => {
    if (collected.length >= 160) return;
    const relPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const lowerSeg = entry.name.toLowerCase();
    if (
      entry.isDirectory &&
      ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '__pycache__', '.venv', 'venv', 'coverage'].includes(
        lowerSeg,
      )
    ) {
      return;
    }
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
      const text = file.size <= 250_000 ? await file.text() : '';
      collected.push({ relativePath: relPath, sizeBytes: file.size, text });
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const all: FileSystemEntry[] = [];
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch || batch.length === 0) break;
        all.push(...batch);
      }
      for (const child of all) {
        await readDroppedEntry(child, relPath, collected);
        if (collected.length >= 160) break;
      }
    }
  };

  const handleDropZone = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const collected: ImportedFileInput[] = [];
      const items = e.dataTransfer?.items ? Array.from(e.dataTransfer.items) : [];
      const entries = items
        .map((it) => (typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null))
        .filter((en): en is FileSystemEntry => en !== null);
      if (entries.length > 0) {
        for (const en of entries) {
          await readDroppedEntry(en, '', collected);
        }
      } else if (e.dataTransfer?.files?.length) {
        const raw = await readFileListToEntries(Array.from(e.dataTransfer.files));
        collected.push(...raw);
      }
      if (collected.length === 0) {
        throw new Error('No readable files were detected in the dropped folder/files.');
      }
      await onCompleteRawEntries(collected, 'folder', effectiveTargetMode, isRefreshMode);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Drag and drop import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {isRefreshMode ? (
                <>
                  <RefreshCw className="w-4 h-4 text-blue-500" />
                  Refresh Project Source Files ({activeProjectTitle})
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 text-blue-500" />
                  Import Codebase into Project Rescue AI
                </>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              node_modules, .git, dist, build, and sensitive .env files are automatically excluded for safety.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Destination Toggle (unless Refresh Mode forces current project) */}
          {!isRefreshMode && hasActiveProject && canModifyProject && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Import Destination</span>
              <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTargetMode('new')}
                  className={`px-3 py-1.5 font-medium cursor-pointer ${
                    targetMode === 'new'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  New Rescue Project
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('current')}
                  className={`px-3 py-1.5 font-medium cursor-pointer ${
                    targetMode === 'current'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Merge into &ldquo;{activeProjectTitle}&rdquo;
                </button>
              </div>
            </div>
          )}

          {/* 4-Source Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'zip', label: 'ZIP Archive', icon: Archive },
                { id: 'folder', label: 'Folder Upload', icon: FolderUp },
                { id: 'files', label: 'Individual Files', icon: FileCode2 },
                { id: 'git', label: 'GitHub Repo', icon: FolderGit2 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = sourceTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSourceTab(item.id);
                    setErrorMsg(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    active
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C17] text-slate-700 dark:text-slate-300 hover:border-blue-500'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* SOURCE 1: ZIP ARCHIVE */}
          {sourceTab === 'zip' && (
            <div className="space-y-4">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setSelectedZipFile(file);
                  setZipRootCandidates([]);
                  handleZipExtract(file);
                }}
              />

              <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C17] text-center space-y-3">
                <Archive className="w-8 h-8 text-blue-500 mx-auto" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Upload a Project ZIP Archive (max 25 MB compressed)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Protected against path traversal (ZIP-Slip), symlink escapes, encrypted entries, and decompression bombs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => zipInputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  {selectedZipFile ? `Selected: ${selectedZipFile.name} (${formatMediaBytes(selectedZipFile.size)})` : 'Choose .zip File'}
                </button>
              </div>

              {zipRootCandidates.length > 1 && selectedZipFile && (
                <div className="p-4 rounded-xl border border-blue-500/40 bg-blue-500/5 space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      Multiple Project Folders Detected Inside ZIP
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Choose which sub-project folder to inspect:
                    </p>
                  </div>
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {zipRootCandidates.map((cand) => (
                      <label
                        key={cand.rootPath || '__root'}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer ${
                          selectedZipRoot === cand.rootPath
                            ? 'border-blue-600 bg-blue-600/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="zipRootCandidate"
                            checked={selectedZipRoot === cand.rootPath}
                            onChange={() => setSelectedZipRoot(cand.rootPath)}
                          />
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {cand.rootPath || '(Archive Root)'}
                          </span>
                          {cand.hasConfigFile && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px]">
                              Config found
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-slate-500">{cand.fileCount} files</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleZipExtract(selectedZipFile, selectedZipRoot)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Extract Selected Folder
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SOURCE 2: FOLDER UPLOAD */}
          {sourceTab === 'folder' && (
            <div className="space-y-4">
              <input
                ref={folderPickerRef}
                type="file"
                // @ts-expect-error webkitdirectory is supported in Chromium/WebKit browsers
                webkitdirectory=""
                multiple
                className="hidden"
                onChange={(e) => handlePickerFiles(e, 'folder')}
              />
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDropZone}
                className={`p-8 rounded-xl border border-dashed text-center space-y-3 transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C17]'
                }`}
              >
                <FolderUp className="w-8 h-8 text-blue-500 mx-auto" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Select a Local Project Folder or Drag &amp; Drop Here
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Preserves full folder structure automatically. If your browser restricts directory picking, switch to ZIP Archive or Individual Files.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => folderPickerRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderUp className="w-4 h-4" />}
                  Browse Folder
                </button>
              </div>
            </div>
          )}

          {/* SOURCE 3: INDIVIDUAL FILES */}
          {sourceTab === 'files' && (
            <div className="space-y-4">
              <input
                ref={multiFilePickerRef}
                type="file"
                multiple
                accept={RESCUE_IMPORT_ACCEPT}
                className="hidden"
                onChange={(e) => handlePickerFiles(e, 'files')}
              />
              <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C17] text-center space-y-3">
                <FileCode2 className="w-8 h-8 text-blue-500 mx-auto" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Select One or Multiple Source Files
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Supports JS/TS/JSX/TSX, Python, HTML/CSS, SQL, JSON, YAML, TOML, Markdown, PHP, Go, Java, Rust, C/C++, C#, and config files.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => multiFilePickerRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode2 className="w-4 h-4" />}
                  Choose Source Files
                </button>
              </div>
            </div>
          )}

          {/* SOURCE 4: GITHUB REPOSITORY */}
          {sourceTab === 'git' && (
            <form onSubmit={handleGitImport} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  GitHub Repository URL
                </label>
                <input
                  type="url"
                  required
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Branch (optional)
                  </label>
                  <input
                    type="text"
                    value={gitBranch}
                    onChange={(e) => setGitBranch(e.target.value)}
                    placeholder="Defaults to main / repo default"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-500" />
                    GitHub Personal Access Token (optional)
                  </label>
                  <input
                    type="password"
                    value={gitToken}
                    onChange={(e) => setGitToken(e.target.value)}
                    placeholder="For private repos or higher rate limit"
                    autoComplete="off"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Public GitHub repositories import directly. For private repositories, provide an ephemeral Personal Access Token (used only for this download request and never stored in Firestore or browser storage).
              </p>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !gitUrl.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderGit2 className="w-4 h-4" />}
                  {busy ? 'Downloading & Inspecting...' : 'Import Repository'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

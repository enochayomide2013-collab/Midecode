import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  FileDiff,
  GitBranch,
  History,
  Loader2,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import {
  createProjectVersionSnapshot,
  getProjectFiles,
  listProjectVersions,
  restoreProjectVersionSnapshot,
} from '../services/dataService';
import {
  compareSnapshotsViaApi,
  deleteProjectVersionSnapshot,
} from '../services/versionHistoryService';
import type {
  FileDiffSummary,
  Project,
  ProjectCollaboratorRole,
  ProjectFile,
  ProjectVersion,
  ProjectVersionSnapshot,
  VersionChangeType,
} from '../types/mideocode';

function formatChangeType(ct?: VersionChangeType): string {
  if (ct === 'ai_build') return 'AI Build';
  if (ct === 'ai_fix') return 'AI Fix';
  if (ct === 'autosave') return 'Autosave';
  if (ct === 'restore') return 'Restore';
  if (ct === 'collab') return 'Collaboration';
  return 'Manual';
}

function formatCreatedAt(val: unknown): string {
  if (!val) return 'Just now';
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toLocaleString();
  }
  return '';
}

export function VersionHistoryView() {
  const {
    firebaseUser,
    profile,
    accessibleProjects,
    activeIdeProjectId,
    versionsProjectId,
    setVersionsProjectId,
    setActiveIdeProjectId,
    setActiveView,
    refreshUserData,
    notify,
  } = useMideo();

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    versionsProjectId || activeIdeProjectId || accessibleProjects[0]?.id || '',
  );
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter & Search
  const [typeFilter, setTypeFilter] = useState<'all' | 'manual' | 'autosave' | 'ai' | 'restore' | 'collab'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Snapshot Creation Form
  const [snapLabel, setSnapLabel] = useState('');
  const [snapDesc, setSnapDesc] = useState('');
  const [creatingSnap, setCreatingSnap] = useState(false);

  // Diff State
  const [baseId, setBaseId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('CURRENT');
  const [diffFiles, setDiffFiles] = useState<FileDiffSummary[]>([]);
  const [diffSummaryCounts, setDiffSummaryCounts] = useState<{
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    unchangedCount: number;
  } | null>(null);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string>('');
  const [diffLoading, setDiffLoading] = useState(false);

  // Pre-Restore Preview & Selective Restore Modal
  const [restoreTargetVersion, setRestoreTargetVersion] = useState<ProjectVersion | null>(null);
  const [restoreMode, setRestoreMode] = useState<'full' | 'selective'>('full');
  const [selectedRestorePaths, setSelectedRestorePaths] = useState<string[]>([]);
  const [restoring, setRestoring] = useState(false);

  // Delete snapshot confirm
  const [confirmDeleteVer, setConfirmDeleteVer] = useState<ProjectVersion | null>(null);

  useEffect(() => {
    if (versionsProjectId) {
      setSelectedProjectId(versionsProjectId);
    } else if (!selectedProjectId && accessibleProjects.length > 0) {
      setSelectedProjectId(activeIdeProjectId || accessibleProjects[0].id);
    }
  }, [versionsProjectId, activeIdeProjectId, accessibleProjects, selectedProjectId]);

  const activeProject: Project | undefined =
    accessibleProjects.find((p) => p.id === selectedProjectId) || accessibleProjects[0];

  const myRole: ProjectCollaboratorRole = useMemo(() => {
    if (!activeProject || !firebaseUser) return 'viewer';
    if (activeProject.ownerId === firebaseUser.uid) return 'owner';
    return activeProject.collaboratorRoles?.[firebaseUser.uid] || 'viewer';
  }, [activeProject, firebaseUser]);

  const canWrite = myRole === 'owner' || myRole === 'editor';

  const loadHistory = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      const [projFiles, projVersions] = await Promise.all([
        getProjectFiles(projectId),
        listProjectVersions(projectId),
      ]);
      setFiles(projFiles);
      setVersions(projVersions);
      if (projVersions.length > 0) {
        setBaseId(projVersions[0].id);
        setTargetId('CURRENT');
      } else {
        setBaseId('');
        setDiffFiles([]);
        setDiffSummaryCounts(null);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load version history.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (activeProject?.id) {
      setVersionsProjectId(activeProject.id);
      loadHistory(activeProject.id);
    } else {
      setFiles([]);
      setVersions([]);
    }
  }, [activeProject?.id, loadHistory, setVersionsProjectId]);

  const liveSnapshot: ProjectVersionSnapshot[] = useMemo(
    () =>
      files.map((f) => ({
        name: f.name,
        folder: f.folder,
        language: f.language,
        content: f.content,
      })),
    [files],
  );

  const runDiff = useCallback(async () => {
    if (!baseId || versions.length === 0) return;
    const baseVer = versions.find((v) => v.id === baseId);
    if (!baseVer) return;
    const targetSnap =
      targetId === 'CURRENT'
        ? liveSnapshot
        : versions.find((v) => v.id === targetId)?.snapshot || liveSnapshot;

    setDiffLoading(true);
    try {
      const res = await compareSnapshotsViaApi(baseVer.snapshot, targetSnap);
      setDiffFiles(res.files);
      setDiffSummaryCounts({
        addedCount: res.addedCount,
        removedCount: res.removedCount,
        modifiedCount: res.modifiedCount,
        unchangedCount: res.unchangedCount,
      });
      const firstChanged = res.files.find((f) => f.status !== 'unchanged') || res.files[0];
      setSelectedDiffPath(firstChanged?.path || '');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to compute diff.');
    } finally {
      setDiffLoading(false);
    }
  }, [baseId, targetId, versions, liveSnapshot, notify]);

  useEffect(() => {
    if (baseId && versions.length > 0) {
      runDiff();
    }
  }, [baseId, targetId, runDiff, versions.length]);

  const filteredVersions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return versions.filter((v) => {
      if (typeFilter === 'ai' && v.changeType !== 'ai_build' && v.changeType !== 'ai_fix') return false;
      if (typeFilter !== 'all' && typeFilter !== 'ai' && (v.changeType || 'manual') !== typeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        v.label.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q) ||
        (v.authorName || '').toLowerCase().includes(q) ||
        (v.aiOperation || '').toLowerCase().includes(q)
      );
    });
  }, [versions, typeFilter, searchQuery]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !activeProject || !canWrite) return;
    setCreatingSnap(true);
    try {
      const nextNum = (versions[0]?.versionNumber || activeProject.version || 0) + 1;
      const created = await createProjectVersionSnapshot(
        firebaseUser.uid,
        activeProject.id,
        nextNum,
        snapLabel.trim() || `Checkpoint v${nextNum}`,
        files,
        {
          ownerId: activeProject.ownerId,
          authorName: profile.displayName,
          description: snapDesc.trim() || undefined,
          changeType: activeProject.ownerId === firebaseUser.uid ? 'manual' : 'collab',
          changedFiles: files.map((f) => (f.folder ? `${f.folder}/${f.name}` : f.name)),
          parentVersionId: versions[0]?.id,
          collaboratorIds: activeProject.collaboratorIds,
        },
      );
      setVersions((prev) => [created, ...prev]);
      setSnapLabel('');
      setSnapDesc('');
      notify('success', `Saved snapshot "${created.label}".`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create snapshot.');
    } finally {
      setCreatingSnap(false);
    }
  };

  const openRestoreModal = (ver: ProjectVersion) => {
    setRestoreTargetVersion(ver);
    setRestoreMode('full');
    setSelectedRestorePaths(
      ver.snapshot.map((f) => (f.folder ? `${f.folder}/${f.name}` : f.name)),
    );
  };

  const handleConfirmRestore = async () => {
    if (!firebaseUser || !profile || !activeProject || !restoreTargetVersion || !canWrite) return;
    setRestoring(true);
    try {
      const restored = await restoreProjectVersionSnapshot(
        firebaseUser.uid,
        activeProject.id,
        restoreTargetVersion,
        files,
        {
          preserveCurrentState: true,
          selectedPaths: restoreMode === 'selective' ? selectedRestorePaths : undefined,
          authorName: profile.displayName,
        },
      );
      setFiles(restored);
      setRestoreTargetVersion(null);
      await Promise.all([refreshUserData(), loadHistory(activeProject.id)]);
      notify(
        'success',
        `Restored ${restoreMode === 'selective' ? `${selectedRestorePaths.length} file(s)` : 'project'} from v${restoreTargetVersion.versionNumber} with automatic pre-restore backup.`,
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setRestoring(false);
    }
  };

  const inspectedDiffFile = diffFiles.find((f) => f.path === selectedDiffPath) || diffFiles[0] || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Version History
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Inspect snapshots, compare line-by-line diffs across commits or AI edits, and safely recover full or selective files.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {accessibleProjects.length > 0 && (
            <select
              value={activeProject?.id || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Select project for Version History"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs font-medium max-w-[240px]"
            >
              {accessibleProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} (v{p.version})
                </option>
              ))}
            </select>
          )}
          {activeProject && (
            <button
              type="button"
              onClick={() => {
                setActiveIdeProjectId(activeProject.id);
                setActiveView('ide');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" />
              Open in IDE
            </button>
          )}
        </div>
      </div>

      {!activeProject ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-12 text-center space-y-3">
          <History className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-500">Create or join a project to manage version history.</p>
          <button
            type="button"
            onClick={() => setActiveView('projects')}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
          >
            Browse Projects
          </button>
        </div>
      ) : (
        <>
          {/* Snapshot Creation Bar */}
          {canWrite ? (
            <form
              onSubmit={handleCreateSnapshot}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
            >
              <input
                value={snapLabel}
                onChange={(e) => setSnapLabel(e.target.value)}
                placeholder="Checkpoint label (e.g., Added auth middleware)"
                className="md:col-span-4 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              />
              <input
                value={snapDesc}
                onChange={(e) => setSnapDesc(e.target.value)}
                placeholder="Optional change summary..."
                className="md:col-span-6 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              />
              <button
                type="submit"
                disabled={creatingSnap}
                className="md:col-span-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                {creatingSnap ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Snapshot
              </button>
            </form>
          ) : (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-xs text-slate-500">
              You have <strong>viewer</strong> access on "{activeProject.title}". You can inspect and compare diffs; snapshot creation and restoration require owner or editor access.
            </div>
          )}

          {/* Split Layout: Timeline (left) | Visual Diff Viewer (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Timeline */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-blue-500" />
                  Snapshots ({filteredVersions.length})
                </h2>
                <div className="relative w-44">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter history..."
                    className="w-full pl-7 pr-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px]"
                  />
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'manual', label: 'Manual' },
                    { id: 'ai', label: 'AI Edits' },
                    { id: 'autosave', label: 'Autosave' },
                    { id: 'restore', label: 'Restores' },
                    { id: 'collab', label: 'Collab' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTypeFilter(f.id)}
                    className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                      typeFilter === f.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading timeline...
                </div>
              ) : filteredVersions.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">
                  No snapshots match the selected filter.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
                  {filteredVersions.map((ver) => {
                    const isAi = ver.changeType === 'ai_build' || ver.changeType === 'ai_fix';
                    return (
                      <div
                        key={ver.id}
                        className={`p-3.5 rounded-lg border transition-colors space-y-2 ${
                          baseId === ver.id
                            ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#080C17]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                              {isAi && <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                              <span className="truncate">
                                v{ver.versionNumber} · {ver.label}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                              {formatChangeType(ver.changeType)} · {ver.authorName || activeProject.ownerName} · {ver.filesCount} files
                            </div>
                          </div>
                          {myRole === 'owner' && versions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteVer(ver)}
                              aria-label={`Delete snapshot ${ver.label}`}
                              className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {ver.description && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">{ver.description}</p>
                        )}
                        {ver.aiOperation && (
                          <div className="text-[11px] font-mono text-violet-600 dark:text-violet-400 truncate">
                            AI Operation: {ver.aiOperation}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400">{formatCreatedAt(ver.createdAt)}</div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setBaseId(ver.id)}
                            className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-medium hover:border-blue-500 cursor-pointer"
                          >
                            Compare Diff
                          </button>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => openRestoreModal(ver)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-medium hover:border-blue-500 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Restore
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Visual Diff Viewer */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileDiff className="w-4 h-4 text-blue-500" />
                  Visual Line-by-Line Diff
                </h2>

                {versions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <select
                      value={baseId}
                      onChange={(e) => setBaseId(e.target.value)}
                      aria-label="Base snapshot"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 max-w-[180px]"
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          Base: v{v.versionNumber} ({v.label.slice(0, 18)})
                        </option>
                      ))}
                    </select>
                    <span className="text-slate-400">→</span>
                    <select
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      aria-label="Target snapshot"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 max-w-[180px]"
                    >
                      <option value="CURRENT">Current Workspace Files</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          Target: v{v.versionNumber} ({v.label.slice(0, 18)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {diffSummaryCounts && (
                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    +{diffSummaryCounts.addedCount} added
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {diffSummaryCounts.modifiedCount} modified
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    -{diffSummaryCounts.removedCount} removed
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{diffSummaryCounts.unchangedCount} unchanged</span>
                </div>
              )}

              {diffLoading ? (
                <div className="py-16 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Computing snapshot diff...
                </div>
              ) : diffFiles.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500">
                  Select a snapshot on the left to inspect file and line changes.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* File tabs */}
                  <div className="flex flex-wrap gap-1.5">
                    {diffFiles.map((df) => (
                      <button
                        key={df.path}
                        type="button"
                        onClick={() => setSelectedDiffPath(df.path)}
                        className={`px-2.5 py-1 rounded-md font-mono text-[11px] border cursor-pointer ${
                          inspectedDiffFile?.path === df.path
                            ? 'border-blue-500 bg-blue-600/10 text-blue-600 dark:text-blue-400 font-semibold'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {df.path} ({df.status} +{df.additions}/-{df.deletions})
                      </button>
                    ))}
                  </div>

                  {inspectedDiffFile && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-[#090D16] overflow-auto max-h-[440px]">
                      <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-mono text-slate-300 flex items-center justify-between">
                        <span>{inspectedDiffFile.path}</span>
                        <span className="tabular-nums">
                          +{inspectedDiffFile.additions} / -{inspectedDiffFile.deletions}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] leading-5">
                        {inspectedDiffFile.lines.map((line, i) => (
                          <div
                            key={i}
                            className={`px-3 flex gap-3 whitespace-pre ${
                              line.type === 'added'
                                ? 'bg-emerald-950/60 text-emerald-300'
                                : line.type === 'removed'
                                  ? 'bg-red-950/60 text-red-300'
                                  : 'text-slate-300'
                            }`}
                          >
                            <span className="w-8 text-right text-slate-500 select-none tabular-nums shrink-0">
                              {line.oldLine ?? ''}
                            </span>
                            <span className="w-8 text-right text-slate-500 select-none tabular-nums shrink-0">
                              {line.newLine ?? ''}
                            </span>
                            <span className="w-3 select-none shrink-0">
                              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                            </span>
                            <span className="flex-1">{line.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Pre-Restore Preview & Selective Restore Modal */}
      {restoreTargetVersion && activeProject && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Restore Preview — v{restoreTargetVersion.versionNumber} ({restoreTargetVersion.label})
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              An automatic safety backup of your current files in <strong>{activeProject.title}</strong> will be recorded before applying this restore.
            </p>

            <div className="flex items-center gap-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 w-fit text-xs">
              <button
                type="button"
                onClick={() => setRestoreMode('full')}
                className={`px-3 py-1 rounded font-medium cursor-pointer ${
                  restoreMode === 'full' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
                }`}
              >
                Full Snapshot ({restoreTargetVersion.snapshot.length} files)
              </button>
              <button
                type="button"
                onClick={() => setRestoreMode('selective')}
                className={`px-3 py-1 rounded font-medium cursor-pointer ${
                  restoreMode === 'selective' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
                }`}
              >
                Selective Files
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
              {restoreTargetVersion.snapshot.map((sf) => {
                const p = sf.folder ? `${sf.folder}/${sf.name}` : sf.name;
                const checked = selectedRestorePaths.includes(p);
                return (
                  <label key={p} className="px-3 py-2 flex items-center justify-between text-xs cursor-pointer">
                    <span className="flex items-center gap-2 font-mono">
                      {restoreMode === 'selective' ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedRestorePaths((prev) =>
                              e.target.checked ? [...prev, p] : prev.filter((x) => x !== p),
                            )
                          }
                        />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                      {p}
                    </span>
                    <span className="text-[11px] text-slate-500">{sf.language}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoreTargetVersion(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={restoring || (restoreMode === 'selective' && selectedRestorePaths.length === 0)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {restoring ? 'Restoring...' : 'Confirm Safe Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Snapshot Confirmation */}
      {confirmDeleteVer && activeProject && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Delete Snapshot v{confirmDeleteVer.versionNumber}?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Removing "{confirmDeleteVer.label}" cannot be undone. Current live project files remain unaffected.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteVer(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await deleteProjectVersionSnapshot(activeProject.id, confirmDeleteVer.id);
                    setVersions((prev) => prev.filter((v) => v.id !== confirmDeleteVer.id));
                    setConfirmDeleteVer(null);
                    notify('info', 'Snapshot deleted.');
                  } catch (err) {
                    notify('error', err instanceof Error ? err.message : 'Failed to delete snapshot.');
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
              >
                Delete Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

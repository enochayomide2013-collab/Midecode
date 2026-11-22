import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Download,
  Globe,
  HardDrive,
  History,
  Lock,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import {
  createProjectVersionSnapshot,
  createProjectWithFiles,
  getProjectFiles,
  listProjectVersions,
  restoreProjectVersionSnapshot,
  updateProjectMeta,
} from '../services/dataService';
import { downloadProjectAsZip } from '../utils/zipBuilder';
import type { Project, ProjectFile, ProjectVersion } from '../types/mideocode';

const QUOTA_BYTES = 5 * 1024 * 1024; // 5 MB per workspace plan limit

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function CloudView() {
  const {
    firebaseUser,
    profile,
    projects,
    refreshUserData,
    setActiveIdeProjectId,
    setActiveView,
    openVersionsForProject,
    notify,
  } = useMideo();

  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [confirmRestoreVersion, setConfirmRestoreVersion] = useState<ProjectVersion | null>(null);

  useEffect(() => {
    if (projects.length === 0) {
      if (selectedProjectId) setSelectedProjectId('');
      return;
    }
    if (!selectedProjectId || !projects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const activeProject: Project | undefined = projects.find((p) => p.id === selectedProjectId);

  const loadProjectDetails = async (projectId: string) => {
    setLoadingVersions(true);
    try {
      const [projFiles, projVersions] = await Promise.all([
        getProjectFiles(projectId),
        listProjectVersions(projectId),
      ]);
      setFiles(projFiles);
      setVersions(projVersions);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to load cloud snapshots.');
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetails(selectedProjectId);
    } else {
      setFiles([]);
      setVersions([]);
    }
  }, [selectedProjectId]);

  const totalStorageBytes = projects.reduce((sum, p) => sum + (p.storageBytes || 0), 0);
  const quotaPct = Math.min(100, Math.round((totalStorageBytes / QUOTA_BYTES) * 100));

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeProject) return;
    setCreatingSnapshot(true);
    try {
      const label = snapshotLabel.trim() || `Manual snapshot v${activeProject.version}`;
      const created = await createProjectVersionSnapshot(
        firebaseUser.uid,
        activeProject.id,
        activeProject.version,
        label,
        files,
      );
      setVersions((prev) => [created, ...prev]);
      setSnapshotLabel('');
      notify('success', 'Cloud snapshot saved.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to create cloud snapshot.');
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async () => {
    if (!firebaseUser || !activeProject || !confirmRestoreVersion) return;
    setRestoringVersionId(confirmRestoreVersion.id);
    try {
      const restoredFiles = await restoreProjectVersionSnapshot(
        firebaseUser.uid,
        activeProject.id,
        confirmRestoreVersion,
        files,
      );
      setFiles(restoredFiles);
      setConfirmRestoreVersion(null);
      await Promise.all([refreshUserData(), loadProjectDetails(activeProject.id)]);
      notify('success', `Restored workspace to v${confirmRestoreVersion.versionNumber}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setRestoringVersionId(null);
    }
  };

  const handleToggleVisibility = async (proj: Project) => {
    const nextVis = proj.visibility === 'private' ? 'public' : 'private';
    try {
      await updateProjectMeta(proj.id, { visibility: nextVis }, files);
      await refreshUserData();
      notify('success', `Workspace visibility set to ${nextVis}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update visibility.');
    }
  };

  const handleExportZip = () => {
    if (!activeProject) return;
    downloadProjectAsZip(
      activeProject.title,
      files.map((f) => ({
        name: f.name,
        folder: f.folder,
        content: f.content,
      })),
    );
    notify('success', `Workspace "${activeProject.title}" downloaded as .zip archive.`);
  };

  const handleExportBackup = () => {
    if (!activeProject) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      project: {
        title: activeProject.title,
        description: activeProject.description,
        language: activeProject.language,
      },
      files: files.map((f) => ({
        name: f.name,
        folder: f.folder,
        language: f.language,
        content: f.content,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', 'Workspace backup downloaded as JSON.');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firebaseUser || !profile) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        project?: { title?: string; description?: string; language?: Project['language'] };
        files?: { name: string; folder: string; language: string; content: string }[];
      };
      if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
        throw new Error('Invalid backup JSON: missing files array.');
      }
      const created = await createProjectWithFiles(firebaseUser.uid, profile.displayName, {
        title: `${parsed.project?.title || 'Imported Project'} (Imported)`,
        description: parsed.project?.description || 'Imported from Mideo Cloud JSON backup',
        language: parsed.project?.language || 'web',
        files: parsed.files.slice(0, 30),
      });
      await refreshUserData();
      setSelectedProjectId(created.project.id);
      notify('success', `Imported "${created.project.title}" into Cloud Storage.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to import backup JSON.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Mideo Cloud
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Cloud-synced workspaces, immutable version snapshots, visibility governance, and portable backups.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer">
          <Upload className="w-4 h-4" />
          Import JSON Backup
          <input type="file" accept=".json,application/json" onChange={handleImportBackup} className="hidden" />
        </label>
      </div>

      {/* Cloud Storage & Sync Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Cloud Storage Usage</span>
            <HardDrive className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatBytes(totalStorageBytes)} / {formatBytes(QUOTA_BYTES)}
          </p>
          <div className="mt-2.5 h-1.5 w-full rounded-md bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-blue-600" style={{ width: `${Math.max(2, quotaPct)}%` }} />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Synced Workspaces</span>
            <Cloud className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {projects.length} {projects.length === 1 ? 'Workspace' : 'Workspaces'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Private by default until explicitly shared
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Conflict Protection</span>
            <CheckCircle2 className="w-4 h-4 text-violet-500" />
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">Active</p>
          <p className="text-xs text-slate-500 mt-1">
            Version-checked writes prevent silent overwrites
          </p>
        </div>
      </div>

      {/* Main Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Workspaces list */}
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Your Cloud Workspaces
          </h2>
          {projects.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-center space-y-3">
              <p className="text-xs text-slate-500">No cloud workspaces created yet.</p>
              <button
                onClick={() => setActiveView('projects')}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium cursor-pointer"
              >
                Start a Guided Project
              </button>
            </div>
          ) : (
            projects.map((proj) => {
              const active = proj.id === selectedProjectId;
              return (
                <button
                  key={proj.id}
                  onClick={() => setSelectedProjectId(proj.id)}
                  className={`w-full p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {proj.title}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      {proj.visibility === 'private' ? (
                        <Lock className="w-3 h-3" />
                      ) : (
                        <Globe className="w-3 h-3 text-emerald-500" />
                      )}
                      {proj.visibility}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>
                      {proj.language} · v{proj.version}
                    </span>
                    <span>{formatBytes(proj.storageBytes || 0)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Version History & Controls */}
        <div className="lg:col-span-7">
          {activeProject ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {activeProject.title}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {files.length} files · v{activeProject.version} ·{' '}
                    {formatBytes(activeProject.storageBytes || 0)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleToggleVisibility(activeProject)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    {activeProject.visibility === 'private' ? (
                      <>
                        <Globe className="w-3.5 h-3.5" /> Make Public
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" /> Make Private
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleExportZip}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:border-blue-500 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export .zip
                  </button>
                  <button
                    onClick={handleExportBackup}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export JSON
                  </button>
                  <button
                    onClick={() => {
                      setActiveIdeProjectId(activeProject.id);
                      setActiveView('ide');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                  >
                    Open in IDE
                  </button>
                </div>
              </div>

              {/* Snapshot Creator */}
              <form
                onSubmit={handleCreateSnapshot}
                className="flex flex-col sm:flex-row gap-2 p-3.5 rounded-lg bg-slate-50 dark:bg-[#080C17] border border-slate-200 dark:border-slate-800"
              >
                <input
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  placeholder="Checkpoint label (e.g., Completed API routes)"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1322] text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={creatingSnapshot}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {creatingSnapshot ? 'Saving...' : 'Create Snapshot'}
                </button>
              </form>

              {/* Version History List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <History className="w-4 h-4 text-blue-500" />
                    <span>Version History ({versions.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openVersionsForProject(activeProject.id)}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap cursor-pointer"
                  >
                    Open Full Diff &amp; Recovery
                  </button>
                </div>

                {loadingVersions ? (
                  <p className="text-xs text-slate-500">Loading version snapshots...</p>
                ) : versions.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No snapshots saved yet. Create a checkpoint above to enable one-click rollback.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {versions.map((ver) => (
                      <div
                        key={ver.id}
                        className="p-3.5 flex items-center justify-between gap-4"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">
                            v{ver.versionNumber} · {ver.label}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {ver.filesCount} files in snapshot
                          </div>
                        </div>
                        <button
                          onClick={() => setConfirmRestoreVersion(ver)}
                          disabled={restoringVersionId === ver.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-12 text-center text-sm text-slate-500">
              Select a workspace to inspect its cloud snapshots and storage status.
            </div>
          )}
        </div>
      </div>

      {/* Explicit Restore Confirmation Dialog */}
      {confirmRestoreVersion && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Restore Snapshot v{confirmRestoreVersion.versionNumber}?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              This replaces the current workspace files in{' '}
              <strong>{activeProject?.title}</strong> with the files saved in "
              {confirmRestoreVersion.label}". Consider creating a snapshot of your current files
              first if you want to keep recent edits.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRestoreVersion(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreSnapshot}
                disabled={Boolean(restoringVersionId)}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                {restoringVersionId ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

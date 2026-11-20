import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  Download,
  GitBranch,
  History,
  Maximize2,
  Minimize2,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import {
  MideoCodeEditorSurface,
  type EditorSurfaceFile,
  type EditorSyncStatus,
} from '../components/MideoCodeEditorSurface';
import {
  addProjectFile,
  createProjectVersionSnapshot,
  createProjectWithFiles,
  deleteProjectFile,
  forceOverwriteProjectFile,
  getProjectFiles,
  renameProjectFile,
  saveProjectFileContent,
} from '../services/dataService';
import { logProjectActivity } from '../services/collaborationService';
import { DOC_ARTICLES } from '../data/docsData';
import type { Project, ProjectCollaboratorRole, ProjectFile } from '../types/mideocode';

export function IdeView() {
  const {
    firebaseUser,
    profile,
    settings,
    projects,
    accessibleProjects,
    activeIdeProjectId,
    setActiveIdeProjectId,
    openTestLabForProject,
    openVersionsForProject,
    openCollabForProject,
    refreshUserData,
    askAi,
    notify,
  } = useMideo();

  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [unsavedContent, setUnsavedContent] = useState<Record<string, string>>({});
  const [syncStatus, setSyncStatus] = useState<EditorSyncStatus>('synced');
  const [conflictState, setConflictState] = useState<{
    fileId: string;
    serverVersion: number;
    lastEditedByName?: string;
    serverFileContent?: string;
  } | null>(null);
  const [latestConsoleError, setLatestConsoleError] = useState('');
  const [fullScreen, setFullScreen] = useState(false);
  const [showDocsDrawer, setShowDocsDrawer] = useState(false);
  const fileImportRef = useRef<HTMLInputElement | null>(null);

  const activeProject: Project | undefined =
    accessibleProjects.find((p) => p.id === activeIdeProjectId) || accessibleProjects[0];

  const myRole: ProjectCollaboratorRole = useMemo(() => {
    if (!activeProject || !firebaseUser) return 'viewer';
    if (activeProject.ownerId === firebaseUser.uid) return 'owner';
    return activeProject.collaboratorRoles?.[firebaseUser.uid] || 'viewer';
  }, [activeProject, firebaseUser]);

  const isReadOnlyViewer = myRole === 'viewer';

  useEffect(() => {
    if (!activeProject) {
      setFiles([]);
      setActiveFileId(null);
      return;
    }
    getProjectFiles(activeProject.id)
      .then((loaded) => {
        setFiles(loaded);
        setActiveFileId(loaded[0]?.id || null);
        setUnsavedContent({});
        setSyncStatus('synced');
      })
      .catch((err) => notify('error', err instanceof Error ? err.message : 'Failed to load files.'));
  }, [activeProject?.id, notify]);

  const surfaceFiles: EditorSurfaceFile[] = useMemo(
    () =>
      files.map((f) => ({
        id: f.id,
        name: f.name,
        folder: f.folder,
        language: f.language,
        content: unsavedContent[f.id] ?? f.content,
      })),
    [files, unsavedContent],
  );

  const activeFile = files.find((f) => f.id === activeFileId) || files[0] || null;
  const activeCode = activeFile ? (unsavedContent[activeFile.id] ?? activeFile.content) : '';

  const handleSaveActiveFile = async () => {
    if (!activeProject || !activeFile || isReadOnlyViewer) return;
    const content = unsavedContent[activeFile.id] ?? activeFile.content;
    const totalBytes = files.reduce((sum, f) => {
      const c = f.id === activeFile.id ? content : (unsavedContent[f.id] ?? f.content);
      return sum + new Blob([c]).size;
    }, 0);

    setSyncStatus('saving');
    try {
      const editorMeta =
        firebaseUser && profile
          ? { uid: firebaseUser.uid, name: profile.displayName }
          : undefined;
      const result = await saveProjectFileContent(
        activeProject.id,
        activeFile.id,
        content,
        activeProject.version,
        totalBytes,
        editorMeta,
      );
      if (result.conflict) {
        setSyncStatus('conflict');
        setConflictState({
          fileId: activeFile.id,
          serverVersion: result.serverVersion,
          lastEditedByName: result.lastEditedByName,
          serverFileContent: result.serverFileContent,
        });
        return;
      }
      setFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, content } : f)));
      setUnsavedContent((prev) => {
        const copy = { ...prev };
        delete copy[activeFile.id];
        return copy;
      });
      setSyncStatus('synced');
      if (firebaseUser && profile && (activeProject.collaboratorIds?.length || 0) > 0) {
        logProjectActivity(
          activeProject.id,
          firebaseUser.uid,
          profile.displayName,
          'file_saved',
          `Saved ${activeFile.name} (v${result.newVersion})`,
          { targetName: activeFile.name, collaboratorIds: activeProject.collaboratorIds },
        ).catch(() => {});
      }
      await refreshUserData();
    } catch (err) {
      setSyncStatus('dirty');
      notify('error', err instanceof Error ? err.message : 'Failed to save file to Mideo Cloud.');
    }
  };

  useEffect(() => {
    if (settings?.autosave === false || isReadOnlyViewer) return;
    if (syncStatus !== 'dirty' || !activeFile || !activeProject) return;
    const t = setTimeout(() => {
      handleSaveActiveFile();
    }, 1800);
    return () => clearTimeout(t);
  }, [syncStatus, unsavedContent, activeFile?.id, settings?.autosave, isReadOnlyViewer]);

  const handleCreateProject = async () => {
    if (!firebaseUser || !profile) return;
    try {
      const created = await createProjectWithFiles(firebaseUser.uid, profile.displayName, {
        title: `Workspace ${projects.length + 1}`,
        description: 'New Mideo IDE workspace',
        language: 'web',
        files: [
          { name: 'index.html', folder: '', language: 'html', content: '<h1>New MideoCode Project</h1>\n<p>Edit HTML, CSS, or JS and run live preview.</p>' },
          { name: 'styles.css', folder: '', language: 'css', content: 'body { font-family: system-ui, sans-serif; padding: 24px; background: #0b1120; color: #f8fafc; }' },
          { name: 'script.js', folder: '', language: 'javascript', content: 'console.log("Workspace ready");' },
        ],
      });
      await refreshUserData();
      setActiveIdeProjectId(created.project.id);
      notify('success', `Created "${created.project.title}"`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create workspace.');
    }
  };

  const handleExportProject = () => {
    if (!activeProject) return;
    const bundle = {
      title: activeProject.title,
      language: activeProject.language,
      exportedAt: new Date().toISOString(),
      files: surfaceFiles.map((f) => ({
        name: f.name,
        language: f.language,
        content: f.content,
      })),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mideocode.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !firebaseUser || !activeProject) return;
    try {
      const text = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'javascript';
      const created = await addProjectFile(firebaseUser.uid, activeProject.id, {
        name: file.name,
        folder: '',
        language: ext === 'py' ? 'python' : ext === 'html' ? 'html' : ext === 'css' ? 'css' : ext === 'sql' ? 'sql' : 'javascript',
        content: text.slice(0, 150000),
        visibility: activeProject.visibility,
      });
      setFiles((prev) => [...prev, created]);
      setActiveFileId(created.id);
      notify('success', `Imported ${file.name}`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to import file.');
    }
  };

  const handleCreateSnapshot = async () => {
    if (!firebaseUser || !profile || !activeProject || isReadOnlyViewer) return;
    try {
      await handleSaveActiveFile();
      const mergedFiles = files.map((f) => ({ ...f, content: unsavedContent[f.id] ?? f.content }));
      await createProjectVersionSnapshot(
        firebaseUser.uid,
        activeProject.id,
        activeProject.version,
        `Manual snapshot (${new Date().toLocaleTimeString()})`,
        mergedFiles,
        {
          ownerId: activeProject.ownerId,
          authorName: profile.displayName,
          changeType: activeProject.ownerId === firebaseUser.uid ? 'manual' : 'collab',
          changedFiles: mergedFiles.map((f) => (f.folder ? `${f.folder}/${f.name}` : f.name)),
          collaboratorIds: activeProject.collaboratorIds,
        },
      );
      notify('success', 'Version snapshot saved to Mideo Cloud.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save snapshot.');
    }
  };

  if (!activeProject) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-12 text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Mideo IDE</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Create a cloud-synced multi-file workspace to write HTML, CSS, JavaScript, and Python with live preview and isolated execution.
        </p>
        <button
          onClick={handleCreateProject}
          className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
        >
          Create First Workspace
        </button>
      </div>
    );
  }

  return (
    <div className={`${fullScreen ? 'fixed inset-0 z-40 bg-slate-50 dark:bg-[#070B14] p-4 flex flex-col overflow-y-auto' : 'space-y-4'}`}>
      {/* Project Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322]">
        <div className="flex items-center gap-3 min-w-0">
          <select
            value={activeProject.id}
            onChange={(e) => setActiveIdeProjectId(e.target.value)}
            aria-label="Select active workspace"
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold max-w-[220px] truncate"
          >
            {accessibleProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} {p.ownerId === firebaseUser?.uid ? '' : '(Shared)'}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreateProject}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            New Workspace
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            v{activeProject.version} · {myRole}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isReadOnlyViewer && (
            <button
              onClick={handleCreateSnapshot}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              Snapshot
            </button>
          )}
          <button
            onClick={() => openVersionsForProject(activeProject.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Versions
          </button>
          <button
            onClick={() => openTestLabForProject(activeProject.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
            TestLab
          </button>
          <button
            onClick={() => openCollabForProject(activeProject.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            Collab
          </button>
          <button
            onClick={() =>
              activeFile &&
              askAi({
                mode: 'debug',
                prompt: `Review or help debug "${activeFile.name}".`,
                context: {
                  filename: activeFile.name,
                  language: activeFile.language,
                  selectedCode: activeCode,
                  errorMessage: latestConsoleError,
                },
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            Ask AI
          </button>
          <button
            onClick={() => setShowDocsDrawer((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Quick Docs
          </button>
          <button
            onClick={handleExportProject}
            aria-label="Export project bundle"
            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          {!isReadOnlyViewer && (
            <>
              <button
                onClick={() => fileImportRef.current?.click()}
                aria-label="Import file"
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <input ref={fileImportRef} type="file" className="hidden" onChange={handleImportFile} />
            </>
          )}
          <button
            onClick={() => setFullScreen((f) => !f)}
            aria-label={fullScreen ? 'Exit full screen' : 'Full screen'}
            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {fullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isReadOnlyViewer && (
        <div className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] text-xs text-slate-600 dark:text-slate-300">
          Read-only <strong>viewer</strong> access on shared project "{activeProject.title}". You can inspect code, run previews, and post discussions in Collaboration.
        </div>
      )}

      {/* Shared Mideo Code Editor Surface */}
      <MideoCodeEditorSurface
        files={surfaceFiles}
        activeFileId={activeFile?.id || null}
        onSelectFile={setActiveFileId}
        onChangeFileContent={(fileId, val) => {
          setUnsavedContent((prev) => ({ ...prev, [fileId]: val }));
          setSyncStatus('dirty');
        }}
        onAddFile={async (name, language) => {
          if (!firebaseUser || !activeProject) return;
          try {
            const created = await addProjectFile(firebaseUser.uid, activeProject.id, {
              name,
              folder: '',
              language,
              content: '',
              visibility: activeProject.visibility,
            });
            setFiles((prev) => [...prev, created]);
            setActiveFileId(created.id);
            notify('success', `Created ${created.name}`);
          } catch (err) {
            notify('error', err instanceof Error ? err.message : 'Unable to add file.');
          }
        }}
        onRenameFile={async (fileId, nextName) => {
          if (!activeProject) return;
          try {
            await renameProjectFile(activeProject.id, fileId, nextName);
            setFiles((prev) => prev.map((x) => (x.id === fileId ? { ...x, name: nextName } : x)));
          } catch (err) {
            notify('error', err instanceof Error ? err.message : 'Unable to rename file.');
          }
        }}
        onDeleteFile={async (fileId) => {
          if (!activeProject) return;
          try {
            await deleteProjectFile(activeProject.id, fileId);
            const remaining = files.filter((f) => f.id !== fileId);
            setFiles(remaining);
            if (activeFileId === fileId) setActiveFileId(remaining[0]?.id || null);
          } catch (err) {
            notify('error', err instanceof Error ? err.message : 'Unable to delete file.');
          }
        }}
        onSave={handleSaveActiveFile}
        syncStatus={syncStatus}
        syncLabel={syncStatus === 'synced' ? `Cloud Synced · v${activeProject.version}` : undefined}
        settings={settings}
        readOnly={isReadOnlyViewer}
        onConsoleErrorChange={setLatestConsoleError}
      />

      {/* Quick Docs Drawer */}
      {showDocsDrawer && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Quick Reference Docs</h3>
            <button onClick={() => setShowDocsDrawer(false)} className="text-xs text-slate-500 hover:text-white cursor-pointer">
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DOC_ARTICLES.slice(0, 3).map((docItem) => (
              <div key={docItem.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                <p className="font-semibold text-slate-900 dark:text-white">{docItem.title}</p>
                <pre className="mt-2 p-2 rounded bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">
                  {docItem.syntax}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cloud Conflict Resolution Modal */}
      {conflictState && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl border border-amber-400 dark:border-amber-700 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold">Cloud Version Conflict Detected</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              A newer version (v{conflictState.serverVersion}
              {conflictState.lastEditedByName ? `, saved by ${conflictState.lastEditedByName}` : ''}) exists in Mideo Cloud. Compare both versions below before resolving.
            </p>
            {conflictState.serverFileContent !== undefined && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="font-semibold text-slate-500 mb-1">Cloud Version (v{conflictState.serverVersion})</div>
                  <pre className="p-2.5 rounded-lg bg-[#090D16] text-slate-200 font-mono overflow-auto max-h-44">
                    {conflictState.serverFileContent}
                  </pre>
                </div>
                <div>
                  <div className="font-semibold text-slate-500 mb-1">Your Local Edits</div>
                  <pre className="p-2.5 rounded-lg bg-[#090D16] text-slate-200 font-mono overflow-auto max-h-44">
                    {unsavedContent[conflictState.fileId] ?? files.find((x) => x.id === conflictState.fileId)?.content ?? ''}
                  </pre>
                </div>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={async () => {
                  const fresh = await getProjectFiles(activeProject.id);
                  setFiles(fresh);
                  setUnsavedContent({});
                  setConflictState(null);
                  setSyncStatus('synced');
                  await refreshUserData();
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Load Cloud Version
              </button>
              <button
                onClick={async () => {
                  try {
                    const f = files.find((x) => x.id === conflictState.fileId);
                    if (!f) return;
                    const content = unsavedContent[f.id] ?? f.content;
                    const totalBytes = surfaceFiles.reduce(
                      (sum, item) => sum + new Blob([item.id === f.id ? content : item.content]).size,
                      0,
                    );
                    await forceOverwriteProjectFile(
                      activeProject.id,
                      f.id,
                      content,
                      conflictState.serverVersion,
                      totalBytes,
                      firebaseUser && profile ? { uid: firebaseUser.uid, name: profile.displayName } : undefined,
                    );
                    setConflictState(null);
                    setSyncStatus('synced');
                    await refreshUserData();
                  } catch (err) {
                    notify('error', err instanceof Error ? err.message : 'Unable to overwrite cloud file.');
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Keep My Local Edits
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
